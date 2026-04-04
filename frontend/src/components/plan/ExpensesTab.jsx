import { useRef, useMemo } from 'react'

function mortgagePayment(balance, annualRate, nMonths) {
  if (!balance || !annualRate || !nMonths || nMonths <= 0) return null
  const r = annualRate / 12
  const monthly = balance * r * Math.pow(1 + r, nMonths) / (Math.pow(1 + r, nMonths) - 1)
  return monthly * 12
}

const fmtCurrency = (v) => v == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v)

const EMPTY = {
  name: '',
  annual_amount: 0,
  start_age: 60,
  end_age: 90,
  inflation_rate: 0.025,
  expense_type: 'standard',
  mortgage_balance: null,
  mortgage_interest_rate: null,
  mortgage_periods: null,
}

export default function ExpensesTab({ expenses, onChange }) {
  const dragIdx = useRef(null)

  const add     = ()         => onChange([...expenses, { ...EMPTY }])
  const remove  = (i)        => onChange(expenses.filter((_, j) => j !== i))
  const update  = (i, patch) => onChange(expenses.map((e, j) => j === i ? { ...e, ...patch } : e))
  const reorder = (from, to) => {
    if (from === to) return
    const arr = [...expenses]
    arr.splice(to, 0, arr.splice(from, 1)[0])
    onChange(arr)
  }

  const setType = (i, type) => {
    if (type === 'standard') {
      update(i, { expense_type: 'standard', mortgage_balance: null, mortgage_interest_rate: null, mortgage_periods: null, inflation_rate: 0.025 })
    } else {
      update(i, { expense_type: 'mortgage', inflation_rate: 0 })
    }
  }

  return (
    <div>
      <div style={rowBetween}>
        <h3 style={sectionTitle}>Expenses</h3>
        <button onClick={add} style={addBtn}>+ Add Expense</button>
      </div>

      {expenses.length === 0
        ? <p style={empty}>No expenses yet.</p>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
              <thead>
                <tr>
                  <th style={th}></th>
                  {["Type", "Name", "Annual Amount (today's $)", 'Start Age', 'End Age', 'Inflation Rate', ''].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenses.map((e, i) => (
                  <>
                    <tr
                      key={i}
                      style={{ borderTop: '1px solid #334155' }}
                      onDragOver={ev => ev.preventDefault()}
                      onDrop={ev => { ev.preventDefault(); reorder(dragIdx.current, i) }}
                    >
                      <td
                        style={tdHandle}
                        draggable
                        onDragStart={ev => { dragIdx.current = i; ev.dataTransfer.effectAllowed = 'move' }}
                      >⠿</td>
                      <td style={td}>
                        <select
                          value={e.expense_type || 'standard'}
                          onChange={ev => setType(i, ev.target.value)}
                          style={{ ...ci(100), cursor: 'pointer' }}
                        >
                          <option value="standard">Standard</option>
                          <option value="mortgage">Mortgage</option>
                        </select>
                      </td>
                      <td style={td}>
                        <input value={e.name} onChange={ev => update(i, { name: ev.target.value })} style={ci()} placeholder="e.g. Living Expenses" />
                      </td>
                      <td style={td}>
                        {e.expense_type === 'mortgage'
                          ? (() => {
                              const pmt = mortgagePayment(e.mortgage_balance, e.mortgage_interest_rate, e.mortgage_periods)
                              return (
                                <span style={{ ...ci(130), display: 'inline-block', color: '#475569', cursor: 'not-allowed', lineHeight: '1.6' }}>
                                  {pmt != null ? fmtCurrency(pmt) : '—'}
                                </span>
                              )
                            })()
                          : <input type="number" value={e.annual_amount} onChange={ev => update(i, { annual_amount: Number(ev.target.value) })} style={ci(130)} />
                        }
                      </td>
                      <td style={td}>
                        <input type="number" value={e.start_age} onChange={ev => update(i, { start_age: Number(ev.target.value) })} style={ci(70)} />
                      </td>
                      <td style={td}>
                        <input type="number" value={e.end_age} onChange={ev => update(i, { end_age: Number(ev.target.value) })} style={ci(70)} />
                      </td>
                      <td style={td}>
                        {e.expense_type === 'mortgage'
                          ? <span style={{ color: '#475569', fontSize: '0.8rem', padding: '0 0.45rem' }}>n/a</span>
                          : (
                            <input
                              type="number"
                              step="0.001"
                              placeholder="0.025"
                              value={e.inflation_rate}
                              onChange={ev => update(i, { inflation_rate: Number(ev.target.value) })}
                              style={ci(85)}
                            />
                          )
                        }
                      </td>
                      <td style={td}>
                        <button onClick={() => remove(i)} style={removeBtn}>✕</button>
                      </td>
                    </tr>
                    {e.expense_type === 'mortgage' && (
                      <tr key={`${i}-mtg`} style={{ background: 'rgba(249,115,22,0.05)' }}>
                        <td />
                        <td />
                        <td colSpan={5} style={{ padding: '0.3rem 0.25rem 0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <label style={mtgLabel}>
                              Remaining Balance ($)
                              <input
                                type="number"
                                placeholder="e.g. 450000"
                                value={e.mortgage_balance ?? ''}
                                onChange={ev => update(i, { mortgage_balance: ev.target.value === '' ? null : Number(ev.target.value) })}
                                style={ci(140)}
                              />
                            </label>
                            <label style={mtgLabel}>
                              Interest Rate
                              <input
                                type="number"
                                step="0.001"
                                placeholder="e.g. 0.065"
                                value={e.mortgage_interest_rate ?? ''}
                                onChange={ev => update(i, { mortgage_interest_rate: ev.target.value === '' ? null : Number(ev.target.value) })}
                                style={ci(100)}
                              />
                            </label>
                            <label style={mtgLabel}>
                              Periods (months)
                              <input
                                type="number"
                                placeholder="e.g. 240"
                                value={e.mortgage_periods ?? ''}
                                onChange={ev => update(i, { mortgage_periods: ev.target.value === '' ? null : Number(ev.target.value) })}
                                style={ci(80)}
                              />
                            </label>
                            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                              Annual amount = P+I · interest is deducted from taxes (itemized vs standard)
                            </span>
                          </div>
                        </td>
                        <td />
                      </tr>
                    )}
                  </>
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
const addBtn      = { padding: '0.35rem 0.7rem', background: '#334155', border: '1px solid #475569', borderRadius: 5, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, color: '#94a3b8' }
const removeBtn   = { padding: '0.2rem 0.45rem', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem' }
const ci          = (w) => ({ padding: '0.35rem 0.45rem', border: '1px solid #334155', borderRadius: 4, fontSize: '0.85rem', width: w ? w : '100%', boxSizing: 'border-box', background: '#0f172a', color: '#f1f5f9' })
const mtgLabel    = { display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600 }
