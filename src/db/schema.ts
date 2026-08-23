import { relations } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex('users_email_key').on(t.email)])

/** One receptionist: who it is, how it behaves, what it may promise. */
export const agents = pgTable('agents', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  businessName: text('business_name').notNull(),
  /** Who the agent is acting as — voice, role, temperament. */
  persona: text('persona').notNull(),
  /** The standard operating procedure the agent must follow on every call. */
  sop: text('sop').notNull(),
  /** Services it may book, one per line, with durations. */
  services: jsonb('services').$type<Service[]>().notNull(),
  /** Opening hours it may offer slots within, e.g. "Mon-Fri 9:00-17:00". */
  hours: text('hours').notNull(),
  greeting: text('greeting').notNull(),
  /** The prompt the operator typed; kept so the agent can be re-authored. */
  authoredFrom: text('authored_from'),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export type Service = { name: string; minutes: number; priceUsd: number | null }

export const contacts = pgTable('contacts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  phone: text('phone'),
  email: text('email'),
  tags: jsonb('tags').$type<string[]>().default([]).notNull(),
  notes: text('notes'),
  /** Hard opt-out. No campaign or follow-up may ever touch this contact. */
  doNotContact: boolean('do_not_contact').default(false).notNull(),
  lastContactedAt: timestamp('last_contacted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('contacts_user_idx').on(t.userId)])

/** An outbound calling job over a set of contacts. */
export const campaigns = pgTable('campaigns', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** What each call is trying to achieve, in the operator's words. */
  goal: text('goal').notNull(),
  /** Contact-cadence guardrails — the anti-disturb contract. */
  maxAttempts: integer('max_attempts').default(2).notNull(),
  minHoursBetweenTouches: integer('min_hours_between_touches').default(48).notNull(),
  quietHoursStart: integer('quiet_hours_start').default(20).notNull(),
  quietHoursEnd: integer('quiet_hours_end').default(9).notNull(),
  status: text('status').$type<'draft' | 'running' | 'paused' | 'done'>().default('draft').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

/** One queued or completed call attempt for one contact in a campaign. */
export const campaignCalls = pgTable('campaign_calls', {
  id: uuid('id').defaultRandom().primaryKey(),
  campaignId: uuid('campaign_id').notNull().references(() => campaigns.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  attempts: integer('attempts').default(0).notNull(),
  status: text('status').$type<'queued' | 'done' | 'skipped' | 'exhausted'>().default('queued').notNull(),
  notBefore: timestamp('not_before', { withTimezone: true }),
}, (t) => [uniqueIndex('campaign_calls_pair_key').on(t.campaignId, t.contactId)])

export const calls = pgTable('calls', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'set null' }),
  campaignId: uuid('campaign_id').references(() => campaigns.id, { onDelete: 'set null' }),
  direction: text('direction').$type<'inbound' | 'outbound'>().notNull(),
  transport: text('transport').$type<'browser' | 'simulated'>().notNull(),
  transcript: jsonb('transcript').$type<Turn[]>().default([]).notNull(),
  /** What the call achieved, set by the agent's end_call tool. */
  outcome: text('outcome').$type<'booked' | 'message_taken' | 'follow_up_set' | 'declined' | 'no_outcome'>(),
  summary: text('summary'),
  /** Structured facts the agent captured: name, phone, intent, slot, etc. */
  captured: jsonb('captured').$type<Record<string, unknown>>(),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, (t) => [index('calls_user_started_idx').on(t.userId, t.startedAt)])

export type Turn = { role: 'agent' | 'caller' | 'tool'; text: string; at: string }

/** Booked slots. Stands in for Google Calendar until one is connected. */
export const appointments = pgTable('appointments', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  callId: uuid('call_id').references(() => calls.id, { onDelete: 'set null' }),
  contactName: text('contact_name').notNull(),
  contactPhone: text('contact_phone'),
  service: text('service').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  minutes: integer('minutes').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('appointments_user_starts_idx').on(t.userId, t.startsAt)])

/**
 * A promise to re-contact someone later. The worker honours cadence rules:
 * never inside quiet hours, never sooner than the campaign's minimum gap,
 * never for an opted-out contact.
 */
export const followups = pgTable('followups', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  contactId: uuid('contact_id').references(() => contacts.id, { onDelete: 'cascade' }),
  callId: uuid('call_id').references(() => calls.id, { onDelete: 'set null' }),
  channel: text('channel').$type<'call' | 'email' | 'sms'>().notNull(),
  reason: text('reason').notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }).notNull(),
  status: text('status').$type<'scheduled' | 'sent' | 'suppressed' | 'cancelled'>().default('scheduled').notNull(),
  /** Why the worker refused to send, when it did. */
  suppressedReason: text('suppressed_reason'),
  draft: text('draft'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index('followups_due_idx').on(t.status, t.dueAt)])

/** Where call outcomes get POSTed — the CRM side. Same contract as SkillMail. */
export const destinations = pgTable('destinations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  url: text('url').notNull(),
  secret: text('secret').notNull(),
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const deliveries = pgTable('deliveries', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  callId: uuid('call_id').references(() => calls.id, { onDelete: 'cascade' }),
  followupId: uuid('followup_id').references(() => followups.id, { onDelete: 'cascade' }),
  destinationId: uuid('destination_id').notNull().references(() => destinations.id, { onDelete: 'cascade' }),
  status: text('status').$type<'pending' | 'delivered' | 'failed'>().notNull(),
  attempts: integer('attempts').default(0).notNull(),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const usersRelations = relations(users, ({ many }) => ({
  agents: many(agents),
  contacts: many(contacts),
}))
export const callsRelations = relations(calls, ({ one }) => ({
  agent: one(agents, { fields: [calls.agentId], references: [agents.id] }),
  contact: one(contacts, { fields: [calls.contactId], references: [contacts.id] }),
}))
