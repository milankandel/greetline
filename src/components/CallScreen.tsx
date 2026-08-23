'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Bot, Mic, MicOff, PhoneOff, Send } from 'lucide-react'

type Turn = { role: 'agent' | 'caller'; text: string }

type Props = {
  callId: string
  agentName: string
  /** Spoken immediately on inbound calls. */
  greeting: string | null
  direction: 'inbound' | 'outbound'
  contactName?: string
  /** Outbound demo mode: an AI plays the person who answered. */
  autoCallee?: boolean
  onEnded?: (outcome: string) => void
}

type SpeechRecognitionLike = {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>>; resultIndex: number }) => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  start: () => void
  stop: () => void
}

function getRecognizer(): SpeechRecognitionLike | null {
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  return Ctor ? new Ctor() : null
}

export function CallScreen({ callId, agentName, greeting, direction, contactName, autoCallee, onEnded }: Props) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [thinking, setThinking] = useState(false)
  const [listening, setListening] = useState(false)
  const [voiceSupported, setVoiceSupported] = useState(true)
  const [ended, setEnded] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const recognizer = useRef<SpeechRecognitionLike | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const opened = useRef(false)

  const audioRef = useRef<HTMLAudioElement | null>(null)

  const speak = useCallback(async (text: string) => {
    // Prefer natural TTS from the server; fall back to the browser voice.
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (res.ok) {
        const blob = await res.blob()
        audioRef.current?.pause()
        const audio = new Audio(URL.createObjectURL(blob))
        audioRef.current = audio
        void audio.play()
        return
      }
    } catch {
      // fall through to speechSynthesis
    }
    if (!('speechSynthesis' in window)) return
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.05
    const natural = window.speechSynthesis.getVoices().find((v) => /natural|neural|premium|samantha|google us english/i.test(v.name))
    if (natural) utterance.voice = natural
    window.speechSynthesis.speak(utterance)
  }, [])

  const agentSaid = useCallback(
    (text: string) => {
      setTurns((t) => [...t, { role: 'agent', text }])
      void speak(text)
    },
    [speak],
  )

  const sendCallerLine = useCallback(
    async (text: string) => {
      if (busy.current || !text.trim()) return
      busy.current = true
      setTurns((t) => [...t, { role: 'caller', text }])
      setThinking(true)
      try {
        const res = await fetch('/api/call/turn', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ callId, callerSaid: text }),
        })
        const json = (await res.json()) as { say?: string; ended?: boolean; outcome?: string; error?: string }
        if (json.error) throw new Error(json.error)
        if (json.say) agentSaid(json.say)
        if (json.ended) {
          setEnded(json.outcome ?? 'no_outcome')
          onEnded?.(json.outcome ?? 'no_outcome')
        }
      } catch (e) {
        setTurns((t) => [...t, { role: 'agent', text: `[call error: ${(e as Error).message}]` }])
      } finally {
        setThinking(false)
        busy.current = false
      }
    },
    [agentSaid, callId, onEnded],
  )

  // Opening move: inbound speaks the greeting; outbound asks the engine for its opener.
  useEffect(() => {
    // StrictMode mounts effects twice in dev; the call must open exactly once.
    if (opened.current) return
    opened.current = true
    if (greeting) {
      agentSaid(greeting)
      return
    }
    void (async () => {
      setThinking(true)
      const res = await fetch('/api/call/turn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ callId }),
      })
      const json = (await res.json()) as { say?: string }
      if (json.say) agentSaid(json.say)
      setThinking(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Demo mode: after each agent line, the AI callee replies on its own.
  useEffect(() => {
    if (!autoCallee || ended || thinking) return
    const last = turns[turns.length - 1]
    if (!last || last.role !== 'agent' || last.text.startsWith('[')) return
    const timer = setTimeout(async () => {
      const res = await fetch('/api/call/simulate-callee', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ callId }),
      })
      const json = (await res.json()) as { say?: string }
      if (json.say) void sendCallerLine(json.say)
    }, 1600)
    return () => clearTimeout(timer)
  }, [turns, autoCallee, ended, thinking, callId, sendCallerLine])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [turns, thinking])

  const toggleMic = () => {
    if (listening) {
      recognizer.current?.stop()
      setListening(false)
      return
    }
    const r = getRecognizer()
    if (!r) {
      setVoiceSupported(false)
      return
    }
    recognizer.current = r
    r.lang = 'en-US'
    r.interimResults = false
    r.continuous = false
    r.onresult = (event) => {
      const text = event.results[event.resultIndex]?.[0]?.transcript
      if (text) void sendCallerLine(text)
    }
    r.onend = () => setListening(false)
    r.onerror = () => setListening(false)
    r.start()
    setListening(true)
  }

  return (
    <div className="card flex h-[70vh] flex-col">
      <div className="flex items-center gap-3 border-b border-edge px-4 py-3">
        <span className={`size-2 rounded-full ${ended ? 'bg-gray-600' : 'bg-emerald-400 motion-safe:animate-pulse'}`} />
        <span className="text-sm text-white">
          {direction === 'inbound' ? `Incoming call → ${agentName}` : `${agentName} calling ${contactName ?? 'contact'}`}
        </span>
        {autoCallee && !ended && <span className="rounded bg-violet-950 px-1.5 py-0.5 text-[10px] tracking-wide text-brand uppercase">ai callee</span>}
        {ended && <span className="ml-auto rounded bg-gray-800 px-2 py-0.5 text-[11px] text-gray-300">ended — {ended.replace(/_/g, ' ')}</span>}
      </div>

      <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === 'agent' ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                t.role === 'agent' ? 'bg-raised text-gray-200' : 'bg-brand-deep/40 text-violet-100'
              }`}
            >
              {t.role === 'agent' && <Bot className="mr-1.5 mb-0.5 inline size-3.5 text-brand" />}
              {t.text}
            </div>
          </div>
        ))}
        {thinking && <p className="text-xs text-gray-500">{agentName} is thinking…</p>}
      </div>

      {!ended && (
        <div className="border-t border-edge p-3">
          {!voiceSupported && (
            <p className="mb-2 text-xs text-amber-400">Voice input needs Chrome or Edge — the text box below works everywhere.</p>
          )}
          <div className="flex gap-2">
            {!autoCallee && (
              <button
                type="button"
                onClick={toggleMic}
                className={`btn ${listening ? 'bg-rose-600 text-white' : 'btn-primary'}`}
                title={listening ? 'Stop listening' : 'Speak'}
              >
                {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                {listening ? 'Listening…' : 'Speak'}
              </button>
            )}
            {!autoCallee && (
              <form
                className="flex flex-1 gap-2"
                onSubmit={(e) => {
                  e.preventDefault()
                  void sendCallerLine(draft)
                  setDraft('')
                }}
              >
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="input-base flex-1"
                  placeholder={direction === 'inbound' ? '…or type what the caller says' : '…or type the contact’s reply'}
                />
                <button type="submit" className="btn btn-ghost" aria-label="Send">
                  <Send className="size-4" />
                </button>
              </form>
            )}
            {autoCallee && <p className="flex-1 self-center text-xs text-gray-500">Hands-free demo — an AI is playing the callee. Sit back.</p>}
            <button
              type="button"
              onClick={() => void sendCallerLine('[The caller hung up.]')}
              className="btn btn-ghost text-rose-300"
              title="Hang up"
            >
              <PhoneOff className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
