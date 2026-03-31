import { useState, useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'

const BAND_LABELS = { lower: 'Lower Band', median: 'Median', upper: 'Upper Band' }

const fmt = (v) => {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${Math.round(v ?? 0)}`
}

/**
 * Single-line chart showing total net assets (sum of all account balances) per age.
 *
 * Props:
 *   data — account_timeline array from simulation results
 *   band — 'lower' | 'median' | 'upper'
 */
export default function NetAssetsChart({ data, band }) {
  const [open, setOpen] = useState(true)
  const chartData = useMemo(() => {
    const byAge = {}
    ;(data ?? []).filter((r) => r.band === band).forEach((r) => {
      byAge[r.age] = (byAge[r.age] ?? 0) + r.balance
    })
    return Object.entries(byAge)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([age, total]) => ({ age: Number(age), total }))
  }, [data, band])

  if (!chartData.length) return null

  return (
    <div style={card}>
      <div onClick={() => setOpen((o) => !o)} style={toggleRow(open)}>
        <h2 style={heading}>Net Assets — {BAND_LABELS[band] ?? band}</h2>
        <span style={toggleHint}>{open ? '▲ collapse' : '▼ expand'}</span>
      </div>
      {open && <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 4, right: 24, bottom: 16, left: 16 }}>
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
            formatter={(v) => [fmt(v), 'Net Assets']}
            labelFormatter={(v) => `Age ${v}`}
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: '0.8rem' }}
          />
          <Line
            type="monotone"
            dataKey="total"
            name="Net Assets"
            stroke="#34d399"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>}
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
