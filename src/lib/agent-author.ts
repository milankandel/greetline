import type { Service } from '@/db/schema'
import { completeStructured } from './llm'

export type DraftedAgent = {
  name: string
  businessName: string
  persona: string
  sop: string
  services: Service[]
  hours: string
  greeting: string
  notes: string
}

const SPEC = {
  type: 'object' as const,
  properties: {
    name: { type: 'string', description: 'A first name for the receptionist, e.g. "Maya".' },
    businessName: { type: 'string' },
    persona: { type: 'string', description: 'Two sentences, second person: who the agent is, its temperament, how it speaks on the phone.' },
    sop: {
      type: 'string',
      description:
        'The standard operating procedure as numbered steps: how to greet, what to ask, booking rules, what it may never promise, when to take a message instead, when to schedule a follow-up, how to close. Concrete, not generic.',
    },
    services: {
      type: 'array',
      description: 'Bookable services with realistic durations. Price null when unknown.',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          minutes: { type: 'number' },
          priceUsd: { type: 'number', description: 'Omit or null when the operator gave no price.' },
        },
        required: ['name', 'minutes'],
      },
    },
    hours: { type: 'string', description: 'e.g. "Mon-Sat 9:00-18:00".' },
    greeting: { type: 'string', description: 'The exact first line spoken when answering, mentioning the business name.' },
    notes: { type: 'string', description: 'One or two sentences to the operator: judgement calls made, what to tighten.' },
  },
  required: ['name', 'businessName', 'persona', 'sop', 'services', 'hours', 'greeting', 'notes'],
}

/** One sentence about the business in, a complete editable receptionist out. */
export async function draftAgent(prompt: string): Promise<DraftedAgent> {
  const result = await completeStructured({
    system:
      'You design AI phone receptionists for small businesses. The operator describes their business in their own ' +
      'words; you return a complete working spec. The SOP is where quality lives: write the steps a careful human ' +
      'receptionist at this exact kind of business would follow, including what NOT to promise (prices not listed, ' +
      'medical or legal advice, refunds) and when to hand off to a human via message or follow-up.',
    user: prompt,
    toolName: 'agent',
    toolDescription: 'The drafted receptionist specification.',
    schema: SPEC,
  })
  const raw = result.output as DraftedAgent
  return { ...raw, services: (raw.services ?? []).map((s) => ({ ...s, priceUsd: s.priceUsd ?? null })) }
}
