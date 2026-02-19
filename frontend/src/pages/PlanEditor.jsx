import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getPlan, createPlan, updatePlan } from '../api/client'
import ProfileTab from '../components/plan/ProfileTab'
import AccountsTab from '../components/plan/AccountsTab'
import IncomeTab from '../components/plan/IncomeTab'
import ExpensesTab from '../components/plan/ExpensesTab'

const EMPTY_PLAN = {
  name: '',
  current_age: 55,
  planning_horizon: 30,
  filing_status: 'single',
  state_tax_type: 'none',
  state_tax_rate: null,
  accounts: [],
  income_sources: [],
  expenses: [],
}

const TABS = ['Profile', 'Accounts', 'Income', 'Expenses']

export default function PlanEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [plan, setPlan] = useState(EMPTY_PLAN)
  const [activeTab, setActiveTab] = useState('Profile')
  const [loading, setLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!id) return
    getPlan(id)
      .then(r => setPlan(r.data))
      .finally(() => setLoading(false))
  }, [id])

  const update = (patch) => setPlan(prev => ({ ...prev, ...patch }))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      if (id) {
        await updatePlan(id, plan)
        setSaved(true)
        setTimeout(() => setSaved(false), 2500)
      } else {
        const r = await createPlan(plan)
        navigate(`/plans/${r.data.id}`, { replace: true })
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'Save failed. Check all fields.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <p style={{ color: '#94a3b8' }}>Loading...</p>

  return (
    <div style={{ maxWidth: 900 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => navigate('/plans')}
          style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem', padding: 0 }}
        >
          ←
        </button>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>
          {id ? (plan.name || 'Edit Plan') : 'New Plan'}
        </h1>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '2px solid #334155', marginBottom: '1.5rem' }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            style={{
              padding: '0.6rem 1.25rem',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontWeight: activeTab === t ? 600 : 400,
              color: activeTab === t ? '#f97316' : '#94a3b8',
              borderBottom: `2px solid ${activeTab === t ? '#f97316' : 'transparent'}`,
              marginBottom: -2,
              fontSize: '0.9rem',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ background: '#1e293b', borderRadius: 8, padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
        {activeTab === 'Profile'  && <ProfileTab  plan={plan} onChange={update} />}
        {activeTab === 'Accounts' && <AccountsTab accounts={plan.accounts} onChange={v => update({ accounts: v })} />}
        {activeTab === 'Income'   && <IncomeTab   sources={plan.income_sources} onChange={v => update({ income_sources: v })} />}
        {activeTab === 'Expenses' && <ExpensesTab expenses={plan.expenses} onChange={v => update({ expenses: v })} />}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1.25rem' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ padding: '0.6rem 1.5rem', background: '#f97316', color: '#fff', border: 'none', borderRadius: 6, cursor: saving ? 'default' : 'pointer', fontWeight: 600, fontSize: '0.9rem', opacity: saving ? 0.7 : 1 }}
        >
          {saving ? 'Saving...' : 'Save Plan'}
        </button>
        {saved  && <span style={{ color: '#4ade80', fontSize: '0.875rem' }}>Saved</span>}
        {error  && <span style={{ color: '#f87171', fontSize: '0.875rem' }}>{error}</span>}
      </div>
    </div>
  )
}
