import type { GatewayHealth } from '@/types'

export async function fetchGatewayHealth(gatewayUrl: string, token: string): Promise<GatewayHealth> {
  try {
    const res = await fetch(`${gatewayUrl}/__openclaw/control-ui-config.json`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    if (!res.ok) return { instanceId: gatewayUrl, status: 'degraded', error: `HTTP ${res.status}` }
    const data = await res.json()
    return {
      instanceId: gatewayUrl,
      status: 'online',
      version: data.version,
      uptime: data.uptime,
      memoryMb: data.memoryMb,
      activeChats: data.activeChats,
    }
  } catch (e: unknown) {
    return { instanceId: gatewayUrl, status: 'offline', error: e instanceof Error ? e.message : 'unreachable' }
  }
}

export async function* streamChat(
  gatewayUrl: string,
  token: string,
  messages: { role: string; content: string }[],
  model = 'openclaw'
): AsyncGenerator<string> {
  const res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ model, messages, stream: true }),
  })
  if (!res.ok) throw new Error(`Gateway error ${res.status}`)
  const reader = res.body!.getReader()
  const dec = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (data === '[DONE]') return
      try {
        const chunk = JSON.parse(data)
        const delta = chunk.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch { /* skip malformed chunks */ }
    }
  }
}
