import { getInstance } from '@/lib/instances'
import { notFound } from 'next/navigation'
import { SecurityManager } from '@/components/security/SecurityManager'

export default async function SecurityPage({ params }: { params: Promise<{ instanceId: string }> }) {
  const { instanceId } = await params
  const inst = getInstance(instanceId)
  if (!inst) notFound()
  return <SecurityManager instance={inst} />
}
