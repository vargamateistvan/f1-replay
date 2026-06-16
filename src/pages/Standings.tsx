import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import {
  useStandings,
  type DriverStanding,
  type ConstructorStanding,
} from "@/hooks/useStandings";
import { ErrorMessage } from "@/components/ErrorMessage";
import { useNumberParam, useStringParam } from "@/hooks/useSearchParamState";
import { YEARS, DEFAULT_YEAR } from "@/constants";

type Tab = "drivers" | "constructors";

// ── Loading progress bar ──────────────────────────────────────────────────────
function LoadingBar({ loaded, total }: { loaded: number; total: number }) {
  if (total === 0) return null;
  const pct = Math.round((loaded / total) * 100);
  return (
    <div className="flex items-center gap-3 text-xs text-muted font-mono px-4 py-1 bg-surface border-b border-panel">
      <span>
        Loading race results… {loaded}/{total}
      </span>
      <div className="flex-1 h-1 bg-panel rounded overflow-hidden">
        <div
          className="h-full bg-f1red transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span>{pct}%</span>
    </div>
  );
}

// ── Custom tooltips ───────────────────────────────────────────────────────────
interface TooltipProps<T> {
  active?: boolean;
  payload?: Array<{ payload: T }>;
}

function DriverTooltip({ active, payload }: TooltipProps<DriverStanding>) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-surface border border-panel text-xs font-mono px-3 py-2 rounded shadow-lg">
      <div className="font-bold" style={{ color: d.color }}>
        {d.fullName}
      </div>
      <div className="text-muted">{d.team}</div>
      <div className="mt-1">
        <span className="text-white font-bold">{d.points}</span> pts
      </div>
      <div className="text-muted">
        {d.wins} wins · {d.podiums} podiums
      </div>
    </div>
  );
}

function ConstructorTooltip({
  active,
  payload,
}: TooltipProps<ConstructorStanding>) {
  if (!active || !payload?.[0]) return null;
  const c = payload[0].payload;
  return (
    <div className="bg-surface border border-panel text-xs font-mono px-3 py-2 rounded shadow-lg">
      <div className="font-bold" style={{ color: c.color }}>
        {c.name}
      </div>
      <div className="mt-1">
        <span className="text-white font-bold">{c.points}</span> pts
      </div>
      <div className="text-muted">
        {c.wins} win{c.wins !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

// ── Driver standings ──────────────────────────────────────────────────────────
function DriverTable({ standings }: { standings: DriverStanding[] }) {
  if (standings.length === 0)
    return <div className="text-muted text-xs p-4">No data yet</div>;
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="sticky top-0 bg-track z-10 border-b border-[#38383f]">
            <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-[#636369] w-8">
              P
            </th>
            <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-[#636369]">
              Driver
            </th>
            <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-[#636369] hidden sm:table-cell">
              Team
            </th>
            <th className="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-[#636369] w-16">
              Pts
            </th>
            <th className="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-[#636369] w-12 hidden sm:table-cell">
              Wins
            </th>
            <th className="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-[#636369] w-16 hidden sm:table-cell">
              Podiums
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.driverNumber} className="border-b border-[#2a2a35]">
              <td className="py-3 px-3 font-black text-sm tabular-nums">
                {s.position}
              </td>
              <td className="py-3 px-3">
                <span className="flex items-center gap-2">
                  <span
                    className="w-[3px] h-4 shrink-0"
                    style={{ background: s.color }}
                  />
                  <span
                    className="font-black text-xs"
                    style={{ color: s.color }}
                  >
                    {s.acronym}
                  </span>
                  <span className="text-muted text-xs hidden sm:inline">
                    {s.fullName}
                  </span>
                </span>
              </td>
              <td className="py-3 px-3 text-muted text-xs hidden sm:table-cell">
                {s.team}
              </td>
              <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-sm">
                {s.points}
              </td>
              <td className="py-3 px-3 text-right font-mono tabular-nums text-muted text-xs hidden sm:table-cell">
                {s.wins}
              </td>
              <td className="py-3 px-3 text-right font-mono tabular-nums text-muted text-xs hidden sm:table-cell">
                {s.podiums}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DriverChart({ standings }: { standings: DriverStanding[] }) {
  const maxPts = standings[0]?.points ?? 1;
  return (
    <ResponsiveContainer
      width="100%"
      height={Math.max(280, standings.length * 22)}
    >
      <BarChart
        data={standings}
        layout="vertical"
        margin={{ top: 4, right: 48, left: 56, bottom: 4 }}
        barSize={14}
      >
        <CartesianGrid horizontal={false} stroke="#2a2a35" />
        <XAxis
          type="number"
          domain={[0, maxPts]}
          tick={{ fill: "#636369", fontSize: 10 }}
          axisLine={{ stroke: "#1e2d4a" }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="acronym"
          tick={{ fill: "#a3a3a3", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip cursor={{ fill: "#1e2d4a33" }} content={<DriverTooltip />} />
        <Bar dataKey="points" radius={[0, 3, 3, 0]}>
          {standings.map((s) => (
            <Cell key={s.driverNumber} fill={s.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Constructor standings ─────────────────────────────────────────────────────
function ConstructorTable({ standings }: { standings: ConstructorStanding[] }) {
  if (standings.length === 0)
    return <div className="text-muted text-xs p-4">No data yet</div>;
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="sticky top-0 bg-track z-10 border-b border-[#38383f]">
            <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-[#636369] w-8">
              P
            </th>
            <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-[#636369]">
              Constructor
            </th>
            <th className="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-[#636369] w-16">
              Pts
            </th>
            <th className="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-[#636369] w-12 hidden sm:table-cell">
              Wins
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.name} className="border-b border-[#2a2a35]">
              <td className="py-3 px-3 font-black text-sm tabular-nums">
                {s.position}
              </td>
              <td className="py-3 px-3">
                <span className="flex items-center gap-2">
                  <span
                    className="w-[3px] h-4 shrink-0"
                    style={{ background: s.color }}
                  />
                  <span
                    className="font-black text-xs"
                    style={{ color: s.color }}
                  >
                    {s.name}
                  </span>
                </span>
              </td>
              <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-sm">
                {s.points}
              </td>
              <td className="py-3 px-3 text-right font-mono tabular-nums text-muted text-xs hidden sm:table-cell">
                {s.wins}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ConstructorChart({ standings }: { standings: ConstructorStanding[] }) {
  const maxPts = standings[0]?.points ?? 1;
  return (
    <ResponsiveContainer
      width="100%"
      height={Math.max(200, standings.length * 28)}
    >
      <BarChart
        data={standings}
        layout="vertical"
        margin={{ top: 4, right: 48, left: 8, bottom: 4 }}
        barSize={18}
      >
        <CartesianGrid horizontal={false} stroke="#2a2a35" />
        <XAxis
          type="number"
          domain={[0, maxPts]}
          tick={{ fill: "#636369", fontSize: 10 }}
          axisLine={{ stroke: "#1e2d4a" }}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: "#a3a3a3", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={0}
          hide
        />
        <Tooltip
          cursor={{ fill: "#1e2d4a33" }}
          content={<ConstructorTooltip />}
        />
        <Bar dataKey="points" radius={[0, 3, 3, 0]}>
          {standings.map((s) => (
            <Cell key={s.name} fill={s.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Standings() {
  const [yearParam, setYear] = useNumberParam("year", DEFAULT_YEAR);
  const year = yearParam ?? DEFAULT_YEAR;
  const [tab, setTab] = useStringParam<Tab>("tab", "drivers");

  const {
    driverStandings,
    constructorStandings,
    loadedRaces,
    totalRaces,
    isLoading,
    isFetching,
    isError,
  } = useStandings(year);

  return (
    <div className="flex flex-col md:h-full md:overflow-hidden bg-track">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 px-4 pt-2 pb-2 bg-surface border-b border-panel">
        <span className="text-f1red font-black text-sm tracking-[0.18em] uppercase">
          STANDINGS
        </span>

        <label className="text-[10px] font-bold uppercase tracking-widest text-muted">
          Year
        </label>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="bg-panel text-white border border-[#38383f] text-xs font-medium px-3 py-1.5 focus:outline-none"
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        {isLoading && (
          <span className="text-muted text-xs animate-pulse">
            Loading sessions…
          </span>
        )}

        {/* Tabs */}
        <div className="flex h-11 w-full sm:ml-auto sm:w-auto">
          {(["drivers", "constructors"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`h-11 flex-1 items-center justify-center px-4 text-xs font-bold uppercase tracking-[0.12em] transition-colors border-b-2 sm:flex-none ${
                tab === t
                  ? "text-white border-f1red"
                  : "text-muted border-transparent hover:text-white"
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
      {isError ? (
        <div className="flex-1">
          <ErrorMessage message="Failed to load championship data" />
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-0 md:flex-1 md:overflow-hidden">
          {tab === "drivers" ? (
            <>
              <div className="sm:w-[420px] shrink-0 sm:border-r border-b sm:border-b-0 border-panel md:overflow-auto md:max-h-full">
                <DriverTable standings={driverStandings} />
              </div>
              <div className="md:flex-1 md:overflow-auto p-4 bg-track min-h-[18rem]">
                <div className="text-[10px] text-muted font-bold mb-3 uppercase tracking-[0.12em]">
                  Points — {year} Driver Championship
                </div>
                <DriverChart standings={driverStandings} />
              </div>
            </>
          ) : (
            <>
              <div className="sm:w-[360px] shrink-0 sm:border-r border-b sm:border-b-0 border-panel md:overflow-auto md:max-h-full">
                <ConstructorTable standings={constructorStandings} />
              </div>
              <div className="md:flex-1 md:overflow-auto p-4 bg-track min-h-[18rem]">
                <div className="text-[10px] text-muted font-bold mb-3 uppercase tracking-[0.12em]">
                  Points — {year} Constructor Championship
                </div>
                <ConstructorChart standings={constructorStandings} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
