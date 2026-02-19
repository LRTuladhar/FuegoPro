export default function SuccessRate({ rate, numRuns }) {
  const pct = (rate * 100).toFixed(1)
  const { color, label, bg, border } =
    rate >= 0.9
      ? { color: '#4ade80', label: 'Strong',   bg: 'rgba(20,83,45,0.4)', border: '#166534' }
      : rate >= 0.7
      ? { color: '#fbbf24', label: 'Moderate', bg: 'rgba(120,53,15,0.4)', border: '#92400e' }
      : { color: '#f87171', label: 'At Risk',  bg: 'rgba(127,29,29,0.4)', border: '#991b1b' }

  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 8,
      padding: '1.25rem 1.75rem',
      display: 'flex',
      alignItems: 'center',
      gap: '2rem',
    }}>
      <div style={{ flexShrink: 0 }}>
        <div style={{ fontSize: '3rem', fontWeight: 800, color, lineHeight: 1 }}>{pct}%</div>
        <div style={{ color, fontWeight: 600, fontSize: '0.85rem', marginTop: 4 }}>{label}</div>
      </div>
      <div style={{ color: '#94a3b8', fontSize: '0.875rem', lineHeight: 1.6 }}>
        <strong style={{ color: '#f1f5f9', display: 'block', marginBottom: 2 }}>
          Monte Carlo Success Rate
        </strong>
        {numRuns.toLocaleString()} simulated scenarios were run. This percentage
        represents how many resulted in the portfolio surviving the full planning
        horizon without running out of money.
      </div>
    </div>
  )
}
