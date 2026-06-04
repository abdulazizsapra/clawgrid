import { NextRequest, NextResponse } from 'next/server'
import { getRegistry, upsertInstance, deleteInstance } from '@/lib/instances'

export async function GET() {
  return NextResponse.json(getRegistry())
}

export async function POST(req: NextRequest) {
  const instance = await req.json()
  upsertInstance(instance)
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  deleteInstance(id)
  return NextResponse.json({ ok: true })
}
