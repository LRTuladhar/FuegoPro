import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'

const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee', '#fb7185']

const fmt = (v) => {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v}`
}

export default function AccountBalancesChart({ data }) {
  if (!data || data.length === 0) return null

  // Build sorted list of unique ages
  const ages = [...new Set(data.map((p) => p.age))].sort((a, b) => a - b)

  // Build ordered list of unique accounts (preserve first-seen order)
  const seen = new Map()
  data.forEach((p) => {
    if (!seen.has(p.account_id)) seen.set(p.account_id, p.account_name)
  })
  const accounts = [...seen.entries()] // [[id, name], ...]

  // Transform to per-age rows: { age, "Account Name": balance, ... }
  const byAge = {}
  data.forEach((p) => {
    if (!byAge[p.age]) byAge[p.age] = { age: p.age }
    byAge[p.age][p.account_name] = p.p50
  })
  const chartData = ages.map((age) => byAge[age])

  return (
    <div style={card}>
      <h2 style={heading}>Account Balances (Median Run)</h2>
      <ResponsiveContainer width="100%" height={280}>
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
            formatter={(v, name) => [fmt(v), name]}
            labelFormatter={(v) => `Age ${v}`}
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: '0.8rem' }}
          />
          <Legend verticalAlign="top" height={36} iconType="line" wrapperStyle={{ color: '#94a3b8' }} />
          {accounts.map(([id, name], i) => (
            <Line
              key={id}
              type="monotone"
              dataKey={name}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

const card = {
  background: '#1e293b',
  borderRadius: 8,
  padding: '1.25rem',
  boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
}

const heading = { margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }
