import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

const COOKIE_NAME = 'oc_panel_session'

function secret(): string {
  return process.env.PANEL_SECRET || 'openclaw-panel-dev-secret'
}

function verifyToken(token: string): boolean {
  const dot = token.lastIndexOf('.')
  if (dot === -1) return false
  const value = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = createHmac('sha256', secret()).update(value).digest('hex')
  try {
    const sigBuf = Buffer.from(sig, 'hex')
    const expBuf = Buffer.from(expected, 'hex')
    if (sigBuf.length !== expBuf.length) return false
    return timingSafeEqual(sigBuf, expBuf)
  } catch {
    return false
  }
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Pass through: login page, auth API, static assets, Next.js internals
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon')
  ) {
    return NextResponse.next()
  }

  // If no password is configured, auth is disabled — open access
  const password = process.env.PANEL_PASSWORD ?? ''
  if (!password) return NextResponse.next()

  // Check session cookie
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (token && verifyToken(token)) return NextResponse.next()

  // Not authenticated — redirect to login
  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/login'
  loginUrl.searchParams.set('from', pathname)
  return NextResponse.redirect(loginUrl)
}

export const runtime = 'nodejs'

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
