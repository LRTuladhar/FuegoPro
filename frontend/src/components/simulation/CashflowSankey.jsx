import { useMemo } from 'react'
import { Sankey, Tooltip } from 'recharts'

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

const NODE_COLORS = {
  income:   '#3b82f6',  // blue   — active income sources
  account:  '#f97316',  // orange — asset accounts (RMDs + withdrawals)
  expenses: '#f87171',  // red    — expense sink
  taxes:    '#fbbf24',  // amber  — tax sink
}

const LINK_COLORS = {
  income:  'rgba(59,130,246,0.25)',
  account: 'rgba(249,115,22,0.25)',
}

// ---------------------------------------------------------------------------
// Data builder
// ---------------------------------------------------------------------------

/**
 * Build Recharts Sankey `{ nodes, links }` from a single debug row.
 *
 * Left side (sources):
 *   - Named income sources (employment, SS, pension, etc.)
 *   - Per-account RMD nodes (RMDs are income, not direct expense withdrawals)
 *   - Account nodes that have expense or tax withdrawals
 *
 * Right side (sinks):
 *   - Expenses — receives exactly total_expenses
 *   - Taxes    — receives exactly total_tax
 *
 * Income (sources + RMDs = available_income) covers expenses first, then taxes.
 * Each income source contributes proportionally.
 * Account withdrawals (withdrawn_expense / withdrawn_tax) flow directly to sinks.
 */
function buildSankeyData(row) {
  if (!row) return null

  const nodes = []
  const links = []
  const nameToIdx = {}

  const addNode = (name, nodeType) => {
    if (!(name in nameToIdx)) {
      nameToIdx[name] = nodes.length
      nodes.push({ name, nodeType })
    }
    return nameToIdx[name]
  }

  const pushLink = (source, target, value, linkType) => {
    const v = Math.round(value)
    if (v > 0) links.push({ source, target, value: v, linkType })
  }

  const totalExpenses = row.expenses?.total_expenses ?? 0
  const totalTax = row.tax?.total_tax ?? 0

  // Build the full list of income contributors:
  //   row.income.sources = employment, SS, pension, etc.  (= available_income minus RMDs)
  //   per-account rmd_amount = RMDs (also part of available_income)
  const incomeSources = []
  for (const src of (row.income?.sources ?? [])) {
    if ((src.gross_amount ?? 0) > 0) {
      incomeSources.push({ name: src.name, amount: src.gross_amount, nodeType: 'income' })
    }
  }
  for (const acct of (row.accounts ?? [])) {
    const rmd = acct.rmd_amount ?? 0
    if (rmd > 0) {
      incomeSources.push({ name: `${acct.account_name} (RMD)`, amount: rmd, nodeType: 'account' })
    }
  }

  // totalIncomeFlow ≈ available_income (sources.sum + rmd_total)
  const totalIncomeFlow = incomeSources.reduce((s, src) => s + src.amount, 0)

  // Income covers expenses first, then taxes; each source contributes proportionally
  const incomeToExp = Math.min(totalIncomeFlow, totalExpenses)
  const incomeToTax = Math.min(Math.max(0, totalIncomeFlow - totalExpenses), totalTax)
  const expFrac = totalIncomeFlow > 0 ? incomeToExp / totalIncomeFlow : 0
  const taxFrac = totalIncomeFlow > 0 ? incomeToTax / totalIncomeFlow : 0

  // --- Nodes ---

  for (const src of incomeSources) addNode(src.name, src.nodeType)

  // Account nodes only for extra withdrawals (NOT RMDs — those are income nodes above)
  for (const acct of (row.accounts ?? [])) {
    const expWd = acct.withdrawn_expense ?? 0
    const taxWd = acct.withdrawn_tax ?? 0
    if (expWd + taxWd > 0) addNode(acct.account_name, 'account')
  }

  const expIdx = addNode('Expenses', 'expenses')
  const taxIdx = addNode('Taxes', 'taxes')

  // --- Links ---

  // Income sources (including RMDs) → Expenses / Taxes (proportional)
  for (const src of incomeSources) {
    const i = nameToIdx[src.name]
    if (i == null) continue
    const toExp = Math.round(src.amount * expFrac)
    const toTax = Math.round(src.amount * taxFrac)
    if (toExp > 0) pushLink(i, expIdx, toExp, 'income')
    if (toTax > 0) pushLink(i, taxIdx, toTax, 'income')
  }

  // Account withdrawals → Expenses / Taxes (direct, not proportional)
  for (const acct of (row.accounts ?? [])) {
    const expWd = acct.withdrawn_expense ?? 0
    const taxWd = acct.withdrawn_tax ?? 0
    const ai = nameToIdx[acct.account_name]
    if (ai == null) continue
    if (expWd > 0) pushLink(ai, expIdx, Math.round(expWd), 'account')
    if (taxWd > 0) pushLink(ai, taxIdx, Math.round(taxWd), 'account')
  }

  return links.length > 0 ? { nodes, links } : null
}

// ---------------------------------------------------------------------------
// Custom node renderer
// ---------------------------------------------------------------------------

function SankeyNodeShape({ x, y, width, height, payload }) {
  if (!payload) return null
  const color = NODE_COLORS[payload.nodeType] ?? '#64748b'
  const isSink = payload.nodeType === 'expenses' || payload.nodeType === 'taxes'
  const h = Math.max(2, height ?? 0)
  const w = width ?? 16
  const labelX = isSink ? (x ?? 0) - 8 : (x ?? 0) + w + 8
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} fill={color} rx={2} />
      <text
        x={labelX}
        y={(y ?? 0) + h / 2}
        textAnchor={isSink ? 'end' : 'start'}
        dominantBaseline="middle"
        fontSize={11}
        fill="#cbd5e1"
        style={{ userSelect: 'none' }}
      >
        {payload.name}
      </text>
    </g>
  )
}

// ---------------------------------------------------------------------------
// Custom link renderer  (colors links by their source type)
// ---------------------------------------------------------------------------

function SankeyLinkShape({ sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth, payload }) {
  const stroke = LINK_COLORS[payload?.linkType] ?? 'rgba(100,116,139,0.25)'
  return (
    <path
      d={`M${sourceX},${sourceY}C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke={stroke}
      strokeWidth={Math.max(1, linkWidth)}
    />
  )
}

// ---------------------------------------------------------------------------
// Tooltip content
// ---------------------------------------------------------------------------

function fmtK(v) {
  const abs = Math.abs(v ?? 0)
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${Math.round(v ?? 0).toLocaleString()}`
}

function SankeyTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0]?.payload
  if (!p) return null
  const isLink = p.source != null && typeof p.source === 'object'
  return (
    <div style={{
      background: '#0f172a',
      border: '1px solid #334155',
      padding: '0.4rem 0.75rem',
      borderRadius: 6,
      fontSize: '0.8rem',
      color: '#f1f5f9',
      pointerEvents: 'none',
    }}>
      {isLink
        ? `${p.source.name} → ${p.target.name}: ${fmtK(p.value)}`
        : `${p.name}: ${fmtK(p.value)}`}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

const LEGEND = [
  ['Income', 'income'],
  ['Accounts / RMDs', 'account'],
  ['Expenses', 'expenses'],
  ['Taxes', 'taxes'],
]

export default function CashflowSankey({ row }) {
  const data = useMemo(() => buildSankeyData(row), [row])

  if (!data) return null

  // Taller chart for more nodes so they're not crowded
  const height = Math.max(180, data.nodes.length * 38)

  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: 8,
      marginBottom: '0.75rem',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        background: '#162032',
        padding: '0.6rem 1rem',
        fontSize: '0.72rem',
        fontWeight: 600,
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span>Cash Flow — Age {row.age}</span>
        <span style={{ display: 'flex', gap: '0.9rem' }}>
          {LEGEND.map(([label, type]) => (
            <span key={type} style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#94a3b8', fontSize: '0.68rem', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}>
              <span style={{ width: 8, height: 8, background: NODE_COLORS[type], borderRadius: 2, flexShrink: 0 }} />
              {label}
            </span>
          ))}
        </span>
      </div>

      {/* Chart */}
      <div style={{ padding: '0.25rem 0' }}>
        <Sankey
          width={700}
          height={height}
          data={data}
          nodePadding={10}
          nodeWidth={16}
          iterations={32}
          margin={{ top: 8, right: 130, bottom: 8, left: 8 }}
          node={<SankeyNodeShape />}
          link={<SankeyLinkShape />}
        >
          <Tooltip content={<SankeyTooltip />} />
        </Sankey>
      </div>
    </div>
  )
}
