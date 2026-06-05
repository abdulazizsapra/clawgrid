import { getInstance } from '@/lib/instances'
import { notFound } from 'next/navigation'
import { SkillsManager } from '@/components/skills/SkillsManager'

export default async function SkillsPage({ params }: { params: Promise<{ instanceId: string }> }) {
  const { instanceId } = await params
  const inst = getInstance(instanceId)
  if (!inst) notFound()
  return <SkillsManager instance={inst} />
}
