import { useState } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'

const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee', '#fb7185']

const BAND_LABELS = { lower: 'Lower Band', median: 'Median', upper: 'Upper Band' }

const fmt = (v) => {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v}`
}

export default function AccountBalancesChart({ data, band }) {
  const [open, setOpen] = useState(true)
  const [hidden, setHidden] = useState(new Set())

  if (!data || data.length === 0) return null

  const filtered = data.filter((p) => p.band === band)

  const ages = [...new Set(filtered.map((p) => p.age))].sort((a, b) => a - b)

  const seen = new Map()
  filtered.forEach((p) => {
    if (!seen.has(p.account_id)) seen.set(p.account_id, p.account_name)
  })
  const accounts = [...seen.entries()] // [[id, name], ...]

  const byAge = {}
  filtered.forEach((p) => {
    if (!byAge[p.age]) byAge[p.age] = { age: p.age }
    byAge[p.age][p.account_name] = p.balance
  })
  const chartData = ages.map((age) => byAge[age])

  const toggleAccount = (name) =>
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })

  const visibleAccounts = accounts.filter(([, name]) => !hidden.has(name))

  return (
    <div style={card}>
      <div onClick={() => setOpen((o) => !o)} style={toggleRow(open)}>
        <h2 style={heading}>Account Balances — {BAND_LABELS[band] ?? band}</h2>
        <span style={toggleHint}>{open ? '▲ collapse' : '▼ expand'}</span>
      </div>
      {open && (
        <>
          <div style={chipRow}>
            {accounts.map(([id, name]) => {
              const color = COLORS[accounts.findIndex(([, n]) => n === name) % COLORS.length]
              const active = !hidden.has(name)
              return (
                <button
                  key={id}
                  onClick={() => toggleAccount(name)}
                  style={chip(color, active)}
                >
                  {name}
                </button>
              )
            })}
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chartData} margin={{ top: 4, right: 24, bottom: 16, left: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis
                dataKey="age"
                type="number"
                domain={['dataMin', 'dataMax']}
                label={{ value: 'Age', position: 'insideBottom', offset: -6, fontSize: 12, fill: '#94a3b8' }}
                tick={{ fontSize: 12, fill: '#94a3b8' }}
              />
              <YAxis tickFormatter={fmt} width={72} tick={{ fontSize: 12, fill: '#94a3b8' }} />
              <Tooltip
                formatter={(v, name) => [fmt(v), name]}
                labelFormatter={(v) => `Age ${v}`}
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: '0.8rem' }}
              />
              {visibleAccounts.map(([id, name]) => {
                const color = COLORS[accounts.findIndex(([, n]) => n === name) % COLORS.length]
                return (
                  <Area
                    key={id}
                    type="monotone"
                    dataKey={name}
                    stackId="a"
                    stroke={color}
                    fill={color}
                    fillOpacity={0.7}
                    dot={false}
                    isAnimationActive={false}
                  />
                )
              })}
            </AreaChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  )
}

const card = {
  background: '#1e293b',
  borderRadius: 8,
  padding: '1.25rem',
  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
}

const heading = { margin: 0, fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }

const toggleRow = (open) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  cursor: 'pointer',
  marginBottom: open ? '0.75rem' : 0,
  userSelect: 'none',
})

const toggleHint = { fontSize: '0.75rem', color: '#94a3b8', flexShrink: 0 }

const chipRow = { display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }

const chip = (color, active) => ({
  padding: '0.2rem 0.6rem',
  borderRadius: 20,
  border: `1px solid ${active ? color : '#334155'}`,
  background: active ? color + '22' : 'transparent',
  color: active ? color : '#475569',
  fontSize: '0.75rem',
  cursor: 'pointer',
  fontWeight: 500,
  transition: 'all 0.15s',
})
