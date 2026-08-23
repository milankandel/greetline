# VoxDesk

An AI receptionist you author in one sentence — it answers calls, books real appointments,
works outbound campaigns politely, and posts every outcome to your CRM as a signed webhook.

**Live demo:** [voxdesk-nu.vercel.app](https://voxdesk.vercel.app) *(URL confirmed on deploy)* —
sign up, click **Simulate incoming call**, and speak.

## What it does

- **Author by prompting.** Describe the business ("a barbershop with three chairs, closed Mondays")
  → VoxDesk drafts the persona, greeting, bookable services, and a step-by-step SOP the agent must
  follow — including what it may never promise. Everything lands in an editable form; nothing goes
  live unreviewed.
- **Inbound calls in the browser.** Speech recognition in, natural TTS out (Gemini TTS with
  browser-voice fallback). The agent checks live availability before offering a time and
  re-verifies before booking — it cannot invent a slot.
- **Outbound campaigns.** A goal in plain English, dialed across your contact list. Take the calls
  yourself, or watch the hands-free demo where a second AI plays the customer.
- **Cadence discipline.** Attempt caps, minimum hours between touches, quiet hours, and hard
  opt-outs are enforced at the queue and in the follow-up worker — suppressions are recorded with
  reasons, never silent. Being disturbed twice in a day costs a customer; a skipped reminder costs nothing.
- **Follow-ups.** Promises made mid-call become scheduled follow-ups; a cron worker drafts the
  message in the agent's voice and ships it to your CRM.
- **CRM webhooks.** Every completed call and follow-up POSTs as JSON with an HMAC-SHA256 signature,
  idempotency key, and exponential-backoff retry. SSRF-guarded destinations (https-only, no private addresses).

## Architecture

```
Browser (STT/TTS) ⇄ /api/call/turn ⇄ agent engine (LLM tool-calling, ≤2 calls/turn)
                                        ├─ availability → demo calendar (Google Calendar adapter point)
                                        ├─ bookings / messages / follow-ups → Postgres
                                        └─ outcome → signed webhook → CRM
Campaign queue → cadence guards (opt-out, gaps, quiet hours, attempt caps) → next eligible contact
Cron → follow-up worker → suppress-or-send with recorded reasons
```

Honest scope: calls run in the browser — same brain a phone line would use, demoed without a
phone bill. Real telephony (Twilio) plugs in at the transport layer. The LLM layer is
provider-agnostic (Groq / Gemini / OpenRouter free tiers).

## Stack

Next.js 16 · TypeScript · Drizzle + Neon Postgres · Groq (chat) + Gemini (TTS) · Tailwind v4

## Local setup

```bash
cp .env.example .env.local   # DATABASE_URL, APP_SECRET, GROQ_API_KEY (chat), GEMINI_API_KEY (TTS)
npm install
npx drizzle-kit migrate
npm run dev
```
