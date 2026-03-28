import { useMemo } from 'react'
import { Sankey, Tooltip } from 'recharts'

// ---------------------------------------------------------------------------
// Color palette
// ---------------------------------------------------------------------------

const NODE_COLORS = {
  income:   '#3b82f6',  // blue   — active income sources
  return:   '#10b981',  // green  — investment returns
  account:  '#f97316',  // orange — asset accounts
  expenses: '#f87171',  // red    — expense sink
  taxes:    '#fbbf24',  // amber  — tax sink
}

const LINK_COLORS = {
  income:  'rgba(59,130,246,0.25)',
  return:  'rgba(16,185,129,0.25)',
  account: 'rgba(249,115,22,0.25)',
}

// ---------------------------------------------------------------------------
// Data builder
// ---------------------------------------------------------------------------

/**
 * Build Recharts Sankey `{ nodes, links }` from a single debug row.
 *
 * Layout (3 columns where possible):
 *   col 0: income sources  +  account nodes with only withdrawals (no returns)
 *   col 1: account nodes that have both a return inflow AND withdrawals
 *   col 2: Expenses  +  Taxes
 *
 * An account with positive investment returns but ZERO withdrawals is omitted
 * entirely — it has no cash-flow story for this year.
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

  // Totals for proportional income allocation
  const totalExpenses = row.expenses?.total_expenses ?? 0
  const totalTax = row.tax?.total_tax ?? 0

  let totalIncome = 0
  for (const src of (row.income?.sources ?? [])) totalIncome += src.gross_amount ?? 0

  // Income covers expenses first, then taxes
  const incToExp = Math.min(totalIncome, totalExpenses)
  const incToTax = Math.min(Math.max(0, totalIncome - totalExpenses), totalTax)
  const expFrac = totalIncome > 0 ? incToExp / totalIncome : 0
  const taxFrac = totalIncome > 0 ? incToTax / totalIncome : 0

  // --- Determine which accounts participate ---
  // account_name → { growth, rmd, expWd, taxWd }
  const acctMeta = {}
  for (const acct of (row.accounts ?? [])) {
    // start_balance is already post-RMD (RMDs taken in Step 2 before the snap)
    const postWd = acct.start_balance
      - (acct.withdrawn_expense ?? 0)
      - (acct.withdrawn_tax ?? 0)
    const growth = acct.end_balance - postWd
    const rmd    = acct.rmd_amount ?? 0
    const expWd  = acct.withdrawn_expense ?? 0
    const taxWd  = acct.withdrawn_tax ?? 0
    acctMeta[acct.account_name] = { growth, rmd, expWd, taxWd }
  }

  // --- Nodes ---

  // Income sources (row.income.sources already includes SS and all other types)
  for (const src of (row.income?.sources ?? [])) {
    if ((src.gross_amount ?? 0) > 0) addNode(src.name, 'income')
  }

  // Account return nodes (only if the account also has withdrawals)
  for (const [name, meta] of Object.entries(acctMeta)) {
    const hasWd = meta.rmd + meta.expWd + meta.taxWd > 0
    if (meta.growth > 0 && hasWd) addNode(`${name} (return)`, 'return')
  }

  // Account nodes (only if the account has withdrawals)
  for (const [name, meta] of Object.entries(acctMeta)) {
    const hasWd = meta.rmd + meta.expWd + meta.taxWd > 0
    if (hasWd) addNode(name, 'account')
  }

  // Sinks
  const expIdx = addNode('Expenses', 'expenses')
  const taxIdx = addNode('Taxes', 'taxes')

  // --- Links ---

  // Income sources → Expenses / Taxes (proportional)
  for (const src of (row.income?.sources ?? [])) {
    const amt = src.gross_amount ?? 0
    if (amt <= 0) continue
    const i = nameToIdx[src.name]
    const toExp = Math.round(amt * expFrac)
    const toTax = Math.round(amt * taxFrac)
    if (toExp > 0) pushLink(i, expIdx, toExp, 'income')
    if (toTax > 0) pushLink(i, taxIdx, toTax, 'income')
  }
  // Account flows
  for (const acct of (row.accounts ?? [])) {
    const ai = nameToIdx[acct.account_name]
    if (ai == null) continue

    const meta = acctMeta[acct.account_name]

    // Return node → Account
    const retName = `${acct.account_name} (return)`
    if (meta.growth > 0 && retName in nameToIdx) {
      pushLink(nameToIdx[retName], ai, Math.round(meta.growth), 'return')
    }

    // Account → Expenses  (RMD + expense withdrawal)
    if (meta.rmd + meta.expWd > 0) {
      pushLink(ai, expIdx, Math.round(meta.rmd + meta.expWd), 'account')
    }

    // Account → Taxes
    if (meta.taxWd > 0) {
      pushLink(ai, taxIdx, Math.round(meta.taxWd), 'account')
    }
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
  ['Returns', 'return'],
  ['Accounts', 'account'],
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
