import { NextRequest, NextResponse } from 'next/server'
import { getRegistry, upsertInstance, deleteInstance } from '@/lib/instances'
import type { OpenClawInstance } from '@/types'

// Strip server-only fields before sending instance data to the browser
function sanitize(inst: OpenClawInstance) {
  const { token: _t, sshKeyPath: _k, ...safe } = inst
  return safe
}

export async function GET() {
  const reg = getRegistry()
  return NextResponse.json({ instances: reg.instances.map(sanitize) })
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

  if (instance.sshJumpHost && typeof instance.sshJumpHost === 'string') {
    // Validate format: user@host or user@host:port — prevents SSRF via malicious jump hosts
    if (!/^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+(:\d{1,5})?$/.test(instance.sshJumpHost)) {
      return NextResponse.json({ error: 'sshJumpHost format must be user@host or user@host:port' }, { status: 400 })
    }
  }

  if (instance.workspacePath && typeof instance.workspacePath === 'string') {
    // Reject newlines + classic shell metacharacters; allowlist approach would be /^\/[a-zA-Z0-9._\-\/]+$/
    if (!instance.workspacePath.startsWith('/') || instance.workspacePath.includes('..') || /["';`$\\\n\r\t\x00]/.test(instance.workspacePath)) {
      return NextResponse.json({ error: 'workspacePath must be an absolute path without special characters' }, { status: 400 })
    }
  }

  if (instance.sshKeyPath && typeof instance.sshKeyPath === 'string') {
    if (instance.sshKeyPath.includes('..') || /["';`$\\\n\r\t\x00]/.test(instance.sshKeyPath)) {
      return NextResponse.json({ error: 'sshKeyPath must not contain .. or special characters' }, { status: 400 })
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
