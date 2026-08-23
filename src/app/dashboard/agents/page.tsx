import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { agents } from '@/db/schema'
import { requireUser } from '@/lib/session'
import { AgentList } from '@/components/AgentList'

export default async function AgentsPage() {
  const user = await requireUser()
  const rows = await db.select().from(agents).where(eq(agents.userId, user.id)).orderBy(desc(agents.createdAt))
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Agents</h1>
        <p className="mt-1 text-sm text-gray-400">
          One sentence about the business becomes a full receptionist — persona, greeting, services, and the SOP it must follow on every
          call. Edit anything before it takes calls.
        </p>
      </div>
      <AgentList rows={rows} />
    </div>
  )
}
