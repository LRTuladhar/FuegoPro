import { useState, useEffect } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { getPlans, compareSimulations } from '../api/client'
import { useSimConfig } from '../store/simConfig'
import SuccessRate from '../components/simulation/SuccessRate'

const PLAN_COLORS = ['#f97316', '#3b82f6', '#10b981']
const MAX_PLANS = 3

export default function Compare() {
  const { config: globalConfig } = useSimConfig()
  const [plans, setPlans] = useState([])
  const [selectedIds, setSelectedIds] = useState([null, null, null])
  const [simConfig, setSimConfig] = useState(null)   // loaded from global after mount
  const [results, setResults] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)

  // Initialise simConfig from global context once loaded
  useEffect(() => {
    if (simConfig === null) setSimConfig({ ...globalConfig, initialRegime: 'random' })
  }, [globalConfig]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getPlans()
      .then(res => setPlans(res.data))
      .catch(() => setError('Failed to load plans.'))
  }, [])

  const chosenIds = selectedIds.filter(Boolean)
  const canRun = chosenIds.length >= 1 && simConfig && simConfig.lowerPct < simConfig.upperPct

  const handleRun = async () => {
    setRunning(true)
    setError(null)
    setResults(null)
    try {
      const res = await compareSimulations(chosenIds, {
        num_runs: simConfig.numRuns,
        lower_percentile: simConfig.lowerPct,
        upper_percentile: simConfig.upperPct,
        initial_market_regime: simConfig.initialRegime === 'random' ? null : simConfig.initialRegime,
      })
      setResults(res.data)
    } catch (e) {
      setError('Compare failed: ' + (e.response?.data?.detail ?? e.message))
    } finally {
      setRunning(false)
    }
  }

  const setSlot = (idx, val) => {
    setSelectedIds(prev => {
      const next = [...prev]
      next[idx] = val ? parseInt(val, 10) : null
      return next
    })
    setResults(null)
  }

  // Build combined chart data: [{age, "Plan A": val, "Plan B": val}, ...]
  const chartData = buildChartData(results)

  return (
    <div style={{ maxWidth: 1040 }}>
      {/* Header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Compare Plans</h1>
        <p style={{ margin: '0.25rem 0 0', color: '#94a3b8', fontSize: '0.875rem' }}>
          Select up to {MAX_PLANS} plans to run side-by-side simulations.
        </p>
      </div>

      {/* Plan selectors + run button */}
      <div style={{
        background: '#1e293b',
        border: '1px solid #334155',
        borderRadius: 8,
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'flex-end',
        gap: '1rem',
        flexWrap: 'wrap',
        marginBottom: '1rem',
      }}>
        {[0, 1, 2].map(idx => (
          <div key={idx}>
            <div style={labelStyle}>Plan {idx + 1}</div>
            <select
              value={selectedIds[idx] ?? ''}
              onChange={e => setSlot(idx, e.target.value)}
              style={{
                ...selectStyle,
                borderColor: selectedIds[idx] ? PLAN_COLORS[idx] : '#334155',
              }}
            >
              <option value="">— select —</option>
              {plans.map(p => (
                <option
                  key={p.id}
                  value={p.id}
                  disabled={selectedIds.some((id, i) => i !== idx && id === p.id)}
                >
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        ))}

        <button
          onClick={handleRun}
          disabled={!canRun || running}
          style={btn(!canRun || running ? 'disabled' : 'primary')}
        >
          {running ? 'Running…' : results ? 'Re-run' : 'Run Compare'}
        </button>
      </div>

      {/* Inline config row */}
      {simConfig && (
        <div style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: 8,
          padding: '0.75rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '2rem',
          flexWrap: 'wrap',
          marginBottom: '1rem',
        }}>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Parameters
          </span>
          <ConfigField label="Runs">
            <input type="number" value={simConfig.numRuns} min={10} max={10000} step={10}
              onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setSimConfig(s => ({ ...s, numRuns: v })) }}
              style={numInput} />
          </ConfigField>
          <ConfigField label="Lower">
            <input type="number" value={simConfig.lowerPct} min={1} max={49}
              onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setSimConfig(s => ({ ...s, lowerPct: v })) }}
              style={{ ...numInput, width: 56 }} />
            <span style={{ color: '#94a3b8', marginLeft: 4 }}>%</span>
          </ConfigField>
          <ConfigField label="Upper">
            <input type="number" value={simConfig.upperPct} min={51} max={99}
              onChange={e => { const v = parseInt(e.target.value, 10); if (!isNaN(v)) setSimConfig(s => ({ ...s, upperPct: v })) }}
              style={{ ...numInput, width: 56 }} />
            <span style={{ color: '#94a3b8', marginLeft: 4 }}>%</span>
          </ConfigField>
          <ConfigField label="Market">
            <div style={{ display: 'flex', gap: 4 }}>
              {['random', 'bear', 'bull'].map((option) => (
                <button
                  key={option}
                  onClick={() => setSimConfig(s => ({ ...s, initialRegime: option }))}
                  style={{
                    padding: '0.3rem 0.6rem',
                    borderRadius: 4,
                    border: '1px solid #334155',
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textTransform: 'capitalize',
                    background: simConfig.initialRegime === option ? '#3b82f6' : '#0f172a',
                    color: simConfig.initialRegime === option ? '#fff' : '#94a3b8',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {option === 'random' ? 'Random' : option === 'bear' ? 'Bear' : 'Bull'}
                </button>
              ))}
            </div>
          </ConfigField>
          {simConfig.lowerPct >= simConfig.upperPct && (
            <span style={{ color: '#f87171', fontSize: '0.8rem' }}>Lower must be less than upper.</span>
          )}
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(127,29,29,0.3)', border: '1px solid #991b1b', borderRadius: 6, padding: '0.75rem 1rem', marginBottom: '1rem', color: '#f87171', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {/* Empty state */}
      {!results && !running && (
        <div style={{
          background: '#1e293b',
          borderRadius: 8,
          padding: '5rem 2rem',
          textAlign: 'center',
          color: '#94a3b8',
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚖️</div>
          <p style={{ margin: 0, fontSize: '1rem' }}>
            Select plans above and click <strong style={{ color: '#f97316' }}>Run Compare</strong>.
          </p>
        </div>
      )}

      {/* Results */}
      {results && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Success rate cards */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${results.length}, 1fr)`, gap: '1rem' }}>
            {results.map((r, idx) => (
              <div key={r.plan_id}>
                <div style={{
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  color: PLAN_COLORS[idx],
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  marginBottom: 6,
                }}>
                  {r.plan_name}
                </div>
                <SuccessRate rate={r.success_rate} numRuns={r.num_runs} />
              </div>
            ))}
          </div>

          {/* Combined portfolio timeline */}
          {chartData.length > 0 && (
            <div style={{ background: '#1e293b', borderRadius: 8, padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
              <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#f1f5f9', marginBottom: '1rem' }}>
                Median Portfolio Value (p50)
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={chartData} margin={{ top: 4, right: 20, bottom: 4, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                  <XAxis
                    dataKey="age"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    label={{ value: 'Age', position: 'insideBottom', offset: -2, fontSize: 11, fill: '#94a3b8' }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickFormatter={v => v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}K`}
                    width={68}
                  />
                  <Tooltip
                    formatter={(v, name) => [
                      v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : `$${(v / 1e3).toFixed(0)}K`,
                      name,
                    ]}
                    labelFormatter={age => `Age ${age}`}
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: '0.8rem' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '0.8rem', paddingTop: 12, color: '#94a3b8' }} />
                  {results.map((r, idx) => (
                    <Line
                      key={r.plan_id}
                      type="monotone"
                      dataKey={r.plan_name}
                      stroke={PLAN_COLORS[idx]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Summary table */}
          <div style={{ background: '#1e293b', borderRadius: 8, padding: '1.25rem 1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.4)', overflowX: 'auto' }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#f1f5f9', marginBottom: '1rem' }}>
              Summary
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <th style={th}>Metric</th>
                  {results.map((r, idx) => (
                    <th key={r.plan_id} style={{ ...th, color: PLAN_COLORS[idx] }}>{r.plan_name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={td}>Success rate</td>
                  {results.map(r => (
                    <td key={r.plan_id} style={{ ...td, fontWeight: 600, color: rateColor(r.success_rate) }}>
                      {(r.success_rate * 100).toFixed(1)}%
                    </td>
                  ))}
                </tr>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={td}>Runs</td>
                  {results.map(r => <td key={r.plan_id} style={td}>{r.num_runs.toLocaleString()}</td>)}
                </tr>
                <tr style={{ borderBottom: '1px solid #334155' }}>
                  <td style={td}>Percentile band</td>
                  {results.map(r => (
                    <td key={r.plan_id} style={td}>{r.lower_percentile}th – {r.upper_percentile}th</td>
                  ))}
                </tr>
                <tr>
                  <td style={td}>Final median portfolio</td>
                  {results.map(r => {
                    const last = r.portfolio_timeline[r.portfolio_timeline.length - 1]
                    const val = last?.p50 ?? 0
                    return (
                      <td key={r.plan_id} style={td}>
                        {val >= 1e6 ? `$${(val / 1e6).toFixed(2)}M` : `$${(val / 1e3).toFixed(0)}K`}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

// Merge portfolio timelines from multiple results into recharts-compatible format
function buildChartData(results) {
  if (!results || results.length === 0) return []
  // Collect all ages
  const ages = [...new Set(results.flatMap(r => r.portfolio_timeline.map(pt => pt.age)))].sort((a, b) => a - b)
  return ages.map(age => {
    const row = { age }
    results.forEach(r => {
      const pt = r.portfolio_timeline.find(p => p.age === age)
      row[r.plan_name] = pt?.p50 ?? null
    })
    return row
  })
}

function rateColor(rate) {
  if (rate >= 0.9) return '#4ade80'
  if (rate >= 0.7) return '#fbbf24'
  return '#f87171'
}

const labelStyle = {
  fontSize: '0.72rem',
  fontWeight: 500,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: 5,
}

const selectStyle = {
  padding: '0.4rem 0.6rem',
  borderRadius: 5,
  border: '1px solid #334155',
  fontSize: '0.875rem',
  color: '#f1f5f9',
  background: '#0f172a',
  minWidth: 180,
  cursor: 'pointer',
}

const numInput = {
  width: 80,
  padding: '0.35rem 0.5rem',
  border: '1px solid #334155',
  borderRadius: 5,
  fontSize: '0.9rem',
  color: '#f1f5f9',
  background: '#0f172a',
  outline: 'none',
}

const th = {
  padding: '0.5rem 1rem',
  textAlign: 'left',
  fontWeight: 600,
  color: '#94a3b8',
  fontSize: '0.8rem',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

const td = {
  padding: '0.6rem 1rem',
  color: '#cbd5e1',
}

function btn(variant) {
  const base = {
    padding: '0.5rem 1.1rem',
    borderRadius: 6,
    border: 'none',
    cursor: variant === 'disabled' ? 'not-allowed' : 'pointer',
    fontSize: '0.875rem',
    fontWeight: 600,
    opacity: variant === 'disabled' ? 0.55 : 1,
    alignSelf: 'flex-end',
  }
  if (variant === 'primary' || variant === 'disabled')
    return { ...base, background: '#f97316', color: '#fff' }
  return { ...base, background: '#334155', color: '#94a3b8' }
}

function ConfigField({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: '0.72rem', fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center' }}>{children}</div>
    </div>
  )
}
