import { desc, eq } from 'drizzle-orm'
import { PhoneIncoming, PhoneOutgoing } from 'lucide-react'
import { db } from '@/db'
import { calls } from '@/db/schema'
import { requireUser } from '@/lib/session'

const TONE: Record<string, string> = {
  booked: 'bg-violet-950 text-brand',
  message_taken: 'bg-sky-950 text-sky-300',
  follow_up_set: 'bg-amber-950 text-amber-300',
  declined: 'bg-gray-800 text-gray-400',
  no_outcome: 'bg-gray-800 text-gray-500',
}

export default async function CallsPage() {
  const user = await requireUser()
  const rows = await db.select().from(calls).where(eq(calls.userId, user.id)).orderBy(desc(calls.startedAt)).limit(40)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Call log</h1>
        <p className="mt-1 text-sm text-gray-400">Every call, its outcome, and the full transcript.</p>
      </div>
      <ul className="space-y-3">
        {rows.map((c) => (
          <li key={c.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              {c.direction === 'inbound' ? <PhoneIncoming className="size-4 text-brand" /> : <PhoneOutgoing className="size-4 text-brand" />}
              {c.outcome && <span className={`rounded px-1.5 py-0.5 text-[10px] tracking-wide uppercase ${TONE[c.outcome]}`}>{c.outcome.replace(/_/g, ' ')}</span>}
              <span className="text-sm text-white">{c.summary || '(no summary)'}</span>
              <span className="ml-auto text-xs text-gray-600">{c.startedAt.toLocaleString()}</span>
            </div>
            {c.transcript.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300">transcript · {c.transcript.length} turns</summary>
                <div className="mt-2 space-y-1.5 rounded-md border border-edge bg-ink p-3">
                  {c.transcript.map((t, i) => (
                    <p key={i} className="text-[12.5px] leading-relaxed">
                      <span className={t.role === 'agent' ? 'text-brand' : 'text-gray-500'}>{t.role === 'agent' ? 'agent' : 'caller'}:</span>{' '}
                      <span className="text-gray-300">{t.text}</span>
                    </p>
                  ))}
                </div>
              </details>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
