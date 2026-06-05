import { NextRequest, NextResponse } from 'next/server'
import { getRegistry, upsertInstance, deleteInstance } from '@/lib/instances'

export async function GET() {
  return NextResponse.json(getRegistry())
}

export async function POST(req: NextRequest) {
  const instance = await req.json().catch(() => null)
  if (!instance || typeof instance !== 'object') return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  if (!instance.id || typeof instance.id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (!/^[a-z0-9][a-z0-9\-_]{0,62}$/.test(instance.id)) return NextResponse.json({ error: 'id must be lowercase alphanumeric with hyphens/underscores' }, { status: 400 })

  if (!instance.gatewayUrl || typeof instance.gatewayUrl !== 'string') return NextResponse.json({ error: 'gatewayUrl required' }, { status: 400 })
  try {
    const u = new URL(instance.gatewayUrl)
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error()
  } catch {
    return NextResponse.json({ error: 'gatewayUrl must be a valid http/https URL' }, { status: 400 })
  }

  if (!instance.sshHost || typeof instance.sshHost !== 'string') return NextResponse.json({ error: 'sshHost required' }, { status: 400 })

  if (instance.workspacePath && typeof instance.workspacePath === 'string') {
    if (!instance.workspacePath.startsWith('/') || instance.workspacePath.includes('..') || /["';`$\\]/.test(instance.workspacePath)) {
      return NextResponse.json({ error: 'workspacePath must be an absolute path without special characters' }, { status: 400 })
    }
  }

  if (instance.sshKeyPath && typeof instance.sshKeyPath === 'string') {
    if (instance.sshKeyPath.includes('..')) {
      return NextResponse.json({ error: 'sshKeyPath must not contain ..' }, { status: 400 })
    }
  }

  upsertInstance(instance)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const id = body?.id
  if (!id || typeof id !== 'string') return NextResponse.json({ error: 'id required' }, { status: 400 })
  deleteInstance(id)
  return NextResponse.json({ ok: true })
}
