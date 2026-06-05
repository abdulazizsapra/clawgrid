'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const from = params.get('from') || '/fleet'
  const inputRef = useRef<HTMLInputElement>(null)

  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!password || loading) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        router.push(from)
        router.refresh()
      } else {
        const d = await res.json()
        setError(d.error || 'Incorrect password')
        setPassword('')
        setShake(true)
        setTimeout(() => setShake(false), 500)
        inputRef.current?.focus()
      }
    } catch {
      setError('Connection error — is the server running?')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 380,
        animation: shake ? 'oc-shake 0.4s ease' : 'none',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/logo.png"
            alt="ClawGrid"
            style={{
              width: 72, height: 72, borderRadius: 20, objectFit: 'cover',
              margin: '0 auto 14px', display: 'block',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
            }}
          />
          <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: '0 0 6px' }}>Control Panel</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Enter your password to continue</p>
        </div>

        {/* Form card */}
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 28,
          boxShadow: '0 4px 32px rgba(0,0,0,0.3)',
        }}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{
                display: 'block', fontSize: 11, fontWeight: 600,
                color: 'var(--text-muted)', textTransform: 'uppercase',
                letterSpacing: '0.07em', marginBottom: 6,
              }}>Password</label>
              <input
                ref={inputRef}
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter panel password"
                autoComplete="current-password"
                style={{
                  width: '100%', background: 'var(--surface2)',
                  border: `1px solid ${error ? 'var(--error)' : 'var(--border)'}`,
                  borderRadius: 9, padding: '10px 14px', fontSize: 14,
                  color: 'var(--text)', outline: 'none', boxSizing: 'border-box',
                  fontFamily: 'inherit', transition: 'border-color 0.15s',
                }}
                onFocus={e => { if (!error) e.target.style.borderColor = 'var(--accent)' }}
                onBlur={e => { e.target.style.borderColor = error ? 'var(--error)' : 'var(--border)' }}
              />
            </div>

            {error && (
              <div style={{
                fontSize: 13, color: 'var(--error)',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 7, padding: '8px 12px',
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!password || loading}
              style={{
                width: '100%', padding: '11px 0', borderRadius: 9, border: 'none',
                background: password && !loading ? 'var(--accent)' : 'var(--surface3)',
                color: password && !loading ? '#fff' : 'var(--text-dim)',
                fontSize: 14, fontWeight: 600, cursor: password && !loading ? 'pointer' : 'not-allowed',
                transition: 'all 0.15s', letterSpacing: '0.01em',
              }}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-dim)', marginTop: 20 }}>
          Set <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>PANEL_PASSWORD</code> in <code style={{ fontSize: 11, color: 'var(--text-muted)' }}>.env.local</code> to enable auth
        </p>
      </div>

      <style>{`
        @keyframes oc-shake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-8px); }
          40% { transform: translateX(8px); }
          60% { transform: translateX(-5px); }
          80% { transform: translateX(5px); }
        }
      `}</style>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
