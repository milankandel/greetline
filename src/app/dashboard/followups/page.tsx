import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { contacts, followups } from '@/db/schema'
import { requireUser } from '@/lib/session'
import { cancelFollowup } from '@/actions/workspace'

const TONE: Record<string, string> = {
  scheduled: 'bg-amber-950 text-amber-300',
  sent: 'bg-violet-950 text-brand',
  suppressed: 'bg-gray-800 text-gray-400',
  cancelled: 'bg-gray-800 text-gray-500',
}

export default async function FollowupsPage() {
  const user = await requireUser()
  const rows = await db
    .select({ f: followups, contactName: contacts.name })
    .from(followups)
    .leftJoin(contacts, eq(followups.contactId, contacts.id))
    .where(eq(followups.userId, user.id))
    .orderBy(desc(followups.createdAt))
    .limit(40)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Follow-ups</h1>
        <p className="mt-1 text-sm text-gray-400">
          Promises the agent made to re-contact someone. The worker enforces spacing: nothing sends inside 24h of the last touch, nothing
          ever sends to an opt-out — a suppressed follow-up shows its reason rather than silently disappearing.
        </p>
      </div>
      <ul className="space-y-2">
        {rows.map(({ f, contactName }) => (
          <li key={f.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded px-1.5 py-0.5 text-[10px] tracking-wide uppercase ${TONE[f.status]}`}>{f.status}</span>
              <span className="rounded border border-edge px-1.5 py-0.5 text-[10px] text-gray-400 uppercase">{f.channel}</span>
              <span className="text-sm text-white">{contactName ?? 'Unknown contact'}</span>
              <span className="text-xs text-gray-500">{f.reason}</span>
              <span className="ml-auto text-xs text-gray-600">due {f.dueAt.toLocaleString()}</span>
              {f.status === 'scheduled' && (
                <form action={cancelFollowup}>
                  <input type="hidden" name="id" value={f.id} />
                  <button className="text-xs text-gray-500 hover:text-rose-400">Cancel</button>
                </form>
              )}
            </div>
            {f.suppressedReason && <p className="mt-1.5 text-xs text-amber-400">suppressed: {f.suppressedReason}</p>}
            {f.draft && <p className="mt-2 rounded-md border border-edge bg-ink p-2.5 text-xs whitespace-pre-wrap text-gray-300">{f.draft}</p>}
          </li>
        ))}
        {!rows.length && <li className="card p-8 text-center text-sm text-gray-500">No follow-ups yet — the agent schedules them mid-call when a caller asks to be contacted later.</li>}
      </ul>
    </div>
  )
}
