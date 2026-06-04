import { getInstance } from '@/lib/instances'
import { notFound } from 'next/navigation'
import { LogViewer } from '@/components/logs/LogViewer'

export default async function LogsPage({ params }: { params: Promise<{ instanceId: string }> }) {
  const { instanceId } = await params
  const inst = getInstance(instanceId)
  if (!inst) notFound()
  return <LogViewer instance={inst} />
}
