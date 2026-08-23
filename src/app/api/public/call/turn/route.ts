import { NextResponse, type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { agents, calls, type Turn } from '@/db/schema'
import { runTurn } from '@/lib/agent-engine'

/** A public conversation cannot run forever on someone else's key. */
const MAX_TURNS = 40

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { callId: string; callerSaid?: string }

  const [call] = await db
    .select()
    .from(calls)
    .where(and(eq(calls.id, body.callId), eq(calls.viaPublic, true)))
    .limit(1)
  if (!call) return NextResponse.json({ error: 'call not found' }, { status: 404 })
  if (call.endedAt) return NextResponse.json({ error: 'call ended' }, { status: 409 })
  if (call.transcript.length >= MAX_TURNS) {
    await db.update(calls).set({ endedAt: new Date(), outcome: 'no_outcome', summary: 'Public demo hit the turn cap.' }).where(eq(calls.id, call.id))
    return NextResponse.json({ say: 'Thanks for trying the demo — this call has reached its limit.', ended: true })
  }

  const [agent] = await db.select().from(agents).where(eq(agents.id, call.agentId)).limit(1)

  const turns: Turn[] = [...call.transcript]
  if (body.callerSaid?.trim()) turns.push({ role: 'caller', text: body.callerSaid.trim().slice(0, 600), at: new Date().toISOString() })

  const result = await runTurn({
    userId: call.userId,
    agent,
    direction: 'inbound',
    turns,
    callId: call.id,
    contactId: null,
  })

  turns.push({ role: 'agent', text: result.say, at: new Date().toISOString() })

  await db
    .update(calls)
    .set(
      result.ended
        ? { transcript: turns, endedAt: new Date(), outcome: result.ended.outcome, summary: result.ended.summary, captured: result.ended.captured }
        : { transcript: turns },
    )
    .where(eq(calls.id, call.id))

  return NextResponse.json({ say: result.say, ended: Boolean(result.ended), outcome: result.ended?.outcome })
}
