import { NextResponse, type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { agents, campaignCalls, calls, campaigns, deliveries, destinations, type Turn } from '@/db/schema'
import { currentUser } from '@/lib/session'
import { runTurn } from '@/lib/agent-engine'
import { deliver, nextAttemptAt } from '@/lib/webhook'

/** One caller utterance in, one agent utterance out. Persists the transcript. */
export async function POST(request: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const body = (await request.json()) as { callId: string; callerSaid?: string }

  const [call] = await db
    .select()
    .from(calls)
    .where(and(eq(calls.id, body.callId), eq(calls.userId, user.id)))
    .limit(1)
  if (!call) return NextResponse.json({ error: 'call not found' }, { status: 404 })
  if (call.endedAt) return NextResponse.json({ error: 'call already ended' }, { status: 409 })

  const [agent] = await db.select().from(agents).where(eq(agents.id, call.agentId)).limit(1)

  const turns: Turn[] = [...call.transcript]
  if (body.callerSaid?.trim()) turns.push({ role: 'caller', text: body.callerSaid.trim(), at: new Date().toISOString() })

  let goal: string | undefined
  if (call.campaignId) {
    const [c] = await db.select({ goal: campaigns.goal }).from(campaigns).where(eq(campaigns.id, call.campaignId)).limit(1)
    goal = c?.goal
  }

  const result = await runTurn({
    userId: user.id,
    agent,
    direction: call.direction,
    goal,
    turns,
    callId: call.id,
    contactId: call.contactId,
  })

  turns.push({ role: 'agent', text: result.say, at: new Date().toISOString() })

  if (!result.ended) {
    await db.update(calls).set({ transcript: turns }).where(eq(calls.id, call.id))
    return NextResponse.json({ say: result.say, ended: false })
  }

  await db
    .update(calls)
    .set({
      transcript: turns,
      endedAt: new Date(),
      outcome: result.ended.outcome,
      summary: result.ended.summary,
      captured: result.ended.captured,
    })
    .where(eq(calls.id, call.id))

  if (call.campaignId && call.contactId) {
    await db
      .update(campaignCalls)
      .set({ status: 'done' })
      .where(and(eq(campaignCalls.campaignId, call.campaignId), eq(campaignCalls.contactId, call.contactId)))
  }

  // Ship the outcome to every active CRM destination, SkillMail-style.
  const targets = await db
    .select()
    .from(destinations)
    .where(and(eq(destinations.userId, user.id), eq(destinations.active, true)))

  for (const target of targets) {
    const [pending] = await db
      .insert(deliveries)
      .values({ userId: user.id, callId: call.id, destinationId: target.id, status: 'pending' })
      .returning()
    const attempt = await deliver({
      url: target.url,
      secret: target.secret,
      headers: {},
      idempotencyKey: pending.id,
      payload: {
        type: 'call.completed',
        direction: call.direction,
        agent: agent.name,
        outcome: result.ended.outcome,
        summary: result.ended.summary,
        captured: result.ended.captured,
        transcript: turns,
        startedAt: call.startedAt.toISOString(),
        endedAt: new Date().toISOString(),
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

  return NextResponse.json({ say: result.say, ended: true, outcome: result.ended.outcome, summary: result.ended.summary })
}
