'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioLines, Mic, MicOff, Send } from 'lucide-react'

type Turn = { role: 'agent' | 'caller'; text: string }

type Props = { publicId: string; transport?: 'browser' | 'widget'; compact?: boolean }

type Recognizer = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>>; resultIndex: number }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

function getRecognizer(): Recognizer | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognizer; webkitSpeechRecognition?: new () => Recognizer }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return Ctor ? new Ctor() : null
}

/** The no-signup demo call. Also rendered inside the embeddable widget iframe. */
export function PublicCall({ publicId, transport = 'browser', compact }: Props) {
  const [call, setCall] = useState<{ callId: string; agentName: string; businessName: string } | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [thinking, setThinking] = useState(false)
  const [listening, setListening] = useState(false)
  const [ended, setEnded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const started = useRef(false)
  const busy = useRef(false)
  const scroller = useRef<HTMLDivElement>(null)
  const recognizer = useRef<Recognizer | null>(null)

  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) return
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.05
    const natural = window.speechSynthesis.getVoices().find((v) => /natural|neural|premium|samantha|google us english/i.test(v.name))
    if (natural) u.voice = natural
    window.speechSynthesis.speak(u)
  }, [])

  useEffect(() => {
    if (started.current) return
    started.current = true
    void (async () => {
      const res = await fetch('/api/public/call/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ publicId, transport }),
      })
      const json = (await res.json()) as { callId?: string; agentName?: string; businessName?: string; greeting?: string; error?: string }
      if (json.error || !json.callId) {
        setError(json.error ?? 'Could not start the demo')
        return
      }
      setCall({ callId: json.callId, agentName: json.agentName!, businessName: json.businessName! })
      if (json.greeting) {
        setTurns([{ role: 'agent', text: json.greeting }])
        speak(json.greeting)
      }
    })()
  }, [publicId, transport, speak])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [turns, thinking])

  const send = useCallback(
    async (text: string) => {
      if (!call || busy.current || !text.trim()) return
      busy.current = true
      setTurns((t) => [...t, { role: 'caller', text }])
      setThinking(true)
      try {
        const res = await fetch('/api/public/call/turn', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ callId: call.callId, callerSaid: text }),
        })
        const json = (await res.json()) as { say?: string; ended?: boolean; error?: string }
        if (json.error) throw new Error(json.error)
        if (json.say) {
          setTurns((t) => [...t, { role: 'agent', text: json.say! }])
          speak(json.say)
        }
        if (json.ended) setEnded(true)
      } catch (e) {
        setTurns((t) => [...t, { role: 'agent', text: `[${(e as Error).message}]` }])
      } finally {
        setThinking(false)
        busy.current = false
      }
    },
    [call, speak],
  )

  const toggleMic = () => {
    if (listening) {
      recognizer.current?.stop()
      setListening(false)
      return
    }
    const r = getRecognizer()
    if (!r) return
    recognizer.current = r
    r.lang = 'en-US'
    r.interimResults = false
    r.continuous = false
    r.onresult = (e) => {
      const text = e.results[e.resultIndex]?.[0]?.transcript
      if (text) void send(text)
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    r.start()
    setListening(true)
  }

  if (error) return <p className="p-6 text-center text-sm text-amber-300">{error}</p>

  return (
    <div className={`card flex flex-col ${compact ? 'h-full rounded-none border-0' : 'h-[65vh]'}`}>
      <div className="flex items-center gap-2 border-b border-edge px-4 py-2.5">
        <AudioLines className="size-4 text-brand" />
        <span className="text-sm text-white">{call ? `${call.agentName} · ${call.businessName}` : 'Connecting…'}</span>
        {ended && <span className="ml-auto rounded bg-gray-800 px-2 py-0.5 text-[11px] text-gray-300">call ended</span>}
      </div>
      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === 'agent' ? 'justify-start' : 'justify-end'}`}>
            <p className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${t.role === 'agent' ? 'bg-raised text-gray-200' : 'bg-brand-deep/40 text-violet-100'}`}>
              {t.text}
            </p>
          </div>
        ))}
        {thinking && <p className="text-xs text-gray-500">typing…</p>}
      </div>
      {!ended && (
        <div className="flex gap-2 border-t border-edge p-3">
          <button type="button" onClick={toggleMic} className={`btn ${listening ? 'bg-rose-600 text-white' : 'btn-primary'}`} title="Speak">
            {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </button>
          <form
            className="flex flex-1 gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void send(draft)
              setDraft('')
            }}
          >
            <input value={draft} onChange={(e) => setDraft(e.target.value)} className="input-base flex-1" placeholder="Speak, or type here…" />
            <button type="submit" className="btn btn-ghost" aria-label="Send">
              <Send className="size-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
