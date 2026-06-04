import { getInstance } from '@/lib/instances'
import { notFound } from 'next/navigation'
import { ChannelsView } from '@/components/channels/ChannelsView'

export default async function ChannelsPage({ params }: { params: Promise<{ instanceId: string }> }) {
  const { instanceId } = await params
  const inst = getInstance(instanceId)
  if (!inst) notFound()
  return <ChannelsView instance={inst} />
}
