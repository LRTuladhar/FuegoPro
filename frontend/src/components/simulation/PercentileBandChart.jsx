import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'

const fmt = (v) => {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v}`
}

export default function PercentileBandChart({
  data,               // statistical cross-sectional percentile data
  representativeData, // per-band representative run totals
  lower,
  upper,
  viewMode = 'statistical',
  onViewModeChange,
}) {
  const isRep = viewMode === 'representative'
  const chartData = isRep ? (representativeData ?? []) : (data ?? [])

  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
        <h2 style={heading}>Portfolio Value</h2>
        {onViewModeChange && (
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { key: 'statistical',    label: 'Statistical' },
              { key: 'representative', label: 'Scenarios'   },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => onViewModeChange(key)}
                style={{
                  padding: '0.25rem 0.65rem',
                  borderRadius: 4,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  background: viewMode === key ? '#f97316' : '#334155',
                  color:      viewMode === key ? '#fff'    : '#94a3b8',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      <p style={{ margin: '0 0 1rem', fontSize: '0.8rem', color: '#94a3b8' }}>
        {isRep
          ? `Three complete runs ranked by final portfolio value (lower / median / upper)`
          : `Median (solid) with ${lower}th / ${upper}th percentile bounds (dashed)`}
      </p>
      <ResponsiveContainer width="100%" height={320}>
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
          <Line
            type="monotone"
            dataKey="p_upper"
            name={isRep ? 'Upper run' : `${upper}th pct`}
            stroke="#93c5fd"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="p50"
            name={isRep ? 'Median run' : 'Median (p50)'}
            stroke="#60a5fa"
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="p_lower"
            name={isRep ? 'Lower run' : `${lower}th pct`}
            stroke="#f97316"
            strokeWidth={1.5}
            strokeDasharray="5 3"
            dot={false}
          />
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

const heading = { margin: '0 0 0.25rem', fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }
