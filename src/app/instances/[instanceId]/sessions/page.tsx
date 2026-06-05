import { getInstance } from '@/lib/instances'
import { notFound } from 'next/navigation'
import { SessionsView } from '@/components/sessions/SessionsView'

export default async function SessionsPage({ params }: { params: Promise<{ instanceId: string }> }) {
  const { instanceId } = await params
  const inst = getInstance(instanceId)
  if (!inst) notFound()
  return <SessionsView instance={inst} />
}
