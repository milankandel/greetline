import { desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { contacts } from '@/db/schema'
import { requireUser } from '@/lib/session'
import { deleteContact, toggleDoNotContact } from '@/actions/workspace'
import { ContactForm } from '@/components/ContactForm'

export default async function ContactsPage() {
  const user = await requireUser()
  const rows = await db.select().from(contacts).where(eq(contacts.userId, user.id)).orderBy(desc(contacts.createdAt))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Contacts</h1>
        <p className="mt-1 text-sm text-gray-400">
          The database campaigns dial from. Opt-outs are absolute: a do-not-contact flag beats every campaign and follow-up, permanently.
        </p>
      </div>
      <ContactForm />
      <ul className="space-y-2">
        {rows.map((c) => (
          <li key={c.id} className={`card flex flex-wrap items-center gap-3 p-4 ${c.doNotContact ? 'opacity-50' : ''}`}>
            <span className="text-sm text-white">{c.name}</span>
            <span className="text-xs text-gray-500">{[c.phone, c.email].filter(Boolean).join(' · ')}</span>
            {c.tags.map((t) => (
              <span key={t} className="rounded border border-edge px-1.5 py-0.5 text-[10px] text-gray-400">
                {t}
              </span>
            ))}
            {c.doNotContact && <span className="rounded bg-rose-950 px-1.5 py-0.5 text-[10px] tracking-wide text-rose-300 uppercase">do not contact</span>}
            {c.lastContactedAt && <span className="text-[11px] text-gray-600">touched {c.lastContactedAt.toLocaleDateString()}</span>}
            <div className="ml-auto flex gap-3 text-xs">
              <form action={toggleDoNotContact}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="current" value={String(c.doNotContact)} />
                <button className="text-gray-400 hover:text-white">{c.doNotContact ? 'Allow contact' : 'Opt out'}</button>
              </form>
              <form action={deleteContact}>
                <input type="hidden" name="id" value={c.id} />
                <button className="text-gray-500 hover:text-rose-400">Delete</button>
              </form>
            </div>
            {c.notes && <p className="w-full text-xs text-gray-500">{c.notes}</p>}
          </li>
        ))}
      </ul>
    </div>
  )
}
