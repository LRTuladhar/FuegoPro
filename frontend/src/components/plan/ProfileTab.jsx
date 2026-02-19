export default function ProfileTab({ plan, onChange }) {
  const str  = (key) => ({ value: plan[key] ?? '', onChange: e => onChange({ [key]: e.target.value }) })
  const num  = (key) => ({ type: 'number', value: plan[key] ?? '', onChange: e => onChange({ [key]: e.target.value === '' ? null : Number(e.target.value) }) })

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
      <div style={{ gridColumn: '1 / -1' }}>
        <Label>Plan Name</Label>
        <Input {...str('name')} placeholder="e.g. Base Case" />
      </div>

      <div>
        <Label>Current Age</Label>
        <Input {...num('current_age')} min={18} max={100} />
      </div>

      <div>
        <Label>Planning Horizon (years)</Label>
        <Input {...num('planning_horizon')} min={1} max={60} />
      </div>

      <div>
        <Label>Filing Status</Label>
        <Select value={plan.filing_status} onChange={e => onChange({ filing_status: e.target.value })}>
          <option value="single">Single</option>
          <option value="married">Married Filing Jointly</option>
        </Select>
      </div>

      <div>
        <Label>State Tax</Label>
        <Select value={plan.state_tax_type} onChange={e => onChange({ state_tax_type: e.target.value, state_tax_rate: null })}>
          <option value="none">No state income tax</option>
          <option value="moderate">Moderate (flat rate)</option>
          <option value="california">California</option>
        </Select>
      </div>

      {plan.state_tax_type === 'moderate' && (
        <div>
          <Label>State Flat Rate (%)</Label>
          <Input
            type="number"
            min={0}
            max={20}
            step={0.1}
            placeholder="e.g. 5"
            value={plan.state_tax_rate != null ? +(plan.state_tax_rate * 100).toFixed(4) : ''}
            onChange={e => onChange({ state_tax_rate: e.target.value === '' ? null : Number(e.target.value) / 100 })}
          />
        </div>
      )}
    </div>
  )
}

function Label({ children }) {
  return (
    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
      {children}
    </label>
  )
}

function Input(props) {
  return (
    <input
      {...props}
      style={{ width: '100%', padding: '0.5rem 0.625rem', border: '1px solid #334155', borderRadius: 6, fontSize: '0.9rem', outline: 'none', background: '#0f172a', color: '#f1f5f9' }}
    />
  )
}

function Select({ children, ...props }) {
  return (
    <select
      {...props}
      style={{ width: '100%', padding: '0.5rem 0.625rem', border: '1px solid #334155', borderRadius: 6, fontSize: '0.9rem', outline: 'none', background: '#0f172a', color: '#f1f5f9' }}
    >
      {children}
    </select>
  )
}
