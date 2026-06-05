import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Browser-side SSH exec helper — calls /api/ssh/:instanceId. Throws on SSH error. */
export async function sshExec(instanceId: string, command: string): Promise<string> {
  const res = await fetch(`/api/ssh/${instanceId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'exec', args: { command } }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.stdout ?? ''
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function statusColor(status: string) {
  switch (status) {
    case 'online': return 'text-green-400'
    case 'offline': return 'text-red-400'
    case 'degraded': return 'text-yellow-400'
    default: return 'text-gray-400'
  }
}

export function statusDot(status: string) {
  switch (status) {
    case 'online': return 'bg-green-400'
    case 'offline': return 'bg-red-400'
    case 'degraded': return 'bg-yellow-400'
    default: return 'bg-gray-400'
  }
}

export function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function formatBytes(mb: number) {
  if (mb < 1024) return `${mb} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}
