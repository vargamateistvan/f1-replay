import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Race Weekend' },
  { to: '/telemetry', label: 'Telemetry' },
  { to: '/standings', label: 'Standings' },
]

export function Nav() {
  return (
    <nav className="flex items-center gap-1 px-4 py-2 bg-surface border-b border-panel">
      <span className="text-f1red font-bold text-lg tracking-widest mr-6">F1 REPLAY</span>
      {links.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `px-3 py-1 rounded text-sm transition-colors ${
              isActive
                ? 'bg-f1red text-white font-semibold'
                : 'text-muted hover:text-white hover:bg-panel'
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
