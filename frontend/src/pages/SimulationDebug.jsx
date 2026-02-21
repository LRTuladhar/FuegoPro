import { useState, useEffect } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { getPlan, getSimulationDebug } from '../api/client'

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function fmt$(val) {
  if (val == null) return '—'
  const abs = Math.abs(val)
  const str = '$' + abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return val < 0 ? `-${str}` : str
}

function fmtPct(val) {
  if (val == null) return '—'
  return (val * 100).toFixed(2) + '%'
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const S = {
  page: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '1.5rem',
    color: '#f1f5f9',
    fontFamily: 'inherit',
  },
  breadcrumb: {
    color: '#94a3b8',
    fontSize: '0.82rem',
    marginBottom: '1rem',
  },
  breadcrumbLink: {
    color: '#3b82f6',
    textDecoration: 'none',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.4rem',
    fontWeight: 700,
    margin: 0,
  },
  subtitle: {
    fontWeight: 400,
    color: '#94a3b8',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  bandSelect: {
    padding: '0.35rem 0.6rem',
    borderRadius: 4,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#f1f5f9',
    fontSize: '0.85rem',
    fontWeight: 500,
  },
  btn: {
    padding: '0.4rem 0.8rem',
    borderRadius: 4,
    border: 'none',
    fontSize: '0.85rem',
    fontWeight: 500,
    cursor: 'pointer',
    background: '#334155',
    color: '#e2e8f0',
  },
  btnPrimary: {
    background: '#3b82f6',
    color: '#fff',
  },
  btnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  yearNav: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1.5rem',
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 8,
    padding: '0.75rem 1rem',
  },
  yearLabel: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginRight: '0.25rem',
  },
  yearSelect: {
    padding: '0.35rem 0.6rem',
    borderRadius: 4,
    border: '1px solid #334155',
    background: '#0f172a',
    color: '#f1f5f9',
    fontSize: '0.9rem',
    fontWeight: 600,
  },
  yearPortfolio: {
    marginLeft: 'auto',
    fontSize: '0.85rem',
    color: '#94a3b8',
  },
  yearPortfolioVal: {
    color: '#34d399',
    fontWeight: 600,
    marginLeft: '0.4rem',
  },
  card: {
    background: '#1e293b',
    border: '1px solid #334155',
    borderRadius: 8,
    marginBottom: '0.75rem',
    overflow: 'hidden',
  },
  cardTitle: {
    background: '#162032',
    padding: '0.6rem 1rem',
    fontSize: '0.72rem',
    fontWeight: 600,
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: '0.45rem 1rem',
    borderTop: '1px solid #1e3050',
    fontSize: '0.875rem',
  },
  rowFirst: {
    borderTop: 'none',
  },
  label: {
    color: '#94a3b8',
    flex: '1 1 auto',
    paddingRight: '1rem',
  },
  value: {
    color: '#f1f5f9',
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
  },
  valueMuted: {
    color: '#475569',
    flexShrink: 0,
  },
  valuePos: {
    color: '#34d399',
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
  },
  valueNeg: {
    color: '#f87171',
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
  },
  divider: {
    padding: '0.35rem 1rem',
    fontSize: '0.72rem',
    color: '#475569',
    background: '#162032',
    borderTop: '1px solid #1e3050',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: '0.5rem 1rem',
    borderTop: '1px solid #334155',
    fontSize: '0.875rem',
    fontWeight: 600,
    background: '#162032',
  },
  loading: {
    display: 'flex',
    justifyContent: 'center',
    padding: '4rem',
    color: '#94a3b8',
  },
  error: {
    background: '#7f1d1d',
    border: '1px solid #b91c1c',
    padding: '1rem',
    borderRadius: 8,
    color: '#fca5a5',
  },
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

function Row({ label, value, first = false, muted = false, variant = null }) {
  let valStyle = S.value
  if (muted) valStyle = S.valueMuted
  else if (variant === 'pos') valStyle = S.valuePos
  else if (variant === 'neg') valStyle = S.valueNeg
  return (
    <div style={{ ...S.row, ...(first ? S.rowFirst : {}) }}>
      <span style={S.label}>{label}</span>
      <span style={valStyle}>{value}</span>
    </div>
  )
}

function TotalRow({ label, value }) {
  return (
    <div style={S.totalRow}>
      <span style={{ color: '#cbd5e1' }}>{label}</span>
      <span style={{ color: '#f1f5f9', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </div>
  )
}

function Divider({ label }) {
  return <div style={S.divider}>{label}</div>
}

function Card({ title, children }) {
  return (
    <div style={S.card}>
      <div style={S.cardTitle}>{title}</div>
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Year detail sections
// ---------------------------------------------------------------------------

function InvestmentGrowthCard({ row }) {
  const portfolioStart = row.accounts.reduce((s, a) => s + a.start_balance, 0)
  return (
    <Card title="Investment Growth">
      {row.accounts.map((acct, i) => {
        // Actual growth = end_balance − (start_balance − withdrawals taken)
        const postWithdrawal = acct.start_balance - acct.withdrawn_expense - acct.withdrawn_tax
        const growthAmt = acct.end_balance - postWithdrawal
        const isStock = acct.asset_class === 'stocks'
        const growthLabel = isStock ? 'Appreciation' : 'Interest'
        return (
          <div key={acct.account_id}>
            {i > 0 && <div style={{ height: 1, background: '#0f172a', margin: '0 1rem' }} />}
            <Row
              first={i === 0}
              label={`${acct.account_name} (${acct.tax_treatment} / ${acct.asset_class}) — Start`}
              value={fmt$(acct.start_balance)}
            />
            <Row
              label={`${acct.account_name} — Growth Rate`}
              value={fmtPct(acct.growth_rate)}
              variant={acct.growth_rate >= 0 ? 'pos' : 'neg'}
            />
            <Row
              label={`${acct.account_name} — ${growthLabel}`}
              value={fmt$(growthAmt)}
              variant={growthAmt >= 0 ? 'pos' : 'neg'}
            />
          </div>
        )
      })}
      <TotalRow label="Portfolio Start" value={fmt$(portfolioStart)} />
    </Card>
  )
}

function IncomeCard({ row }) {
  const inc = row.income
  return (
    <Card title="Income">
      {inc.sources.map((src, i) => (
        <Row key={i} first={i === 0} label={src.name} value={fmt$(src.gross_amount)} variant="pos" />
      ))}
      {inc.sources.length === 0 && <Row first label="(no income sources active)" value="—" muted />}
      <Divider label="Social Security" />
      <Row label="SS Gross" value={fmt$(inc.ss_gross)} variant="pos" />
      <Row label="SS Taxable Fraction" value={fmtPct(inc.ss_fraction)} />
      <Row label="SS Taxable Amount" value={fmt$(inc.taxable_ss)} />
      <Row label="Provisional Income (SS calc)" value={fmt$(inc.provisional_income)} />
      <Divider label="Totals" />
      <Row label="RMD Total" value={fmt$(inc.rmd_total)} variant="pos" />
      <Row label="Total Ordinary Income" value={fmt$(inc.other_ordinary)} variant="pos" />
      <Row label="Total Nontaxable Income" value={fmt$(inc.other_nontaxable)} variant="pos" />
      <TotalRow label="Available Income (pre-withdrawal)" value={fmt$(inc.available_income)} />
    </Card>
  )
}

function ExpensesCard({ row }) {
  const exp = row.expenses
  return (
    <Card title="Expenses">
      {exp.items.map((item, i) => (
        <Row
          key={i}
          first={i === 0}
          label={`${item.name} (base ${fmt$(item.base_amount)} @ ${fmtPct(item.inflation_rate)} infl)`}
          value={fmt$(item.adjusted_amount)}
          variant="neg"
        />
      ))}
      {exp.items.length === 0 && <Row first label="(no expenses active)" value="—" muted />}
      <TotalRow label="Total Expenses" value={fmt$(exp.total_expenses)} />
    </Card>
  )
}

function ExpenseWithdrawalCard({ row }) {
  const wd = row.expense_withdrawal
  const anyDrawn = wd.total_withdrawn > 0
  return (
    <Card title="Expense Withdrawal">
      <Row first label="Net Need (expenses − available income)" value={fmt$(wd.net_need || 0)} />
      {anyDrawn && <Divider label="Drawn from accounts" />}
      {anyDrawn && row.accounts.map((acct) => (
        acct.withdrawn_expense > 0 && (
          <Row
            key={acct.account_id}
            label={`${acct.account_name} (${acct.tax_treatment})`}
            value={fmt$(acct.withdrawn_expense)}
          />
        )
      ))}
      <Divider label="Summary" />
      <Row label="Total Withdrawn" value={fmt$(wd.total_withdrawn)} />
      <Row label="Ordinary Income Generated" value={fmt$(wd.ordinary_income)} />
      <Row label="LTCG Income Generated" value={fmt$(wd.ltcg_income)} />
      <Row
        label="Shortfall"
        value={wd.shortfall > 0 ? fmt$(wd.shortfall) : '—'}
        muted={wd.shortfall === 0}
      />
    </Card>
  )
}

function TaxCard({ row }) {
  const tax = row.tax
  return (
    <Card title="Tax Calculation">
      <Row first label="Total Ordinary Income" value={fmt$(tax.total_ordinary_income)} />
      <Row label="Total LTCG Income" value={fmt$(tax.total_ltcg_income)} />
      <Row label="State Taxable Income" value={fmt$(tax.state_taxable_income)} />
      <Divider label="Tax breakdown" />
      <Row label="Federal Ordinary Tax" value={fmt$(tax.federal_ordinary_tax)} />
      <Row label="Federal LTCG Tax" value={fmt$(tax.federal_ltcg_tax)} />
      <Row label="State Tax" value={fmt$(tax.state_tax)} />
      <TotalRow label="Total Tax" value={fmt$(tax.total_tax)} />
      <Row label="Effective Tax Rate" value={fmtPct(tax.effective_tax_rate)} />
    </Card>
  )
}

function TaxWithdrawalCard({ row }) {
  const wd = row.tax_withdrawal
  const anyDrawn = wd.total_withdrawn > 0
  return (
    <Card title="Tax Withdrawal">
      <Row first label="Tax Shortfall" value={fmt$(wd.tax_shortfall || 0)} />
      {anyDrawn && <Divider label="Drawn from accounts" />}
      {anyDrawn && row.accounts.map((acct) => (
        acct.withdrawn_tax > 0 && (
          <Row
            key={acct.account_id}
            label={`${acct.account_name} (${acct.tax_treatment})`}
            value={fmt$(acct.withdrawn_tax)}
            colorize
          />
        )
      ))}
      {anyDrawn && <Divider label="Summary" />}
      <Row label="Total Withdrawn" value={fmt$(wd.total_withdrawn)} muted={!anyDrawn} />
      <Row
        label="Shortfall"
        value={wd.shortfall > 0 ? fmt$(wd.shortfall) : '—'}
        muted={wd.shortfall === 0}
      />
    </Card>
  )
}

function FinalBalancesCard({ row }) {
  return (
    <Card title="End Balances">
      {row.accounts.map((acct, i) => (
        <Row
          key={acct.account_id}
          first={i === 0}
          label={`${acct.account_name} (${acct.tax_treatment} / ${acct.asset_class})`}
          value={fmt$(acct.end_balance)}
        />
      ))}
      <TotalRow label="Portfolio End" value={fmt$(row.portfolio_end)} />
      {row.failed && (
        <div style={{ padding: '0.5rem 1rem', color: '#f87171', fontSize: '0.85rem', fontWeight: 600 }}>
          Portfolio depleted this year
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

const BAND_LABELS = { lower: 'Lower Band', median: 'Median', upper: 'Upper Band' }

export default function SimulationDebug() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const band = searchParams.get('band') ?? 'median'

  const [plan, setPlan] = useState(null)
  const [debug, setDebug] = useState(null)
  const [loading, setLoading] = useState(true)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState(null)
  const [selectedIdx, setSelectedIdx] = useState(0)

  // Initial load: plan + first debug fetch
  useEffect(() => {
    const load = async () => {
      try {
        const [planRes, debugRes] = await Promise.all([
          getPlan(id),
          getSimulationDebug(id, band),
        ])
        setPlan(planRes.data)
        setDebug(debugRes.data)
      } catch {
        setError('Failed to load debug data. Make sure a simulation has been run for this plan.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch when band changes (after initial load)
  useEffect(() => {
    if (loading) return
    setFetching(true)
    setError(null)
    getSimulationDebug(id, band)
      .then((res) => {
        setDebug(res.data)
        setSelectedIdx(0)
      })
      .catch(() => setError('Failed to fetch debug trace for this band.'))
      .finally(() => setFetching(false))
  }, [band]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBandChange = (newBand) => {
    setSearchParams({ band: newBand })
  }

  if (loading) return <div style={S.loading}>Loading…</div>

  if (error && !debug) {
    return (
      <div style={S.page}>
        <div style={S.error}>{error}</div>
      </div>
    )
  }

  const rows = debug?.age_rows ?? []
  const row = rows[selectedIdx]

  return (
    <div style={S.page}>
      <div style={S.breadcrumb}>
        <Link to={`/plans/${id}/simulate`} style={S.breadcrumbLink}>← Simulation</Link>
      </div>

      <div style={S.header}>
        <h1 style={S.title}>
          {plan?.name}
          <span style={S.subtitle}> — Debug Table</span>
        </h1>
        <div style={S.controls}>
          <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Band
          </span>
          <select
            style={S.bandSelect}
            value={band}
            onChange={(e) => handleBandChange(e.target.value)}
            disabled={fetching}
          >
            <option value="lower">Lower Band</option>
            <option value="median">Median</option>
            <option value="upper">Upper Band</option>
          </select>
          {fetching && <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Loading…</span>}
        </div>
      </div>

      {error && <div style={{ ...S.error, marginBottom: '1rem' }}>{error}</div>}

      {/* Band context pill */}
      {debug && (
        <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '1rem' }}>
          Showing the representative <strong style={{ color: '#94a3b8' }}>{BAND_LABELS[debug.band] ?? debug.band}</strong> run
          from the last simulation.
        </div>
      )}

      {/* Year navigator */}
      {rows.length > 0 && (
        <div style={S.yearNav}>
          <span style={S.yearLabel}>Age</span>
          <button
            style={{ ...S.btn, ...(selectedIdx === 0 ? S.btnDisabled : {}) }}
            onClick={() => setSelectedIdx(i => Math.max(0, i - 1))}
            disabled={selectedIdx === 0}
          >
            ←
          </button>
          <select
            style={S.yearSelect}
            value={selectedIdx}
            onChange={(e) => setSelectedIdx(Number(e.target.value))}
          >
            {rows.map((r, i) => (
              <option key={r.age} value={i}>{r.age}</option>
            ))}
          </select>
          <button
            style={{ ...S.btn, ...(selectedIdx === rows.length - 1 ? S.btnDisabled : {}) }}
            onClick={() => setSelectedIdx(i => Math.min(rows.length - 1, i + 1))}
            disabled={selectedIdx === rows.length - 1}
          >
            →
          </button>
          <span style={S.yearPortfolio}>
            Portfolio end:
            <span style={S.yearPortfolioVal}>{fmt$(row?.portfolio_end)}</span>
          </span>
        </div>
      )}

      {/* Year detail */}
      {row && (
        <>
          <InvestmentGrowthCard row={row} />
          <IncomeCard row={row} />
          <ExpensesCard row={row} />
          <ExpenseWithdrawalCard row={row} />
          <TaxCard row={row} />
          <TaxWithdrawalCard row={row} />
          <FinalBalancesCard row={row} />
        </>
      )}
    </div>
  )
}
