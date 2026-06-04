import { NextRequest, NextResponse } from 'next/server'
import { getInstance } from '@/lib/instances'
import { runSshCommand, restartGateway, getGatewayLogs, getSystemStats } from '@/lib/ssh'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ instanceId: string }> }
) {
  const { instanceId } = await params
  const inst = getInstance(instanceId)
  if (!inst) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { action, args } = await req.json()

  try {
    switch (action) {
      case 'restart': {
        const result = await restartGateway(inst)
        return NextResponse.json(result)
      }
      case 'logs': {
        const logs = await getGatewayLogs(inst, args?.lines ?? 100)
        return NextResponse.json({ logs })
      }
      case 'stats': {
        const stats = await getSystemStats(inst)
        return NextResponse.json({ stats })
      }
      case 'exec': {
        if (!args?.command) return NextResponse.json({ error: 'command required' }, { status: 400 })
        const result = await runSshCommand(inst, args.command)
        return NextResponse.json(result)
      }
      default:
        return NextResponse.json({ error: 'unknown action' }, { status: 400 })
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'ssh error' }, { status: 500 })
  }
}
