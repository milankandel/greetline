import { NextResponse, type NextRequest } from 'next/server'
import { and, eq, isNull, lte, or, sql as dsql } from 'drizzle-orm'
import { db } from '@/db'
import { agents, campaignCalls, campaigns, calls, contacts } from '@/db/schema'
import { currentUser } from '@/lib/session'

/**
 * Opens a call record. Inbound: caller is anonymous until they identify.
 * Outbound: pops the next eligible contact off the campaign queue, enforcing
 * the campaign's cadence rules before anyone is dialled.
 */
export async function POST(request: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const body = (await request.json()) as { agentId?: string; campaignId?: string; direction: 'inbound' | 'outbound' }

  if (body.direction === 'inbound') {
    const [agent] = await db
      .select()
      .from(agents)
      .where(and(eq(agents.userId, user.id), body.agentId ? eq(agents.id, body.agentId) : eq(agents.active, true)))
      .limit(1)
    if (!agent) return NextResponse.json({ error: 'no active agent' }, { status: 404 })

    const [call] = await db
      .insert(calls)
      .values({ userId: user.id, agentId: agent.id, direction: 'inbound', transport: 'browser' })
      .returning()
    return NextResponse.json({ callId: call.id, agentId: agent.id, greeting: agent.greeting, agentName: agent.name })
  }

  // Outbound: next queued contact whose cadence window is open.
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, String(body.campaignId)), eq(campaigns.userId, user.id)))
    .limit(1)
  if (!campaign) return NextResponse.json({ error: 'campaign not found' }, { status: 404 })

  const hour = new Date().getUTCHours()
  const quiet =
    campaign.quietHoursStart > campaign.quietHoursEnd
      ? hour >= campaign.quietHoursStart || hour < campaign.quietHoursEnd
      : hour >= campaign.quietHoursStart && hour < campaign.quietHoursEnd
  if (quiet) {
    return NextResponse.json({ error: `Inside quiet hours (${campaign.quietHoursStart}:00–${campaign.quietHoursEnd}:00 UTC). Nobody gets called now.` }, { status: 409 })
  }

  const rows = await db
    .select({ queued: campaignCalls, contact: contacts })
    .from(campaignCalls)
    .innerJoin(contacts, eq(campaignCalls.contactId, contacts.id))
    .where(
      and(
        eq(campaignCalls.campaignId, campaign.id),
        eq(campaignCalls.status, 'queued'),
        or(isNull(campaignCalls.notBefore), lte(campaignCalls.notBefore, new Date())),
      ),
    )
    .limit(20)

  const gapMs = campaign.minHoursBetweenTouches * 3_600_000
  const eligible = rows.find(({ contact }) => {
    if (contact.doNotContact) return false
    if (contact.lastContactedAt && Date.now() - contact.lastContactedAt.getTime() < gapMs) return false
    return true
  })

  // Mark hard-skips so the queue drains rather than spinning on them.
  for (const { queued, contact } of rows) {
    if (contact.doNotContact) {
      await db.update(campaignCalls).set({ status: 'skipped' }).where(eq(campaignCalls.id, queued.id))
    }
  }

  if (!eligible) {
    return NextResponse.json({ error: 'No contact is currently eligible — cadence gaps or opt-outs are holding the rest.' }, { status: 404 })
  }

  const [agent] = await db.select().from(agents).where(eq(agents.id, campaign.agentId)).limit(1)

  await db
    .update(campaignCalls)
    .set({ attempts: dsql`${campaignCalls.attempts} + 1` })
    .where(eq(campaignCalls.id, eligible.queued.id))
  await db.update(contacts).set({ lastContactedAt: new Date() }).where(eq(contacts.id, eligible.contact.id))

  const [call] = await db
    .insert(calls)
    .values({
      userId: user.id,
      agentId: agent.id,
      contactId: eligible.contact.id,
      campaignId: campaign.id,
      direction: 'outbound',
      transport: 'browser',
    })
    .returning()

  return NextResponse.json({
    callId: call.id,
    agentId: agent.id,
    agentName: agent.name,
    goal: campaign.goal,
    contact: { id: eligible.contact.id, name: eligible.contact.name, phone: eligible.contact.phone },
    queueItemId: eligible.queued.id,
    greeting: null,
  })
}
