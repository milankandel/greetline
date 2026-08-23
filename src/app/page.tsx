import Link from 'next/link'
import { ArrowRight, AudioLines, CalendarCheck, MoonStar, PhoneIncoming, PhoneOutgoing, ShieldCheck, Webhook } from 'lucide-react'
import { currentUser } from '@/lib/session'

const TRANSCRIPT: { role: 'agent' | 'caller'; text: string }[] = [
  { role: 'agent', text: 'Thank you for calling Harbor Dental Studio, this is Maya — how can I help you today?' },
  { role: 'caller', text: 'Hi, my crown came loose this morning and it really hurts.' },
  { role: 'agent', text: 'I’m sorry — that sounds urgent. Let me check today’s emergency slots… I can see 10:30 or 11:00 this morning. Which works?' },
  { role: 'caller', text: '10:30. It’s Rosa Delgado, 415-555-0182.' },
  { role: 'agent', text: 'Booked: emergency assessment, today at 10:30 for Rosa Delgado. Dr. Chen will see you — anything else?' },
]

const PILLARS = [
  {
    icon: PhoneIncoming,
    title: 'Answers like your best hire',
    body: 'Describe your business in one sentence. Greetline drafts the persona, greeting, and a step-by-step SOP — booking rules, what never to promise, when to hand off to a human. You edit; it obeys.',
  },
  {
    icon: PhoneOutgoing,
    title: 'Works your list, politely',
    body: 'Campaigns dial through your contacts toward a goal you write in plain English. Attempt caps, minimum gaps between touches, quiet hours, and hard opt-outs are enforced at the queue — not suggested in a prompt.',
  },
  {
    icon: CalendarCheck,
    title: 'Books real appointments',
    body: 'The agent checks live availability before offering a time and re-verifies before booking — it cannot invent a slot. Every offer comes from the calendar, never from the model’s imagination.',
  },
  {
    icon: Webhook,
    title: 'Lands in your CRM',
    body: 'Every call outcome and follow-up ships as an HMAC-signed webhook with retries — transcript, structured fields, and the drafted follow-up message included. HubSpot, Zapier, or your own endpoint.',
  },
  {
    icon: MoonStar,
    title: 'Never becomes spam',
    body: 'The follow-up worker suppresses anything landing within 24 hours of the last touch and records why. A customer disturbed twice in a day costs more than a skipped reminder — the cadence engine knows it.',
  },
  {
    icon: ShieldCheck,
    title: 'Honest by design',
    body: 'Calls run in the browser over speech recognition and synthesis — the same brain a phone line would use, demoed without a phone bill. The telephony adapter is where Twilio plugs in.',
  },
]

function Waveform() {
  const heights = [14, 26, 38, 30, 44, 22, 36, 48, 28, 40, 18, 32, 46, 24, 34]
  return (
    <div className="flex h-12 items-center gap-1" aria-hidden>
      {heights.map((h, i) => (
        <span key={i} className="gl-bar w-1 rounded-full bg-brand/70" style={{ height: `${h}px`, animationDelay: `${i * 90}ms` }} />
      ))}
    </div>
  )
}

export default async function Home() {
  const user = await currentUser()

  return (
    <main className="gl-glow">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="flex items-center gap-2 font-semibold text-white">
          <AudioLines className="size-5 text-brand" />
          Greetline
        </span>
        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <Link href="/dashboard" className="btn btn-primary">
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-primary">
                Start free
              </Link>
            </>
          )}
        </nav>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-16 pb-24">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
          <div className="gl-rise">
            <span className="inline-flex items-center gap-2 rounded-full border border-edge bg-raised/80 px-3 py-1 text-xs text-gray-400">
              <span className="size-1.5 rounded-full bg-brand" />
              Inbound · Outbound · Follow-ups — one agent
            </span>
            <h1 className="mt-6 text-4xl leading-[1.06] font-semibold tracking-tight text-white sm:text-6xl">
              Your phone,
              <span className="block bg-gradient-to-r from-violet-300 via-brand to-sky-300 bg-clip-text text-transparent">answered forever.</span>
            </h1>
            <p className="mt-6 max-w-xl text-[15px] leading-relaxed text-gray-400">
              Greetline is an AI receptionist you author in one sentence. It answers every call by your SOP, books real appointments against a
              real calendar, calls your list toward goals you set — and refuses to pester anyone. Every outcome lands in your CRM, signed.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/signup" className="btn btn-primary px-5 py-2.5">
                Talk to the demo agent <ArrowRight className="size-4" />
              </Link>
              <Waveform />
            </div>
            <p className="mt-3 text-xs text-gray-600">Free workspace, preloaded with a receptionist, contacts, and a running campaign.</p>
          </div>

          <div className="card gl-rise gl-rise-2 overflow-hidden shadow-[0_0_80px_-20px_rgb(139_92_246/0.25)]">
            <div className="flex items-center gap-2 border-b border-edge px-4 py-2.5">
              <span className="size-2 rounded-full bg-emerald-400" />
              <span className="text-xs text-gray-400">Live call — Maya · Harbor Dental Studio</span>
              <span className="ml-auto rounded bg-violet-950 px-1.5 py-0.5 text-[10px] tracking-wide text-brand uppercase">booked</span>
            </div>
            <div className="space-y-3 p-4">
              {TRANSCRIPT.map((t, i) => (
                <div key={i} className={`flex ${t.role === 'agent' ? 'justify-start' : 'justify-end'}`}>
                  <p
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-relaxed ${
                      t.role === 'agent' ? 'bg-raised text-gray-200' : 'bg-brand-deep/40 text-violet-100'
                    }`}
                  >
                    {t.text}
                  </p>
                </div>
              ))}
              <div className="rounded-lg border border-edge bg-ink p-3 font-mono text-[11px] leading-relaxed text-gray-500">
                POST /crm/hooks · x-greetline-signature: t=1787…,v1=9c41…{'\n'}
                {'{'} &quot;type&quot;: &quot;call.completed&quot;, &quot;outcome&quot;: &quot;booked&quot;, &quot;service&quot;: &quot;Emergency assessment&quot;, &quot;startsAt&quot;: &quot;10:30&quot; {'}'}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-edge bg-surface/40">
        <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-12 px-6 py-20 sm:grid-cols-2 lg:grid-cols-3">
          {PILLARS.map((p, i) => (
            <div key={p.title} className={`gl-rise ${i % 3 === 1 ? 'gl-rise-2' : i % 3 === 2 ? 'gl-rise-3' : ''}`}>
              <div className="inline-flex rounded-lg border border-edge bg-raised p-2">
                <p.icon className="size-4 text-brand" />
              </div>
              <h2 className="mt-3 text-[15px] font-medium text-white">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-gray-400">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-white">Sixty seconds to a working receptionist.</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm text-gray-400">
          Sign up, say what your business does, and take the first call yourself — speak into the mic, try to trip it up.
        </p>
        <Link href="/signup" className="btn btn-primary mt-8 px-6 py-3">
          Create your agent <ArrowRight className="size-4" />
        </Link>
      </section>

      <footer className="border-t border-edge">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-gray-600">
          <span>Greetline — built by Milan Kandel</span>
          <a href="https://github.com/milankandel/greetline" className="hover:text-brand" target="_blank" rel="noreferrer">
            github.com/milankandel/greetline
          </a>
        </div>
      </footer>
    </main>
  )
}
