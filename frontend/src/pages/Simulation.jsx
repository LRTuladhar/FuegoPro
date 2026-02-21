import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { getPlan, runSimulation, getSimulationResults } from '../api/client'
import SuccessRate from '../components/simulation/SuccessRate'
import PercentileBandChart from '../components/simulation/PercentileBandChart'
import AccountBalancesChart from '../components/simulation/AccountBalancesChart'
import DetailDrawer, { PortfolioSection, BandSelector } from '../components/simulation/DetailDrawer'
import SimConfigPanel from '../components/simulation/SimConfigPanel'
import { useSimConfig } from '../store/simConfig'

export default function Simulation() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { config: globalConfig, loaded: globalLoaded } = useSimConfig()
  const [plan, setPlan] = useState(null)
  const [results, setResults] = useState(null)
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [simConfig, setSimConfig] = useState(null)
  const [band, setBand] = useState('median')
  const [viewMode, setViewMode] = useState('statistical')

  // Initialise local config from global defaults once available
  useEffect(() => {
    if (globalLoaded && simConfig === null) {
      setSimConfig({ ...globalConfig, initialRegime: 'random' })
    }
  }, [globalLoaded]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Promise.all([
      getPlan(id),
      getSimulationResults(id).catch(() => null),
    ])
      .then(([planRes, resultsRes]) => {
        setPlan(planRes.data)
        setResults(resultsRes?.data ?? null)
      })
      .catch(() => setError('Failed to load plan.'))
      .finally(() => setLoading(false))
  }, [id])

  // Build representative run portfolio timeline from account_timeline.
  // For each age, sum balances across all accounts per band.
  const representativeTimeline = useMemo(() => {
    if (!results?.account_timeline?.length) return []
    const byBandAge = {}
    results.account_timeline.forEach((p) => {
      const key = `${p.band}:${p.age}`
      byBandAge[key] = (byBandAge[key] ?? 0) + p.balance
    })
    const ages = [...new Set(results.account_timeline.map((p) => p.age))].sort((a, b) => a - b)
    return ages.map((age) => ({
      age,
      p_lower: byBandAge[`lower:${age}`]  ?? 0,
      p50:     byBandAge[`median:${age}`] ?? 0,
      p_upper: byBandAge[`upper:${age}`]  ?? 0,
    }))
  }, [results?.account_timeline])

  const configInvalid = !simConfig || simConfig.lowerPct >= simConfig.upperPct

  const handleRun = async () => {
    if (configInvalid) return
    setRunning(true)
    setError(null)
    try {
      const res = await runSimulation(id, {
        num_runs: simConfig.numRuns,
        lower_percentile: simConfig.lowerPct,
        upper_percentile: simConfig.upperPct,
        initial_market_regime: simConfig.initialRegime === 'random' ? undefined : simConfig.initialRegime,
      })
      setResults(res.data)
    } catch (e) {
      setError('Simulation failed: ' + (e.response?.data?.detail ?? e.message))
    } finally {
      setRunning(false)
    }
  }

  if (loading) return <p style={{ color: '#94a3b8' }}>Loading…</p>
  if (error && !results) return <p style={{ color: '#f87171' }}>{error}</p>

  return (
    <div style={{ maxWidth: 960 }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '1rem',
      }}>
        <div>
          <Link
            to="/plans"
            style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '0.82rem' }}
          >
            ← Plans
          </Link>
          <h1 style={{ margin: '0.2rem 0 0', fontSize: '1.4rem', fontWeight: 700 }}>
            {plan?.name}
            <span style={{ fontWeight: 400, color: '#94a3b8' }}> — Simulation</span>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <button onClick={() => navigate(`/plans/${id}`)} style={btn('secondary')}>
            Edit Plan
          </button>
          <button
            onClick={handleRun}
            disabled={running || configInvalid}
            style={btn(running || configInvalid ? 'disabled' : 'primary')}
          >
            {running ? 'Running…' : results ? 'Re-run' : 'Run Simulation'}
          </button>
        </div>
      </div>

      {/* Config panel — visible once global config is loaded */}
      {simConfig && <SimConfigPanel config={simConfig} onChange={setSimConfig} />}

      {error && (
        <div style={{ background: 'rgba(127,29,29,0.3)', border: '1px solid #991b1b', borderRadius: 6, padding: '0.75rem 1rem', marginTop: '1rem', color: '#f87171', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      {!results ? (
        /* Empty state */
        <div style={{
          background: '#1e293b',
          borderRadius: 8,
          padding: '5rem 2rem',
          textAlign: 'center',
          color: '#94a3b8',
          boxShadow: '0 1px 3px rgba(0,0,0,0.4)',
          marginTop: '1rem',
        }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📊</div>
          <p style={{ margin: 0, fontSize: '1rem' }}>
            Click <strong style={{ color: '#f97316' }}>Run Simulation</strong> to run a
            Monte Carlo analysis of this plan.
          </p>
        </div>
      ) : (
        /* Results */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '1rem' }}>
          <SuccessRate rate={results.success_rate} numRuns={results.num_runs} />

          {/* Group 1: Portfolio value chart + table */}
          <div style={group}>
            <PercentileBandChart
              data={results.portfolio_timeline}
              representativeData={representativeTimeline}
              lower={results.lower_percentile}
              upper={results.upper_percentile}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
            <PortfolioSection
              data={results.portfolio_timeline}
              representativeData={representativeTimeline}
              lower={results.lower_percentile}
              upper={results.upper_percentile}
              viewMode={viewMode}
            />
          </div>

          {/* Band selection panel — controls both the chart and detail tables */}
          <div style={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, padding: '0.75rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Band Selection
            </span>
            <BandSelector value={band} onChange={setBand} />
            <button
              onClick={() => navigate(`/plans/${id}/simulate/debug?band=${band}`)}
              style={{ ...btn('secondary'), marginLeft: 'auto', ...(results ? {} : { opacity: 0.45, cursor: 'not-allowed' }) }}
              disabled={!results}
            >
              Debug Table
            </button>
          </div>

          {/* Group 2: Account balances chart + detail tables */}
          <div style={group}>
            <AccountBalancesChart data={results.account_timeline} band={band} />
            <DetailDrawer
              annualDetail={results.annual_detail}
              incomeDetail={results.income_detail}
              expenseDetail={results.expense_detail}
              accountTimeline={results.account_timeline}
              returnDetail={results.return_detail}
              initialBalance={plan?.accounts?.reduce((s, a) => s + (a.balance ?? 0), 0) ?? 0}
              band={band}
            />
          </div>
          <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: 0, textAlign: 'right' }}>
            {results.num_runs.toLocaleString()} runs · lower {results.lower_percentile}th /
            upper {results.upper_percentile}th percentile ·
            run {new Date(results.created_at).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  )
}

const group = { display: 'flex', flexDirection: 'column', gap: '0.5rem' }

function btn(variant) {
  const base = {
    padding: '0.45rem 0.9rem',
    borderRadius: 6,
    border: 'none',
    cursor: variant === 'disabled' ? 'not-allowed' : 'pointer',
    fontSize: '0.85rem',
    fontWeight: 500,
    opacity: variant === 'disabled' ? 0.6 : 1,
  }
  if (variant === 'primary' || variant === 'disabled')
    return { ...base, background: '#f97316', color: '#fff' }
  return { ...base, background: '#334155', color: '#94a3b8' }
}
