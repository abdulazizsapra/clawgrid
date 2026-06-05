import { NextRequest, NextResponse } from 'next/server'
import { checkPassword, createToken, isAuthEnabled, COOKIE_NAME, COOKIE_MAX_AGE } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!isAuthEnabled()) {
    return NextResponse.json({ error: 'Auth not configured' }, { status: 400 })
  }

  const { password } = await req.json().catch(() => ({ password: '' }))

  if (!password || !checkPassword(password)) {
    // Constant-time delay to slow brute-force
    await new Promise(r => setTimeout(r, 500))
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 })
  }

  const token = createToken()
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  })
  return res
}
