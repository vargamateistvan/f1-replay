import { useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Cell, ResponsiveContainer,
} from 'recharts'
import { useStandings, type DriverStanding, type ConstructorStanding } from '@/hooks/useStandings'

const YEARS = [2024, 2023]
type Tab = 'drivers' | 'constructors'

// ── Loading progress bar ──────────────────────────────────────────────────────
function LoadingBar({ loaded, total }: { loaded: number; total: number }) {
  if (total === 0) return null
  const pct = Math.round((loaded / total) * 100)
  return (
    <div className="flex items-center gap-3 text-xs text-muted font-mono px-4 py-1 bg-surface border-b border-panel">
      <span>Loading race results… {loaded}/{total}</span>
      <div className="flex-1 h-1 bg-panel rounded overflow-hidden">
        <div
          className="h-full bg-f1red transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>{pct}%</span>
    </div>
  )
}

// ── Custom tooltips ───────────────────────────────────────────────────────────
interface TooltipProps<T> { active?: boolean; payload?: Array<{ payload: T }> }

function DriverTooltip({ active, payload }: TooltipProps<DriverStanding>) {
  if (!active || !payload?.[0]) return null
  const d = payload[0].payload
  return (
    <div className="bg-surface border border-panel text-xs font-mono px-3 py-2 rounded shadow-lg">
      <div className="font-bold" style={{ color: d.color }}>{d.fullName}</div>
      <div className="text-muted">{d.team}</div>
      <div className="mt-1"><span className="text-white font-bold">{d.points}</span> pts</div>
      <div className="text-muted">{d.wins} wins · {d.podiums} podiums</div>
    </div>
  )
}

function ConstructorTooltip({ active, payload }: TooltipProps<ConstructorStanding>) {
  if (!active || !payload?.[0]) return null
  const c = payload[0].payload
  return (
    <div className="bg-surface border border-panel text-xs font-mono px-3 py-2 rounded shadow-lg">
      <div className="font-bold" style={{ color: c.color }}>{c.name}</div>
      <div className="mt-1"><span className="text-white font-bold">{c.points}</span> pts</div>
      <div className="text-muted">{c.wins} win{c.wins !== 1 ? 's' : ''}</div>
    </div>
  )
}

// ── Driver standings ──────────────────────────────────────────────────────────
function DriverTable({ standings }: { standings: DriverStanding[] }) {
  if (standings.length === 0) return <div className="text-muted text-xs p-4">No data yet</div>
  return (
    <div className="overflow-auto">
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="text-muted border-b border-panel sticky top-0 bg-surface z-10">
            <th className="text-left py-1.5 px-2 w-8">P</th>
            <th className="text-left py-1.5 px-2">Driver</th>
            <th className="text-left py-1.5 px-2">Team</th>
            <th className="text-right py-1.5 px-2 w-16">Pts</th>
            <th className="text-right py-1.5 px-2 w-12">Wins</th>
            <th className="text-right py-1.5 px-2 w-16">Podiums</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr
              key={s.driverNumber}
              className="border-b border-panel/40 hover:bg-panel/30 transition-colors"
            >
              <td className="py-1.5 px-2 text-muted tabular-nums">{s.position}</td>
              <td className="py-1.5 px-2">
                <span
                  className="inline-block w-0.5 h-3.5 mr-1.5 rounded-sm align-middle"
                  style={{ background: s.color }}
                />
                <span className="font-bold" style={{ color: s.color }}>{s.acronym}</span>
                <span className="text-muted ml-1.5">{s.fullName}</span>
              </td>
              <td className="py-1.5 px-2 text-muted">{s.team}</td>
              <td className="py-1.5 px-2 text-right tabular-nums font-bold">{s.points}</td>
              <td className="py-1.5 px-2 text-right tabular-nums text-muted">{s.wins}</td>
              <td className="py-1.5 px-2 text-right tabular-nums text-muted">{s.podiums}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DriverChart({ standings }: { standings: DriverStanding[] }) {
  const maxPts = standings[0]?.points ?? 1
  return (
    <ResponsiveContainer width="100%" height={Math.max(280, standings.length * 22)}>
      <BarChart
        data={standings}
        layout="vertical"
        margin={{ top: 4, right: 48, left: 56, bottom: 4 }}
        barSize={14}
      >
        <CartesianGrid horizontal={false} stroke="#1e2d4a" />
        <XAxis
          type="number"
          domain={[0, maxPts]}
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={{ stroke: '#1e2d4a' }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="acronym"
          tick={{ fill: '#9ca3af', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip cursor={{ fill: '#1e2d4a33' }} content={<DriverTooltip />} />
        <Bar dataKey="points" radius={[0, 3, 3, 0]}>
          {standings.map((s) => (
            <Cell key={s.driverNumber} fill={s.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Constructor standings ─────────────────────────────────────────────────────
function ConstructorTable({ standings }: { standings: ConstructorStanding[] }) {
  if (standings.length === 0) return <div className="text-muted text-xs p-4">No data yet</div>
  return (
    <div className="overflow-auto">
      <table className="w-full text-xs font-mono border-collapse">
        <thead>
          <tr className="text-muted border-b border-panel sticky top-0 bg-surface z-10">
            <th className="text-left py-1.5 px-2 w-8">P</th>
            <th className="text-left py-1.5 px-2">Constructor</th>
            <th className="text-right py-1.5 px-2 w-16">Pts</th>
            <th className="text-right py-1.5 px-2 w-12">Wins</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr
              key={s.name}
              className="border-b border-panel/40 hover:bg-panel/30 transition-colors"
            >
              <td className="py-1.5 px-2 text-muted tabular-nums">{s.position}</td>
              <td className="py-1.5 px-2">
                <span
                  className="inline-block w-2 h-2 rounded-sm mr-2 align-middle"
                  style={{ background: s.color }}
                />
                <span className="font-bold" style={{ color: s.color }}>{s.name}</span>
              </td>
              <td className="py-1.5 px-2 text-right tabular-nums font-bold">{s.points}</td>
              <td className="py-1.5 px-2 text-right tabular-nums text-muted">{s.wins}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ConstructorChart({ standings }: { standings: ConstructorStanding[] }) {
  const maxPts = standings[0]?.points ?? 1
  return (
    <ResponsiveContainer width="100%" height={Math.max(200, standings.length * 28)}>
      <BarChart
        data={standings}
        layout="vertical"
        margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
        barSize={18}
      >
        <CartesianGrid horizontal={false} stroke="#1e2d4a" />
        <XAxis
          type="number"
          domain={[0, maxPts]}
          tick={{ fill: '#6b7280', fontSize: 10 }}
          axisLine={{ stroke: '#1e2d4a' }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: '#9ca3af', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={0}
          hide
        />
        <Tooltip cursor={{ fill: '#1e2d4a33' }} content={<ConstructorTooltip />} />
        <Bar dataKey="points" radius={[0, 3, 3, 0]}>
          {standings.map((s) => (
            <Cell key={s.name} fill={s.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Standings() {
  const [year, setYear] = useState(2024)
  const [tab, setTab] = useState<Tab>('drivers')

  const { driverStandings, constructorStandings, loadedRaces, totalRaces, isLoading, isFetching } =
    useStandings(year)

  return (
    <div className="flex flex-col h-full overflow-hidden bg-track">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-2 bg-surface border-b border-panel text-sm font-mono">
        <span className="text-f1red font-black tracking-widest">STANDINGS</span>

        <label className="text-muted text-xs">Year</label>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="bg-panel text-white border border-panel rounded px-2 py-1 text-xs"
        >
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        {isLoading && <span className="text-muted text-xs animate-pulse">Loading sessions…</span>}

        {/* Tabs */}
        <div className="ml-auto flex">
          {(['drivers', 'constructors'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1 text-xs font-bold uppercase tracking-wider transition-colors ${
                tab === t
                  ? 'text-white border-b-2 border-f1red'
                  : 'text-muted hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Progress bar while race results are loading */}
      {isFetching && <LoadingBar loaded={loadedRaces} total={totalRaces} />}

      {/* Content */}
      <div className="flex-1 overflow-hidden flex gap-0">
        {tab === 'drivers' ? (
          <>
            <div className="w-[420px] shrink-0 border-r border-panel overflow-auto">
              <DriverTable standings={driverStandings} />
            </div>
            <div className="flex-1 overflow-auto p-4 bg-track">
              <div className="text-xs text-muted font-mono mb-3 uppercase tracking-wider">
                Points — {year} Driver Championship
              </div>
              <DriverChart standings={driverStandings} />
            </div>
          </>
        ) : (
          <>
            <div className="w-[360px] shrink-0 border-r border-panel overflow-auto">
              <ConstructorTable standings={constructorStandings} />
            </div>
            <div className="flex-1 overflow-auto p-4 bg-track">
              <div className="text-xs text-muted font-mono mb-3 uppercase tracking-wider">
                Points — {year} Constructor Championship
              </div>
              <ConstructorChart standings={constructorStandings} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
