import { getInstance } from '@/lib/instances'
import { notFound } from 'next/navigation'
import { CronMonitor } from '@/components/crons/CronMonitor'

export default async function CronsPage({ params }: { params: Promise<{ instanceId: string }> }) {
  const { instanceId } = await params
  const inst = getInstance(instanceId)
  if (!inst) notFound()
  return <CronMonitor instance={inst} />
}
