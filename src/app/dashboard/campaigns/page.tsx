import Link from 'next/link'
import { desc, eq } from 'drizzle-orm'
import { Bot, PhoneOutgoing } from 'lucide-react'
import { db } from '@/db'
import { agents, campaignCalls, campaigns } from '@/db/schema'
import { requireUser } from '@/lib/session'
import { setCampaignStatus } from '@/actions/workspace'
import { CampaignForm } from '@/components/CampaignForm'

export default async function CampaignsPage() {
  const user = await requireUser()
  const [rows, agentRows] = await Promise.all([
    db.select().from(campaigns).where(eq(campaigns.userId, user.id)).orderBy(desc(campaigns.createdAt)),
    db.select({ id: agents.id, name: agents.name }).from(agents).where(eq(agents.userId, user.id)),
  ])

  const queues = new Map<string, { queued: number; done: number }>()
  for (const c of rows) {
    const items = await db.select({ status: campaignCalls.status }).from(campaignCalls).where(eq(campaignCalls.campaignId, c.id))
    queues.set(c.id, { queued: items.filter((i) => i.status === 'queued').length, done: items.filter((i) => i.status === 'done').length })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Campaigns</h1>
        <p className="mt-1 text-sm text-gray-400">
          Outbound calling over your contact list. Take a call yourself, or watch the hands-free demo where an AI plays the customer.
        </p>
      </div>

      <CampaignForm agentOptions={agentRows} />

      <ul className="space-y-3">
        {rows.map((c) => {
          const q = queues.get(c.id)!
          return (
            <li key={c.id} className="card p-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-white">{c.name}</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] tracking-wide uppercase ${
                    c.status === 'running' ? 'bg-violet-950 text-brand' : 'bg-gray-800 text-gray-400'
                  }`}
                >
                  {c.status}
                </span>
                <span className="text-xs text-gray-500">
                  {q.queued} queued · {q.done} done · max {c.maxAttempts} attempts · {c.minHoursBetweenTouches}h gap
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {c.status === 'running' && q.queued > 0 && (
                    <>
                      <Link href={`/dashboard/call?direction=outbound&campaignId=${c.id}`} className="btn btn-primary text-[13px]">
                        <PhoneOutgoing className="size-3.5" /> Call next
                      </Link>
                      <Link href={`/dashboard/call?direction=outbound&campaignId=${c.id}&auto=1`} className="btn btn-ghost text-[13px]">
                        <Bot className="size-3.5" /> Hands-free demo
                      </Link>
                    </>
                  )}
                  <form action={setCampaignStatus}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="status" value={c.status === 'running' ? 'paused' : 'running'} />
                    <button className="text-xs text-gray-400 hover:text-white">{c.status === 'running' ? 'Pause' : 'Resume'}</button>
                  </form>
                </div>
              </div>
              <p className="mt-2 text-sm text-gray-400">{c.goal}</p>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
