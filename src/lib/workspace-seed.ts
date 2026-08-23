import { randomBytes } from 'node:crypto'
import { db } from '@/db'
import { agents, campaignCalls, campaigns, contacts } from '@/db/schema'

/**
 * A fresh workspace gets a working receptionist, a handful of contacts, and a
 * ready-to-run win-back campaign, so the first click demonstrates everything.
 */
export async function seedWorkspace(userId: string) {
  const [agent] = await db
    .insert(agents)
    .values({
      userId,
      publicId: randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, 'x'),
      name: 'Maya',
      businessName: 'Harbor Dental Studio',
      persona:
        'You are Maya, the front-desk receptionist at Harbor Dental Studio. You are warm, unhurried, and precise — ' +
        'the kind of receptionist who repeats the appointment back before hanging up.',
      sop: [
        '1. Greet with the business name and ask how you can help.',
        '2. For booking: ask which service, offer only checked availability, collect full name and callback number, confirm the slot back twice.',
        '3. Never quote prices beyond the service list, never give dental advice — offer a call-back from the hygienist instead.',
        '4. If the caller is in pain, treat it as urgent: offer the earliest slot of the day.',
        '5. If nothing fits, take a message or schedule a follow-up call — never leave the caller without a next step.',
        '6. Close by confirming what happens next.',
      ].join('\n'),
      services: [
        { name: 'Check-up & clean', minutes: 30, priceUsd: 120 },
        { name: 'Whitening consult', minutes: 30, priceUsd: null },
        { name: 'Emergency assessment', minutes: 60, priceUsd: 180 },
      ],
      hours: 'Mon-Sat 9:00-17:00',
      greeting: 'Thank you for calling Harbor Dental Studio, this is Maya — how can I help you today?',
      authoredFrom: 'A dental clinic receptionist that books cleanings and handles emergencies.',
      active: true,
    })
    .returning()

  const seeded = await db
    .insert(contacts)
    .values([
      { userId, name: 'Rosa Delgado', phone: '+1 415 555 0182', email: 'rosa@example.com', tags: ['lapsed'], notes: 'Last visit 14 months ago.' },
      { userId, name: 'Ken Watanabe', phone: '+1 628 555 0140', email: 'ken@example.com', tags: ['lapsed'], notes: 'Cancelled twice this spring.' },
      { userId, name: 'Amara Osei', phone: '+1 415 555 0117', email: 'amara@example.com', tags: ['new-patient'], notes: 'Asked about whitening.' },
    ])
    .returning()

  const [campaign] = await db
    .insert(campaigns)
    .values({
      userId,
      agentId: agent.id,
      name: 'Lapsed patient win-back',
      goal: 'Invite patients who have not visited in over a year to book a check-up and clean. Be gentle — one offer, no pressure.',
      maxAttempts: 2,
      minHoursBetweenTouches: 48,
      status: 'running',
    })
    .returning()

  await db.insert(campaignCalls).values(seeded.map((c) => ({ campaignId: campaign.id, contactId: c.id })))
}
