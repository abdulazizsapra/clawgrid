import { getInstance } from '@/lib/instances'
import { notFound } from 'next/navigation'
import { ChatPanel } from '@/components/chat/ChatPanel'

export default async function ChatPage({ params }: { params: Promise<{ instanceId: string }> }) {
  const { instanceId } = await params
  const inst = getInstance(instanceId)
  if (!inst) notFound()
  return <ChatPanel instance={inst} />
}
