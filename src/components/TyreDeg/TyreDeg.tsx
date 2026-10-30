import { Fragment, useMemo, useState } from "react";
import {
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Driver, Lap, Pit, Stint } from "@/api/types";
import { CompoundRing } from "@/components/LiveTiming/TyreBadge";
import {
  COMPOUND_COLORS,
  RACE_PACE_DEG_HIGH,
  RACE_PACE_DEG_LOW,
  RACE_PACE_FUEL_S_PER_LAP,
  RACE_PACE_NOISY_R2,
} from "@/constants";
import { teamColor } from "@/utils/color";
import {
  cleanRaceLaps,
  compoundPaceSummary,
  fitStintPace,
  type NeutralisedWindow,
  type PaceLap,
  type StintPace,
} from "@/utils/racePace";
import { TOKEN_HEX } from "@/designTokens";

/** Most drivers plotted at once; more turns the scatter into noise. */
const MAX_SELECTED = 4;
/** Line style per selected driver, so teammates (same colour) stay apart. */
const DRIVER_DASHES = ["", "6 3", "2 3", "10 3 2 3"];
/** Degradation that fills the table's bar (s/lap). */
const DEG_BAR_FULL = 0.15;

const DEG_COLORS = { gentle: "#22c55e", moderate: TOKEN_HEX.orange, heavy: TOKEN_HEX.f1red };

interface Props {
  readonly drivers: Driver[];
  readonly laps: Lap[];
  readonly stints: Stint[];
  readonly pits: Pit[];
  readonly neutralised: NeutralisedWindow[];
  readonly sessionStartMs: number;
  /** Playhead (session ms); laps finishing after it are never shown. */
  readonly sessionTimeMs: number;
  readonly focusDriver?: number | null;
  /** Race position per driver at the playhead; rows follow it when given. */
  readonly positionByDriver?: ReadonlyMap<number, number> | null;
}

// Tyre degradation: lap time against tyre age for each stint, with a fitted
// slope (s/lap). Built from the laps/stints/pits already loaded for the page.
export function TyreDeg({
  drivers,
  laps,
  stints,
  pits,
  neutralised,
  sessionStartMs,
  sessionTimeMs,
  focusDriver = null,
  positionByDriver = null,
}: Props) {
  const [fuelCorrected, setFuelCorrected] = useState(false);
  const [picked, setPicked] = useState<number[] | null>(null);

  const fits = useMemo(() => {
    const paceLaps = cleanRaceLaps({
      laps,
      stints,
      pits,
      neutralised,
      sessionStartMs,
      cutoffMs: sessionTimeMs,
    });
    return fitStintPace(paceLaps, {
      fuelSPerLap: fuelCorrected ? RACE_PACE_FUEL_S_PER_LAP : 0,
    });
  }, [laps, stints, pits, neutralised, sessionStartMs, sessionTimeMs, fuelCorrected]);

  // Noisy fits (traffic, fuel-dominated stints) would skew the field summary.
  const compounds = useMemo(
    () => compoundPaceSummary(fits.filter((f) => f.r2 >= RACE_PACE_NOISY_R2)),
    [fits],
  );

  const driverByNumber = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  );

  // Drivers by race position (else the drivers list), each with their stints in order.
  const groups = useMemo(() => {
    const listOrder = new Map(drivers.map((d, i) => [d.driver_number, i]));
    const rank = (driverNumber: number) =>
      positionByDriver?.get(driverNumber) ?? 1000 + (listOrder.get(driverNumber) ?? 0);
    const byDriver = new Map<number, StintPace[]>();
    for (const fit of fits) {
      byDriver.set(fit.driverNumber, [...(byDriver.get(fit.driverNumber) ?? []), fit]);
    }
    return [...byDriver.entries()]
      .sort(([a], [b]) => rank(a) - rank(b))
      .map(([driverNumber, driverFits]) => ({ driverNumber, fits: driverFits }));
  }, [fits, drivers, positionByDriver]);

  const selected = useMemo(() => {
    if (picked) return picked;
    if (focusDriver !== null && fits.some((f) => f.driverNumber === focusDriver)) {
      return [focusDriver];
    }
    return groups[0] ? [groups[0].driverNumber] : [];
  }, [picked, focusDriver, fits, groups]);

  const toggleDriver = (driverNumber: number) => {
    setPicked(
      selected.includes(driverNumber)
        ? selected.filter((n) => n !== driverNumber)
        : [...selected, driverNumber].slice(-MAX_SELECTED),
    );
  };

  const colorOf = (driverNumber: number) =>
    teamColor(driverByNumber.get(driverNumber)?.team_colour);
  const acronymOf = (driverNumber: number) =>
    driverByNumber.get(driverNumber)?.name_acronym ?? String(driverNumber);

  const plotted = fits.filter((f) => selected.includes(f.driverNumber));

  if (fits.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[120px] px-4 text-center text-muted text-sm">
        Not enough clean green-flag laps yet to measure tyre degradation
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {compounds.length > 0 && (
        <div
          className="grid shrink-0 gap-px border-b border-panel bg-panel"
          style={{
            gridTemplateColumns: `repeat(${Math.min(Math.max(compounds.length, 1), 3)}, minmax(0, 1fr))`,
          }}
        >
          {compounds.map((c) => (
            <div key={c.compound} className="min-w-0 bg-track px-2 py-2 sm:px-3">
              <div className="flex items-center gap-1.5 text-tiny font-bold uppercase tracking-caps text-muted">
                <CompoundRing compound={c.compound} size="sm" />
                <span className="truncate">{compoundName(c.compound)}</span>
                <span className="ml-auto font-mono tracking-normal" title="Stints measured">
                  {c.stints}
                </span>
              </div>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span
                  className="font-mono text-base font-black tabular-nums leading-none"
                  style={{ color: degColor(c.medianDegSPerLap) }}
                >
                  {formatDeg(c.medianDegSPerLap)}
                </span>
                <span className="text-caption text-muted">
                  s/lap<span className="hidden sm:inline"> median</span>
                </span>
              </div>
              <div className="mt-1 truncate text-caption text-muted">
                Best{" "}
                <span className="font-bold" style={{ color: colorOf(c.best.driverNumber) }}>
                  {acronymOf(c.best.driverNumber)}
                </span>{" "}
                <span className="font-mono tabular-nums">{formatDeg(c.best.degSPerLap)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-1.5 border-b border-panel bg-track px-2 py-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {selected.length === 0 && (
            <span className="text-caption text-muted">Pick drivers below to plot them</span>
          )}
          {selected.map((driverNumber, i) => (
            <button
              key={driverNumber}
              type="button"
              onClick={() => toggleDriver(driverNumber)}
              className="flex h-5 items-center gap-1 border border-panel bg-surface px-1.5 text-caption font-black transition-colors hover:border-fg/30"
              aria-label={`Remove ${acronymOf(driverNumber)} from chart`}
            >
              <svg width="16" height="6" aria-hidden="true">
                <line
                  x1="0"
                  y1="3"
                  x2="16"
                  y2="3"
                  stroke={colorOf(driverNumber)}
                  strokeWidth="2"
                  strokeDasharray={DRIVER_DASHES[i]}
                />
              </svg>
              <span style={{ color: colorOf(driverNumber) }}>{acronymOf(driverNumber)}</span>
              <span className="text-muted" aria-hidden="true">
                ×
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setFuelCorrected((v) => !v)}
          aria-pressed={fuelCorrected}
          className={`h-5 shrink-0 px-2 text-tiny font-black uppercase tracking-widest border transition-colors ${
            fuelCorrected
              ? "border-f1red bg-f1red text-white"
              : "border-panel bg-track text-muted hover:text-fg"
          }`}
          title={`Add back ${RACE_PACE_FUEL_S_PER_LAP} s/lap for fuel burn, which hides part of the tyre wear`}
        >
          Fuel corr.
        </button>
      </div>

      <div className="h-[220px] shrink-0 bg-sunken">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="rgb(var(--color-panel))" />
            <XAxis
              type="number"
              dataKey="tyreAge"
              name="Tyre age"
              allowDecimals={false}
              domain={["dataMin", "dataMax"]}
              tick={{ fill: TOKEN_HEX.faint, fontSize: 10 }}
              axisLine={{ stroke: "rgb(var(--color-panel))" }}
              tickLine={false}
            />
            <YAxis
              type="number"
              dataKey="lapS"
              name="Lap time"
              domain={["auto", "auto"]}
              width={40}
              tickFormatter={(v: number) => v.toFixed(1)}
              tick={{ fill: TOKEN_HEX.faint, fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={false}
              content={<DegTooltip acronymOf={acronymOf} colorOf={colorOf} />}
            />
            {plotted.map((fit) => (
              <Scatter
                key={`${fit.driverNumber}-${fit.stintNumber}`}
                data={fit.laps}
                fill={COMPOUND_COLORS[fit.compound]}
                stroke={colorOf(fit.driverNumber)}
                strokeWidth={1.5}
                isAnimationActive={false}
              />
            ))}
            {plotted.map((fit) => (
              <ReferenceLine
                key={`fit-${fit.driverNumber}-${fit.stintNumber}`}
                segment={fitSegment(fit)}
                stroke={colorOf(fit.driverNumber)}
                strokeWidth={2}
                strokeDasharray={DRIVER_DASHES[selected.indexOf(fit.driverNumber)]}
                ifOverflow="extendDomain"
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <div className="min-h-0 overflow-y-auto md:panel-scroll">
        <table className="w-full text-small tabular-nums">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-panel text-tiny uppercase tracking-widest text-muted">
              <th className="px-2 py-1.5 pl-3 text-left font-bold">Driver</th>
              <th className="px-2 py-1.5 text-left font-bold">Stint</th>
              <th className="px-2 py-1.5 text-right font-bold">Laps</th>
              <th className="px-2 py-1.5 text-right font-bold">Deg s/lap</th>
              <th className="hidden px-2 py-1.5 text-right font-bold sm:table-cell">Base</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(({ driverNumber, fits: driverFits }) => {
              const isSelected = selected.includes(driverNumber);
              const color = colorOf(driverNumber);
              const position = positionByDriver?.get(driverNumber);
              return (
                <Fragment key={driverNumber}>
                  {driverFits.map((fit, i) => {
                    const noisy = fit.r2 < RACE_PACE_NOISY_R2;
                    return (
                      <tr
                        key={fit.stintNumber}
                        onClick={() => toggleDriver(driverNumber)}
                        aria-selected={isSelected}
                        className={`cursor-pointer transition-colors ${
                          i === driverFits.length - 1 ? "border-b border-panel" : ""
                        } ${isSelected ? "bg-surface text-fg" : "text-fg/70 hover:bg-surface"}`}
                        style={{ boxShadow: `inset ${isSelected ? 4 : 2}px 0 0 ${color}` }}
                      >
                        <td className="px-2 py-1 pl-3 font-black">
                          {i === 0 && (
                            <span className="flex items-center gap-1.5">
                              {position !== undefined && (
                                <span className="w-4 font-mono text-caption text-muted">
                                  {position}
                                </span>
                              )}
                              <span style={{ color: isSelected ? color : undefined }}>
                                {acronymOf(driverNumber)}
                              </span>
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1">
                          <span className="flex items-center gap-1.5">
                            <CompoundRing compound={fit.compound} size="sm" />
                            <span className="font-mono text-caption text-muted">
                              L{fit.laps[0]!.lapNumber}–{fit.laps.at(-1)!.lapNumber}
                            </span>
                          </span>
                        </td>
                        <td className="px-2 py-1 text-right font-mono">{fit.laps.length}</td>
                        <td className="px-2 py-1 text-right">
                          <span
                            className={`inline-flex items-center justify-end gap-1.5 ${noisy ? "opacity-50" : ""}`}
                            title={noisy ? "Noisy fit: lap times barely follow tyre age" : undefined}
                          >
                            <DegBar degSPerLap={fit.degSPerLap} />
                            <span className="w-11 font-mono font-bold">
                              {formatDeg(fit.degSPerLap)}
                            </span>
                          </span>
                        </td>
                        <td className="hidden px-2 py-1 text-right font-mono text-muted sm:table-cell">
                          {fit.baseS.toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DegBar({ degSPerLap }: { degSPerLap: number }) {
  const width = Math.min(1, Math.max(0, degSPerLap) / DEG_BAR_FULL) * 100;
  return (
    <span className="relative h-1.5 w-10 bg-panel sm:w-14" aria-hidden="true">
      <span
        className="absolute inset-y-0 left-0"
        style={{ width: `${width}%`, backgroundColor: degColor(degSPerLap) }}
      />
    </span>
  );
}

function degColor(degSPerLap: number): string {
  if (degSPerLap <= RACE_PACE_DEG_LOW) return DEG_COLORS.gentle;
  if (degSPerLap <= RACE_PACE_DEG_HIGH) return DEG_COLORS.moderate;
  return DEG_COLORS.heavy;
}

function fitSegment(fit: StintPace): [{ x: number; y: number }, { x: number; y: number }] {
  const ages = fit.laps.map((l) => l.tyreAge);
  const from = Math.min(...ages);
  const to = Math.max(...ages);
  return [
    { x: from, y: fit.baseS + fit.degSPerLap * from },
    { x: to, y: fit.baseS + fit.degSPerLap * to },
  ];
}

function formatDeg(degSPerLap: number): string {
  const rounded = Math.round(degSPerLap * 1000) / 1000;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(3)}`;
}

function compoundName(compound: Stint["compound"]): string {
  return compound.charAt(0) + compound.slice(1).toLowerCase();
}

function formatLapTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${s}` : s;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: PaceLap }>;
  acronymOf: (driverNumber: number) => string;
  colorOf: (driverNumber: number) => string;
}
function DegTooltip({ active, payload, acronymOf, colorOf }: TooltipProps) {
  const lap = payload?.[0]?.payload;
  if (!active || !lap) return null;
  return (
    <div className="bg-surface border border-panel px-2 py-1.5 shadow-xl">
      <div className="flex items-center gap-1.5 text-small font-black">
        <span style={{ color: colorOf(lap.driverNumber) }}>{acronymOf(lap.driverNumber)}</span>
        <CompoundRing compound={lap.compound} size="sm" />
        <span className="text-tiny uppercase tracking-widest text-muted">Lap {lap.lapNumber}</span>
      </div>
      <div className="mt-0.5 font-mono text-small tabular-nums text-fg/90">
        {formatLapTime(lap.lapS)}
        <span className="ml-1.5 text-muted">age {lap.tyreAge}</span>
      </div>
    </div>
  );
}
