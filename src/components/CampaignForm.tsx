'use client'

import { useActionState } from 'react'
import { saveCampaign, type ActionState } from '@/actions/workspace'

export function CampaignForm({ agentOptions }: { agentOptions: { id: string; name: string }[] }) {
  const [state, submit, pending] = useActionState<ActionState, FormData>(saveCampaign, {})
  return (
    <form action={submit} className="card space-y-3 p-5">
      <h2 className="text-sm font-medium text-white">New campaign</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="name" required className="input-base" placeholder="Campaign name" />
        <select name="agentId" required className="input-base">
          {agentOptions.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} makes the calls
            </option>
          ))}
        </select>
      </div>
      <textarea
        name="goal"
        required
        rows={2}
        className="input-base"
        placeholder="What should each call achieve? e.g. Remind customers with appointments tomorrow, and offer to reschedule if the time no longer works."
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-gray-400">Max attempts per contact</span>
          <input name="maxAttempts" type="number" min={1} max={5} defaultValue={2} className="input-base" />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-gray-400">Minimum hours between touches</span>
          <input name="minHours" type="number" min={1} max={720} defaultValue={48} className="input-base" />
        </label>
      </div>
      <p className="text-xs text-gray-600">
        Cadence rules are enforced, not suggested: quiet hours, minimum gaps, attempt caps, and opt-outs all suppress dials at the queue level.
      </p>
      {state.error && <p className="text-sm text-rose-400">{state.error}</p>}
      {state.ok && <p className="text-sm text-brand">{state.ok}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? 'Creating…' : 'Create & enroll contacts'}
      </button>
    </form>
  )
}
