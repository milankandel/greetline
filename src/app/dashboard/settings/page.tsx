import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { destinations } from '@/db/schema'
import { requireUser } from '@/lib/session'
import { deleteDestination } from '@/actions/workspace'
import { DestinationForm } from '@/components/DestinationForm'

export default async function SettingsPage() {
  const user = await requireUser()
  const rows = await db.select().from(destinations).where(eq(destinations.userId, user.id)).orderBy(desc(destinations.createdAt))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">CRM destinations</h1>
        <p className="mt-1 text-sm text-gray-400">
          Every completed call and every sent follow-up is POSTed here as JSON, HMAC-SHA256 signed, with retry on failure — plug in
          HubSpot, Zapier, Make, or your own endpoint.
        </p>
      </div>
      <DestinationForm />
      <ul className="space-y-2">
        {rows.map((d) => (
          <li key={d.id} className="card flex flex-wrap items-center gap-3 p-4">
            <span className="text-sm text-white">{d.name}</span>
            <span className="font-mono text-xs break-all text-gray-500">{d.url}</span>
            <span className="font-mono text-[11px] text-gray-600">{d.secret.slice(0, 12)}…</span>
            <form action={deleteDestination} className="ml-auto">
              <input type="hidden" name="id" value={d.id} />
              <button className="text-xs text-gray-500 hover:text-rose-400">Delete</button>
            </form>
          </li>
        ))}
      </ul>
    </div>
  )
}
