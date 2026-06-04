import { getInstance } from '@/lib/instances'
import { notFound } from 'next/navigation'
import { AgentsView } from '@/components/agents/AgentsView'

export default async function AgentsPage({ params }: { params: Promise<{ instanceId: string }> }) {
  const { instanceId } = await params
  const inst = getInstance(instanceId)
  if (!inst) notFound()
  return <AgentsView instance={inst} />
}
