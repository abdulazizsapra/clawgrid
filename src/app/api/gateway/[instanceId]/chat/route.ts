import { NextRequest } from 'next/server'
import { getInstance } from '@/lib/instances'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  const { instanceId } = await params
  const inst = getInstance(instanceId)
  if (!inst) return new Response('Instance not found', { status: 404 })

  const body = await req.json()
  const res = await fetch(`${inst.gatewayUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(inst.token ? { Authorization: `Bearer ${inst.token}` } : {}),
    },
    body: JSON.stringify(body),
  })

  return new Response(res.body, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'text/event-stream' },
  })
}
