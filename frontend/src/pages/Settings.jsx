import SimConfigPanel from '../components/shared/SimConfigPanel'

export default function Settings() {
  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Settings</h1>
        <p style={{ margin: '0.25rem 0 0', color: '#94a3b8', fontSize: '0.875rem' }}>
          Global defaults applied to all new simulations. Individual runs can still override these.
        </p>
      </div>

      <SimConfigPanel />
    </div>
  )
}
