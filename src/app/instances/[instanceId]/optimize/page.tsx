import { getInstance } from '@/lib/instances'
import { notFound } from 'next/navigation'
import { OptimizePanel } from '@/components/optimize/OptimizePanel'

export default async function OptimizePage({ params }: { params: Promise<{ instanceId: string }> }) {
  const { instanceId } = await params
  const inst = getInstance(instanceId)
  if (!inst) notFound()
  return <OptimizePanel instance={inst} />
}
