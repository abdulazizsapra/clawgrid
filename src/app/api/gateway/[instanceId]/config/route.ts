import { NextRequest, NextResponse } from 'next/server'
import { getInstance } from '@/lib/instances'
import { fetchGatewayConfig } from '@/lib/gateway'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  const { instanceId } = await params
  const inst = getInstance(instanceId)
  if (!inst) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const config = await fetchGatewayConfig(inst.gatewayUrl, inst.token)
  if (!config) return NextResponse.json({ error: 'gateway unreachable' }, { status: 502 })
  return NextResponse.json(config)
}
