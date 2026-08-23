'use server'

import { revalidatePath } from 'next/cache'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { agents, campaignCalls, campaigns, contacts, destinations, followups, type Service } from '@/db/schema'
import { newSecret } from '@/lib/crypto'
import { randomBytes } from 'node:crypto'
import { requireUser } from '@/lib/session'
import { assertPublicUrl } from '@/lib/webhook'
import { draftAgent, type DraftedAgent } from '@/lib/agent-author'

export type ActionState = { error?: string; ok?: string }
export type DraftState = ActionState & { draft?: DraftedAgent }

function fail(e: unknown): ActionState {
  const message = e instanceof Error ? e.message : 'Something went wrong'
  return { error: message === 'UNAUTHENTICATED' ? 'Your session expired. Sign in again.' : message }
}

export async function draftAgentFromPrompt(_prev: DraftState, formData: FormData): Promise<DraftState> {
  try {
    await requireUser()
    const prompt = String(formData.get('prompt') ?? '').trim()
    if (prompt.length < 10) return { error: 'Describe the business in a sentence so there is something to work from' }
    return { draft: await draftAgent(prompt), ok: 'Draft ready — review the SOP before going live' }
  } catch (e) {
    return fail(e)
  }
}

export async function saveAgent(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser()
    const services = JSON.parse(String(formData.get('services') || '[]')) as Service[]
    if (!services.length) return { error: 'Add at least one bookable service' }

    const values = {
      name: String(formData.get('name') ?? '').trim(),
      businessName: String(formData.get('businessName') ?? '').trim(),
      persona: String(formData.get('persona') ?? '').trim(),
      sop: String(formData.get('sop') ?? '').trim(),
      services,
      hours: String(formData.get('hours') ?? '').trim() || 'Mon-Fri 9:00-17:00',
      greeting: String(formData.get('greeting') ?? '').trim(),
      authoredFrom: String(formData.get('authoredFrom') ?? '') || null,
    }
    if (values.name.length < 2 || values.businessName.length < 2) return { error: 'Name and business name are required' }
    if (values.sop.length < 40) return { error: 'The SOP is the product — give it real steps' }

    const id = formData.get('id')
    if (id) {
      await db.update(agents).set(values).where(and(eq(agents.id, String(id)), eq(agents.userId, user.id)))
    } else {
      await db.insert(agents).values({ userId: user.id, publicId: randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, 'x'), ...values })
    }
    revalidatePath('/dashboard/agents')
    return { ok: id ? 'Agent updated' : 'Agent created' }
  } catch (e) {
    return fail(e)
  }
}

export async function deleteAgent(formData: FormData) {
  const user = await requireUser()
  await db.delete(agents).where(and(eq(agents.id, String(formData.get('id'))), eq(agents.userId, user.id)))
  revalidatePath('/dashboard/agents')
}

export async function saveContact(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser()
    const name = String(formData.get('name') ?? '').trim()
    if (name.length < 2) return { error: 'Name is required' }
    await db.insert(contacts).values({
      userId: user.id,
      name,
      phone: String(formData.get('phone') ?? '').trim() || null,
      email: String(formData.get('email') ?? '').trim() || null,
      notes: String(formData.get('notes') ?? '').trim() || null,
      tags: String(formData.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    })
    revalidatePath('/dashboard/contacts')
    return { ok: 'Contact added' }
  } catch (e) {
    return fail(e)
  }
}

export async function toggleDoNotContact(formData: FormData) {
  const user = await requireUser()
  const id = String(formData.get('id'))
  const current = formData.get('current') === 'true'
  await db.update(contacts).set({ doNotContact: !current }).where(and(eq(contacts.id, id), eq(contacts.userId, user.id)))
  revalidatePath('/dashboard/contacts')
}

export async function deleteContact(formData: FormData) {
  const user = await requireUser()
  await db.delete(contacts).where(and(eq(contacts.id, String(formData.get('id'))), eq(contacts.userId, user.id)))
  revalidatePath('/dashboard/contacts')
}

export async function saveCampaign(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser()
    const agentId = String(formData.get('agentId') ?? '')
    const name = String(formData.get('name') ?? '').trim()
    const goal = String(formData.get('goal') ?? '').trim()
    if (name.length < 2 || goal.length < 15) return { error: 'Name the campaign and describe the goal of each call' }

    const [agent] = await db.select({ id: agents.id }).from(agents).where(and(eq(agents.id, agentId), eq(agents.userId, user.id))).limit(1)
    if (!agent) return { error: 'Pick which agent makes these calls' }

    const [campaign] = await db
      .insert(campaigns)
      .values({
        userId: user.id,
        agentId,
        name,
        goal,
        maxAttempts: Math.min(5, Math.max(1, Number(formData.get('maxAttempts')) || 2)),
        minHoursBetweenTouches: Math.min(720, Math.max(1, Number(formData.get('minHours')) || 48)),
        status: 'running',
      })
      .returning()

    // Enroll every eligible contact; opted-out people never enter the queue.
    const eligible = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.userId, user.id), eq(contacts.doNotContact, false)))
    if (eligible.length) {
      await db.insert(campaignCalls).values(eligible.map((c) => ({ campaignId: campaign.id, contactId: c.id }))).onConflictDoNothing()
    }
    revalidatePath('/dashboard/campaigns')
    return { ok: `Campaign running — ${eligible.length} contacts queued` }
  } catch (e) {
    return fail(e)
  }
}

export async function setCampaignStatus(formData: FormData) {
  const user = await requireUser()
  const status = String(formData.get('status')) as 'running' | 'paused' | 'done'
  await db
    .update(campaigns)
    .set({ status })
    .where(and(eq(campaigns.id, String(formData.get('id'))), eq(campaigns.userId, user.id)))
  revalidatePath('/dashboard/campaigns')
}

export async function saveDestination(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser()
    const name = String(formData.get('name') ?? '').trim()
    const url = String(formData.get('url') ?? '').trim()
    if (name.length < 2) return { error: 'Give the destination a name' }
    try {
      await assertPublicUrl(url)
    } catch (e) {
      return { error: (e as Error).message }
    }
    await db.insert(destinations).values({ userId: user.id, name, url, secret: newSecret(), active: true })
    revalidatePath('/dashboard/settings')
    return { ok: 'Destination added' }
  } catch (e) {
    return fail(e)
  }
}

export async function deleteDestination(formData: FormData) {
  const user = await requireUser()
  await db.delete(destinations).where(and(eq(destinations.id, String(formData.get('id'))), eq(destinations.userId, user.id)))
  revalidatePath('/dashboard/settings')
}

export async function cancelFollowup(formData: FormData) {
  const user = await requireUser()
  await db
    .update(followups)
    .set({ status: 'cancelled' })
    .where(and(eq(followups.id, String(formData.get('id'))), eq(followups.userId, user.id)))
  revalidatePath('/dashboard/followups')
}
