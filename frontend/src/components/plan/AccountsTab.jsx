import { useRef } from 'react'

const EMPTY = {
  name: '',
  tax_treatment: 'traditional',
  asset_class: 'stocks',
  balance: 0,
  start_age: null,
  annual_return_rate: null,
  gains_pct: null,
}

export default function AccountsTab({ accounts, onChange }) {
  const dragIdx = useRef(null)

  const add     = ()         => onChange([...accounts, { ...EMPTY }])
  const remove  = (i)        => onChange(accounts.filter((_, j) => j !== i))
  const update  = (i, patch) => onChange(accounts.map((a, j) => j === i ? { ...a, ...patch } : a))
  const reorder = (from, to) => {
    if (from === to) return
    const arr = [...accounts]
    arr.splice(to, 0, arr.splice(from, 1)[0])
    onChange(arr)
  }

  return (
    <div>
      <div style={rowBetween}>
        <h3 style={sectionTitle}>Accounts</h3>
        <button onClick={add} style={addBtn}>+ Add Account</button>
      </div>

      {accounts.length === 0
        ? <p style={empty}>No accounts yet.</p>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
              <thead>
                <tr>
                  <th style={th}></th>
                  {['Name', 'Tax Treatment', 'Asset Class', 'Balance ($)', 'Start Age', 'Return Rate', 'LTCG %', ''].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {accounts.map((a, i) => (
                  <tr
                    key={i}
                    style={{ borderTop: '1px solid #334155' }}
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); reorder(dragIdx.current, i) }}
                  >
                    <td
                      style={tdHandle}
                      draggable
                      onDragStart={e => { dragIdx.current = i; e.dataTransfer.effectAllowed = 'move' }}
                    >⠿</td>
                    <td style={td}>
                      <input value={a.name} onChange={e => update(i, { name: e.target.value })} style={ci()} placeholder="e.g. 401(k)" />
                    </td>
                    <td style={td}>
                      <select value={a.tax_treatment} onChange={e => update(i, { tax_treatment: e.target.value })} style={ci()}>
                        <option value="traditional">Traditional (pre-tax)</option>
                        <option value="taxable_brokerage">Taxable Brokerage</option>
                        <option value="cash_savings">Cash / Savings</option>
                      </select>
                    </td>
                    <td style={td}>
                      <select
                        value={a.asset_class}
                        onChange={e => {
                          const cls = e.target.value
                          update(i, { asset_class: cls, ...(cls !== 'stocks' ? { gains_pct: null } : {}) })
                        }}
                        style={ci()}
                      >
                        <option value="stocks">Stocks</option>
                        <option value="bonds">Bonds</option>
                        <option value="savings">Savings</option>
                      </select>
                    </td>
                    <td style={td}>
                      <input type="number" value={a.balance} onChange={e => update(i, { balance: Number(e.target.value) })} style={ci(110)} />
                    </td>
                    <td style={td}>
                      <input
                        type="number"
                        min={0}
                        placeholder="now"
                        value={a.start_age ?? ''}
                        onChange={e => update(i, { start_age: e.target.value === '' ? null : Number(e.target.value) })}
                        style={ci(60)}
                        title="Age at which this account becomes available. Leave empty to use from the start."
                      />
                    </td>
                    <td style={td}>
                      {a.asset_class !== 'stocks'
                        ? <input type="number" step="0.001" placeholder="0.04" value={a.annual_return_rate ?? ''} onChange={e => update(i, { annual_return_rate: e.target.value === '' ? null : Number(e.target.value) })} style={ci(80)} />
                        : <span style={muted}>historical</span>}
                    </td>
                    <td style={td}>
                      {a.tax_treatment === 'taxable_brokerage' && a.asset_class === 'stocks'
                        ? <input type="number" step="0.01" min={0} max={1} placeholder="0.80" value={a.gains_pct ?? ''} onChange={e => update(i, { gains_pct: e.target.value === '' ? null : Number(e.target.value) })} style={ci(70)} />
                        : <span style={muted}>—</span>}
                    </td>
                    <td style={td}>
                      <button onClick={() => remove(i)} style={removeBtn}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  )
}

const rowBetween  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }
const sectionTitle= { margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9' }
const empty       = { color: '#94a3b8', fontSize: '0.875rem', margin: 0 }
const th          = { padding: '0.5rem', fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', textAlign: 'left', borderBottom: '1px solid #334155', whiteSpace: 'nowrap' }
const td          = { padding: '0.3rem 0.25rem', verticalAlign: 'middle' }
const tdHandle    = { padding: '0.3rem 0.4rem', verticalAlign: 'middle', color: '#475569', cursor: 'grab', fontSize: '1rem', userSelect: 'none' }
const muted       = { color: '#94a3b8', fontSize: '0.8rem' }
const addBtn      = { padding: '0.35rem 0.7rem', background: '#334155', border: '1px solid #475569', borderRadius: 5, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, color: '#94a3b8' }
const removeBtn   = { padding: '0.2rem 0.45rem', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem' }
const ci          = (w) => ({ padding: '0.35rem 0.45rem', border: '1px solid #334155', borderRadius: 4, fontSize: '0.85rem', width: w ? w : '100%', boxSizing: 'border-box', background: '#0f172a', color: '#f1f5f9' })
