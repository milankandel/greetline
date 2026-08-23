'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CallScreen } from '@/components/CallScreen'

type StartResponse = {
  callId?: string
  agentName?: string
  greeting?: string | null
  goal?: string
  contact?: { name: string }
  error?: string
}

function CallPage() {
  const params = useSearchParams()
  const router = useRouter()
  const direction = (params.get('direction') as 'inbound' | 'outbound') ?? 'inbound'
  const campaignId = params.get('campaignId')
  const autoCallee = params.get('auto') === '1'
  const [call, setCall] = useState<StartResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // One page load = one call record, StrictMode double-mount included.
    if (started.current) return
    started.current = true
    void (async () => {
      const res = await fetch('/api/call/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ direction, campaignId }),
      })
      const json = (await res.json()) as StartResponse
      if (json.error) setError(json.error)
      else setCall(json)
    })()
  }, [direction, campaignId])

  if (error) {
    return (
      <div className="card p-8 text-center">
        <p className="text-sm text-amber-300">{error}</p>
        <button onClick={() => router.back()} className="btn btn-ghost mt-4">
          Back
        </button>
      </div>
    )
  }
  if (!call?.callId) return <p className="text-sm text-gray-500">Connecting…</p>

  return (
    <div className="space-y-4">
      <CallScreen
        callId={call.callId}
        agentName={call.agentName ?? 'Agent'}
        greeting={call.greeting ?? null}
        direction={direction}
        contactName={call.contact?.name}
        autoCallee={autoCallee}
        onEnded={() => setTimeout(() => router.push('/dashboard/calls'), 2500)}
      />
      {direction === 'inbound' && (
        <p className="text-xs text-gray-600">
          You are the caller. Click <span className="text-gray-400">Speak</span> and ask for an appointment — or try to trick the agent into
          promising something off-SOP.
        </p>
      )}
    </div>
  )
}

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Connecting…</p>}>
      <CallPage />
    </Suspense>
  )
}
