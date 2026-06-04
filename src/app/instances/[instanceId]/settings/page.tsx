import { getInstance } from '@/lib/instances'
import { notFound } from 'next/navigation'
import { InstanceSettings } from '@/components/settings/InstanceSettings'

export default async function SettingsPage({ params }: { params: Promise<{ instanceId: string }> }) {
  const { instanceId } = await params
  const inst = getInstance(instanceId)
  if (!inst) notFound()
  return <InstanceSettings instance={inst} />
}
