import { getInstance } from '@/lib/instances'
import { notFound } from 'next/navigation'
import { HealthMonitor } from '@/components/health/HealthMonitor'

export default async function HealthPage({ params }: { params: Promise<{ instanceId: string }> }) {
  const { instanceId } = await params
  const inst = getInstance(instanceId)
  if (!inst) notFound()
  return <HealthMonitor instance={inst} />
}
