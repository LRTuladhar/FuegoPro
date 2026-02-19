import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getPlans, deletePlan, duplicatePlan } from '../api/client'

export default function PlansList() {
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const load = () => {
    getPlans()
      .then(r => setPlans(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return
    await deletePlan(id)
    load()
  }

  const handleDuplicate = async (id) => {
    await duplicatePlan(id)
    load()
  }

  if (loading) return <p style={{ color: '#94a3b8' }}>Loading...</p>

  return (
    <div style={{ maxWidth: 960 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Plans</h1>
        <button onClick={() => navigate('/plans/new')} style={btn('primary')}>+ New Plan</button>
      </div>

      {plans.length === 0 ? (
        <div style={{ background: '#1e293b', borderRadius: 8, padding: '3rem', textAlign: 'center', color: '#94a3b8', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
          No plans yet. Create one to get started.
        </div>
      ) : (
        <div style={{ background: '#1e293b', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.4)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#162032' }}>
                {['Name', 'Age', 'Horizon', 'Filing Status', 'Last Run', 'Success Rate', ''].map(h => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {plans.map(p => (
                <tr key={p.id} style={{ borderTop: '1px solid #334155' }}>
                  <td style={td}><strong>{p.name}</strong></td>
                  <td style={td}>{p.current_age}</td>
                  <td style={td}>{p.planning_horizon} yrs</td>
                  <td style={td}>{p.filing_status === 'married' ? 'Married' : 'Single'}</td>
                  <td style={td}>{p.last_simulated_at ? new Date(p.last_simulated_at).toLocaleDateString() : '—'}</td>
                  <td style={td}>
                    {p.last_success_rate != null
                      ? <span style={{ fontWeight: 600, color: p.last_success_rate >= 0.9 ? '#4ade80' : p.last_success_rate >= 0.7 ? '#fbbf24' : '#f87171' }}>
                          {(p.last_success_rate * 100).toFixed(0)}%
                        </span>
                      : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => navigate(`/plans/${p.id}/simulate`)} style={btn('primary')}>Simulate</button>
                    {' '}
                    <button onClick={() => navigate(`/plans/${p.id}`)} style={btn('secondary')}>Edit</button>
                    {' '}
                    <button onClick={() => handleDuplicate(p.id)} style={btn('secondary')}>Copy</button>
                    {' '}
                    <button onClick={() => handleDelete(p.id, p.name)} style={btn('danger')}>Delete</button>
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

const th = {
  padding: '0.625rem 1rem',
  fontSize: '0.75rem',
  fontWeight: 600,
  color: '#94a3b8',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  textAlign: 'left',
}

const td = {
  padding: '0.75rem 1rem',
  fontSize: '0.9rem',
  color: '#f1f5f9',
}

function btn(variant) {
  const base = { padding: '0.35rem 0.7rem', borderRadius: 5, border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 500 }
  if (variant === 'primary') return { ...base, background: '#f97316', color: '#fff' }
  if (variant === 'danger')  return { ...base, background: 'rgba(127,29,29,0.4)', color: '#f87171' }
  return { ...base, background: '#334155', color: '#94a3b8' }
}
