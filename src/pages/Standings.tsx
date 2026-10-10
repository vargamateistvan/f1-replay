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
import { useEffect, useMemo, useRef, useState } from "react";
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
  tabSwapMotion,
  staggerFadeUpMotion,
  MOTION,
} from "@/lib/motion";
import { ErrorMessage } from "@/components/ErrorMessage";
import { DriverHeadshot } from "@/components/DriverHeadshot";
import {
  PointsProgressionChart,
  type ProgressionSeries,
} from "@/components/PointsProgression/PointsProgressionChart";
import { TitleOutlookBanner } from "@/components/TitleOutlook/TitleOutlookBanner";
import { TeammateComparison } from "@/components/TeammateComparison/TeammateComparison";
import { ResultsGrid } from "@/components/ResultsGrid/ResultsGrid";
import type { TitleOutlook } from "@/utils/championship";
import { useSearchParams } from "react-router-dom";
import { useNumberParam, useStringParam } from "@/hooks/useSearchParamState";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { replaceHistorySearchParams } from "@/utils/url";
import { YEARS, DEFAULT_YEAR } from "@/constants";
import { ChevronDown } from "lucide-react";
import {
  PICKER_BAR,
  PICKER_CHEVRON,
  PICKER_FIELD_LABEL,
  PICKER_SELECT,
} from "@/components/Nav/pickerStyles";

type Tab = "drivers" | "constructors" | "results" | "teammates";
type ChartView = "totals" | "progression";

const TABS: Tab[] = ["drivers", "constructors", "results", "teammates"];
const CHART_VIEWS: ChartView[] = ["totals", "progression"];
// Shorter labels so all four tabs fit a phone-width tab bar.
const TAB_SHORT_LABEL: Partial<Record<Tab, string>> = { constructors: "teams" };

const TITLE_LABEL: Record<TitleOutlook["status"], string> = {
  champion: "Champion",
  leader: "Championship leader",
  contender: "Can still win the title",
  eliminated: "Out of title contention",
};

function TitleLine({ title }: { title?: TitleOutlook }) {
  if (!title) return null;
  return (
    <div
      className={
        title.status === "eliminated" ? "text-muted" : "text-amber-300"
      }
    >
      {TITLE_LABEL[title.status]}
      {title.status === "contender" || title.status === "leader"
        ? ` · max ${title.maxPoints}`
        : ""}
    </div>
  );
}

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
      <TitleLine title={d.title} />
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
      <TitleLine title={c.title} />
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
            {/* In the md+ split layout the panel is ≤420px; the team moves under the name. */}
            <th className="text-left py-2 px-3 text-[10px] font-bold uppercase tracking-widest text-muted hidden sm:table-cell md:hidden">
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
                  <span className="hidden sm:flex flex-col leading-tight">
                    <span className="text-muted text-xs">{s.fullName}</span>
                    <span className="hidden md:block text-muted/70 text-[10px]">
                      {s.team}
                    </span>
                  </span>
                </span>
              </td>
              <td className="py-3 px-3 text-muted text-xs hidden sm:table-cell md:hidden">
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
  const isMobileViewport = useMediaQuery("(max-width: 767px)");
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
          margin={{
            top: 4,
            right: isMobileViewport ? 16 : 48,
            left: isMobileViewport ? 0 : 56,
            bottom: 4,
          }}
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

// ── Chart header ──────────────────────────────────────────────────────────────
function ChartHeader({
  title,
  view,
  onChange,
}: {
  title: string;
  view: ChartView;
  onChange: (view: ChartView) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="min-w-0 text-[10px] text-muted font-bold uppercase tracking-[0.12em]">
        Points — {title}
      </div>
      <div className="flex" role="group" aria-label="Chart view">
        {CHART_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            aria-pressed={view === v}
            onClick={() => onChange(v)}
            className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
              view === v
                ? "border-f1red bg-f1red text-white"
                : "border-panel bg-track text-muted hover:text-white"
            }`}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Standings() {
  const [, setSearchParams] = useSearchParams();
  const [yearParam] = useNumberParam("year", DEFAULT_YEAR);
  const year = yearParam ?? DEFAULT_YEAR;
  const [meetingKey] = useNumberParam("meeting", null);
  const [sessionKey] = useNumberParam("session", null);
  // meeting/session belong to the previous year; drop them in the same update
  // so the new year's latest race drives the standings.
  const setYear = (next: number) => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("year", String(next));
        p.delete("meeting");
        p.delete("session");
        replaceHistorySearchParams(p);
        return p;
      },
      { replace: true },
    );
  };
  const [tabParam, setTab] = useStringParam<Tab>("tab", "drivers");
  const tab: Tab = TABS.includes(tabParam) ? tabParam : "drivers";
  const [chartParam, setChartView] = useStringParam<ChartView>(
    "chart",
    "totals",
  );
  const chartView: ChartView = CHART_VIEWS.includes(chartParam)
    ? chartParam
    : "totals";
  const teammatesRef = useRef<HTMLDivElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const driverTableRef = useRef<HTMLDivElement>(null);
  const driverChartRef = useRef<HTMLDivElement>(null);
  const constructorTableRef = useRef<HTMLDivElement>(null);
  const constructorChartRef = useRef<HTMLDivElement>(null);
  const contentGridRef = useRef<HTMLDivElement>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabIndicatorRef = useRef<HTMLSpanElement>(null);
  const tabButtonRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    drivers: null,
    constructors: null,
    results: null,
    teammates: null,
  });

  const {
    driverStandings,
    constructorStandings,
    driverProgression,
    constructorProgression,
    remaining,
    teammates,
    resultsGrid,
    qualifyingLoading,
    loadedRaces,
    totalRaces,
    isLoading,
    isFetching,
    isError,
  } = useStandings(year, sessionKey, meetingKey, {
    includeQualifying: tab === "teammates",
    includeResultMarkers: tab === "results",
  });

  const tabCounts: Record<Tab, { count: number; unit: string }> = {
    drivers: { count: driverStandings.length, unit: "drivers" },
    constructors: { count: constructorStandings.length, unit: "teams" },
    results: { count: resultsGrid.rounds.length, unit: "rounds" },
    teammates: { count: teammates.length, unit: "pairs" },
  };

  const driverSeries = useMemo<ProgressionSeries[]>(() => {
    const seenTeams = new Set<string>();
    return driverStandings.map((d) => {
      const dashed = seenTeams.has(d.team);
      seenTeams.add(d.team);
      return {
        key: `d${d.driverNumber}`,
        label: d.acronym,
        color: d.color,
        dashed,
        values: driverProgression.totals.get(d.driverNumber) ?? [],
      };
    });
  }, [driverStandings, driverProgression]);

  // Index-based keys: team names may contain "." which Recharts reads as a path.
  const constructorSeries = useMemo<ProgressionSeries[]>(
    () =>
      constructorStandings.map((c, i) => ({
        key: `c${i}`,
        label: c.name,
        color: c.color,
        values: constructorProgression.totals.get(c.name) ?? [],
      })),
    [constructorStandings, constructorProgression],
  );

  useEffect(() => {
    if (isFetching || isError) return;
    if (!motionEnabled()) return;

    const tableRoot =
      tab === "drivers"
        ? driverTableRef.current
        : tab === "constructors"
          ? constructorTableRef.current
          : tab === "results"
            ? resultsRef.current
            : teammatesRef.current;
    const chartRoot =
      tab === "drivers"
        ? driverChartRef.current
        : tab === "constructors"
          ? constructorChartRef.current
          : null;
    const targets = [tableRoot, chartRoot].filter(
      (node): node is HTMLDivElement => node !== null,
    );

    if (targets.length === 0) return;

    const animations = [animateMotion(targets, fadeUpMotion())].filter(
      (animation): animation is NonNullable<typeof animation> => animation !== null,
    );

    const rows = tableRoot?.querySelectorAll("[data-standing-row]");
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
    const animation = animateMotion(
      contentGridRef.current,
      tabSwapMotion({
        opacity: [0.45, 1],
        translateY: [18, 0],
        scale: [0.992, 1],
        duration: MOTION.duration.panel,
      }),
    );
    return () => {
      animation?.revert();
    };
  }, [tab, year]);

  useEffect(() => {
    const bar = tabBarRef.current;
    const button = tabButtonRefs.current[tab];
    if (!bar || !button || bar.scrollWidth <= bar.clientWidth) return;
    const start = button.offsetLeft;
    const end = start + button.offsetWidth;
    if (start < bar.scrollLeft) bar.scrollLeft = start;
    else if (end > bar.scrollLeft + bar.clientWidth)
      bar.scrollLeft = end - bar.clientWidth;
  }, [tab]);

  useEffect(() => {
    if (!motionEnabled()) return;

    const bar = tabBarRef.current;
    const indicator = tabIndicatorRef.current;
    const button = tabButtonRefs.current[tab];
    if (!bar || !indicator || !button) return;

    // The bar may scroll horizontally on narrow screens; offsets are measured
    // in its scrolled content space.
    const barRect = bar.getBoundingClientRect();
    const buttonRect = button.getBoundingClientRect();
    const currentRect = indicator.getBoundingClientRect();
    const targetLeft = buttonRect.left - barRect.left + bar.scrollLeft;
    const targetWidth = buttonRect.width;
    const currentLeft = currentRect.width
      ? currentRect.left - barRect.left + bar.scrollLeft
      : targetLeft;
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
      {/* Picker bar — same styles as the race pages' session picker */}
      <div className={PICKER_BAR}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:px-4">
          <label className="flex items-center gap-1">
            <span className={PICKER_FIELD_LABEL}>Year</span>
            <span className="relative inline-block">
              <select
                aria-label="Season year"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className={`${PICKER_SELECT} w-[4.75rem]`}
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <ChevronDown aria-hidden="true" className={PICKER_CHEVRON} />
            </span>
          </label>

          {isLoading && (
            <span className={PICKER_FIELD_LABEL}>Loading sessions…</span>
          )}
        </div>
      </div>

      {/* Sub-tabs — same pattern as the Commentary tabs */}
      <div
        ref={tabBarRef}
        role="tablist"
        aria-label="Standings view"
        className="relative flex w-full shrink-0 overflow-x-auto overflow-y-hidden border-b border-panel bg-track [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <span
          ref={tabIndicatorRef}
          className="pointer-events-none absolute bottom-0 h-0.5 bg-f1red"
          style={{ left: 0, width: 0 }}
        />
        {TABS.map((t) => (
          <button
            key={t}
            ref={(node) => {
              tabButtonRefs.current[t] = node;
            }}
            type="button"
            role="tab"
            aria-selected={tab === t}
            aria-label={t}
            onClick={() => setTab(t)}
            className={`flex-1 shrink-0 whitespace-nowrap border-b-2 px-1.5 py-2 text-[10px] font-bold uppercase tracking-wider transition-colors sm:flex-none sm:px-4 sm:text-[11px] ${
              tab === t
                ? "text-white border-f1red"
                : "text-muted border-transparent hover:text-white"
            }`}
          >
            {TAB_SHORT_LABEL[t] ? (
              <>
                <span className="block sm:hidden">{TAB_SHORT_LABEL[t]}</span>
                <span className="hidden sm:block">{t}</span>
              </>
            ) : (
              <span className="block">{t}</span>
            )}
            <span
              className={`mt-1 block font-mono text-[9px] leading-none tabular-nums ${
                tab === t ? "text-white/70" : "text-muted/80"
              }`}
            >
              {tabCounts[t].count}
              <span className="hidden sm:inline"> {tabCounts[t].unit}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Progress bar while race results are loading */}
      {isFetching && <LoadingBar loaded={loadedRaces} total={totalRaces} />}

      {/* Content */}
      {isError ? (
        <div className="flex-1">
          <ErrorMessage message="Failed to load championship data" />
        </div>
      ) : tab === "results" ? (
        <div
          ref={resultsRef}
          className="w-full md:flex md:min-h-0 md:flex-1 md:flex-col md:overflow-hidden"
        >
          <ResultsGrid
            rounds={resultsGrid.rounds}
            cells={resultsGrid.cells}
            standings={driverStandings}
            loading={isFetching}
          />
        </div>
      ) : tab === "teammates" ? (
        <div
          ref={teammatesRef}
          className="w-full md:flex-1 md:overflow-auto"
        >
          <TeammateComparison
            comparisons={teammates}
            qualifyingLoading={qualifyingLoading}
          />
        </div>
      ) : (
        <>
          {tab === "drivers" ? (
            <TitleOutlookBanner
              scope="driver"
              remaining={remaining}
              entries={driverStandings.map((d) => ({
                key: String(d.driverNumber),
                label: d.acronym,
                color: d.color,
                points: d.points,
                title: d.title,
              }))}
            />
          ) : (
            <TitleOutlookBanner
              scope="team"
              remaining={remaining}
              entries={constructorStandings.map((c) => ({
                key: c.name,
                label: c.name,
                color: c.color,
                points: c.points,
                title: c.title,
              }))}
            />
          )}
          <div
            ref={contentGridRef}
            className="grid w-full gap-0 md:grid-cols-[minmax(300px,420px)_minmax(0,1fr)] md:flex-1 md:overflow-hidden"
          >
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
                  <ChartHeader
                    title={`${year} Driver Championship`}
                    view={chartView}
                    onChange={setChartView}
                  />
                  {chartView === "progression" ? (
                    <PointsProgressionChart
                      rounds={driverProgression.rounds}
                      series={driverSeries}
                      loading={isFetching}
                    />
                  ) : (
                    <DriverChart standings={driverStandings} />
                  )}
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
                  <ChartHeader
                    title={`${year} Constructor Championship`}
                    view={chartView}
                    onChange={setChartView}
                  />
                  {chartView === "progression" ? (
                    <PointsProgressionChart
                      rounds={constructorProgression.rounds}
                      series={constructorSeries}
                      loading={isFetching}
                    />
                  ) : (
                    <ConstructorChart standings={constructorStandings} />
                  )}
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
