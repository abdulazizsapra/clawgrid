import { getInstance } from '@/lib/instances'
import { notFound } from 'next/navigation'
import { CostDashboard } from '@/components/cost/CostDashboard'

export default async function CostPage({ params }: { params: Promise<{ instanceId: string }> }) {
  const { instanceId } = await params
  const inst = getInstance(instanceId)
  if (!inst) notFound()
  return <CostDashboard instance={inst} />
}
