import { useState } from 'react'

const money = (v) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(v ?? 0)

const pct = (v) => `${((v ?? 0) * 100).toFixed(1)}%`

// ---------------------------------------------------------------------------
// Collapsible section wrapper
// ---------------------------------------------------------------------------
function Section({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ background: '#1e293b', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          textAlign: 'left',
          padding: '0.875rem 1.25rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.95rem',
          fontWeight: 600,
          color: '#f1f5f9',
        }}
      >
        {title}
        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{open ? '▲ collapse' : '▼ expand'}</span>
      </button>
      {open && (
        <div style={{ borderTop: '1px solid #334155', overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Annual cashflow summary table
// ---------------------------------------------------------------------------
function CashflowTable({ annualDetail, incomeDetail, expenseDetail, accountTimeline, returnDetail, initialBalance }) {
  if (!annualDetail || annualDetail.length === 0) return <Empty />

  const ages = [...new Set(annualDetail.map((r) => r.age))].sort((a, b) => a - b)

  // End-of-year portfolio balance per age (sum across all accounts for this band)
  const endBalByAge = {}
  accountTimeline.forEach((p) => {
    endBalByAge[p.age] = (endBalByAge[p.age] ?? 0) + p.balance
  })

  // Aggregate income, expenses, taxes, investment returns per age
  const incByAge = {}
  incomeDetail.forEach((r) => { incByAge[r.age] = (incByAge[r.age] ?? 0) + r.amount })

  const expByAge = {}
  expenseDetail.forEach((r) => { expByAge[r.age] = (expByAge[r.age] ?? 0) + r.amount })

  const retByAge = {}
  returnDetail.forEach((r) => { retByAge[r.age] = (retByAge[r.age] ?? 0) + r.return_amount })

  const annByAge = {}
  annualDetail.forEach((r) => { annByAge[r.age] = r })

  return (
    <table style={tableStyle}>
      <thead>
        <tr style={{ background: '#162032' }}>
          {['Age', 'Start Balance', 'Income', 'Inv. Returns', 'Expenses', 'Tax', 'End Balance', 'Δ Portfolio', 'Net Cash Flow'].map((h) => (
            <th key={h} style={th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ages.map((age, idx) => {
          const income   = incByAge[age] ?? 0
          const invRet   = retByAge[age] ?? 0
          const expenses = expByAge[age] ?? 0
          const ann      = annByAge[age] ?? {}
          const tax      = (ann.tax_federal_ordinary ?? 0) + (ann.tax_federal_ltcg ?? 0) + (ann.tax_state ?? 0)
          const endBal   = endBalByAge[age] ?? 0
          const startBal = idx === 0 ? initialBalance : (endBalByAge[ages[idx - 1]] ?? 0)
          const netCash  = income - expenses - tax
          const delta    = endBal - startBal
          const netColor = netCash >= 0 ? '#34d399' : '#f87171'
          const deltaColor = delta >= 0 ? '#34d399' : '#f87171'
          const retColor = invRet >= 0 ? '#34d399' : '#f87171'

          return (
            <tr key={age} style={{ borderTop: '1px solid #334155' }}>
              <td style={td}>{age}</td>
              <td style={td}>{money(startBal)}</td>
              <td style={td}>{money(income)}</td>
              <td style={{ ...td, color: retColor }}>{invRet >= 0 ? '+' : ''}{money(invRet)}</td>
              <td style={td}>{money(expenses)}</td>
              <td style={td}>{money(tax)}</td>
              <td style={{ ...td, fontWeight: 600 }}>{money(endBal)}</td>
              <td style={{ ...td, fontWeight: 600, color: deltaColor }}>
                {delta >= 0 ? '+' : ''}{money(delta)}
              </td>
              <td style={{ ...td, fontWeight: 600, color: netColor }}>
                {netCash >= 0 ? '+' : ''}{money(netCash)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Portfolio value table (median run + percentile bounds)
// ---------------------------------------------------------------------------
function PortfolioTable({ data, lower, upper }) {
  if (!data || data.length === 0) return <Empty />
  return (
    <table style={tableStyle}>
      <thead>
        <tr style={{ background: '#162032' }}>
          {['Age', `${lower}th Pct`, 'Median (p50)', `${upper}th Pct`].map((h) => (
            <th key={h} style={th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={row.age} style={{ borderTop: '1px solid #334155' }}>
            <td style={td}>{row.age}</td>
            <td style={td}>{money(row.p_lower)}</td>
            <td style={{ ...td, fontWeight: 600 }}>{money(row.p50)}</td>
            <td style={td}>{money(row.p_upper)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Tax breakdown table
// ---------------------------------------------------------------------------
function TaxTable({ data }) {
  if (!data || data.length === 0) return <Empty />
  return (
    <table style={tableStyle}>
      <thead>
        <tr style={{ background: '#162032' }}>
          {['Age', 'Fed Ordinary', 'Fed LTCG', 'State', 'Total Tax', 'Eff. Rate'].map((h) => (
            <th key={h} style={th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row) => {
          const total = row.tax_federal_ordinary + row.tax_federal_ltcg + row.tax_state
          return (
            <tr key={row.age} style={{ borderTop: '1px solid #334155' }}>
              <td style={td}>{row.age}</td>
              <td style={td}>{money(row.tax_federal_ordinary)}</td>
              <td style={td}>{money(row.tax_federal_ltcg)}</td>
              <td style={td}>{money(row.tax_state)}</td>
              <td style={{ ...td, fontWeight: 600 }}>{money(total)}</td>
              <td style={td}>{pct(row.effective_tax_rate)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Income detail table  (pivoted: one column per source)
// ---------------------------------------------------------------------------
function IncomeTable({ data }) {
  if (!data || data.length === 0) return <Empty />

  const ages = [...new Set(data.map((r) => r.age))].sort((a, b) => a - b)
  const sources = [...new Set(data.map((r) => r.source_name))]
  const byAge = {}
  data.forEach((r) => {
    if (!byAge[r.age]) byAge[r.age] = {}
    byAge[r.age][r.source_name] = r.amount
  })

  return (
    <table style={tableStyle}>
      <thead>
        <tr style={{ background: '#162032' }}>
          <th style={th}>Age</th>
          {sources.map((s) => <th key={s} style={th}>{s}</th>)}
          <th style={th}>Total</th>
        </tr>
      </thead>
      <tbody>
        {ages.map((age) => {
          const row = byAge[age] || {}
          const total = Object.values(row).reduce((a, b) => a + b, 0)
          return (
            <tr key={age} style={{ borderTop: '1px solid #334155' }}>
              <td style={td}>{age}</td>
              {sources.map((s) => (
                <td key={s} style={td}>{row[s] != null ? money(row[s]) : '—'}</td>
              ))}
              <td style={{ ...td, fontWeight: 600 }}>{money(total)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Expense detail table  (pivoted: one column per expense)
// ---------------------------------------------------------------------------
function ExpenseTable({ data }) {
  if (!data || data.length === 0) return <Empty />

  const ages = [...new Set(data.map((r) => r.age))].sort((a, b) => a - b)
  const names = [...new Set(data.map((r) => r.expense_name))]
  const byAge = {}
  data.forEach((r) => {
    if (!byAge[r.age]) byAge[r.age] = {}
    byAge[r.age][r.expense_name] = r.amount
  })

  return (
    <table style={tableStyle}>
      <thead>
        <tr style={{ background: '#162032' }}>
          <th style={th}>Age</th>
          {names.map((n) => <th key={n} style={th}>{n}</th>)}
          <th style={th}>Total</th>
        </tr>
      </thead>
      <tbody>
        {ages.map((age) => {
          const row = byAge[age] || {}
          const total = Object.values(row).reduce((a, b) => a + b, 0)
          return (
            <tr key={age} style={{ borderTop: '1px solid #334155' }}>
              <td style={td}>{age}</td>
              {names.map((n) => (
                <td key={n} style={td}>{row[n] != null ? money(row[n]) : '—'}</td>
              ))}
              <td style={{ ...td, fontWeight: 600 }}>{money(total)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

// ---------------------------------------------------------------------------
// Investment returns table  (pivoted: one column per account)
// ---------------------------------------------------------------------------
function ReturnTable({ data }) {
  if (!data || data.length === 0) return <Empty />

  const ages     = [...new Set(data.map((r) => r.age))].sort((a, b) => a - b)
  const accounts = [...new Set(data.map((r) => r.account_name))]
  const byAge    = {}
  data.forEach((r) => {
    if (!byAge[r.age]) byAge[r.age] = {}
    byAge[r.age][r.account_name] = r.return_amount
  })

  return (
    <table style={tableStyle}>
      <thead>
        <tr style={{ background: '#162032' }}>
          <th style={th}>Age</th>
          {accounts.map((n) => <th key={n} style={th}>{n}</th>)}
          <th style={th}>Total</th>
        </tr>
      </thead>
      <tbody>
        {ages.map((age) => {
          const row   = byAge[age] || {}
          const total = Object.values(row).reduce((a, b) => a + b, 0)
          const totalColor = total >= 0 ? '#34d399' : '#f87171'
          return (
            <tr key={age} style={{ borderTop: '1px solid #334155' }}>
              <td style={td}>{age}</td>
              {accounts.map((n) => {
                const v = row[n]
                const c = v == null ? '#94a3b8' : v >= 0 ? '#34d399' : '#f87171'
                return (
                  <td key={n} style={{ ...td, color: c }}>
                    {v != null ? (v >= 0 ? '+' : '') + money(v) : '—'}
                  </td>
                )
              })}
              <td style={{ ...td, fontWeight: 600, color: totalColor }}>
                {total >= 0 ? '+' : ''}{money(total)}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function Empty() {
  return <p style={{ padding: '1rem 1.25rem', color: '#94a3b8', fontSize: '0.875rem' }}>No data.</p>
}

// ---------------------------------------------------------------------------
// Portfolio section — exported separately so Simulation.jsx can place it
// next to the portfolio chart
// ---------------------------------------------------------------------------
export function PortfolioSection({ data, lower, upper }) {
  return (
    <Section title="Portfolio Value (All Bands)">
      <PortfolioTable data={data} lower={lower} upper={upper} />
    </Section>
  )
}

// ---------------------------------------------------------------------------
// Band selector
// ---------------------------------------------------------------------------
const BANDS = [
  { value: 'lower',  label: 'Lower Band' },
  { value: 'median', label: 'Median' },
  { value: 'upper',  label: 'Upper Band' },
]

export function BandSelector({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {BANDS.map((b) => (
        <button
          key={b.value}
          onClick={() => onChange(b.value)}
          style={{
            padding: '0.25rem 0.65rem',
            borderRadius: 4,
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.78rem',
            fontWeight: 500,
            background: value === b.value ? '#f97316' : '#334155',
            color: value === b.value ? '#fff' : '#94a3b8',
          }}
        >
          {b.label}
        </button>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export — detail tables with band selector
// ---------------------------------------------------------------------------
export default function DetailDrawer({ annualDetail, incomeDetail, expenseDetail, accountTimeline, returnDetail, initialBalance, band }) {
  const label = BANDS.find((b) => b.value === band)?.label ?? band

  const ann  = (annualDetail    ?? []).filter((r) => r.band === band)
  const inc  = (incomeDetail    ?? []).filter((r) => r.band === band)
  const exp  = (expenseDetail   ?? []).filter((r) => r.band === band)
  const acct = (accountTimeline ?? []).filter((r) => r.band === band)
  const ret  = (returnDetail    ?? []).filter((r) => r.band === band)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <Section title={`Annual Summary — ${label}`} defaultOpen>
        <CashflowTable
          annualDetail={ann}
          incomeDetail={inc}
          expenseDetail={exp}
          accountTimeline={acct}
          returnDetail={ret}
          initialBalance={initialBalance ?? 0}
        />
      </Section>
      <Section title={`Investment Returns — ${label}`}>
        <ReturnTable data={ret} />
      </Section>
      <Section title={`Tax Breakdown — ${label}`}>
        <TaxTable data={ann} />
      </Section>
      <Section title={`Income Detail — ${label}`}>
        <IncomeTable data={inc} />
      </Section>
      <Section title={`Expense Detail — ${label}`}>
        <ExpenseTable data={exp} />
      </Section>
    </div>
  )
}

const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }

const th = {
  padding: '0.5rem 1rem',
  fontSize: '0.72rem',
  fontWeight: 600,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const td = {
  padding: '0.5rem 1rem',
  color: '#f1f5f9',
  whiteSpace: 'nowrap',
}
