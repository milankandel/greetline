import { NextResponse, type NextRequest } from 'next/server'
import { and, eq, lte } from 'drizzle-orm'
import { db } from '@/db'
import { agents, contacts, deliveries, destinations, followups } from '@/db/schema'
import { completeStructured } from '@/lib/llm'
import { deliver, nextAttemptAt } from '@/lib/webhook'

export const dynamic = 'force-dynamic'

/** Minimum gap between ANY two touches to one contact, campaign or follow-up. */
const GLOBAL_MIN_GAP_HOURS = 24

/**
 * Processes due follow-ups. The cadence contract: a follow-up is suppressed —
 * not delayed silently, suppressed with a recorded reason — when the contact
 * opted out or was touched too recently. Being disturbed twice in a day costs
 * a customer; a suppressed reminder costs nothing.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 })
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const due = await db
    .select({ f: followups, agent: agents })
    .from(followups)
    .innerJoin(agents, eq(followups.agentId, agents.id))
    .where(and(eq(followups.status, 'scheduled'), lte(followups.dueAt, new Date())))
    .limit(20)

  let sent = 0
  let suppressed = 0

  for (const { f, agent } of due) {
    const contact = f.contactId
      ? (await db.select().from(contacts).where(eq(contacts.id, f.contactId)).limit(1))[0]
      : null

    if (contact?.doNotContact) {
      await db.update(followups).set({ status: 'suppressed', suppressedReason: 'contact opted out' }).where(eq(followups.id, f.id))
      suppressed++
      continue
    }
    if (contact?.lastContactedAt && Date.now() - contact.lastContactedAt.getTime() < GLOBAL_MIN_GAP_HOURS * 3_600_000) {
      // Pushed forward, not dropped: it stays scheduled and re-checks next run.
      await db
        .update(followups)
        .set({ dueAt: new Date(contact.lastContactedAt.getTime() + GLOBAL_MIN_GAP_HOURS * 3_600_000) })
        .where(eq(followups.id, f.id))
      suppressed++
      continue
    }

    const result = await completeStructured({
      system: `${agent.persona}\n\nYou write short follow-up messages for ${agent.businessName}. Warm, specific, one clear next step, no pressure. Sign off as ${agent.name}.`,
      user: `Write a ${f.channel === 'sms' ? 'two-sentence SMS' : 'short email (subject + 3 sentences)'} to ${contact?.name ?? 'the customer'}. Reason for the follow-up: ${f.reason}`,
      toolName: 'message',
      toolDescription: 'The follow-up message.',
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    }).catch(() => null)

    const draft = result ? (result.output as { text: string }).text : `Follow-up re: ${f.reason}`
    await db.update(followups).set({ status: 'sent', draft, sentAt: new Date() }).where(eq(followups.id, f.id))
    if (contact) await db.update(contacts).set({ lastContactedAt: new Date() }).where(eq(contacts.id, contact.id))
    sent++

    const targets = await db
      .select()
      .from(destinations)
      .where(and(eq(destinations.userId, f.userId), eq(destinations.active, true)))
    for (const target of targets) {
      const [pending] = await db
        .insert(deliveries)
        .values({ userId: f.userId, followupId: f.id, destinationId: target.id, status: 'pending' })
        .returning()
      const attempt = await deliver({
        url: target.url,
        secret: target.secret,
        headers: {},
        idempotencyKey: pending.id,
        payload: {
          type: 'followup.due',
          channel: f.channel,
          reason: f.reason,
          draft,
          contact: contact ? { name: contact.name, phone: contact.phone, email: contact.email } : null,
          agent: agent.name,
          dueAt: f.dueAt.toISOString(),
        },
      })
      await db
        .update(deliveries)
        .set({
          attempts: 1,
          status: attempt.ok ? 'delivered' : 'pending',
          responseStatus: attempt.status,
          responseBody: attempt.error ?? attempt.body,
          nextAttemptAt: attempt.ok ? null : nextAttemptAt(1),
        })
        .where(eq(deliveries.id, pending.id))
    }
  }

  return NextResponse.json({ due: due.length, sent, suppressed })
}
