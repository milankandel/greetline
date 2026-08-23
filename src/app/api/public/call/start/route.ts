import { NextResponse, type NextRequest } from 'next/server'
import { and, count, eq, gte } from 'drizzle-orm'
import { db } from '@/db'
import { agents, calls } from '@/db/schema'

/** Public demo calls per agent per day. Protects the owner's LLM quota. */
const PUBLIC_DAILY_CAP = 40

/** No-signup calls from the demo page and the embeddable widget. */
export async function POST(request: NextRequest) {
  const { publicId, transport } = (await request.json()) as { publicId?: string; transport?: 'browser' | 'widget' }
  if (!publicId) return NextResponse.json({ error: 'publicId required' }, { status: 400 })

  const [agent] = await db
    .select()
    .from(agents)
    .where(and(eq(agents.publicId, publicId), eq(agents.publicEnabled, true), eq(agents.active, true)))
    .limit(1)
  if (!agent) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const since = new Date(Date.now() - 86_400_000)
  const [{ used }] = await db
    .select({ used: count() })
    .from(calls)
    .where(and(eq(calls.agentId, agent.id), eq(calls.viaPublic, true), gte(calls.startedAt, since)))
  if (used >= PUBLIC_DAILY_CAP) {
    return NextResponse.json({ error: 'The demo line is busy today — try again tomorrow.' }, { status: 429 })
  }

  const [call] = await db
    .insert(calls)
    .values({
      userId: agent.userId,
      agentId: agent.id,
      direction: 'inbound',
      transport: transport === 'widget' ? 'widget' : 'browser',
      viaPublic: true,
    })
    .returning()

  return NextResponse.json({
    callId: call.id,
    agentName: agent.name,
    businessName: agent.businessName,
    greeting: agent.greeting,
  })
}
