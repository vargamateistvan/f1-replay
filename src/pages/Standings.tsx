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
import { useEffect, useRef, useState } from "react";
import {
  useStandings,
  type DriverStanding,
  type ConstructorStanding,
} from "@/hooks/useStandings";
import {
  animateMotion,
  barRevealMotion,
  fadeUpMotion,
  motionEnabled,
  staggerFadeUpMotion,
  MOTION,
} from "@/lib/motion";
import { ErrorMessage } from "@/components/ErrorMessage";
import { DriverHeadshot } from "@/components/DriverHeadshot";
import { useNumberParam, useStringParam } from "@/hooks/useSearchParamState";
import { YEARS, DEFAULT_YEAR } from "@/constants";

type Tab = "drivers" | "constructors";

// ── Loading progress bar ──────────────────────────────────────────────────────
function LoadingBar({ loaded, total }: { loaded: number; total: number }) {
  const show = total !== 0;
  const pct = show ? Math.round((loaded / total) * 100) : 0;

  if (!show) return null;
  return (
    <div className="flex items-center gap-3 text-xs text-muted font-mono px-4 py-1 bg-surface border-b border-panel">
      <span>
        Loading championship data… {loaded}/{total}
      </span>
      <div className="flex-1 h-1 bg-panel rounded overflow-hidden">
        <div
          className="h-full bg-f1red transition-all duration-300"
          style={{ transformOrigin: "left center", width: `${pct}%` }}
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
        {d.pointsDelta != null && (
          <span
            className={`ml-2 text-[10px] ${
              d.pointsDelta > 0
                ? "text-emerald-400"
                : d.pointsDelta < 0
                  ? "text-red-400"
                  : "text-muted"
            }`}
          >
            {d.pointsDelta > 0 ? "+" : ""}
            {d.pointsDelta} this race
          </span>
        )}
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

function useChartBarReveal(
  root: HTMLDivElement | null,
  active: boolean,
  dependencyKey: string | number,
) {
  useEffect(() => {
    if (!active || !motionEnabled()) return;
    if (!root) return;

    const bars = root.querySelectorAll("path.recharts-rectangle");
    if (bars.length === 0) return;

    const animation = animateMotion(bars, barRevealMotion());

    return () => {
      animation?.revert();
    };
  }, [active, dependencyKey, root]);
}

// ── Driver standings ──────────────────────────────────────────────────────────
function DriverTable({ standings }: { standings: DriverStanding[] }) {
  if (standings.length === 0)
    return (
      <div className="min-h-32">
        <ErrorMessage
          message="No data found for the selected season"
          variant="empty"
        />
      </div>
    );
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="sticky top-0 bg-track z-10 border-b border-panel">
            <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted w-8">
              P
            </th>
            <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted">
              Driver
            </th>
            <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted hidden sm:table-cell">
              Team
            </th>
            <th className="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted w-16">
              Pts
            </th>
            <th className="text-right py-2 px-2 text-[10px] font-bold uppercase tracking-widest text-muted w-10 hidden sm:table-cell">
              W
            </th>
            <th className="text-right py-2 px-2 text-[10px] font-bold uppercase tracking-widest text-muted w-12 hidden sm:table-cell">
              Pds
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr
              key={s.driverNumber}
              data-standing-row
              className="border-b border-panel"
            >
              <td className="py-3 px-3 font-black text-sm tabular-nums">
                <span>{s.position}</span>
                {s.positionChange != null && s.positionChange !== 0 && (
                  <span
                    className={`ml-1 text-[10px] font-normal ${
                      s.positionChange > 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {s.positionChange > 0 ? "▲" : "▼"}
                    {Math.abs(s.positionChange)}
                  </span>
                )}
              </td>
              <td className="py-3 px-3">
                <span className="flex items-center gap-2">
                  <DriverHeadshot
                    driver={s.driver}
                    accent={s.color}
                    size="xxs"
                  />
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
                {s.pointsDelta != null && (
                  <span
                    data-standing-delta
                    className={`ml-1 text-[10px] font-normal ${
                      s.pointsDelta > 0
                        ? "text-emerald-400"
                        : s.pointsDelta < 0
                          ? "text-red-400"
                          : "text-muted"
                    }`}
                  >
                    {s.pointsDelta > 0 ? "+" : ""}
                    {s.pointsDelta}
                  </span>
                )}
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
  const [chartRoot, setChartRoot] = useState<HTMLDivElement | null>(null);
  useChartBarReveal(chartRoot, standings.length > 0, [
    standings.length,
    standings[0]?.points ?? 0,
  ].join(":"));
  return (
    <div ref={setChartRoot}>
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
          <CartesianGrid horizontal={false} stroke="rgb(var(--color-panel))" />
          <XAxis
            type="number"
            domain={[0, maxPts]}
            tick={{ fill: "rgb(var(--color-muted))", fontSize: 10 }}
            axisLine={{ stroke: "rgb(var(--color-panel))" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="acronym"
            tick={{ fill: "rgb(var(--color-muted))", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <Tooltip
            cursor={{ fill: "rgb(var(--color-panel) / 0.2)" }}
            content={<DriverTooltip />}
          />
          <Bar dataKey="points" radius={[0, 3, 3, 0]}>
            {standings.map((s) => (
              <Cell key={s.driverNumber} fill={s.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Constructor standings ─────────────────────────────────────────────────────
function ConstructorTable({ standings }: { standings: ConstructorStanding[] }) {
  if (standings.length === 0)
    return (
      <div className="min-h-32">
        <ErrorMessage
          message="No data found for the selected season"
          variant="empty"
        />
      </div>
    );
  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="sticky top-0 bg-track z-10 border-b border-panel">
            <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted w-8">
              P
            </th>
            <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted">
              Constructor
            </th>
            <th className="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted w-16">
              Pts
            </th>
            <th className="text-right py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted w-12 hidden sm:table-cell">
              Wins
            </th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr
              key={s.name}
              data-standing-row
              className="border-b border-panel"
            >
              <td className="py-3 px-3 font-black text-sm tabular-nums">
                <span>{s.position}</span>
                {s.positionChange != null && s.positionChange !== 0 && (
                  <span
                    className={`ml-1 text-[10px] font-normal ${
                      s.positionChange > 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {s.positionChange > 0 ? "▲" : "▼"}
                    {Math.abs(s.positionChange)}
                  </span>
                )}
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
                {s.pointsDelta != null && (
                  <span
                    data-standing-delta
                    className={`ml-1 text-[10px] font-normal ${
                      s.pointsDelta > 0
                        ? "text-emerald-400"
                        : s.pointsDelta < 0
                          ? "text-red-400"
                          : "text-muted"
                    }`}
                  >
                    {s.pointsDelta > 0 ? "+" : ""}
                    {s.pointsDelta}
                  </span>
                )}
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
  const [chartRoot, setChartRoot] = useState<HTMLDivElement | null>(null);
  useChartBarReveal(chartRoot, standings.length > 0, [
    standings.length,
    standings[0]?.points ?? 0,
  ].join(":"));
  return (
    <div ref={setChartRoot}>
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
          <CartesianGrid horizontal={false} stroke="rgb(var(--color-panel))" />
          <XAxis
            type="number"
            domain={[0, maxPts]}
            tick={{ fill: "rgb(var(--color-muted))", fontSize: 10 }}
            axisLine={{ stroke: "rgb(var(--color-panel))" }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: "rgb(var(--color-muted))", fontSize: 10 }}
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
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Standings() {
  const [yearParam, setYear] = useNumberParam("year", DEFAULT_YEAR);
  const year = yearParam ?? DEFAULT_YEAR;
  const [meetingKey] = useNumberParam("meeting", null);
  const [sessionKey] = useNumberParam("session", null);
  const [tab, setTab] = useStringParam<Tab>("tab", "drivers");
  const driverTableRef = useRef<HTMLDivElement>(null);
  const driverChartRef = useRef<HTMLDivElement>(null);
  const constructorTableRef = useRef<HTMLDivElement>(null);
  const constructorChartRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabIndicatorRef = useRef<HTMLSpanElement>(null);
  const tabButtonRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    drivers: null,
    constructors: null,
  });

  const {
    driverStandings,
    constructorStandings,
    loadedRaces,
    totalRaces,
    isLoading,
    isFetching,
    isError,
  } = useStandings(year, sessionKey, meetingKey);

  useEffect(() => {
    if (isFetching || isError) return;
    if (!motionEnabled()) return;

    const tableRoot =
      tab === "drivers" ? driverTableRef.current : constructorTableRef.current;
    const chartRoot =
      tab === "drivers" ? driverChartRef.current : constructorChartRef.current;
    const targets = [tableRoot, chartRoot].filter(
      (node): node is HTMLDivElement => node !== null,
    );

    if (targets.length === 0) return;

    const animations = [animateMotion(targets, fadeUpMotion())].filter(
      (animation): animation is NonNullable<typeof animation> => animation !== null,
    );

    const rows = tableRoot?.querySelectorAll("tbody tr[data-standing-row]");
    if (rows?.length) {
      const rowsAnimation = animateMotion(rows, staggerFadeUpMotion());
      if (rowsAnimation) animations.push(rowsAnimation);
    }

    return () => {
      animations.forEach((animation) => animation.revert());
    };
  }, [isError, isFetching, tab, year, driverStandings, constructorStandings]);

  useEffect(() => {
    if (!motionEnabled()) return;

    const bar = tabBarRef.current;
    const indicator = tabIndicatorRef.current;
    const button = tabButtonRefs.current[tab];
    if (!bar || !indicator || !button) return;

    const barRect = bar.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const currentRect = indicator.getBoundingClientRect();
    const targetLeft = buttonRect.left - barRect.left;
    const targetWidth = buttonRect.width;
    const currentLeft = currentRect.width ? currentRect.left - barRect.left : targetLeft;
    const currentWidth = currentRect.width || targetWidth;

    const animation = animateMotion(indicator, {
      opacity: [1, 1],
      left: [currentLeft, targetLeft],
      width: [currentWidth, targetWidth],
      duration: MOTION.duration.medium,
      ease: MOTION.easing.strong,
    });

    return () => {
      animation?.revert();
    };
  }, [tab]);

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
          className="bg-panel text-white border border-panel text-xs font-medium px-3 py-1.5 focus:outline-none"
        >
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        {isLoading && (
          <span className="text-muted text-xs">
            Loading sessions…
          </span>
        )}

        {/* Tabs */}
        <div
          ref={tabBarRef}
          className="relative flex h-11 w-full sm:ml-auto sm:w-auto"
        >
          <span
            ref={tabIndicatorRef}
            className="pointer-events-none absolute bottom-0 h-0.5 bg-f1red"
            style={{ left: 0, width: 0 }}
          />
          {(["drivers", "constructors"] as Tab[]).map((t) => (
            <button
              key={t}
              ref={(node) => {
                tabButtonRefs.current[t] = node;
              }}
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
        <div className="grid w-full gap-0 md:grid-cols-[minmax(300px,420px)_minmax(0,1fr)] md:flex-1 md:overflow-hidden">
          {tab === "drivers" ? (
            <>
              <div
                ref={driverTableRef}
                className="w-full shrink-0 border-b border-panel md:border-r md:border-b-0 md:overflow-auto md:max-h-full"
              >
                <DriverTable standings={driverStandings} />
              </div>
              <div
                ref={driverChartRef}
                className="min-w-0 md:overflow-auto p-4 bg-track min-h-[18rem]"
              >
                <div className="text-[10px] text-muted font-bold mb-3 uppercase tracking-[0.12em]">
                  Points — {year} Driver Championship
                </div>
                <DriverChart standings={driverStandings} />
              </div>
            </>
          ) : (
            <>
              <div
                ref={constructorTableRef}
                className="w-full shrink-0 border-b border-panel md:border-r md:border-b-0 md:overflow-auto md:max-h-full"
              >
                <ConstructorTable standings={constructorStandings} />
              </div>
              <div
                ref={constructorChartRef}
                className="min-w-0 md:overflow-auto p-4 bg-track min-h-[18rem]"
              >
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
