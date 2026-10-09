import { Fragment, useMemo } from "react";
import { ZoomIn } from "lucide-react";
import { CORNER_FOCUS_PADDING_M, CORNER_ZONE_COLORS } from "@/constants";
import type { TelemetrySample } from "@/hooks/useCarDataForLap";
import { useSettings } from "@/stores/settings";
import {
  alignLap,
  analyzeCornerZone,
  buildLapSegments,
  cornerZoneLabel,
  segmentDeltas,
  summarizeSegmentDeltas,
  withLapStart,
  type CornerDriverMetrics,
  type DeltaSummary,
  type LapSegment,
  type LapTiming,
} from "@/utils/cornerAnalysis";
import { cornerSpeedLabel, type CornerZone } from "@/utils/corners";
import {
  shortDistanceUnitLabel,
  speedUnitLabel,
  toDisplayShortDistanceM,
  toDisplaySpeed,
} from "@/utils/units";
import { focusTelemetryCharts } from "@/components/TelemetryChart/sync";

export interface CornerAnalysisLap {
  key: string;
  label: string;
  lapNo: number | null;
  color: string;
  samples: readonly TelemetrySample[];
  /** Official lap/sector times, used to anchor the lap to the timing lines. */
  timing: LapTiming;
}

interface Props {
  zones: readonly CornerZone[];
  /** Laps to compare; the first entry is the reference for all deltas. */
  laps: readonly CornerAnalysisLap[];
  onHoverDistance?: (distance: number | null) => void;
  /** Called after the charts are zoomed to a segment (e.g. to scroll them into view). */
  onFocusSegment?: () => void;
}

interface ComparedLap {
  lap: CornerAnalysisLap;
  deltas: (number | null)[];
  summary: DeltaSummary;
}

type CornerSegment = LapSegment & { zone: CornerZone };

const PANEL = "bg-surface border border-panel";
const PANEL_TITLE =
  "text-[10px] font-bold text-muted px-3 py-2 border-b border-panel uppercase tracking-[0.12em] border-l-2 border-l-f1red bg-track";
const TH = "whitespace-nowrap px-2 py-1 text-right sm:px-3";
const TD = "whitespace-nowrap px-2 py-1 text-right tabular-nums sm:px-3";
const BEST = "text-[#b48ead] font-bold";
const GAIN = "text-[#3fd35a]";
const LOSS = "text-[#ff8a8a]";
const STRIP_W = 1000;
const STRIP_H = 40;
const STRIP_HALF = STRIP_H / 2 - 2;
// One car_data sample at ~300 km/h covers roughly this many metres.
const SAMPLE_SPACING_M = 20;

function formatDelta(delta: number | null | undefined): string {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) return "—";
  if (Math.abs(delta) < 0.0005) return "0.000";
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(3)}`;
}

function deltaClass(delta: number | null | undefined): string {
  if (
    delta === null ||
    delta === undefined ||
    !Number.isFinite(delta) ||
    Math.abs(delta) < 0.0005
  ) {
    return "text-muted";
  }
  return delta < 0 ? GAIN : LOSS;
}

const NO_BEST: ReadonlySet<number> = new Set();

/**
 * Indices of the best value (ties included) after rounding to display
 * precision, or an empty set when fewer than two laps have a value.
 */
function bestIndices(
  values: readonly (number | null | undefined)[],
  better: (a: number, b: number) => boolean,
  quantize: (value: number) => number = Math.round,
): ReadonlySet<number> {
  const valid = values
    .map((value, index) => ({ value, index }))
    .filter(
      (entry): entry is { value: number; index: number } =>
        entry.value !== null &&
        entry.value !== undefined &&
        Number.isFinite(entry.value),
    )
    .map(({ value, index }) => ({ value: quantize(value), index }));
  if (valid.length < 2) return NO_BEST;

  let bestValue = valid[0]!.value;
  for (const { value } of valid) if (better(value, bestValue)) bestValue = value;
  return new Set(valid.filter((e) => e.value === bestValue).map((e) => e.index));
}

const higher = (a: number, b: number) => a > b;
const lower = (a: number, b: number) => a < b;
const toMs = (seconds: number) => Math.round(seconds * 1000);

export function CornerAnalysis({
  zones,
  laps,
  onHoverDistance,
  onFocusSegment,
}: Props) {
  const metricSystem = useSettings((s) => s.metricSystem);
  const speedUnit = speedUnitLabel(metricSystem);
  const distUnit = shortDistanceUnitLabel(metricSystem);
  const reference = laps[0];

  // Every lap is mapped onto the reference lap's distance axis (which is the
  // charts' axis), anchored at the timing line at both ends of the lap.
  const alignment = useMemo(() => {
    if (!reference) return null;
    const ref = alignLap(reference.samples, reference.timing);
    if (!ref) return null;
    const samples = laps.map((lap, index) =>
      index === 0
        ? ref.samples
        : (alignLap(lap.samples, lap.timing, ref)?.samples ??
          withLapStart(lap.samples)),
    );
    return { ref, samples };
  }, [laps, reference]);

  const lapStart = alignment?.ref.startDistance ?? 0;
  const lapEnd = alignment?.ref.finishDistance ?? 0;
  const lapSpan = Math.max(1e-6, lapEnd - lapStart);

  const segments = useMemo(
    () => buildLapSegments(zones, lapEnd, lapStart),
    [zones, lapEnd, lapStart],
  );
  const cornerSegments = useMemo(
    () => segments.filter((s): s is CornerSegment => s.zone !== null),
    [segments],
  );

  const metrics = useMemo(
    () =>
      cornerSegments.map((segment) => {
        const lapSamples = alignment?.samples ?? [];
        const refMetrics = lapSamples[0]
          ? analyzeCornerZone(segment.zone, lapSamples[0])
          : null;
        return lapSamples.map((samples, index) =>
          index === 0
            ? refMetrics
            : analyzeCornerZone(segment.zone, samples, refMetrics?.minSpeedDist),
        );
      }),
    [cornerSegments, alignment],
  );

  const compared = useMemo<ComparedLap[]>(() => {
    if (!alignment) return [];
    const [refSamples, ...others] = alignment.samples;
    return others.map((samples, index) => {
      const deltas = segmentDeltas(segments, refSamples!, samples);
      return {
        lap: laps[index + 1]!,
        deltas,
        summary: summarizeSegmentDeltas(segments, deltas),
      };
    });
  }, [alignment, laps, segments]);

  const segmentIndexByKey = useMemo(
    () => new Map(segments.map((segment, index) => [segment.key, index])),
    [segments],
  );

  const maxAbsDelta = useMemo(() => {
    let max = 0;
    for (const row of compared) {
      for (const delta of row.deltas) {
        if (delta !== null && Number.isFinite(delta)) {
          max = Math.max(max, Math.abs(delta));
        }
      }
    }
    return max;
  }, [compared]);

  if (!reference || !alignment || cornerSegments.length === 0) return null;

  const focusSegment = (segment: LapSegment) => {
    focusTelemetryCharts(
      Math.max(0, segment.startDistance - CORNER_FOCUS_PADDING_M),
      segment.endDistance + CORNER_FOCUS_PADDING_M,
    );
    onFocusSegment?.();
  };

  const fmtSpeed = (kmh: number | undefined) =>
    kmh === undefined
      ? "—"
      : Math.round(toDisplaySpeed(kmh, metricSystem)).toString();
  const fmtDist = (m: number | null | undefined) =>
    m === null || m === undefined
      ? null
      : `${Math.round(toDisplayShortDistanceM(m, metricSystem))} ${distUnit}`;

  const brakeText = (m: CornerDriverMetrics | null) => {
    if (!m) return "—";
    if (m.isFlat) return "Flat";
    return fmtDist(m.brakeBeforeApexM) ?? "Lift";
  };

  return (
    <div className={PANEL} data-testid="corner-analysis">
      <div className={PANEL_TITLE}>
        Corner analysis
        <span className="ml-2 font-normal normal-case tracking-normal text-muted">
          {laps.length > 1 ? `Δ vs ${reference.label} · − = faster · ` : ""}
          click a corner to zoom the charts
        </span>
      </div>

      {compared.length > 0 && (
        <div className="space-y-2 border-b border-panel px-3 py-2">
          {compared.map(({ lap, deltas, summary }) => {
            const gainIdx = summary.biggestGainIndex;
            const lossIdx = summary.biggestLossIndex;
            return (
              <div key={lap.key} className="space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] uppercase tracking-[0.1em] text-muted">
                  <span className="font-black" style={{ color: lap.color }}>
                    {lap.label} · L{lap.lapNo ?? "-"}
                  </span>
                  <span>
                    Corners{" "}
                    <span className={`font-mono font-bold ${deltaClass(summary.corners)}`}>
                      {formatDelta(summary.corners)}s
                    </span>
                  </span>
                  <span>
                    Straights{" "}
                    <span className={`font-mono font-bold ${deltaClass(summary.straights)}`}>
                      {formatDelta(summary.straights)}s
                    </span>
                  </span>
                  <span>
                    Lap{" "}
                    <span className={`font-mono font-bold ${deltaClass(summary.total)}`}>
                      {formatDelta(summary.total)}s
                    </span>
                  </span>
                  {gainIdx !== null && (
                    <span>
                      Best gain{" "}
                      <span className={`font-mono font-bold normal-case ${GAIN}`}>
                        {segments[gainIdx]?.label} {formatDelta(deltas[gainIdx])}s
                      </span>
                    </span>
                  )}
                  {lossIdx !== null && (
                    <span>
                      Biggest loss{" "}
                      <span className={`font-mono font-bold normal-case ${LOSS}`}>
                        {segments[lossIdx]?.label} {formatDelta(deltas[lossIdx])}s
                      </span>
                    </span>
                  )}
                </div>
                <svg
                  viewBox={`0 0 ${STRIP_W} ${STRIP_H}`}
                  preserveAspectRatio="none"
                  className="block h-10 w-full rounded-sm border border-panel bg-track"
                  role="img"
                  aria-label={`Time delta by lap segment for ${lap.label} versus ${reference.label}`}
                >
                  {segments.map((segment, index) => {
                    const x = ((segment.startDistance - lapStart) / lapSpan) * STRIP_W;
                    const w = Math.max(
                      0.5,
                      ((segment.endDistance - segment.startDistance) / lapSpan) *
                        STRIP_W,
                    );
                    const delta = deltas[index] ?? null;
                    const h =
                      delta === null || maxAbsDelta === 0
                        ? 0
                        : Math.max(1, (Math.abs(delta) / maxAbsDelta) * STRIP_HALF);
                    const isGain = delta !== null && delta < 0;
                    const inset = Math.min(1, w * 0.1);
                    return (
                      <g
                        key={segment.key}
                        className="cursor-pointer"
                        onClick={() => focusSegment(segment)}
                      >
                        <title>
                          {`${segment.label}: ${lap.label} ${formatDelta(delta)}s vs ${reference.label}`}
                        </title>
                        <rect
                          x={x}
                          y={0}
                          width={w}
                          height={STRIP_H}
                          fill={
                            segment.zone
                              ? CORNER_ZONE_COLORS[segment.zone.speedClass]
                              : "transparent"
                          }
                        />
                        {h > 0 && (
                          <rect
                            x={x + inset}
                            y={isGain ? STRIP_H / 2 - h : STRIP_H / 2}
                            width={Math.max(0.5, w - inset * 2)}
                            height={h}
                            fill={isGain ? "#3fd35a" : "#ff5c70"}
                            opacity={0.85}
                          />
                        )}
                      </g>
                    );
                  })}
                  <line
                    x1={0}
                    x2={STRIP_W}
                    y1={STRIP_H / 2}
                    y2={STRIP_H / 2}
                    stroke="#4a4a5d"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
              </div>
            );
          })}
          <p className="text-[10px] text-[#636369]">
            Bars above the line = time gained, below = time lost · shaded bands =
            corners · click a bar to zoom
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] font-mono text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-[#636369]">
              <th className="whitespace-nowrap px-2 py-1 text-left sm:px-3">Turn</th>
              <th className="whitespace-nowrap px-2 py-1 text-left sm:px-3">Driver</th>
              <th className={TH} title={`Speed entering the corner zone (${speedUnit})`}>
                Entry
              </th>
              <th className={TH} title={`Minimum speed through the corner (${speedUnit})`}>
                Min
              </th>
              <th className={TH} title={`Speed leaving the corner zone (${speedUnit})`}>
                Exit
              </th>
              <th
                className={TH}
                title="Distance from the braking point to the apex. Smaller = later braking. Lift = slowed without braking, Flat = taken flat out."
              >
                Brake
              </th>
              <th
                className={TH}
                title="Distance after the apex where the driver is back to full throttle. Smaller = earlier."
              >
                Full thr.
              </th>
              <th className={TH} title="Time spent in the corner zone (s)">
                Time
              </th>
              {laps.length > 1 && (
                <th
                  className={TH}
                  title={`Time vs ${reference.label} in this corner (s), − = faster`}
                >
                  Δ
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {cornerSegments.map((segment, cornerIndex) => {
              const rowMetrics = metrics[cornerIndex] ?? [];
              const segmentIndex = segmentIndexByKey.get(segment.key) ?? -1;
              const bestEntry = bestIndices(rowMetrics.map((m) => m?.entrySpeed), higher);
              const bestMin = bestIndices(rowMetrics.map((m) => m?.minSpeed), higher);
              const bestExit = bestIndices(rowMetrics.map((m) => m?.exitSpeed), higher);
              const bestBrake = bestIndices(
                rowMetrics.map((m) => m?.brakeBeforeApexM),
                lower,
              );
              const bestThrottle = bestIndices(
                rowMetrics.map((m) => m?.fullThrottleAfterApexM),
                lower,
              );
              const bestTime = bestIndices(rowMetrics.map((m) => m?.zoneTimeS), lower, toMs);
              const apex =
                rowMetrics[0]?.minSpeedDist ??
                segment.zone.apexes[0] ??
                segment.startDistance;

              return (
                <Fragment key={segment.key}>
                  {laps.map((lap, lapIndex) => {
                    const m = rowMetrics[lapIndex] ?? null;
                    const delta =
                      lapIndex === 0
                        ? null
                        : (compared[lapIndex - 1]?.deltas[segmentIndex] ?? null);
                    const cls = (best: ReadonlySet<number>) =>
                      best.has(lapIndex) ? BEST : "text-white";
                    const noBrake = !!m && m.brakeBeforeApexM === null;
                    return (
                      <tr
                        key={`${segment.key}-${lap.key}`}
                        className={`${lapIndex === 0 ? "border-t border-panel" : ""} hover:bg-white/[0.03]`}
                        onMouseEnter={() => onHoverDistance?.(apex)}
                        onMouseLeave={() => onHoverDistance?.(null)}
                      >
                        {lapIndex === 0 && (
                          <td
                            rowSpan={laps.length}
                            className="whitespace-nowrap px-2 py-1 align-top sm:px-3"
                          >
                            <button
                              type="button"
                              onClick={() => focusSegment(segment)}
                              className="inline-flex items-center gap-1.5 font-black text-white hover:text-f1red"
                              title={`${cornerSpeedLabel(segment.zone.speedClass)} corner · zoom charts to ${segment.label}`}
                            >
                              <span
                                className="h-2 w-2 rounded-sm border border-white/20"
                                style={{
                                  background: CORNER_ZONE_COLORS[segment.zone.speedClass],
                                }}
                              />
                              {cornerZoneLabel(segment.zone)}
                              <ZoomIn className="h-3 w-3 opacity-60" aria-hidden="true" />
                            </button>
                          </td>
                        )}
                        <td className="whitespace-nowrap px-2 py-1 text-left sm:px-3">
                          <span className="font-black" style={{ color: lap.color }}>
                            {lap.label}
                          </span>
                        </td>
                        <td className={`${TD} ${cls(bestEntry)}`}>{fmtSpeed(m?.entrySpeed)}</td>
                        <td className={`${TD} ${cls(bestMin)}`}>{fmtSpeed(m?.minSpeed)}</td>
                        <td className={`${TD} ${cls(bestExit)}`}>{fmtSpeed(m?.exitSpeed)}</td>
                        <td className={`${TD} ${noBrake ? "text-muted" : cls(bestBrake)}`}>
                          {brakeText(m)}
                        </td>
                        <td className={`${TD} ${cls(bestThrottle)}`}>
                          {fmtDist(m?.fullThrottleAfterApexM) ?? "—"}
                        </td>
                        <td className={`${TD} ${cls(bestTime)}`}>
                          {m ? m.zoneTimeS.toFixed(3) : "—"}
                        </td>
                        {laps.length > 1 && (
                          <td
                            className={`${TD} ${lapIndex === 0 ? "text-muted" : deltaClass(delta)}`}
                          >
                            {lapIndex === 0 ? "ref" : formatDelta(delta)}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-1 text-[10px] text-[#636369]">
        Speeds in {speedUnit} · distances relative to the apex · purple = best ·
        car data is sampled at ~4 Hz, so braking and throttle points are accurate
        to about ±
        {Math.round(toDisplayShortDistanceM(SAMPLE_SPACING_M, metricSystem))}{" "}
        {distUnit} at high speed
      </p>
    </div>
  );
}
