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
function Section({ title, children }) {
  const [open, setOpen] = useState(false)
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

function Empty() {
  return <p style={{ padding: '1rem 1.25rem', color: '#94a3b8', fontSize: '0.875rem' }}>No data.</p>
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export default function DetailDrawer({ portfolioTimeline, lowerPct, upperPct, annualDetail, incomeDetail, expenseDetail }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <Section title="Portfolio Value (All Bands)">
        <PortfolioTable data={portfolioTimeline} lower={lowerPct} upper={upperPct} />
      </Section>
      <Section title="Tax Breakdown (Median Run)">
        <TaxTable data={annualDetail} />
      </Section>
      <Section title="Income Detail (Median Run)">
        <IncomeTable data={incomeDetail} />
      </Section>
      <Section title="Expense Detail (Median Run)">
        <ExpenseTable data={expenseDetail} />
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
