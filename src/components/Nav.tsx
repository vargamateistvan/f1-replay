import { NavLink } from 'react-router-dom'

const links = [
  { to: '/', label: 'Race Weekend' },
  { to: '/telemetry', label: 'Telemetry' },
  { to: '/standings', label: 'Standings' },
]

export function Nav() {
  return (
    <nav className="flex items-center h-11 px-4 bg-track border-b border-panel">
      <span className="text-f1red font-black text-sm tracking-[0.18em] uppercase mr-8 select-none">
        F1 REPLAY
      </span>
      {links.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `h-11 flex items-center px-4 text-xs font-bold uppercase tracking-[0.12em] transition-colors border-b-2 ${
              isActive
                ? 'text-white border-f1red'
                : 'text-muted border-transparent hover:text-white hover:border-[#38383f]'
            }`
          }
        >
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
