'use client'

import { useState } from 'react'
import { AgentComposer, AgentEditor, type AgentDraft } from './AgentEditor'
import { deleteAgent } from '@/actions/workspace'
import type { DraftedAgent } from '@/lib/agent-author'

export type AgentRowData = AgentDraft & { id: string; publicId: string | null }

export function AgentList({ rows }: { rows: AgentRowData[] }) {
  const [editing, setEditing] = useState<string | null>(null)
  const [pending, setPending] = useState<{ draft: AgentDraft; notes: string } | null>(null)

  const accept = (d: DraftedAgent, prompt: string) =>
    setPending({
      notes: d.notes,
      draft: {
        name: d.name,
        businessName: d.businessName,
        persona: d.persona,
        sop: d.sop,
        services: d.services,
        hours: d.hours,
        greeting: d.greeting,
        authoredFrom: prompt,
      },
    })

  return (
    <div className="space-y-4">
      {pending ? (
        <AgentEditor agent={pending.draft} notes={pending.notes} onDone={() => setPending(null)} />
      ) : (
        <AgentComposer onDraft={accept} />
      )}

      {rows.map((row) =>
        editing === row.id ? (
          <AgentEditor key={row.id} agent={row} onDone={() => setEditing(null)} />
        ) : (
          <div key={row.id} className="card p-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-white">{row.name}</span>
              <span className="text-xs text-gray-500">{row.businessName} · {row.hours}</span>
              <div className="ml-auto flex gap-3 text-xs">
                <a href="/dashboard/call?direction=inbound" className="text-brand hover:underline">
                  Test call
                </a>
                <button onClick={() => setEditing(row.id)} className="text-gray-400 hover:text-white">
                  Edit
                </button>
                <form action={deleteAgent}>
                  <input type="hidden" name="id" value={row.id} />
                  <button className="text-gray-500 hover:text-rose-400">Delete</button>
                </form>
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500 italic">{row.greeting}</p>
            <pre className="mt-2 max-h-40 overflow-y-auto rounded-md border border-edge bg-ink p-3 font-mono text-[11.5px] whitespace-pre-wrap text-gray-400">{row.sop}</pre>
            {row.publicId && (
              <div className="mt-3 rounded-md border border-edge bg-ink p-2.5 text-[11.5px] text-gray-500">
                <p>
                  Public demo line: <a className="text-brand hover:underline" href={`/try/${row.publicId}`}>/try/{row.publicId}</a>
                </p>
                <p className="mt-1 font-mono break-all">
                  {`<script src="${typeof window !== 'undefined' ? window.location.origin : ''}/widget.js" data-agent="${row.publicId}" defer></script>`}
                </p>
              </div>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {row.services.map((s) => (
                <span key={s.name} className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-gray-400">
                  {s.name} · {s.minutes}m{s.priceUsd ? ` · $${s.priceUsd}` : ''}
                </span>
              ))}
            </div>
          </div>
        ),
      )}
    </div>
  )
}
