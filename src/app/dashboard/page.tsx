import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'
import { PhoneIncoming, PhoneOutgoing } from 'lucide-react'
import { db } from '@/db'
import { agents, appointments, calls, campaigns, followups } from '@/db/schema'
import { requireUser } from '@/lib/session'

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-600">{hint}</p>}
    </div>
  )
}

export default async function Overview() {
  const user = await requireUser()
  const [agentRows, callRows, apptRows, fuRows, campRows] = await Promise.all([
    db.select().from(agents).where(eq(agents.userId, user.id)),
    db.select().from(calls).where(eq(calls.userId, user.id)).orderBy(desc(calls.startedAt)).limit(6),
    db.select().from(appointments).where(eq(appointments.userId, user.id)),
    db.select().from(followups).where(eq(followups.userId, user.id)),
    db.select().from(campaigns).where(eq(campaigns.userId, user.id)),
  ])

  const booked = callRows.filter((c) => c.outcome === 'booked').length

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-white">Overview</h1>
          <p className="mt-1 text-sm text-gray-400">Answer a call, or let the agent work the campaign queue.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/dashboard/call?direction=inbound" className="btn btn-primary">
            <PhoneIncoming className="size-4" /> Simulate incoming call
          </Link>
          <Link href="/dashboard/campaigns" className="btn btn-ghost">
            <PhoneOutgoing className="size-4" /> Run campaign
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Agents" value={agentRows.length} hint={agentRows.map((a) => a.name).join(', ')} />
        <Stat label="Appointments booked" value={apptRows.length} hint={`${booked} from recent calls`} />
        <Stat label="Campaigns" value={campRows.filter((c) => c.status === 'running').length} hint={`${campRows.length} total`} />
        <Stat label="Follow-ups" value={fuRows.filter((f) => f.status === 'scheduled').length} hint={`${fuRows.filter((f) => f.status === 'suppressed').length} suppressed by cadence rules`} />
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-white">Recent calls</h2>
          <Link href="/dashboard/calls" className="text-xs text-brand hover:underline">
            Full log →
          </Link>
        </div>
        {callRows.length === 0 ? (
          <div className="card p-8 text-center text-sm text-gray-400">
            No calls yet. <Link className="text-brand hover:underline" href="/dashboard/call?direction=inbound">Simulate one</Link> — speak into the mic and book an appointment.
          </div>
        ) : (
          <ul className="space-y-2">
            {callRows.map((c) => (
              <li key={c.id} className="card flex flex-wrap items-center gap-3 p-4">
                {c.direction === 'inbound' ? <PhoneIncoming className="size-4 text-brand" /> : <PhoneOutgoing className="size-4 text-brand" />}
                <span className="text-sm text-white">{c.summary || '(in progress)'}</span>
                <span className="ml-auto text-xs text-gray-500">
                  {c.outcome ? c.outcome.replace(/_/g, ' ') : 'live'} · {c.startedAt.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
