import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AudioLines } from 'lucide-react'
import { currentUser } from '@/lib/session'
import { logOut } from '@/actions/auth'

const NAV = [
  { href: '/dashboard', label: 'Overview' },
  { href: '/dashboard/agents', label: 'Agents' },
  { href: '/dashboard/contacts', label: 'Contacts' },
  { href: '/dashboard/campaigns', label: 'Campaigns' },
  { href: '/dashboard/calls', label: 'Call log' },
  { href: '/dashboard/followups', label: 'Follow-ups' },
  { href: '/dashboard/settings', label: 'CRM' },
]

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen">
      <header className="border-b border-edge">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-3">
          <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold text-white">
            <AudioLines className="size-4 text-brand" />
            VoxDesk
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-1.5 text-[13px] text-gray-400 transition hover:bg-raised hover:text-white">
                {n.label}
              </Link>
            ))}
          </nav>
          <span className="hidden text-xs text-gray-500 sm:block">{user.email}</span>
          <form action={logOut}>
            <button className="text-xs text-gray-500 transition hover:text-white">Sign out</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
