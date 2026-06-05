import { NextRequest, NextResponse } from 'next/server'
import { getInstance } from '@/lib/instances'
import { fetchGatewayHealth } from '@/lib/gateway'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  const { instanceId } = await params
  const inst = getInstance(instanceId)
  if (!inst) return NextResponse.json({ error: 'not found' }, { status: 404 })
  try {
    const health = await fetchGatewayHealth(inst.gatewayUrl, inst.token)
    return NextResponse.json({ ...health, instanceId })
  } catch (e) {
    return NextResponse.json({ instanceId, status: 'offline', error: e instanceof Error ? e.message : 'unreachable' })
  }
}
