import { createHmac, timingSafeEqual, randomBytes } from 'crypto'

export const COOKIE_NAME = 'oc_panel_session'
export const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

function secret(): string {
  return process.env.PANEL_SECRET || 'openclaw-panel-dev-secret'
}

export function getPassword(): string {
  return process.env.PANEL_PASSWORD ?? ''
}

export function isAuthEnabled(): boolean {
  return getPassword().length > 0
}

export function createToken(): string {
  const value = randomBytes(32).toString('hex')
  const sig = createHmac('sha256', secret()).update(value).digest('hex')
  return `${value}.${sig}`
}

export function verifyToken(token: string): boolean {
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

export function checkPassword(input: string): boolean {
  const pw = getPassword()
  if (!pw) return false
  try {
    // Hash both to fixed-length digests so timingSafeEqual is always comparing equal-length buffers
    const a = createHmac('sha256', 'clawgrid-pw').update(input).digest()
    const b = createHmac('sha256', 'clawgrid-pw').update(pw).digest()
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
