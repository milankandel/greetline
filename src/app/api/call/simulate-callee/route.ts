import { NextResponse, type NextRequest } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { agents, calls, campaigns } from '@/db/schema'
import { currentUser } from '@/lib/session'
import { simulateCallee } from '@/lib/agent-engine'

/** Demo mode: an AI plays the person who picked up. */
export async function POST(request: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const { callId } = (await request.json()) as { callId: string }
  const [call] = await db
    .select()
    .from(calls)
    .where(and(eq(calls.id, callId), eq(calls.userId, user.id)))
    .limit(1)
  if (!call || call.endedAt) return NextResponse.json({ error: 'call not found or ended' }, { status: 404 })

  const [agent] = await db.select().from(agents).where(eq(agents.id, call.agentId)).limit(1)
  let goal = 'a general call'
  if (call.campaignId) {
    const [c] = await db.select({ goal: campaigns.goal }).from(campaigns).where(eq(campaigns.id, call.campaignId)).limit(1)
    goal = c?.goal ?? goal
  }

  const say = await simulateCallee(agent.businessName, goal, call.transcript)
  return NextResponse.json({ say })
}
