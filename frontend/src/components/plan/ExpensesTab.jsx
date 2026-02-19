const EMPTY = {
  name: '',
  annual_amount: 0,
  start_age: 60,
  end_age: 90,
  inflation_rate: 0.025,
}

export default function ExpensesTab({ expenses, onChange }) {
  const add    = ()         => onChange([...expenses, { ...EMPTY }])
  const remove = (i)        => onChange(expenses.filter((_, j) => j !== i))
  const update = (i, patch) => onChange(expenses.map((e, j) => j === i ? { ...e, ...patch } : e))

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
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 580 }}>
              <thead>
                <tr>
                  {["Name", "Annual Amount (today's $)", 'Start Age', 'End Age', 'Inflation Rate', ''].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenses.map((e, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #334155' }}>
                    <td style={td}>
                      <input value={e.name} onChange={ev => update(i, { name: ev.target.value })} style={ci()} placeholder="e.g. Living Expenses" />
                    </td>
                    <td style={td}>
                      <input type="number" value={e.annual_amount} onChange={ev => update(i, { annual_amount: Number(ev.target.value) })} style={ci(130)} />
                    </td>
                    <td style={td}>
                      <input type="number" value={e.start_age} onChange={ev => update(i, { start_age: Number(ev.target.value) })} style={ci(70)} />
                    </td>
                    <td style={td}>
                      <input type="number" value={e.end_age} onChange={ev => update(i, { end_age: Number(ev.target.value) })} style={ci(70)} />
                    </td>
                    <td style={td}>
                      <input
                        type="number"
                        step="0.001"
                        placeholder="0.025"
                        value={e.inflation_rate}
                        onChange={ev => update(i, { inflation_rate: Number(ev.target.value) })}
                        style={ci(85)}
                      />
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
const addBtn      = { padding: '0.35rem 0.7rem', background: '#334155', border: '1px solid #475569', borderRadius: 5, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500, color: '#94a3b8' }
const removeBtn   = { padding: '0.2rem 0.45rem', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.9rem' }
const ci          = (w) => ({ padding: '0.35rem 0.45rem', border: '1px solid #334155', borderRadius: 4, fontSize: '0.85rem', width: w ? w : '100%', boxSizing: 'border-box', background: '#0f172a', color: '#f1f5f9' })
