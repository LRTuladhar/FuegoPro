import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer,
  ComposedChart, Area,
} from 'recharts'
import { getPlan, runSensitivity } from '../api/client'
import { useSimConfig } from '../store/simConfig'

// ---------------------------------------------------------------------------
// Parameter definitions
// ---------------------------------------------------------------------------

const PARAMETERS = {
  stock_return_offset: {
    label: 'Stock Returns',
    defaultMin: -0.04,
    defaultMax: 0.04,
    step: 0.005,
    baseline: 0,
    format: v => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`,
    displayMin: v => (v * 100).toFixed(1),
    displayMax: v => (v * 100).toFixed(1),
    parseInput: v => parseFloat(v) / 100,
    description: 'Adjust annual stock returns from historical average',
    inputUnit: '%',
  },
  inflation_rate: {
    label: 'Inflation Rate',
    defaultMin: 0.01,
    defaultMax: 0.05,
    step: 0.0025,
    baseline: null,
    format: v => `${(v * 100).toFixed(2)}%`,
    displayMin: v => (v * 100).toFixed(2),
    displayMax: v => (v * 100).toFixed(2),
    parseInput: v => parseFloat(v) / 100,
    description: 'Override all expense inflation rates',
    inputUnit: '%',
  },
  expense_adjustment: {
    label: 'Annual Expenses',
    defaultMin: -0.20,
    defaultMax: 0.20,
    step: 0.05,
    baseline: 0,
    format: v => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`,
    displayMin: v => (v * 100).toFixed(0),
    displayMax: v => (v * 100).toFixed(0),
    parseInput: v => parseFloat(v) / 100,
    description: 'Scale all annual expense amounts',
    inputUnit: '%',
  },
  healthcare_inflation: {
    label: 'Healthcare Inflation',
    defaultMin: 0.01,
    defaultMax: 0.10,
    step: 0.005,
    baseline: null,
    format: v => `${(v * 100).toFixed(1)}%`,
    displayMin: v => (v * 100).toFixed(1),
    displayMax: v => (v * 100).toFixed(1),
    parseInput: v => parseFloat(v) / 100,
    description: 'Override inflation rate for healthcare expenses',
    inputUnit: '%',
  },
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const S = {
  page: {
    maxWidth: 960,
    color: '#f1f5f9',
    fontFamily: 'inherit',
  },
  breadcrumb: {
    color: '#94a3b8',
    fontSize: '0.82rem',
    marginBottom: '0.25rem',
    display: 'flex',
    gap: '0.35rem',
    alignItems: 'center',
  },
  breadcrumbLink: {
    color: '#94a3b8',
    textDecoration: 'none',
  },
  title: {
    fontSize: '1.4rem',
    fontWeight: 700,
    margin: '0.2rem 0 1.5rem',
  },
  card: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 8,
    padding: '1.25rem',
    marginBottom: '0.75rem',
  },
  sectionLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.75rem',
  },
  toggleRow: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
  },
  paramDesc: {
    fontSize: '0.8rem',
    color: '#64748b',
    marginTop: '0.6rem',
  },
  rangeRow: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  inputGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  inputLabel: {
    fontSize: '0.78rem',
    color: '#94a3b8',
    fontWeight: 500,
  },
  inputWrap: {
    display: 'flex',
    alignItems: 'center',
    background: '#0f172a',
    border: '1px solid #475569',
    borderRadius: 6,
    overflow: 'hidden',
  },
  input: {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: '#f1f5f9',
    fontSize: '0.9rem',
    padding: '0.4rem 0.6rem',
    width: 80,
  },
  inputSuffix: {
    padding: '0 0.5rem',
    color: '#64748b',
    fontSize: '0.85rem',
    borderLeft: '1px solid #334155',
    background: '#1e293b',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
  },
  chartTitle: {
    fontSize: '0.9rem',
    fontWeight: 600,
    color: '#cbd5e1',
    marginBottom: '0.75rem',
  },
  error: {
    background: 'rgba(127,29,29,0.3)',
    border: '1px solid #991b1b',
    borderRadius: 6,
    padding: '0.75rem 1rem',
    color: '#f87171',
    fontSize: '0.875rem',
    marginBottom: '0.75rem',
  },
}

function toggleBtn(active) {
  return {
    padding: '0.35rem 0.85rem',
    borderRadius: 6,
    border: active ? '1px solid #f97316' : '1px solid #475569',
    background: active ? 'rgba(249,115,22,0.15)' : 'transparent',
    color: active ? '#f97316' : '#94a3b8',
    fontSize: '0.85rem',
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
  }
}

function analyzeBtn(disabled) {
  return {
    padding: '0.45rem 1.25rem',
    borderRadius: 6,
    border: 'none',
    background: disabled ? '#334155' : '#f97316',
    color: disabled ? '#64748b' : '#fff',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    alignSelf: 'flex-end',
  }
}

// ---------------------------------------------------------------------------
// Tooltip formatters
// ---------------------------------------------------------------------------

function fmt$(val) {
  if (val == null) return '—'
  const abs = Math.abs(val)
  if (abs >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`
  if (abs >= 1_000) return `$${(val / 1_000).toFixed(0)}K`
  return `$${val.toFixed(0)}`
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SensitivityAnalysis() {
  const { id } = useParams()
  const { config: simConfig } = useSimConfig()
  const [plan, setPlan] = useState(null)
  const [parameter, setParameter] = useState('stock_return_offset')
  const [rangeMin, setRangeMin] = useState('')
  const [rangeMax, setRangeMax] = useState('')
  const [results, setResults] = useState(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)

  // Initialise range inputs when parameter changes
  useEffect(() => {
    const p = PARAMETERS[parameter]
    setRangeMin(p.displayMin(p.defaultMin))
    setRangeMax(p.displayMax(p.defaultMax))
    setResults(null)
    setError(null)
  }, [parameter])

  useEffect(() => {
    getPlan(id)
      .then(res => setPlan(res.data))
      .catch(() => setError('Failed to load plan.'))
  }, [id])

  const paramDef = PARAMETERS[parameter]

  const handleAnalyze = async () => {
    setRunning(true)
    setError(null)
    try {
      const minVal = paramDef.parseInput(rangeMin)
      const maxVal = paramDef.parseInput(rangeMax)
      const regime = simConfig?.initialRegime
      const res = await runSensitivity(id, {
        parameter,
        min_value: minVal,
        max_value: maxVal,
        step: paramDef.step,
        num_runs: simConfig?.numRuns ?? 1000,
        initial_market_regime: (regime && regime !== 'random') ? regime : undefined,
      })
      setResults(res.data.steps)
    } catch (e) {
      setError('Analysis failed: ' + (e.response?.data?.detail ?? e.message))
    } finally {
      setRunning(false)
    }
  }

  // Derive chart data from results
  const successData = results?.map(r => ({
    label: paramDef.format(r.param_value),
    paramValue: r.param_value,
    successRate: +(r.success_rate * 100).toFixed(1),
  })) ?? []

  const portfolioData = results?.map(r => {
    const last = r.portfolio_timeline.at(-1)
    return {
      label: paramDef.format(r.param_value),
      paramValue: r.param_value,
      p50: last?.p50 ?? 0,
      p_lower: last?.p_lower ?? 0,
      p_upper: last?.p_upper ?? 0,
    }
  }) ?? []

  const baselineValue = paramDef.baseline !== null
    ? paramDef.format(paramDef.baseline)
    : null

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.breadcrumb}>
        <Link to="/plans" style={S.breadcrumbLink}>Plans</Link>
        <span>›</span>
        <Link to={`/plans/${id}/simulate`} style={S.breadcrumbLink}>
          {plan?.name ?? '…'}
        </Link>
        <span>›</span>
        <span style={{ color: '#f1f5f9' }}>Sensitivity Analysis</span>
      </div>
      <h1 style={S.title}>
        {plan?.name}
        <span style={{ fontWeight: 400, color: '#94a3b8' }}> — Sensitivity Analysis</span>
      </h1>

      {/* Parameter selector */}
      <div style={S.card}>
        <div style={S.sectionLabel}>Parameter</div>
        <div style={S.toggleRow}>
          {Object.entries(PARAMETERS).map(([key, p]) => (
            <button
              key={key}
              style={toggleBtn(parameter === key)}
              onClick={() => setParameter(key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div style={S.paramDesc}>{paramDef.description}</div>
      </div>

      {/* Range inputs + Analyze button */}
      <div style={S.card}>
        <div style={S.sectionLabel}>Range</div>
        <div style={S.rangeRow}>
          <div style={S.inputGroup}>
            <label style={S.inputLabel}>Min</label>
            <div style={S.inputWrap}>
              <input
                type="number"
                style={S.input}
                value={rangeMin}
                onChange={e => setRangeMin(e.target.value)}
              />
              <span style={S.inputSuffix}>{paramDef.inputUnit}</span>
            </div>
          </div>
          <div style={S.inputGroup}>
            <label style={S.inputLabel}>Max</label>
            <div style={S.inputWrap}>
              <input
                type="number"
                style={S.input}
                value={rangeMax}
                onChange={e => setRangeMax(e.target.value)}
              />
              <span style={S.inputSuffix}>{paramDef.inputUnit}</span>
            </div>
          </div>
          <button
            style={analyzeBtn(running)}
            disabled={running}
            onClick={handleAnalyze}
          >
            {running ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
      </div>

      {error && <div style={S.error}>{error}</div>}

      {running && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1.5rem', justifyContent: 'center', color: '#94a3b8', fontSize: '0.9rem' }}>
          <svg width="22" height="22" viewBox="0 0 22 22" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
            <circle cx="11" cy="11" r="9" fill="none" stroke="#334155" strokeWidth="3" />
            <path d="M11 2 a9 9 0 0 1 9 9" fill="none" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
          Running sensitivity analysis…
        </div>
      )}

      {/* Results */}
      {results && (
        <>
          {/* Success rate curve */}
          <div style={S.card}>
            <div style={S.chartTitle}>Success Rate</div>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={successData} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={v => `${v}%`}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  width={42}
                />
                <Tooltip
                  contentStyle={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 6 }}
                  labelStyle={{ color: '#f1f5f9', fontSize: 12 }}
                  itemStyle={{ color: '#f97316' }}
                  formatter={v => [`${v}%`, 'Success Rate']}
                />
                {baselineValue !== null && (
                  <ReferenceLine
                    x={baselineValue}
                    stroke="#64748b"
                    strokeDasharray="4 3"
                    label={{ value: 'baseline', fill: '#64748b', fontSize: 10, position: 'insideTopRight' }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="successRate"
                  stroke="#f97316"
                  strokeWidth={2}
                  dot={{ fill: '#f97316', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Ending portfolio band chart */}
          <div style={S.card}>
            <div style={S.chartTitle}>
              Ending Portfolio Value
              <span style={{ fontSize: '0.78rem', fontWeight: 400, color: '#64748b', marginLeft: 8 }}>
                (at final age — median with {results[0] ? `p${20}–p${80}` : ''} band)
              </span>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={portfolioData} margin={{ top: 8, right: 24, bottom: 8, left: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={fmt$}
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  width={56}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0]?.payload
                    if (!d) return null
                    return (
                      <div style={{ background: '#1e293b', border: '1px solid #475569', borderRadius: 6, padding: '0.5rem 0.75rem', fontSize: 12 }}>
                        <div style={{ color: '#f1f5f9', marginBottom: 6 }}>{label}</div>
                        <div style={{ color: '#93c5fd' }}>P80: {fmt$(d.p_upper)}</div>
                        <div style={{ color: '#3b82f6', fontWeight: 600 }}>Median: {fmt$(d.p50)}</div>
                        <div style={{ color: '#93c5fd' }}>P20: {fmt$(d.p_lower)}</div>
                      </div>
                    )
                  }}
                />
                {baselineValue !== null && (
                  <ReferenceLine
                    x={baselineValue}
                    stroke="#64748b"
                    strokeDasharray="4 3"
                    label={{ value: 'baseline', fill: '#64748b', fontSize: 10, position: 'insideTopRight' }}
                  />
                )}
                {/* Two stacked Areas produce the shaded band between p_lower and p_upper */}
                <Area
                  type="monotone"
                  dataKey="p_upper"
                  stroke="none"
                  fill="#3b82f6"
                  fillOpacity={0.2}
                  legendType="none"
                />
                <Area
                  type="monotone"
                  dataKey="p_lower"
                  stroke="none"
                  fill="#1e293b"
                  fillOpacity={1}
                  legendType="none"
                />
                <Line
                  type="monotone"
                  dataKey="p50"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  )
}
