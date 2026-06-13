import { NextRequest, NextResponse } from 'next/server'
import { checkPassword, createToken, isAuthEnabled, COOKIE_NAME, COOKIE_MAX_AGE } from '@/lib/auth'

// In-memory rate limiter: max 10 attempts per IP per 15 minutes
const attempts = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const rec = attempts.get(ip)
  if (!rec || now > rec.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 })
    return false
  }
  rec.count++
  return rec.count > 10
}

export async function POST(req: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 400 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many attempts — try again later' }, { status: 429 })
  }

  const { password } = await req.json().catch(() => ({ password: '' }))

  if (!password || !checkPassword(password)) {
    await new Promise(r => setTimeout(r, 500))
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  const token = createToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
