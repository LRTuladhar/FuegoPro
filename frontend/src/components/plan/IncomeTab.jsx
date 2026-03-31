import { useRef } from 'react'

const EMPTY = {
  name: '',
  income_type: 'employment',
  annual_amount: 0,
  start_age: 60,
  end_age: 70,
  is_taxable: null,
}

const INCOME_TYPES = [
  { value: 'employment',       label: 'Employment' },
  { value: 'social_security',  label: 'Social Security' },
  { value: 'rental',           label: 'Rental' },
  { value: 'other',            label: 'Other' },
]

export default function IncomeTab({ sources, onChange }) {
  const dragIdx = useRef(null)

  const add     = ()         => onChange([...sources, { ...EMPTY }])
  const remove  = (i)        => onChange(sources.filter((_, j) => j !== i))
  const update  = (i, patch) => onChange(sources.map((s, j) => j === i ? { ...s, ...patch } : s))
  const reorder = (from, to) => {
    if (from === to) return
    const arr = [...sources]
    arr.splice(to, 0, arr.splice(from, 1)[0])
    onChange(arr)
  }

  return (
    <div>
      <div style={rowBetween}>
        <h3 style={sectionTitle}>Income Sources</h3>
        <button onClick={add} style={addBtn}>+ Add Income</button>
      </div>

      {sources.length === 0
        ? <p style={empty}>No income sources yet.</p>
        : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={th}></th>
                  {['Name', 'Type', 'Annual Amount ($)', 'Start Age', 'End Age', 'Taxable', ''].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sources.map((s, i) => (
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
                      <input value={s.name} onChange={e => update(i, { name: e.target.value })} style={ci()} placeholder="e.g. SS Benefit" />
                    </td>
                    <td style={td}>
                      <select value={s.income_type} onChange={e => update(i, { income_type: e.target.value, is_taxable: null })} style={ci()}>
                        {INCOME_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </td>
                    <td style={td}>
                      <input type="number" value={s.annual_amount} onChange={e => update(i, { annual_amount: Number(e.target.value) })} style={ci(120)} />
                    </td>
                    <td style={td}>
                      <input type="number" value={s.start_age} onChange={e => update(i, { start_age: Number(e.target.value) })} style={ci(70)} />
                    </td>
                    <td style={td}>
                      <input type="number" value={s.end_age} onChange={e => update(i, { end_age: Number(e.target.value) })} style={ci(70)} />
                    </td>
                    <td style={td}>
                      {s.income_type === 'other'
                        ? (
                          <select
                            value={s.is_taxable == null ? '' : String(s.is_taxable)}
                            onChange={e => update(i, { is_taxable: e.target.value === '' ? null : e.target.value === 'true' })}
                            style={ci(80)}
                          >
                            <option value="">—</option>
                            <option value="true">Yes</option>
                            <option value="false">No</option>
                          </select>
                        )
                        : <span style={muted}>auto</span>}
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
