import { useEffect, useState } from 'react'
import { useSimConfig } from '../../store/simConfig'

/**
 * SimConfigPanel — settings panel for editing and saving global simulation
 * defaults (stored in the database). Displayed on the Settings page.
 */
export default function SimConfigPanel() {
  const { config, saveConfig, loaded } = useSimConfig()
  const [local, setLocal] = useState(config)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  // Sync local state when context finishes loading from API
  useEffect(() => {
    if (loaded) setLocal(config)
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const invalid = local.lowerPct >= local.upperPct

  const set = (key, raw) => {
    const val = parseInt(raw, 10)
    if (!isNaN(val)) setLocal(prev => ({ ...prev, [key]: val }))
  }

  const handleSave = async () => {
    if (invalid) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await saveConfig(local)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (e) {
      setError(e.response?.data?.detail ?? 'Failed to save settings.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: 8,
      padding: '1.5rem 1.75rem',
      maxWidth: 480,
    }}>
      <h2 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>
        Default Simulation Parameters
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <Field label="Number of runs" hint="10 – 10,000">
          <input
            type="number"
            value={local.numRuns}
            min={10}
            max={10000}
            step={100}
            onChange={e => set('numRuns', e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="Lower percentile band" hint="1 – 49">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              value={local.lowerPct}
              min={1}
              max={49}
              onChange={e => set('lowerPct', e.target.value)}
              style={{ ...inputStyle, width: 80 }}
            />
            <span style={{ color: '#94a3b8' }}>%</span>
          </div>
        </Field>

        <Field label="Upper percentile band" hint="51 – 99">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              value={local.upperPct}
              min={51}
              max={99}
              onChange={e => set('upperPct', e.target.value)}
              style={{ ...inputStyle, width: 80 }}
            />
            <span style={{ color: '#94a3b8' }}>%</span>
          </div>
        </Field>
      </div>

      {invalid && (
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.82rem', color: '#f87171' }}>
          Lower band must be less than upper band.
        </p>
      )}

      {error && (
        <p style={{ margin: '0.75rem 0 0', fontSize: '0.82rem', color: '#f87171' }}>{error}</p>
      )}

      <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          onClick={handleSave}
          disabled={saving || invalid}
          style={btn(saving || invalid ? 'disabled' : 'primary')}
        >
          {saving ? 'Saving…' : 'Save defaults'}
        </button>
        {saved && (
          <span style={{ fontSize: '0.82rem', color: '#4ade80', fontWeight: 500 }}>
            Saved!
          </span>
        )}
      </div>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div style={{ fontSize: '0.82rem', fontWeight: 500, color: '#cbd5e1', marginBottom: 6 }}>
        {label}
        {hint && <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 6 }}>({hint})</span>}
      </div>
      {children}
    </div>
  )
}

const inputStyle = {
  width: 160,
  padding: '0.4rem 0.6rem',
  border: '1px solid #334155',
  borderRadius: 5,
  fontSize: '0.9rem',
  color: '#f1f5f9',
  background: '#0f172a',
  outline: 'none',
}

function btn(variant) {
  const base = {
    padding: '0.45rem 1rem',
    borderRadius: 6,
    border: 'none',
    cursor: variant === 'disabled' ? 'not-allowed' : 'pointer',
    fontSize: '0.85rem',
    fontWeight: 500,
    opacity: variant === 'disabled' ? 0.6 : 1,
  }
  if (variant === 'primary' || variant === 'disabled')
    return { ...base, background: '#f97316', color: '#fff' }
  return { ...base, background: '#334155', color: '#94a3b8' }
}
