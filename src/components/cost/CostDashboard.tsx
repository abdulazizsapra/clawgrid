'use client'
import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, DollarSign, TrendingUp, Zap, Database } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import type { OpenClawInstance } from '@/types'

interface CostEntry {
  date: string
  inputTokens: number
  outputTokens: number
  cacheTokens: number
  model: string
  cost?: number
}

const MODEL_RATES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-4-8':   { input: 15, output: 75 },
  'claude-haiku-4-5':  { input: 0.8, output: 4 },
}

function calcCost(entry: CostEntry): number {
  const rates = MODEL_RATES[entry.model] ?? MODEL_RATES['claude-sonnet-4-6']
  return (entry.inputTokens * rates.input + entry.outputTokens * rates.output) / 1_000_000
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} style={{ color: 'var(--accent)' }} />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

export function CostDashboard({ instance }: { instance: OpenClawInstance }) {
  const [entries, setEntries] = useState<CostEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/ssh/${instance.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'exec',
          args: {
            command: `find "${instance.workspacePath}/logs" -name "*.jsonl" -newer /tmp/.cost_check 2>/dev/null | head -30; ls "${instance.workspacePath}/logs/" 2>/dev/null | tail -30`,
          },
        }),
      })
      // Try to read daily usage logs
      const scanRes = await fetch(`/api/ssh/${instance.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'exec',
          args: { command: `ls -1 "${instance.workspacePath}/logs/" 2>/dev/null | grep -E "^[0-9]{4}-[0-9]{2}-[0-9]{2}" | tail -14` },
        }),
      })
      const scanData = await scanRes.json()
      const logFiles = (scanData.stdout || '').trim().split('\n').filter(Boolean)

      const parsed: CostEntry[] = []
      for (const f of logFiles.slice(-14)) {
        const catRes = await fetch(`/api/ssh/${instance.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'exec',
            args: { command: `cat "${instance.workspacePath}/logs/${f}" 2>/dev/null | tail -500` },
          }),
        })
        const catData = await catRes.json()
        const lines = (catData.stdout || '').trim().split('\n').filter(Boolean)
        let dayIn = 0, dayOut = 0, dayCache = 0, dayModel = 'claude-sonnet-4-6'
        for (const line of lines) {
          try {
            const obj = JSON.parse(line)
            if (obj.inputTokens) dayIn += obj.inputTokens
            if (obj.outputTokens) dayOut += obj.outputTokens
            if (obj.cacheTokens) dayCache += obj.cacheTokens
            if (obj.model) dayModel = obj.model
          } catch { /* skip */ }
        }
        if (dayIn + dayOut > 0) {
          parsed.push({ date: f.replace('.jsonl', '').slice(0, 10), inputTokens: dayIn, outputTokens: dayOut, cacheTokens: dayCache, model: dayModel })
        }
      }
      setEntries(parsed)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed')
    } finally {
      setLoading(false)
    }
  }, [instance.id, instance.workspacePath])

  useEffect(() => { load() }, [load])

  const totalCost = entries.reduce((sum, e) => sum + calcCost(e), 0)
  const totalTokens = entries.reduce((sum, e) => sum + e.inputTokens + e.outputTokens, 0)
  const totalCache = entries.reduce((sum, e) => sum + e.cacheTokens, 0)
  const avgDailyCost = entries.length > 0 ? totalCost / entries.length : 0

  const chartData = entries.map(e => ({
    date: e.date.slice(5),
    cost: parseFloat(calcCost(e).toFixed(4)),
    tokens: Math.round((e.inputTokens + e.outputTokens) / 1000),
  }))

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Cost Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>{instance.name} · last {entries.length} days</p>
        </div>
        <button onClick={load} disabled={loading} className="p-1.5 rounded-lg transition-colors" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && <p className="text-sm mb-4" style={{ color: 'var(--error)' }}>{error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={DollarSign} label="Total Cost (period)" value={`$${totalCost.toFixed(4)}`} sub={`~$${avgDailyCost.toFixed(4)}/day`} />
        <StatCard icon={Zap} label="Total Tokens" value={(totalTokens / 1000).toFixed(1) + 'K'} />
        <StatCard icon={Database} label="Cache Tokens" value={(totalCache / 1000).toFixed(1) + 'K'} sub="saved from billing" />
        <StatCard icon={TrendingUp} label="Days Tracked" value={String(entries.length)} />
      </div>

      {chartData.length > 0 && (
        <div className="rounded-xl p-5 mb-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-medium mb-4">Daily Cost (USD)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barSize={20}>
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
              <Tooltip
                contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`$${v.toFixed(4)}`, 'cost']}
              />
              <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill="var(--accent)" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && entries.length === 0 && !error && (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>
          <DollarSign size={32} className="mx-auto mb-3 opacity-30" />
          <p className="text-sm">No cost data found. Usage logs appear in the workspace logs/ directory.</p>
        </div>
      )}
    </div>
  )
}
