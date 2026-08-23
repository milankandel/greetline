'use client'

import { useActionState, useState } from 'react'
import { Plus, Sparkles, X } from 'lucide-react'
import { draftAgentFromPrompt, saveAgent, type ActionState, type DraftState } from '@/actions/workspace'
import type { Service } from '@/db/schema'
import type { DraftedAgent } from '@/lib/agent-author'

export type AgentDraft = {
  id?: string
  name: string
  businessName: string
  persona: string
  sop: string
  services: Service[]
  hours: string
  greeting: string
  authoredFrom?: string | null
}

export function AgentComposer({ onDraft }: { onDraft: (d: DraftedAgent, prompt: string) => void }) {
  const [state, submit, pending] = useActionState<DraftState, FormData>(async (prev, data) => {
    const result = await draftAgentFromPrompt(prev, data)
    if (result.draft) onDraft(result.draft, String(data.get('prompt') ?? ''))
    return result
  }, {})

  return (
    <form action={submit} className="card space-y-3 p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-brand" />
        <h2 className="text-sm font-medium text-white">Describe your business</h2>
      </div>
      <textarea
        name="prompt"
        rows={2}
        required
        className="input-base"
        placeholder="A barbershop with three chairs — walk-ins, fades, and beard trims. Closed Mondays."
      />
      {state.error && <p className="text-sm text-rose-400">{state.error}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? 'Drafting the receptionist…' : 'Draft my receptionist'}
      </button>
    </form>
  )
}

export function AgentEditor({ agent, notes, onDone }: { agent?: AgentDraft; notes?: string; onDone?: () => void }) {
  const [services, setServices] = useState<Service[]>(agent?.services?.length ? agent.services : [{ name: '', minutes: 30, priceUsd: null }])
  const [state, submit, pending] = useActionState<ActionState, FormData>(async (prev, data) => {
    data.set('services', JSON.stringify(services.filter((s) => s.name.trim())))
    const result = await saveAgent(prev, data)
    if (result.ok) onDone?.()
    return result
  }, {})

  const patch = (i: number, next: Partial<Service>) => setServices((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...next } : r)))
  const field = 'input-base'

  return (
    <form action={submit} className="card space-y-4 p-5">
      {agent?.id && <input type="hidden" name="id" value={agent.id} />}
      {agent?.authoredFrom && <input type="hidden" name="authoredFrom" value={agent.authoredFrom} />}
      {notes && <p className="rounded-md border border-violet-900/50 bg-violet-950/25 px-3 py-2 text-sm text-violet-200">{notes}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1 block text-xs text-gray-400">Agent name</span>
          <input name="name" required defaultValue={agent?.name} className={field} placeholder="Maya" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-gray-400">Business</span>
          <input name="businessName" required defaultValue={agent?.businessName} className={field} placeholder="Harbor Dental Studio" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-gray-400">Hours</span>
          <input name="hours" defaultValue={agent?.hours} className={field} placeholder="Mon-Sat 9:00-17:00" />
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-xs text-gray-400">Greeting — the exact first line on inbound calls</span>
        <input name="greeting" required defaultValue={agent?.greeting} className={field} />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-gray-400">Persona</span>
        <textarea name="persona" required rows={2} defaultValue={agent?.persona} className={field} />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs text-gray-400">Standard operating procedure — the agent follows this on every call</span>
        <textarea name="sop" required rows={7} defaultValue={agent?.sop} className={`${field} font-mono text-[12.5px]`} />
      </label>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs text-gray-400">Bookable services</span>
          <button type="button" onClick={() => setServices((s) => [...s, { name: '', minutes: 30, priceUsd: null }])} className="inline-flex items-center gap-1 text-xs text-brand hover:underline">
            <Plus className="size-3" /> Add
          </button>
        </div>
        <div className="space-y-2">
          {services.map((s, i) => (
            <div key={i} className="grid grid-cols-[1fr_6rem_6rem_auto] gap-2">
              <input value={s.name} onChange={(e) => patch(i, { name: e.target.value })} className={field} placeholder="Check-up & clean" />
              <input value={s.minutes} onChange={(e) => patch(i, { minutes: Number(e.target.value) || 30 })} className={field} inputMode="numeric" placeholder="min" />
              <input
                value={s.priceUsd ?? ''}
                onChange={(e) => patch(i, { priceUsd: e.target.value === '' ? null : Number(e.target.value) })}
                className={field}
                inputMode="decimal"
                placeholder="$ (opt)"
              />
              <button type="button" onClick={() => setServices((rows) => rows.filter((_, idx) => idx !== i))} className="text-gray-600 hover:text-rose-400" aria-label="Remove">
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {state.error && <p className="text-sm text-rose-400">{state.error}</p>}
      {state.ok && <p className="text-sm text-brand">{state.ok}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={pending} className="btn btn-primary">
          {pending ? 'Saving…' : agent?.id ? 'Save changes' : 'Create agent'}
        </button>
        {onDone && (
          <button type="button" onClick={onDone} className="btn btn-ghost">
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
