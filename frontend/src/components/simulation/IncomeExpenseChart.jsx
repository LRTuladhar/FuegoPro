import { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'

const INCOME_COLORS  = ['#60a5fa', '#34d399', '#a78bfa', '#22d3ee', '#fbbf24', '#4ade80', '#fb7185']
const EXPENSE_COLORS = ['#f87171', '#fb923c', '#fbbf24', '#f472b6', '#c084fc', '#22d3ee', '#60a5fa']

const BAND_LABELS = { lower: 'Lower Band', median: 'Median', upper: 'Upper Band' }

const fmt = (v) => {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${Math.round(v ?? 0)}`
}

/**
 * Stacked area chart for either income or expense breakdown per age.
 *
 * Props:
 *   data        — income_detail or expense_detail array from simulation results
 *   categoryKey — field name to use as the stacked category ('source_name' or 'expense_name')
 *   title       — chart heading (e.g. 'Income' or 'Expenses')
 *   band        — 'lower' | 'median' | 'upper'
 *   variant     — 'income' (default) | 'expenses' — selects color palette
 */
export default function IncomeExpenseChart({ data, categoryKey, title, band, variant = 'income' }) {
  const [open, setOpen] = useState(true)
  const [hidden, setHidden] = useState(new Set())
  const colors = variant === 'expenses' ? EXPENSE_COLORS : INCOME_COLORS

  const toggleCategory = (cat) =>
    setHidden((prev) => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })

  const { chartData, categories } = useMemo(() => {
    const filtered = (data ?? []).filter((r) => r.band === band)
    const ages = [...new Set(filtered.map((r) => r.age))].sort((a, b) => a - b)

    // Preserve first-seen category order
    const seen = new Set()
    filtered.forEach((r) => { if (!seen.has(r[categoryKey])) seen.add(r[categoryKey]) })
    const cats = [...seen]

    // Pivot: { age, "CategoryName": amount, ... }
    const byAge = {}
    filtered.forEach((r) => {
      if (!byAge[r.age]) byAge[r.age] = { age: r.age }
      byAge[r.age][r[categoryKey]] = r.amount
    })

    return { chartData: ages.map((age) => byAge[age]), categories: cats }
  }, [data, categoryKey, band])

  if (!chartData.length) return null

  return (
    <div style={card}>
      <div onClick={() => setOpen((o) => !o)} style={toggleRow(open)}>
        <h2 style={heading}>{title} — {BAND_LABELS[band] ?? band}</h2>
        <span style={toggleHint}>{open ? '▲ collapse' : '▼ expand'}</span>
      </div>
      {open && <>
        {/* Custom toggleable legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
          {categories.map((cat, i) => {
            const color = colors[i % colors.length]
            const isHidden = hidden.has(cat)
            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '0.2rem 0.55rem',
                  borderRadius: 4,
                  border: `1px solid ${isHidden ? '#334155' : color}`,
                  background: isHidden ? 'transparent' : `${color}22`,
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  color: isHidden ? '#475569' : '#f1f5f9',
                  transition: 'all 0.15s',
                  userSelect: 'none',
                }}
              >
                <span style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: isHidden ? '#334155' : color,
                  flexShrink: 0,
                }} />
                {cat}
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
            {categories.filter((cat) => !hidden.has(cat)).map((cat, i) => (
              <Area
                key={cat}
                type="monotone"
                dataKey={cat}
                stackId="a"
                stroke={colors[categories.indexOf(cat) % colors.length]}
                fill={colors[categories.indexOf(cat) % colors.length]}
                fillOpacity={0.55}
                strokeWidth={1}
                dot={false}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </>}
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
  marginBottom: open ? '1rem' : 0,
  userSelect: 'none',
})

const toggleHint = { fontSize: '0.75rem', color: '#94a3b8', flexShrink: 0 }
