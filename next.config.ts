import type { NextConfig } from 'next'

if (!process.env.PANEL_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('FATAL: PANEL_SECRET environment variable must be set in production')
}

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self';" },
]

const config: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['ssh2'],
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
}
export default config
