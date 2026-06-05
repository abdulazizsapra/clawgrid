'use client'
import { sshExec } from '@/lib/utils'
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Play, Pause, AlertCircle, CheckCircle, Clock, Timer, Plus, Trash2, Edit2, X, ChevronRight, CalendarDays, List, RotateCcw, ChevronsDown, ChevronsUp, ArrowUpDown } from 'lucide-react'
import type { OpenClawInstance } from '@/types'

// ─── Types ───────────────────────────────────────────────────────────────────

interface CronSchedule { kind: string; expr: string; tz: string }
interface CronPayload { kind: string; model: string; message: string; timeoutSeconds: number }
interface CronDelivery { mode: string }

interface CronJob {
  id: string
  name: string
  agentId: string
  sessionKey?: string
  enabled: boolean
  createdAtMs?: number
  schedule?: CronSchedule
  sessionTarget?: string
  wakeMode?: string
  payload?: CronPayload
  delivery?: CronDelivery
  // merged from state
  lastRunAtMs?: number
  nextRunAtMs?: number
  lastRunStatus?: string
  lastDurationMs?: number
  consecutiveErrors?: number
  lastError?: string
}

interface EditForm {
  id: string
  name: string
  agentId: string
  enabled: boolean
  cronExpr: string
  timezone: string
  message: string
  model: string
  timeoutSeconds: number
  sessionTarget: string
}

const BLANK_FORM: EditForm = {
  id: '',
  name: '',
  agentId: 'main',
  enabled: true,
  cronExpr: '0 9 * * *',
  timezone: 'Australia/Sydney',
  message: '',
  model: 'anthropic/claude-sonnet-4-6',
  timeoutSeconds: 300,
  sessionTarget: 'isolated',
}

const TIMEZONES = [
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Perth',
  'UTC', 'America/New_York', 'America/Los_Angeles', 'Europe/London', 'Asia/Singapore',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMs(ms: number) {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function fmtRelative(ms?: number) {
  if (!ms) return 'never'
  const diff = Date.now() - ms
  if (diff < 0) return `in ${fmtMs(Math.abs(diff))}`
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return new Date(ms).toLocaleDateString()
}

function fmtDatetime(ms?: number) {
  if (!ms) return '—'
  return new Date(ms).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
}

function cronHuman(expr: string | undefined): string {
  if (!expr) return '—'
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return expr
  const [min, hour, dom, mon, dow] = parts

  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  const fmtTime = (h: string, m: string) => {
    const hNum = parseInt(h)
    const mNum = parseInt(m) || 0
    const ampm = hNum >= 12 ? 'PM' : 'AM'
    const h12 = hNum % 12 || 12
    return `${h12}:${String(mNum).padStart(2,'0')} ${ampm}`
  }

  // Every N minutes: */N * * * *
  if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*')
    return `Every ${min.slice(2)} minutes`

  // Every N hours: 0 */N * * *
  if (hour.startsWith('*/') && dom === '*' && mon === '*' && dow === '*')
    return `Every ${hour.slice(2)} hours at :${min.padStart(2,'0')}`

  // Daily: M H * * *
  if (dom === '*' && mon === '*' && dow === '*' && !hour.startsWith('*/'))
    return `Daily at ${fmtTime(hour, min)}`

  // Weekdays: M H * * 1-5
  if (dom === '*' && mon === '*' && dow === '1-5')
    return `Weekdays at ${fmtTime(hour, min)}`

  // Weekends: M H * * 0,6 or 6,0
  if (dom === '*' && mon === '*' && (dow === '0,6' || dow === '6,0'))
    return `Weekends at ${fmtTime(hour, min)}`

  // Weekly: M H * * D (single day)
  if (dom === '*' && mon === '*' && dow !== '*' && !dow.includes(',') && !dow.includes('-')) {
    const d = parseInt(dow)
    const dayName = !isNaN(d) ? DAYS[d] : dow
    return `${dayName}s at ${fmtTime(hour, min)}`
  }

  // Weekly multiple days: M H * * 1,3,5
  if (dom === '*' && mon === '*' && dow !== '*' && dow.includes(',')) {
    const dayNames = dow.split(',').map(d => (DAYS[parseInt(d)] ?? d).slice(0,3)).join(', ')
    return `${dayNames} at ${fmtTime(hour, min)}`
  }

  // Monthly: M H D * *
  if (dom !== '*' && mon === '*' && dow === '*' && !dom.includes('*')) {
    const d = parseInt(dom)
    const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'
    return `${d}${suffix} of month at ${fmtTime(hour, min)}`
  }

  // Yearly: M H D M *
  if (dom !== '*' && mon !== '*' && dow === '*' && !mon.includes('*')) {
    const monthName = MONTHS[(parseInt(mon) - 1)] ?? mon
    return `${monthName} ${dom} at ${fmtTime(hour, min)}`
  }

  return expr
}

// ─── Cron expression parser + calendar logic ─────────────────────────────────

function cronMatchesDay(expr: string, date: Date): boolean {
  if (!expr) return false
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return false
  const [, , domPart, monPart, dowPart] = parts

  const month = date.getMonth() + 1  // 1-12
  const dom = date.getDate()          // 1-31
  const dow = date.getDay()           // 0-6

  function matchField(field: string, value: number): boolean {
    if (field === '*') return true
    if (field.startsWith('*/')) {
      const step = parseInt(field.slice(2))
      return !isNaN(step) && value % step === 0
    }
    if (field.includes(',')) return field.split(',').some(f => matchField(f.trim(), value))
    if (field.includes('-')) {
      const [lo, hi] = field.split('-').map(Number)
      return value >= lo && value <= hi
    }
    return parseInt(field) === value
  }

  const domOk = matchField(domPart, dom)
  const monOk = matchField(monPart, month)
  const dowOk = matchField(dowPart, dow)

  // Standard cron: if both DOM and DOW are restricted, either matching is enough
  const domRestricted = domPart !== '*'
  const dowRestricted = dowPart !== '*'
  const domDowOk = domRestricted && dowRestricted ? (domOk || dowOk) : (domOk && dowOk)

  return monOk && domDowOk
}

function getCronHoursForDay(expr: string): string[] {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return []
  const [minPart, hourPart] = parts
  const hours: string[] = []
  for (let h = 0; h < 24; h++) {
    let hMatch = false
    if (hourPart === '*') hMatch = true
    else if (hourPart.startsWith('*/')) hMatch = h % parseInt(hourPart.slice(2)) === 0
    else hMatch = parseInt(hourPart) === h

    if (hMatch) {
      let mMatch = false
      if (minPart === '*') mMatch = true
      else if (minPart.startsWith('*/')) mMatch = true
      else mMatch = parseInt(minPart) >= 0

      if (mMatch) {
        const m = minPart === '*' ? '00' : minPart.startsWith('*/') ? '00' : minPart.padStart(2, '0')
        hours.push(`${String(h).padStart(2, '0')}:${m}`)
      }
    }
  }
  return hours
}

// ─── Schedule builder (replaces raw cron input) ───────────────────────────────

type ScheduleKind = 'daily' | 'weekly' | 'monthly' | 'hourly' | 'custom'

interface ScheduleState {
  kind: ScheduleKind
  hour: number
  minute: number
  daysOfWeek: number[]  // 0=Sun..6=Sat
  dayOfMonth: number    // 1-31
  everyNHours: number
  customExpr: string
}

const DAYS_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function scheduleToExpr(s: ScheduleState): string {
  const m = String(s.minute).padStart(2, '0')
  const h = String(s.hour).padStart(2, '0')
  switch (s.kind) {
    case 'daily':   return `${m} ${h} * * *`
    case 'weekly':  return `${m} ${h} * * ${s.daysOfWeek.length > 0 ? s.daysOfWeek.sort().join(',') : '1'}`
    case 'monthly': return `${m} ${h} ${s.dayOfMonth} * *`
    case 'hourly':  return `${m} */${s.everyNHours} * * *`
    case 'custom':  return s.customExpr || '0 9 * * *'
  }
}

function exprToSchedule(expr: string): ScheduleState {
  const blank: ScheduleState = { kind: 'daily', hour: 9, minute: 0, daysOfWeek: [1], dayOfMonth: 1, everyNHours: 1, customExpr: expr }
  if (!expr) return blank
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return { ...blank, kind: 'custom', customExpr: expr }
  const [minStr, hourStr, domStr, , dowStr] = parts
  const min = parseInt(minStr)
  const hour = parseInt(hourStr)
  const safeMin = isNaN(min) ? 0 : min
  const safeHour = isNaN(hour) ? 9 : hour

  if (domStr === '*' && dowStr === '*' && !hourStr.startsWith('*/'))
    return { ...blank, kind: 'daily', hour: safeHour, minute: safeMin }
  if (domStr === '*' && dowStr === '*' && hourStr.startsWith('*/'))
    return { ...blank, kind: 'hourly', everyNHours: parseInt(hourStr.slice(2)) || 1, minute: safeMin }
  if (domStr === '*' && dowStr !== '*') {
    const dow = dowStr.split(',').map(Number).filter(n => !isNaN(n))
    return { ...blank, kind: 'weekly', hour: safeHour, minute: safeMin, daysOfWeek: dow.length ? dow : [1] }
  }
  if (domStr !== '*' && dowStr === '*') {
    const dom = parseInt(domStr)
    return { ...blank, kind: 'monthly', hour: safeHour, minute: safeMin, dayOfMonth: isNaN(dom) ? 1 : dom }
  }
  return { ...blank, kind: 'custom', customExpr: expr }
}

function ScheduleBuilder({ expr, onChange }: { expr: string; onChange: (expr: string) => void }) {
  const [sched, setSched] = useState<ScheduleState>(() => exprToSchedule(expr))

  function update(next: ScheduleState) {
    setSched(next)
    onChange(scheduleToExpr(next))
  }

  const sel: React.CSSProperties = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 8px', fontSize: 13, color: 'var(--text)', outline: 'none', fontFamily: 'inherit', cursor: 'pointer' }

  const kindLabels: Record<ScheduleKind, string> = {
    daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', hourly: 'Every N hours', custom: 'Custom expression',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Kind selector */}
      <div>
        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'block' }}>Repeat</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(['daily', 'weekly', 'monthly', 'hourly', 'custom'] as ScheduleKind[]).map(k => (
            <button key={k} onClick={() => update({ ...sched, kind: k })} style={{
              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 500, cursor: 'pointer',
              border: `1px solid ${sched.kind === k ? 'var(--accent)' : 'var(--border)'}`,
              background: sched.kind === k ? 'var(--accent-dim)' : 'var(--surface2)',
              color: sched.kind === k ? 'var(--accent)' : 'var(--text-muted)',
            }}>{kindLabels[k]}</button>
          ))}
        </div>
      </div>

      {/* Time picker — shown for daily / weekly / monthly */}
      {(sched.kind === 'daily' || sched.kind === 'weekly' || sched.kind === 'monthly') && (
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'block' }}>Time</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select style={sel} value={sched.hour} onChange={e => update({ ...sched, hour: parseInt(e.target.value) })}>
              {Array.from({ length: 24 }, (_, i) => (
                <option key={i} value={i}>{String(i).padStart(2, '0')}:00</option>
              ))}
            </select>
            <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>:</span>
            <select style={sel} value={sched.minute} onChange={e => update({ ...sched, minute: parseInt(e.target.value) })}>
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
            <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>local server time</span>
          </div>
        </div>
      )}

      {/* Day of week — weekly only */}
      {sched.kind === 'weekly' && (
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'block' }}>Days of Week</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {DAYS_LABEL.map((d, i) => {
              const on = sched.daysOfWeek.includes(i)
              return (
                <button key={i} onClick={() => {
                  const next = on ? sched.daysOfWeek.filter(x => x !== i) : [...sched.daysOfWeek, i]
                  update({ ...sched, daysOfWeek: next.length ? next : [i] })
                }} style={{
                  width: 36, height: 36, borderRadius: '50%', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                  background: on ? 'var(--accent)' : 'var(--surface2)',
                  color: on ? '#fff' : 'var(--text-muted)',
                }}>{d.slice(0, 2)}</button>
              )
            })}
          </div>
        </div>
      )}

      {/* Day of month — monthly only */}
      {sched.kind === 'monthly' && (
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'block' }}>Day of Month</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
              <button key={d} onClick={() => update({ ...sched, dayOfMonth: d })} style={{
                width: 30, height: 30, borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                border: `1px solid ${sched.dayOfMonth === d ? 'var(--accent)' : 'var(--border)'}`,
                background: sched.dayOfMonth === d ? 'var(--accent)' : 'var(--surface2)',
                color: sched.dayOfMonth === d ? '#fff' : 'var(--text-muted)',
              }}>{d}</button>
            ))}
          </div>
        </div>
      )}

      {/* Every N hours */}
      {sched.kind === 'hourly' && (
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'block' }}>Interval</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Every</span>
            <select style={sel} value={sched.everyNHours} onChange={e => update({ ...sched, everyNHours: parseInt(e.target.value) })}>
              {[1, 2, 3, 4, 6, 8, 12].map(n => <option key={n} value={n}>{n} hour{n !== 1 ? 's' : ''}</option>)}
            </select>
            <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>at minute</span>
            <select style={sel} value={sched.minute} onChange={e => update({ ...sched, minute: parseInt(e.target.value) })}>
              {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => (
                <option key={m} value={m}>{String(m).padStart(2, '0')}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Custom expr */}
      {sched.kind === 'custom' && (
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6, display: 'block' }}>Cron Expression</label>
          <input
            value={sched.customExpr}
            onChange={e => update({ ...sched, customExpr: e.target.value })}
            placeholder="0 9 * * 1"
            spellCheck={false}
            style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box', fontFamily: "'SF Mono','Fira Code',monospace" }}
          />
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
            Format: minute hour day-of-month month day-of-week
          </div>
        </div>
      )}

      {/* Preview */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>Preview</span>
        <code style={{ fontSize: 12, color: 'var(--accent)', background: 'var(--accent-dim)', padding: '2px 8px', borderRadius: 4 }}>{scheduleToExpr(sched)}</code>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cronHuman(scheduleToExpr(sched))}</span>
      </div>
    </div>
  )
}

// ─── Calendar view ─────────────────────────────────────────────────────────────

function CalendarView({ jobs }: { jobs: CronJob[] }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const monthStart = new Date(viewYear, viewMonth, 1)
  const monthEnd = new Date(viewYear, viewMonth + 1, 0)
  const daysInMonth = monthEnd.getDate()
  const firstDow = monthStart.getDay() // 0=Sun

  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

  // Compute which jobs fire on each day of the month
  const dayJobs: Record<number, CronJob[]> = {}
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(viewYear, viewMonth, d)
    const matching = jobs.filter(j => j.enabled && j.schedule?.expr && cronMatchesDay(j.schedule.expr, date))
    if (matching.length > 0) dayJobs[d] = matching
  }

  const selectedJobs = selectedDay ? (dayJobs[selectedDay] ?? []) : []

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
    setSelectedDay(null)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
    setSelectedDay(null)
  }

  const isToday = (d: number) => d === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()

  // Build grid cells: padding + days
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', minHeight: 0 }}>
      {/* Calendar */}
      <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <button onClick={prevMonth} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>‹</button>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, flex: 1, textAlign: 'center' }}>{MONTH_NAMES[viewMonth]} {viewYear}</h2>
          <button onClick={nextMonth} style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>›</button>
        </div>

        {/* Day-of-week headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
          {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '4px 0' }}>{d}</div>
          ))}
        </div>

        {/* Day grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {cells.map((day, idx) => {
            if (!day) return <div key={idx} />
            const hasJobs = !!dayJobs[day]
            const jobList = dayJobs[day] ?? []
            const isSelected = selectedDay === day
            const isTdy = isToday(day)

            return (
              <button
                key={day}
                onClick={() => setSelectedDay(isSelected ? null : day)}
                style={{
                  minHeight: 72, borderRadius: 10, padding: '6px 8px', cursor: hasJobs ? 'pointer' : 'default',
                  border: `1px solid ${isSelected ? 'var(--accent)' : isTdy ? 'rgba(59,130,246,0.4)' : 'var(--border)'}`,
                  background: isSelected ? 'var(--accent-dim)' : isTdy ? 'rgba(59,130,246,0.05)' : 'var(--surface2)',
                  textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 4, transition: 'all 0.1s',
                }}
              >
                <span style={{ fontSize: 13, fontWeight: isTdy ? 700 : 500, color: isTdy ? 'var(--accent)' : isSelected ? 'var(--accent)' : 'var(--text)' }}>
                  {day}
                </span>
                {hasJobs && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {jobList.slice(0, 3).map((j, i) => (
                      <div key={i} style={{ fontSize: 9, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isSelected ? 'var(--accent)' : 'var(--text-muted)', background: isSelected ? 'rgba(59,130,246,0.15)' : 'var(--surface3)', borderRadius: 3, padding: '1px 4px' }}>
                        {j.name}
                      </div>
                    ))}
                    {jobList.length > 3 && <div style={{ fontSize: 9, color: 'var(--text-dim)' }}>+{jobList.length - 3} more</div>}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Legend */}
        <div style={{ marginTop: 16, display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-dim)' }}>
          <span>· Click a day to see scheduled jobs</span>
          <span>· Only enabled jobs are shown</span>
          <span>· {Object.keys(dayJobs).length} active days this month</span>
        </div>
      </div>

      {/* Day detail sidebar */}
      {selectedDay && (
        <div style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{MONTH_NAMES[viewMonth]} {selectedDay}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedJobs.length} job{selectedJobs.length !== 1 ? 's' : ''} scheduled</div>
            </div>
            <button onClick={() => setSelectedDay(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}><X size={14} /></button>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '12px' }}>
            {selectedJobs.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>No jobs scheduled</div>
            )}
            {selectedJobs.map(job => {
              const times = job.schedule?.expr ? getCronHoursForDay(job.schedule.expr) : []
              return (
                <div key={job.id} style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 9, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>{job.name}</div>
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--accent)', marginBottom: 2 }}>{cronHuman(job.schedule?.expr)}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{job.schedule?.expr ?? '—'} · {job.schedule?.tz ?? ''}</div>
                  </div>
                  {times.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {times.slice(0, 8).map(t => (
                        <span key={t} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--surface3)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{t}</span>
                      ))}
                      {times.length > 8 && <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>+{times.length - 8} more</span>}
                    </div>
                  )}
                  {job.agentId && <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 5 }}>Agent: {job.agentId}</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}


// ─── Stat badge ───────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status?: string }) {
  if (status === 'ok' || status === 'success')
    return <CheckCircle size={13} style={{ color: 'var(--success)', flexShrink: 0 }} />
  if (status === 'error')
    return <AlertCircle size={13} style={{ color: 'var(--error)', flexShrink: 0 }} />
  if (status === 'running')
    return <RefreshCw size={13} style={{ color: 'var(--accent)', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
  return <Clock size={13} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
}

// ─── Edit/Create modal ────────────────────────────────────────────────────────

function CronForm({
  form, agents, onChange, onSubmit, onClose, isNew, saving,
}: {
  form: EditForm
  agents: string[]
  onChange: (f: EditForm) => void
  onSubmit: () => void
  onClose: () => void
  isNew: boolean
  saving: boolean
}) {
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.07em' }
  const inputStyle: React.CSSProperties = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 10px', fontSize: 13, color: 'var(--text)', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }
  const field = (label: string, content: React.ReactNode) => (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {content}
    </div>
  )

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
        width: '100%', maxWidth: 580, maxHeight: '90vh', overflow: 'auto',
        display: 'flex', flexDirection: 'column',
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>{isNew ? 'New Cron Job' : 'Edit Cron Job'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '20px', flex: 1, overflow: 'auto' }}>
          {/* Name */}
          {field('Job Name', <input
            style={inputStyle} value={form.name}
            onChange={e => onChange({ ...form, name: e.target.value })}
            placeholder="Daily CEO Briefing"
          />)}

          {/* Agent + Session */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Agent</label>
              <select style={inputStyle} value={form.agentId} onChange={e => onChange({ ...form, agentId: e.target.value })}>
                {agents.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Session</label>
              <select style={inputStyle} value={form.sessionTarget} onChange={e => onChange({ ...form, sessionTarget: e.target.value })}>
                <option value="isolated">Isolated (fresh context)</option>
                <option value="persistent">Persistent (continues session)</option>
              </select>
            </div>
          </div>

          {/* Schedule builder */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Schedule</label>
            <ScheduleBuilder
              expr={form.cronExpr}
              onChange={expr => onChange({ ...form, cronExpr: expr })}
            />
          </div>

          {/* Timezone */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Timezone</label>
            <select style={inputStyle} value={form.timezone} onChange={e => onChange({ ...form, timezone: e.target.value })}>
              {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
              {!TIMEZONES.includes(form.timezone) && <option value={form.timezone}>{form.timezone}</option>}
            </select>
          </div>

          {/* Model + Timeout */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={labelStyle}>Model</label>
              <input
                style={inputStyle} value={form.model}
                onChange={e => onChange({ ...form, model: e.target.value })}
                placeholder="anthropic/claude-sonnet-4-6"
                spellCheck={false}
              />
            </div>
            <div>
              <label style={labelStyle}>Timeout (seconds)</label>
              <input
                style={inputStyle} type="number" value={form.timeoutSeconds}
                onChange={e => onChange({ ...form, timeoutSeconds: parseInt(e.target.value) || 300 })}
                min={30} max={3600}
              />
            </div>
          </div>

          {/* Message */}
          {field('Message / Prompt', <textarea
            style={{ ...inputStyle, minHeight: 140, resize: 'vertical', lineHeight: 1.55, fontFamily: "'SF Mono','Fira Code',monospace", fontSize: 12 }}
            value={form.message}
            onChange={e => onChange({ ...form, message: e.target.value })}
            placeholder="You are COMMAND. Run the daily briefing..."
          />)}

          {/* Enabled */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" id="enabled-cb" checked={form.enabled} onChange={e => onChange({ ...form, enabled: e.target.checked })}
              style={{ width: 16, height: 16, cursor: 'pointer', accentColor: 'var(--accent)' }} />
            <label htmlFor="enabled-cb" style={{ fontSize: 13, color: 'var(--text-muted)', cursor: 'pointer' }}>Enabled (will run on schedule)</label>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', padding: '14px 20px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 13, cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            onClick={onSubmit} disabled={saving || !form.name || !form.message}
            style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving…' : (isNew ? 'Create Job' : 'Save Changes')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Detail panel ──────────────────────────────────────────────────────────────

function DetailPanel({
  job, onClose, onToggle, onEdit, onDelete, onReset,
}: {
  job: CronJob
  onClose: () => void
  onToggle: () => void
  onEdit: () => void
  onDelete: () => void
  onReset: () => void
}) {
  const [showMsg, setShowMsg] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 110, flexShrink: 0, fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, wordBreak: 'break-word' }}>{value}</span>
    </div>
  )

  const statusColor = job.lastRunStatus === 'ok' || job.lastRunStatus === 'success' ? 'var(--success)'
    : job.lastRunStatus === 'error' ? 'var(--error)' : 'var(--text-dim)'

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--surface)', borderLeft: '1px solid var(--border)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <StatusIcon status={job.lastRunStatus} />
            <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>{job.name}</span>
            {!job.enabled && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>paused</span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3, fontFamily: 'monospace' }}>{job.id}</div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, marginLeft: 8, flexShrink: 0 }}>
          <X size={14} />
        </button>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 16px' }}>

        {/* Schedule */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Schedule</p>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginBottom: 5 }}>{cronHuman(job.schedule?.expr)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{job.schedule?.expr ?? '—'} · {job.schedule?.tz ?? '—'}</div>
          </div>
        </div>

        {/* Config rows */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Configuration</p>
          {row('Agent', <code style={{ fontSize: 12, color: 'var(--accent)' }}>{job.agentId}</code>)}
          {row('Model', <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{job.payload?.model ?? '—'}</span>)}
          {row('Session', job.sessionTarget ?? 'isolated')}
          {row('Timeout', job.payload?.timeoutSeconds ? `${job.payload.timeoutSeconds}s` : '—')}
          {row('Wake mode', job.wakeMode ?? 'now')}
          {row('Created', job.createdAtMs ? fmtDatetime(job.createdAtMs) : '—')}
        </div>

        {/* Execution */}
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Last Execution</p>
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: job.lastError ? 8 : 0 }}>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Status</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: statusColor }}>{job.lastRunStatus ?? '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Ran</div>
                <div style={{ fontSize: 13 }}>{fmtRelative(job.lastRunAtMs)}</div>
              </div>
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Duration</div>
                <div style={{ fontSize: 13 }}>{job.lastDurationMs ? fmtMs(job.lastDurationMs) : '—'}</div>
              </div>
              {(job.consecutiveErrors ?? 0) > 0 && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 2 }}>Errors</div>
                  <div style={{ fontSize: 13, color: 'var(--error)' }}>{job.consecutiveErrors}×</div>
                </div>
              )}
            </div>
            {job.lastError && (
              <div style={{ fontSize: 11, color: 'var(--error)', background: 'rgba(239,68,68,0.08)', borderRadius: 5, padding: '6px 8px', fontFamily: 'monospace', wordBreak: 'break-word' }}>
                {job.lastError}
              </div>
            )}
          </div>
          {job.nextRunAtMs && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
              <Timer size={11} />
              Next run: <strong style={{ color: 'var(--text)' }}>{fmtDatetime(job.nextRunAtMs)}</strong>
            </div>
          )}
        </div>

        {/* Message */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Prompt / Message</p>
            <button onClick={() => setShowMsg(s => !s)} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {showMsg ? 'collapse' : `show (${(job.payload?.message ?? '').length} chars)`}
            </button>
          </div>
          {job.payload?.message ? (
            <>
              {showMsg && (
                <pre style={{
                  background: '#0d1117', border: '1px solid var(--border)', borderRadius: 8,
                  padding: '10px 12px', fontSize: 11.5, lineHeight: 1.65,
                  color: '#e8eaf0', overflow: 'auto', maxHeight: 300,
                  fontFamily: "'SF Mono','Fira Code',monospace", whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word', margin: 0,
                }}>
                  {job.payload.message}
                </pre>
              )}
              {!showMsg && (
                <div style={{ fontSize: 12, color: 'var(--text-dim)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '8px 12px', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {job.payload.message.slice(0, 120)}…
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-dim)', fontStyle: 'italic' }}>No message payload</div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
        <button onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
          <Edit2 size={11} /> Edit
        </button>
        <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
          {job.enabled ? <><Pause size={11} /> Pause</> : <><Play size={11} /> Resume</>}
        </button>
        {(job.consecutiveErrors ?? 0) > 0 && (
          <button onClick={onReset} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 7, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.06)', color: 'var(--success)', fontSize: 12, cursor: 'pointer' }}>
            <RotateCcw size={11} /> Reset Error
          </button>
        )}
        <div style={{ flex: 1 }} />
        {confirmDelete ? (
          <>
            <span style={{ fontSize: 12, color: 'var(--error)', alignSelf: 'center' }}>Delete?</span>
            <button onClick={onDelete} style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: 'var(--error)', color: '#fff', fontSize: 12, cursor: 'pointer' }}>Yes, delete</button>
            <button onClick={() => setConfirmDelete(false)} style={{ padding: '7px 12px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          </>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 7, border: '1px solid rgba(239,68,68,0.3)', background: 'transparent', color: 'var(--error)', fontSize: 12, cursor: 'pointer' }}>
            <Trash2 size={11} /> Delete
          </button>
        )}
      </div>
    </div>
  )
}

// ─── Main ──────────────────────────────────────────────────────────────────────

export function CronMonitor({ instance }: { instance: OpenClawInstance }) {
  const [jobs, setJobs] = useState<CronJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm | null>(null)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<'all' | 'enabled' | 'error'>('all')
  const [agents, setAgents] = useState<string[]>(['main', 'command'])
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [sortBy, setSortBy] = useState<'nextRun' | 'lastRun' | 'name' | 'errors'>('nextRun')
  const [bulkWorking, setBulkWorking] = useState(false)

  const cronDir = `${instance.workspacePath}/cron`

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [jobsRaw, stateRaw, agentListRaw] = await Promise.all([
        sshExec(instance.id, `cat "${cronDir}/jobs.json" 2>/dev/null || echo "null"`),
        sshExec(instance.id, `cat "${cronDir}/jobs-state.json" 2>/dev/null || echo "null"`),
        sshExec(instance.id, `ls "${instance.workspacePath}/agents/" 2>/dev/null`),
      ])

      const jobsData = JSON.parse(jobsRaw.trim() || 'null')
      const stateData = JSON.parse(stateRaw.trim() || 'null')

      if (agentListRaw.trim()) {
        const list = agentListRaw.trim().split('\n').filter(Boolean)
        if (list.length > 0) setAgents(list)
      }

      if (!jobsData) { setJobs([]); setLastRefresh(new Date().toLocaleTimeString()); return }

      const jobsList: CronJob[] = (jobsData.jobs ?? []).map((j: Record<string, unknown>) => {
        const entry = (stateData?.jobs?.[j.id as string] ?? {}) as Record<string, unknown>
        const st = (entry.state ?? entry) as Record<string, unknown>
        return {
          id: j.id as string,
          name: j.name as string,
          agentId: j.agentId as string,
          sessionKey: j.sessionKey as string | undefined,
          enabled: j.enabled as boolean,
          createdAtMs: j.createdAtMs as number | undefined,
          schedule: j.schedule as CronSchedule,
          sessionTarget: j.sessionTarget as string | undefined,
          wakeMode: j.wakeMode as string | undefined,
          payload: j.payload as CronPayload,
          delivery: j.delivery as CronDelivery | undefined,
          lastRunAtMs: st.lastRunAtMs as number | undefined,
          nextRunAtMs: st.nextRunAtMs as number | undefined,
          lastRunStatus: (st.lastRunStatus ?? st.lastStatus) as string | undefined,
          lastDurationMs: st.lastDurationMs as number | undefined,
          consecutiveErrors: st.consecutiveErrors as number | undefined,
          lastError: st.lastError as string | undefined,
        }
      })

      setJobs(jobsList)
      setLastRefresh(new Date().toLocaleTimeString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load')
    } finally {
      setLoading(false)
    }
  }, [instance.id, instance.workspacePath, cronDir])

  useEffect(() => { load().catch(() => {}) }, [load])

  async function writeJob(job: CronJob) {
    // Build the canonical job object matching OpenClaw format
    const obj: Record<string, unknown> = {
      id: job.id,
      agentId: job.agentId,
      sessionKey: job.sessionKey ?? `agent:${job.agentId}:${job.agentId}`,
      name: job.name,
      enabled: job.enabled,
      createdAtMs: job.createdAtMs ?? Date.now(),
      schedule: job.schedule,
      sessionTarget: job.sessionTarget ?? 'isolated',
      wakeMode: job.wakeMode ?? 'now',
      payload: job.payload,
      delivery: job.delivery ?? { mode: 'none' },
      state: {},
    }
    // Base64 encode to avoid escaping issues in the shell command
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(obj))))
    const cmd = `python3 -c "
import json, base64
job = json.loads(base64.b64decode('${b64}').decode())
with open('${cronDir}/jobs.json', 'r') as f:
    data = json.load(f)
idx = next((i for i,j in enumerate(data['jobs']) if j['id']==job['id']), -1)
if idx >= 0:
    data['jobs'][idx] = job
else:
    data['jobs'].append(job)
with open('${cronDir}/jobs.json', 'w') as f:
    json.dump(data, f, indent=2)
print('ok')
"`
    const out = await sshExec(instance.id, cmd)
    if (!out.includes('ok')) throw new Error('Write failed')
  }

  async function deleteJob(id: string) {
    const cmd = `python3 -c "
import json
with open('${cronDir}/jobs.json', 'r') as f:
    data = json.load(f)
data['jobs'] = [j for j in data['jobs'] if j['id'] != '${id}']
with open('${cronDir}/jobs.json', 'w') as f:
    json.dump(data, f, indent=2)
print('ok')
"`
    await sshExec(instance.id, cmd)
  }

  async function toggleJob(job: CronJob) {
    const updated = { ...job, enabled: !job.enabled }
    await writeJob(updated)
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, enabled: updated.enabled } : j))
  }

  function openNew() {
    setEditForm({ ...BLANK_FORM, id: crypto.randomUUID() })
  }

  function openEdit(job: CronJob) {
    setEditForm({
      id: job.id,
      name: job.name,
      agentId: job.agentId,
      enabled: job.enabled,
      cronExpr: job.schedule?.expr ?? '0 9 * * *',
      timezone: job.schedule?.tz ?? 'Australia/Sydney',
      message: job.payload?.message ?? '',
      model: job.payload?.model ?? BLANK_FORM.model,
      timeoutSeconds: job.payload?.timeoutSeconds ?? 300,
      sessionTarget: job.sessionTarget ?? 'isolated',
    })
  }

  async function saveForm() {
    if (!editForm) return
    setSaving(true)
    try {
      const isNew = !jobs.find(j => j.id === editForm.id)
      const job: CronJob = {
        id: editForm.id,
        name: editForm.name,
        agentId: editForm.agentId,
        enabled: editForm.enabled,
        schedule: { kind: 'cron', expr: editForm.cronExpr, tz: editForm.timezone },
        sessionTarget: editForm.sessionTarget,
        wakeMode: 'now',
        payload: {
          kind: 'agentTurn',
          model: editForm.model,
          message: editForm.message,
          timeoutSeconds: editForm.timeoutSeconds,
        },
        delivery: { mode: 'none' },
        createdAtMs: isNew ? Date.now() : jobs.find(j => j.id === editForm.id)?.createdAtMs,
      }
      await writeJob(job)
      setEditForm(null)
      await load()
    } catch (e) {
      alert(`Save failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteJob(id)
      setSelectedId(null)
      await load()
    } catch (e) {
      alert(`Delete failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function resetJobError(id: string) {
    const cmd = `python3 -c "
import json
with open('${cronDir}/jobs-state.json', 'r') as f:
    data = json.load(f)
jobs = data.get('jobs', {})
if '${id}' in jobs:
    st = jobs['${id}'].get('state', jobs['${id}'])
    st['consecutiveErrors'] = 0
    st['lastError'] = None
    st['lastRunStatus'] = None
    st['lastStatus'] = None
    if 'state' in jobs['${id}']:
        jobs['${id}']['state'] = st
    else:
        jobs['${id}'] = st
with open('${cronDir}/jobs-state.json', 'w') as f:
    json.dump(data, f, indent=2)
print('ok')
"`
    try {
      await sshExec(instance.id, cmd)
      setJobs(prev => prev.map(j => j.id === id ? { ...j, consecutiveErrors: 0, lastError: undefined, lastRunStatus: undefined } : j))
    } catch (e) {
      alert(`Reset failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  async function bulkSetEnabled(enabled: boolean) {
    setBulkWorking(true)
    try {
      const cmd = `python3 -c "
import json
with open('${cronDir}/jobs.json', 'r') as f:
    data = json.load(f)
for j in data.get('jobs', []):
    j['enabled'] = ${enabled ? 'True' : 'False'}
with open('${cronDir}/jobs.json', 'w') as f:
    json.dump(data, f, indent=2)
print('ok')
"`
      await sshExec(instance.id, cmd)
      setJobs(prev => prev.map(j => ({ ...j, enabled })))
    } catch (e) {
      alert(`Bulk operation failed: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBulkWorking(false)
    }
  }

  const filtered = jobs.filter(j => {
    if (filter === 'enabled') return j.enabled
    if (filter === 'error') return (j.consecutiveErrors ?? 0) > 0
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'nextRun') {
      if (!a.nextRunAtMs && !b.nextRunAtMs) return 0
      if (!a.nextRunAtMs) return 1
      if (!b.nextRunAtMs) return -1
      return a.nextRunAtMs - b.nextRunAtMs
    }
    if (sortBy === 'lastRun') return (b.lastRunAtMs ?? 0) - (a.lastRunAtMs ?? 0)
    if (sortBy === 'name') return (a.name ?? '').localeCompare(b.name ?? '')
    if (sortBy === 'errors') return (b.consecutiveErrors ?? 0) - (a.consecutiveErrors ?? 0)
    return 0
  })

  const selectedJob: CronJob | null = selectedId ? (jobs.find(j => j.id === selectedId) ?? null) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border)', flexShrink: 0, gap: 10, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>Cron Jobs</h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, margin: 0 }}>
            {instance.name} · {jobs.length} job{jobs.length !== 1 ? 's' : ''}
            {lastRefresh && <span style={{ color: 'var(--text-dim)' }}> · {lastRefresh}</span>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* View toggle */}
          <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <button onClick={() => setView('list')} title="List view" style={{ padding: '5px 10px', border: 'none', cursor: 'pointer', background: view === 'list' ? 'var(--accent-dim)' : 'transparent', color: view === 'list' ? 'var(--accent)' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              <List size={13} />
            </button>
            <button onClick={() => setView('calendar')} title="Calendar view" style={{ padding: '5px 10px', border: 'none', cursor: 'pointer', background: view === 'calendar' ? 'var(--accent-dim)' : 'transparent', color: view === 'calendar' ? 'var(--accent)' : 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
              <CalendarDays size={13} />
            </button>
          </div>

          {/* Filter tabs — list view only */}
          {view === 'list' && (
            <div style={{ display: 'flex', background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)', overflow: 'hidden' }}>
              {(['all', 'enabled', 'error'] as const).map(f => (
                <button key={f} onClick={() => setFilter(f)} style={{
                  padding: '5px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
                  background: filter === f ? 'var(--accent-dim)' : 'transparent',
                  color: filter === f ? 'var(--accent)' : 'var(--text-muted)',
                  fontWeight: filter === f ? 600 : 400,
                }}>{f}</button>
              ))}
            </div>
          )}

          {/* Sort */}
          {view === 'list' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface2)', borderRadius: 7, border: '1px solid var(--border)', padding: '3px 8px' }}>
              <ArrowUpDown size={11} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
              <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
                style={{ background: 'transparent', border: 'none', outline: 'none', fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer', fontFamily: 'inherit' }}>
                <option value="nextRun">Next Run</option>
                <option value="lastRun">Last Run</option>
                <option value="name">Name</option>
                <option value="errors">Errors</option>
              </select>
            </div>
          )}

          {/* Bulk actions */}
          <button onClick={() => bulkSetEnabled(true)} disabled={bulkWorking} title="Resume all jobs"
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--success)', fontSize: 11, cursor: 'pointer', opacity: bulkWorking ? 0.5 : 1 }}>
            <ChevronsUp size={12} /> All on
          </button>
          <button onClick={() => bulkSetEnabled(false)} disabled={bulkWorking} title="Pause all jobs"
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--warning)', fontSize: 11, cursor: 'pointer', opacity: bulkWorking ? 0.5 : 1 }}>
            <ChevronsDown size={12} /> All off
          </button>

          <button onClick={openNew} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
            <Plus size={12} /> New Job
          </button>
          <button onClick={load} disabled={loading} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}>
            <RefreshCw size={12} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 13, color: 'var(--error)', background: 'var(--error-dim)', padding: '10px 18px', flexShrink: 0 }}>{error}</div>
      )}

      {/* Calendar view */}
      {view === 'calendar' && (
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <CalendarView jobs={jobs} />
        </div>
      )}

      {/* Body: list + detail split */}
      {view === 'list' && <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* Job list */}
        <div style={{ flex: selectedJob ? '0 0 340px' : 1, overflow: 'auto', padding: '12px' }}>
          {loading && jobs.length === 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[1,2,3].map(i => <div key={i} style={{ height: 68, borderRadius: 10, background: 'var(--surface2)', animation: 'pulse 2s cubic-bezier(.4,0,.6,1) infinite' }} />)}
            </div>
          )}

          {!loading && filtered.length === 0 && !error && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)' }}>
              <Clock size={36} style={{ margin: '0 auto 12px', opacity: 0.25, display: 'block' }} />
              <p style={{ fontSize: 14, margin: '0 0 4px' }}>No jobs{filter !== 'all' ? ` matching "${filter}"` : ''}.</p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sorted.map(job => {
              const isSelected = selectedId === job.id
              const hasError = (job.consecutiveErrors ?? 0) > 0
              return (
                <div
                  key={job.id}
                  onClick={() => setSelectedId(isSelected ? null : job.id)}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '11px 14px',
                    borderRadius: 10, cursor: 'pointer', opacity: job.enabled ? 1 : 0.55,
                    background: isSelected ? 'var(--accent-dim)' : 'var(--surface)',
                    border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                    transition: 'border-color 0.1s',
                  }}
                >
                  <div style={{ paddingTop: 1 }}>
                    <StatusIcon status={job.lastRunStatus} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 500, fontSize: 13, color: isSelected ? 'var(--accent)' : 'var(--text)' }}>{job.name}</span>
                      {!job.enabled && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--text-dim)', border: '1px solid var(--border)' }}>paused</span>}
                      {hasError && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'rgba(239,68,68,0.12)', color: 'var(--error)' }}>{job.consecutiveErrors}× err</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--accent)' }}>{cronHuman(job.schedule?.expr)}</span>
                      <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{job.schedule?.expr ?? ''}</span>
                      {job.lastRunAtMs && (
                        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>ran {fmtRelative(job.lastRunAtMs)}</span>
                      )}
                      {job.nextRunAtMs && (
                        <span style={{ fontSize: 11, color: 'var(--accent)', opacity: 0.7 }}>next {fmtRelative(job.nextRunAtMs)}</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <ChevronRight size={12} style={{ color: 'var(--text-dim)', transform: isSelected ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                    <button
                      onClick={e => { e.stopPropagation(); toggleJob(job) }}
                      title={job.enabled ? 'Pause' : 'Resume'}
                      style={{ padding: '3px 6px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      {job.enabled ? <Pause size={11} /> : <Play size={11} />}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Detail panel */}
        {selectedJob && (
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <DetailPanel
              job={selectedJob}
              onClose={() => setSelectedId(null)}
              onToggle={() => selectedJob && toggleJob(selectedJob)}
              onEdit={() => selectedJob && openEdit(selectedJob)}
              onDelete={() => selectedJob && handleDelete(selectedJob.id)}
              onReset={() => selectedJob && resetJobError(selectedJob.id)}
            />
          </div>
        )}
      </div>}

      {/* Create/Edit modal */}
      {editForm && (
        <CronForm
          form={editForm}
          agents={agents}
          onChange={setEditForm}
          onSubmit={saveForm}
          onClose={() => setEditForm(null)}
          isNew={!jobs.find(j => j.id === editForm.id)}
          saving={saving}
        />
      )}
    </div>
  )
}
