/**
 * SimConfigPanel — lets the user configure run parameters before launching
 * a simulation. All validation happens inline; the Run button stays enabled
 * only when the config is valid.
 */
export default function SimConfigPanel({ config, onChange }) {
  const { numRuns, lowerPct, upperPct, initialRegime = 'random' } = config
  const invalid = lowerPct >= upperPct

  const set = (key, raw) => {
    const val = parseInt(raw, 10)
    if (!isNaN(val)) onChange({ ...config, [key]: val })
  }

  const setRegime = (regime) => {
    onChange({ ...config, initialRegime: regime })
  }

  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: 8,
      padding: '1rem 1.25rem',
      display: 'flex',
      alignItems: 'flex-end',
      gap: '2rem',
      flexWrap: 'wrap',
    }}>
      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', alignSelf: 'center', marginRight: 4 }}>
        Parameters
      </span>

      <Field label="Runs">
        <input
          type="number"
          value={numRuns}
          min={10}
          max={10000}
          step={10}
          onChange={(e) => set('numRuns', e.target.value)}
          style={inputStyle}
        />
      </Field>

      <Field label="Lower band">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="number"
            value={lowerPct}
            min={1}
            max={49}
            onChange={(e) => set('lowerPct', e.target.value)}
            style={{ ...inputStyle, width: 60 }}
          />
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>%</span>
        </div>
      </Field>

      <Field label="Upper band">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <input
            type="number"
            value={upperPct}
            min={51}
            max={99}
            onChange={(e) => set('upperPct', e.target.value)}
            style={{ ...inputStyle, width: 60 }}
          />
          <span style={{ color: '#94a3b8', fontSize: '0.85rem' }}>%</span>
        </div>
      </Field>

      <Field label="Initial Market">
        <div style={{ display: 'flex', gap: 6 }}>
          {['random', 'bear', 'bull'].map((option) => (
            <button
              key={option}
              onClick={() => setRegime(option)}
              style={{
                padding: '0.4rem 0.8rem',
                borderRadius: 5,
                border: '1px solid #334155',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                textTransform: 'capitalize',
                background: initialRegime === option ? '#3b82f6' : '#0f172a',
                color: initialRegime === option ? '#fff' : '#94a3b8',
                transition: 'all 0.15s ease',
              }}
            >
              {option === 'random' ? 'Random' : option === 'bear' ? 'Bear start' : 'Bull start'}
            </button>
          ))}
        </div>
      </Field>

      {invalid && (
        <span style={{ fontSize: '0.8rem', color: '#f87171', alignSelf: 'center' }}>
          Lower band must be less than upper band.
        </span>
      )}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: '0.72rem', fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 5 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

const inputStyle = {
  width: 90,
  padding: '0.35rem 0.5rem',
  border: '1px solid #334155',
  borderRadius: 5,
  fontSize: '0.9rem',
  color: '#f1f5f9',
  background: '#0f172a',
  outline: 'none',
}
