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

function CustomTooltip({ active, payload, label, visibleAccounts, accounts }) {
  if (!active || !payload || payload.length === 0) return null
  const total = payload.reduce((sum, entry) => sum + (entry.value ?? 0), 0)
  return (
    <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#f1f5f9' }}>
      <div style={{ marginBottom: '0.35rem', fontWeight: 600, color: '#94a3b8' }}>Age {label}</div>
      {payload.map((entry) => {
        const color = COLORS[accounts.findIndex(([, n]) => n === entry.name) % COLORS.length]
        return (
          <div key={entry.name} style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5rem', color }}>
            <span>{entry.name}</span>
            <span>{fmt(entry.value)}</span>
          </div>
        )
      })}
      <div style={{ borderTop: '1px solid #334155', marginTop: '0.35rem', paddingTop: '0.35rem', display: 'flex', justifyContent: 'space-between', gap: '1.5rem', fontWeight: 600, color: '#f1f5f9' }}>
        <span>Total</span>
        <span>{fmt(total)}</span>
      </div>
    </div>
  )
}

export default function AccountBalancesChart({ data, band, initialAccounts, currentAge }) {
  const [open, setOpen] = useState(true)
  const [hidden, setHidden] = useState(new Set())

  if (!data || data.length === 0) return null

  const filtered = data.filter((p) => p.band === band)

  const seen = new Map()
  filtered.forEach((p) => {
    if (!seen.has(p.account_id)) seen.set(p.account_id, p.account_name)
  })
  const accounts = [...seen.entries()] // [[id, name], ...]

  // Shift simulation ages by +1 (they are end-of-year; age N means end of year at age N)
  // so that the chart x-axis reads: currentAge = initial state, currentAge+1 = end of year 1, etc.
  const byAge = {}
  filtered.forEach((p) => {
    const displayAge = p.age + 1
    if (!byAge[displayAge]) byAge[displayAge] = { age: displayAge }
    byAge[displayAge][p.account_name] = p.balance
  })

  // Prepend the initial-balance point at currentAge
  const initialPoint = { age: currentAge }
  if (initialAccounts) {
    accounts.forEach(([id, name]) => {
      const acct = initialAccounts.find((a) => a.id === id)
      initialPoint[name] = (acct && (acct.start_age == null || acct.start_age <= currentAge))
        ? (acct.balance ?? 0)
        : 0
    })
  }

  const ages = [currentAge, ...Object.keys(byAge).map(Number).sort((a, b) => a - b)]
  const chartData = ages.map((age) => age === currentAge ? initialPoint : byAge[age])

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
              <Tooltip content={<CustomTooltip visibleAccounts={visibleAccounts} accounts={accounts} />} />
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
