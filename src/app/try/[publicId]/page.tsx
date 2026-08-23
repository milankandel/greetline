import Link from 'next/link'
import { and, eq } from 'drizzle-orm'
import { AudioLines } from 'lucide-react'
import { db } from '@/db'
import { agents } from '@/db/schema'
import { PublicCall } from '@/components/PublicCall'

export default async function TryPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params
  const [agent] = await db
    .select({ businessName: agents.businessName })
    .from(agents)
    .where(and(eq(agents.publicId, publicId), eq(agents.publicEnabled, true)))
    .limit(1)

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-white">
          <AudioLines className="size-4 text-brand" />
          Greetline
        </Link>
        <Link href="/signup" className="btn btn-ghost text-[13px]">
          Build your own agent
        </Link>
      </header>
      {agent ? (
        <>
          <h1 className="mb-1 text-lg font-semibold text-white">Call {agent.businessName}</h1>
          <p className="mb-5 text-sm text-gray-400">No signup. Click the mic and talk — ask for an appointment, or try to trip it up.</p>
          <PublicCall publicId={publicId} />
        </>
      ) : (
        <p className="card p-8 text-center text-sm text-gray-400">This demo line is not available.</p>
      )}
    </main>
  )
}
