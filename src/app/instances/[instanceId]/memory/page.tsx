import { getInstance } from '@/lib/instances'
import { notFound } from 'next/navigation'
import { MemoryBrowser } from '@/components/memory/MemoryBrowser'

export default async function MemoryPage({ params }: { params: Promise<{ instanceId: string }> }) {
  const { instanceId } = await params
  const inst = getInstance(instanceId)
  if (!inst) notFound()
  return <MemoryBrowser instance={inst} />
}
