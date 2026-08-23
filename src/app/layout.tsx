import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'VoxDesk — an AI receptionist that answers, books, and follows up',
  description:
    'Describe your business in a sentence. VoxDesk drafts the SOP, answers calls in the browser, books real appointments, runs polite outbound campaigns, and posts every outcome to your CRM as a signed webhook.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
