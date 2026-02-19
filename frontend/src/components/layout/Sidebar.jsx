import { NavLink } from 'react-router-dom'

export default function Sidebar() {
  return (
    <nav style={{
      width: 200,
      flexShrink: 0,
      background: '#0f172a',
      padding: '1.25rem 0.75rem',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{
        fontWeight: 700,
        fontSize: '1.1rem',
        color: '#f97316',
        padding: '0.25rem 0.75rem',
        marginBottom: '1.25rem',
        letterSpacing: '-0.01em',
      }}>
        FuegoPro
      </div>

      <SideLink to="/plans">Plans</SideLink>
      <SideLink to="/compare">Compare</SideLink>

      <div style={{ flex: 1 }} />

      <SideLink to="/settings">Settings</SideLink>
    </nav>
  )
}

function SideLink({ to, children }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        display: 'block',
        padding: '0.5rem 0.75rem',
        borderRadius: 6,
        textDecoration: 'none',
        color: isActive ? '#fff' : '#94a3b8',
        background: isActive ? '#1e3a5f' : 'transparent',
        fontWeight: isActive ? 600 : 400,
        fontSize: '0.9rem',
      })}
    >
      {children}
    </NavLink>
  )
}
