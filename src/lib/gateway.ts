import type { GatewayHealth } from '@/types'

export interface GatewayConfig {
  assistantName: string
  assistantAvatar: string
  assistantAgentId: string
  serverVersion: string
}

// Blocks SSRF to cloud metadata endpoints.
// Loopback (localhost / 127.0.0.1) and RFC-1918 private ranges are intentionally
// allowed because gateways are typically exposed on the panel host via autossh tunnels
// (localhost:4000, localhost:4001, …) or on a LAN. All requests are server-side only.
// gatewayUrl is stored at registration time but re-validated here to catch
// any direct edits to data/instances.json that bypassed the API.
export function assertSafeGatewayUrl(rawUrl: string): void {
  const u = new URL(rawUrl)
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Disallowed protocol')
  const h = u.hostname.toLowerCase()
  if (
    h.startsWith('169.254.') ||   // link-local / AWS metadata
    h.startsWith('0.')            // reserved
  ) {
    throw new Error(`Disallowed SSRF target: ${h}`)
  }
}

export async function fetchGatewayConfig(gatewayUrl: string, token: string): Promise<GatewayConfig | null> {
  try {
    assertSafeGatewayUrl(gatewayUrl)
    const res = await fetch(`${gatewayUrl}/__openclaw/control-ui-config.json`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const raw = await res.json()
    // Only forward the expected fields — never proxy arbitrary gateway config data
    return {
      assistantName: typeof raw.assistantName === 'string' ? raw.assistantName : '',
      assistantAvatar: typeof raw.assistantAvatar === 'string' ? raw.assistantAvatar : '',
      assistantAgentId: typeof raw.assistantAgentId === 'string' ? raw.assistantAgentId : '',
      serverVersion: typeof raw.serverVersion === 'string' ? raw.serverVersion : '',
    }
  } catch {
    return null
  }
}

export async function fetchGatewayHealth(gatewayUrl: string, token: string): Promise<GatewayHealth> {
  try {
    assertSafeGatewayUrl(gatewayUrl)
    const res = await fetch(`${gatewayUrl}/__openclaw/control-ui-config.json`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    if (!res.ok) return { instanceId: '', status: 'degraded', error: `HTTP ${res.status}` }
    const data = await res.json()
    return {
      instanceId: '',
      status: 'online',
      version: data.version,
      uptime: data.uptime,
      memoryMb: data.memoryMb,
      activeChats: data.activeChats,
    }
  } catch (e: unknown) {
    return { instanceId: '', status: 'offline', error: e instanceof Error ? e.message : 'unreachable' }
  }
}

export async function* streamChat(
  gatewayUrl: string,
  token: string,
  messages: { role: string; content: string }[],
  model = 'openclaw'
): AsyncGenerator<string> {
  assertSafeGatewayUrl(gatewayUrl)
  const res = await fetch(`${gatewayUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ model, messages, stream: true }),
  })
  if (!res.ok) throw new Error(`Gateway error ${res.status}`)
  if (!res.body) throw new Error('Empty response body from gateway')
  const reader = res.body.getReader()
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
