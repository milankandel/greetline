import { PublicCall } from '@/components/PublicCall'

/** Rendered inside the customer-site iframe the embed script creates. */
export default async function WidgetPage({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params
  return (
    <div className="h-screen">
      <PublicCall publicId={publicId} transport="widget" compact />
    </div>
  )
}
