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

  let upstreamRes: Response
  try {
    upstreamRes = await fetch(`${inst.gatewayUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(inst.token ? { Authorization: `Bearer ${inst.token}` } : {}),
      },
      body: JSON.stringify(body),
      // @ts-expect-error — Node 18+ fetch supports duplex
      duplex: 'half',
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Gateway unreachable' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!upstreamRes.ok) {
    const text = await upstreamRes.text()
    return new Response(text, { status: upstreamRes.status, headers: { 'Content-Type': 'application/json' } })
  }

  if (!upstreamRes.body) {
    return new Response(JSON.stringify({ error: 'Empty response from gateway' }), { status: 502, headers: { 'Content-Type': 'application/json' } })
  }

  return new Response(upstreamRes.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
      'Transfer-Encoding': 'chunked',
    },
  })
}
