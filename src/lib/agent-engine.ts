import { and, eq, gte, lt } from 'drizzle-orm'
import { db } from '@/db'
import { agents, appointments, followups, type Service, type Turn } from '@/db/schema'
import { completeStructured } from './llm'

export type AgentRow = typeof agents.$inferSelect

export type EngineResult = {
  say: string
  /** Set when the agent decided the call is over. */
  ended?: {
    outcome: 'booked' | 'message_taken' | 'follow_up_set' | 'declined' | 'no_outcome'
    summary: string
    captured: Record<string, unknown>
  }
}

const RESPOND_SCHEMA = {
  type: 'object' as const,
  properties: {
    say: { type: 'string', description: 'What to say next. One or two spoken sentences — this is read aloud, never a wall of text.' },
    action: {
      type: 'string',
      enum: ['none', 'check_availability', 'book_appointment', 'schedule_followup', 'end_call'],
      description:
        'none: keep talking. check_availability: you need open slots before answering. book_appointment: caller agreed to a specific offered slot. schedule_followup: caller asked to be contacted later. end_call: the conversation is complete.',
    },
    date: { type: 'string', description: 'YYYY-MM-DD the caller asked about. For check_availability and book_appointment.' },
    time: { type: 'string', description: 'HH:MM 24h start time. For book_appointment only — must be a slot you actually offered.' },
    service: { type: 'string', description: 'Which service, matching the services list. For book_appointment.' },
    callerName: { type: 'string', description: 'Caller name once learned.' },
    callerPhone: { type: 'string', description: 'Callback number once learned.' },
    followupChannel: { type: 'string', enum: ['call', 'email', 'sms'], description: 'For schedule_followup.' },
    followupWhen: { type: 'string', description: 'YYYY-MM-DD for schedule_followup.' },
    followupReason: { type: 'string', description: 'Why the follow-up exists, for schedule_followup.' },
    outcome: {
      type: 'string',
      enum: ['booked', 'message_taken', 'follow_up_set', 'declined', 'no_outcome'],
      description: 'For end_call: what the call achieved.',
    },
    summary: { type: 'string', description: 'For end_call: two-sentence summary for the CRM record.' },
  },
  required: ['say', 'action'],
}

function systemPrompt(agent: AgentRow, direction: 'inbound' | 'outbound', goal?: string): string {
  const services = agent.services.map((s: Service) => `- ${s.name} (${s.minutes} min${s.priceUsd ? `, $${s.priceUsd}` : ''})`).join('\n')
  return [
    agent.persona.trim(),
    '',
    `You are on a live ${direction} phone call for ${agent.businessName}. Everything you output is spoken aloud.`,
    direction === 'outbound' && goal ? `The purpose of THIS call: ${goal}` : '',
    '',
    'STANDARD OPERATING PROCEDURE — follow it exactly:',
    agent.sop.trim(),
    '',
    `Services you may book:\n${services}`,
    `Business hours: ${agent.hours}`,
    '',
    'Rules that override everything: never invent an available time — check availability first and offer only what came back.',
    'Never promise prices or services outside the list. Collect the caller\'s name and number before booking.',
    'If the caller asks to never be contacted again, apologise once, end the call with outcome declined, and say nothing more.',
    'Keep every reply to one or two short spoken sentences.',
    'When the caller signals they are finished — a goodbye, a thanks-that-is-all — say a brief closing line and use the end_call action with the correct outcome. Never leave a finished call hanging.',
    'Never state whether a time is or is not available unless a check_availability result from THIS call says so.',
    'Any promise to contact the caller later MUST be made through the schedule_followup action at the moment you make it — a spoken promise with no action is a broken promise. Use it at most once per call.',
    'On the turn where the caller says goodbye, the action is ALWAYS end_call — never anything else.',
    'You may only say an appointment is booked on the same turn you use the book_appointment action. Words do not book anything; the action does.',
    'When ending the call, always fill callerName and callerPhone if the caller mentioned them at any point.',
  ].filter(Boolean).join('\n')
}

function transcriptAsText(turns: Turn[]): string {
  return turns.map((t) => `${t.role === 'agent' ? 'YOU' : t.role === 'caller' ? 'CALLER' : 'SYSTEM'}: ${t.text}`).join('\n')
}

/** Open slots for a date: business hours minus existing bookings. */
export async function openSlots(userId: string, agent: AgentRow, date: string, minutes: number): Promise<string[]> {
  const dayStart = new Date(`${date}T00:00:00Z`)
  const dayEnd = new Date(`${date}T23:59:59Z`)
  const booked = await db
    .select({ startsAt: appointments.startsAt, minutes: appointments.minutes })
    .from(appointments)
    .where(and(eq(appointments.userId, userId), gte(appointments.startsAt, dayStart), lt(appointments.startsAt, dayEnd)))

  // Hours parsing is deliberately simple: "9:00-17:00" style windows apply to
  // every listed day; the demo calendar doesn't model per-day exceptions.
  const window = agent.hours.match(/(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/)
  const open = window ? Number(window[1]) : 9
  const close = window ? Number(window[3]) : 17

  const slots: string[] = []
  for (let h = open; h + minutes / 60 <= close; h++) {
    for (const m of [0, 30]) {
      const start = new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)
      const end = new Date(start.getTime() + minutes * 60_000)
      const clash = booked.some((b) => {
        const bEnd = new Date(b.startsAt.getTime() + b.minutes * 60_000)
        return start < bEnd && end > b.startsAt
      })
      if (!clash) slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
      if (slots.length >= 6) return slots
    }
  }
  return slots
}

/**
 * One conversational turn. At most two model calls: one to decide, and one
 * more only when the decision needed live data (availability) first.
 */
export async function runTurn(input: {
  userId: string
  agent: AgentRow
  direction: 'inbound' | 'outbound'
  goal?: string
  turns: Turn[]
  callId: string
  contactId?: string | null
}): Promise<EngineResult> {
  const system = systemPrompt(input.agent, input.direction, input.goal)
  const user = `Conversation so far:\n${transcriptAsText(input.turns)}\n\nProduce your next move.`

  const first = await completeStructured({
    system,
    user,
    toolName: 'respond',
    toolDescription: 'Your next spoken line and, when needed, one action.',
    schema: RESPOND_SCHEMA,
  })
  const move = first.output as Record<string, string>

  switch (move.action) {
    case 'check_availability': {
      const service = input.agent.services.find((s) => s.name.toLowerCase() === (move.service ?? '').toLowerCase()) ?? input.agent.services[0]
      const date = move.date || new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
      const slots = await openSlots(input.userId, input.agent, date, service.minutes)
      const second = await completeStructured({
        system,
        user: `${user}\n\nSYSTEM: availability for ${date} (${service.name}): ${slots.length ? slots.join(', ') : 'no open slots'}. Offer at most three, or an alternative if none.`,
        toolName: 'respond',
        toolDescription: 'Your next spoken line. Do not pick another action this turn.',
        schema: RESPOND_SCHEMA,
      })
      return { say: (second.output as Record<string, string>).say }
    }

    case 'book_appointment': {
      if (!move.date || !move.time || !move.callerName) {
        return { say: move.say || 'Could I take your name and preferred time to lock that in?' }
      }
      const service = input.agent.services.find((s) => s.name.toLowerCase() === (move.service ?? '').toLowerCase()) ?? input.agent.services[0]
      // Re-verify instead of trusting the model: the slot must still be open.
      const stillOpen = (await openSlots(input.userId, input.agent, move.date, service.minutes)).includes(move.time)
      if (!stillOpen) {
        return { say: `I'm sorry — ${move.time} just went. Can I offer another time?` }
      }
      const startsAt = new Date(`${move.date}T${move.time}:00Z`)
      await db.insert(appointments).values({
        userId: input.userId,
        agentId: input.agent.id,
        callId: input.callId,
        contactName: move.callerName,
        contactPhone: move.callerPhone || null,
        service: service.name,
        startsAt,
        minutes: service.minutes,
      })
      // No-show prevention: every booking gets a reminder follow-up a day
      // ahead (or halfway there for near-term bookings).
      const reminderAt = new Date(Math.max(Date.now() + 60_000, Math.min(startsAt.getTime() - 86_400_000, startsAt.getTime() - (startsAt.getTime() - Date.now()) / 2)))
      await db.insert(followups).values({
        userId: input.userId,
        agentId: input.agent.id,
        contactId: input.contactId ?? null,
        callId: input.callId,
        channel: 'sms',
        reason: `Appointment reminder: ${move.callerName} — ${service.name} on ${move.date} at ${move.time}. Confirm or offer to rebook.`,
        dueAt: reminderAt,
      })
      return { say: move.say }
    }

    case 'schedule_followup': {
      // One promise per call. The model repeating the action on a later turn
      // must not multiply into repeated contact — that is how you disturb people.
      const already = await db.select({ id: followups.id }).from(followups).where(eq(followups.callId, input.callId)).limit(1)
      if (already.length) return { say: move.say }
      const due = move.followupWhen ? new Date(`${move.followupWhen}T14:00:00Z`) : new Date(Date.now() + 2 * 86_400_000)
      await db.insert(followups).values({
        userId: input.userId,
        agentId: input.agent.id,
        contactId: input.contactId ?? null,
        callId: input.callId,
        channel: (move.followupChannel as 'call' | 'email' | 'sms') || 'call',
        reason: move.followupReason || 'Requested on call',
        dueAt: due,
      })
      return { say: move.say }
    }

    case 'end_call': {
      let outcome = (move.outcome as 'booked' | 'message_taken' | 'follow_up_set' | 'declined' | 'no_outcome') || 'no_outcome'
      let endSummary = move.summary || ''

      // Reconciliation: a 'booked' ending must correspond to a real
      // appointment row from this call. When the model narrated a booking it
      // never performed, book it now if the details are present and the slot
      // is genuinely open — otherwise downgrade honestly and leave a
      // follow-up so a human repairs the promise.
      if (outcome === 'booked') {
        const rows = await db.select({ id: appointments.id }).from(appointments).where(eq(appointments.callId, input.callId)).limit(1)
        if (!rows.length) {
          // The move rarely carries the details on this failure path; pull
          // them from what was actually said before giving up.
          if (!move.date || !move.time || !move.callerName) {
            const salvage = await completeStructured({
              system: 'Extract the appointment agreed on this call. Use only facts stated in the transcript. Today is ' + new Date().toISOString().slice(0, 10) + '.',
              user: transcriptAsText(input.turns),
              toolName: 'booking',
              toolDescription: 'The appointment both sides agreed to.',
              schema: {
                type: 'object',
                properties: {
                  date: { type: 'string', description: 'YYYY-MM-DD' },
                  time: { type: 'string', description: 'HH:MM 24h' },
                  service: { type: 'string' },
                  callerName: { type: 'string' },
                  callerPhone: { type: 'string' },
                },
                required: ['date', 'time', 'callerName'],
              },
            }).catch(() => null)
            if (salvage) {
              const got = salvage.output as Record<string, string>
              move.date = move.date || got.date
              move.time = move.time || got.time
              move.service = move.service || got.service
              move.callerName = move.callerName || got.callerName
              move.callerPhone = move.callerPhone || got.callerPhone
            }
          }
          const service =
            input.agent.services.find((sv) => sv.name.toLowerCase() === (move.service ?? '').toLowerCase()) ?? input.agent.services[0]
          const canBook =
            move.date && move.time && move.callerName &&
            (await openSlots(input.userId, input.agent, move.date, service.minutes)).includes(move.time)
          if (canBook) {
            await db.insert(appointments).values({
              userId: input.userId,
              agentId: input.agent.id,
              callId: input.callId,
              contactName: move.callerName,
              contactPhone: move.callerPhone || null,
              service: service.name,
              startsAt: new Date(`${move.date}T${move.time}:00Z`),
              minutes: service.minutes,
            })
          } else {
            outcome = 'follow_up_set'
            endSummary = `NEEDS ATTENTION — caller was told a booking exists but none was made. ${endSummary}`
            await db.insert(followups).values({
              userId: input.userId,
              agentId: input.agent.id,
              contactId: input.contactId ?? null,
              callId: input.callId,
              channel: 'call',
              reason: endSummary,
              dueAt: new Date(Date.now() + 60 * 60_000),
            })
          }
        }
      }

      // Safety net: a follow_up_set outcome must leave a follow-up row even
      // when the model skipped the schedule_followup action mid-call.
      if (outcome === 'follow_up_set' && !endSummary.startsWith('NEEDS ATTENTION')) {
        const existing = await db.select({ id: followups.id }).from(followups).where(eq(followups.callId, input.callId)).limit(1)
        if (!existing.length) {
          await db.insert(followups).values({
            userId: input.userId,
            agentId: input.agent.id,
            contactId: input.contactId ?? null,
            callId: input.callId,
            channel: 'call',
            reason: move.summary || 'Promised on call',
            dueAt: new Date(Date.now() + 18 * 3_600_000),
          })
        }
      }

      // Salvage contact details from the transcript when the model left the
      // captured fields empty — a phone number said aloud must not be lost.
      const spoken = input.turns.filter((t) => t.role === 'caller').map((t) => t.text).join(' ')
      const phoneMatch = move.callerPhone || spoken.match(/(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}/)?.[0] || null

      return {
        say: move.say,
        ended: {
          outcome,
          summary: endSummary,
          captured: {
            callerName: move.callerName || null,
            callerPhone: phoneMatch,
          },
        },
      }
    }

    default:
      return { say: move.say }
  }
}

/**
 * Plays the other side of a simulated outbound call, so the demo can run
 * hands-free. A separate persona with its own instructions — it knows nothing
 * the receptionist knows.
 */
export async function simulateCallee(agentBusiness: string, goal: string, turns: Turn[]): Promise<string> {
  const result = await completeStructured({
    system:
      'You are an ordinary person answering your phone. Respond naturally in one short spoken sentence — sometimes busy, sometimes interested, occasionally asking a question back. Never break character, never mention being an AI.',
    user: `A receptionist from ${agentBusiness} is calling you about: ${goal}\n\nCall so far:\n${transcriptAsText(turns)}\n\nYour next line as the person called:`,
    toolName: 'speak',
    toolDescription: 'Your next spoken line.',
    schema: { type: 'object', properties: { say: { type: 'string' } }, required: ['say'] },
  })
  return (result.output as { say: string }).say
}
