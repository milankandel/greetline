'use client'

import { useActionState } from 'react'
import { saveContact, type ActionState } from '@/actions/workspace'

export function ContactForm() {
  const [state, submit, pending] = useActionState<ActionState, FormData>(saveContact, {})
  return (
    <form action={submit} className="card grid gap-2 p-4 sm:grid-cols-[1.2fr_1fr_1.2fr_1fr_auto]">
      <input name="name" required className="input-base" placeholder="Full name" />
      <input name="phone" className="input-base" placeholder="Phone" />
      <input name="email" className="input-base" placeholder="Email" />
      <input name="tags" className="input-base" placeholder="tags,comma" />
      <button type="submit" disabled={pending} className="btn btn-primary">
        {pending ? '…' : 'Add'}
      </button>
      {state.error && <p className="text-sm text-rose-400 sm:col-span-5">{state.error}</p>}
    </form>
  )
}
