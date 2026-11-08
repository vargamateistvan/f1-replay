import { memo } from "react";
import { CloudRain, CloudSun, Wind } from "lucide-react";
import type { Driver, Stint } from "@/api/types";
import {
  COMPOUND_COLORS,
  COMPOUND_HARD_LIGHT_COLOR,
  COMPOUND_LETTERS,
  FLAG_COLORS,
  PIT_MARKER_COLOR,
  PIT_WINDOW_COLOR,
  RING_CARDINAL_LABEL_RADIUS,
  SAFETY_CAR_NUMBERS,
  TRACK_PIT_CAR_SCALE,
} from "@/constants";
import type { PitLaneStatus, TimingSectorFlags } from "@/timeline/raceControl";
import { TOKEN_HEX } from "@/designTokens";
import { trackEvent } from "@/lib/analytics";
import { teamColor } from "@/utils/color";
import { forwardSpan, ringPoint, wrapFraction } from "@/utils/lapProgress";
import { PIT_CONDITION_LABEL, type PitLossCondition } from "@/utils/pitRejoin";
import { SPECIAL_TRACK_VEHICLES } from "../TrackMap/layers/specialVehicles";
import { PitAccessLight } from "../TrackMap/layers/PitAccessLight";
import { mapBackgroundColor } from "../TrackMap/trackMapFormat";
import {
  displayArc,
  fromTimeFraction,
  signedTimeDelta,
  timeArc,
  toDisplay,
  type RingCarLayout,
  type RingModel,
  type RingScale,
} from "./ringModel";

const RING_WIDTH = 14;
const PIT_WIDTH = 6;
const FONT = "Inter, sans-serif";

function formatCenterGap(gap: string | null): string {
  if (gap === "LEAD") return "LEADER";
  if (!gap) return "—";
  return gap.endsWith("s") ? gap : `${gap}s`;
}

interface RingFrame {
  cx: number;
  cy: number;
  r: number;
}

/** Text rotated to follow the ring at dial position `d`, kept upright. */
function tangentRotation(d: number): number {
  const deg = d * 360;
  return d > 0.25 && d < 0.75 ? deg + 180 : deg;
}

/** Dark text on light team colours (Haas white, McLaren papaya), white otherwise. */
function labelTextColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1]!, 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.62 ? "#111318" : "#ffffff";
}

function compoundBadgeColor(compound: Stint["compound"], lightMode: boolean): string {
  return lightMode && compound === "HARD"
    ? COMPOUND_HARD_LIGHT_COLOR
    : COMPOUND_COLORS[compound];
}

/** Cardinal labels around the dial, in the same fixed orientation as a map. */
export const RingCardinalDirections = memo(function RingCardinalDirections({
  cx,
  cy,
  rotationDeg,
  lightMode,
}: Pick<RingFrame, "cx" | "cy"> & { rotationDeg: number; lightMode: boolean }) {
  const color = lightMode ? "#2a3246" : "#d4dbee";
  const labels = [
    { direction: "N", fraction: 0 },
    { direction: "E", fraction: 0.25 },
    { direction: "S", fraction: 0.5 },
    { direction: "W", fraction: 0.75 },
  ] as const;
  return (
    <g role="group" aria-label="Cardinal directions" data-testid="ring-cardinal-directions">
      {labels.map(({ direction, fraction }) => {
        const point = ringPoint(
          cx,
          cy,
          RING_CARDINAL_LABEL_RADIUS,
          fraction + rotationDeg / 360,
        );
        return (
          <text
            key={direction}
            data-direction={direction}
            x={point.x}
            y={point.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={8}
            fill={direction === "N" ? TOKEN_HEX.f1red : color}
            fontFamily={FONT}
            fontWeight="900"
            letterSpacing="0.08em"
          >
            {direction}
          </text>
        );
      })}
    </g>
  );
});

/** The ring, sector flag tints, sector bars + labels, corner ticks and the finish line. */
export const RingTrack = memo(function RingTrack({
  cx,
  cy,
  r,
  model,
  scale,
  timingSectorFlags,
  showCornerNumbers,
  patternId,
  lightMode,
}: RingFrame & {
  model: RingModel;
  scale: RingScale;
  timingSectorFlags: TimingSectorFlags | null;
  showCornerNumbers: boolean;
  patternId: string;
  lightMode: boolean;
}) {
  const [b2, b3] = model.sectorBoundaries;
  const sectors: { n: 1 | 2 | 3; from: number; to: number }[] = [
    { n: 1, from: 0, to: b2 },
    { n: 2, from: b2, to: b3 },
    { n: 3, from: b3, to: 1 },
  ];
  const tickColor = lightMode ? "#5b6478" : "#8d97ad";
  const labelColor = lightMode ? "#2a3246" : "#d4dbee";
  const inner = r - RING_WIDTH / 2;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={lightMode ? "#aebad0" : "#3a4356"} strokeWidth={RING_WIDTH + 2} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={lightMode ? "#d7e0f0" : "#232a37"} strokeWidth={RING_WIDTH} />
      {sectors.map(({ n, from, to }) => {
        const flag = timingSectorFlags?.[n];
        if (!flag || flag === "CLEAR" || flag === "GREEN") return null;
        return (
          <path
            key={`flag-${n}`}
            d={displayArc(scale, cx, cy, r, from, to)}
            fill="none"
            stroke={FLAG_COLORS[flag] ?? FLAG_COLORS.CLEAR}
            strokeWidth={RING_WIDTH}
            opacity={0.55}
          />
        );
      })}
      {model.corners.map((c) => {
        const d = toDisplay(scale, c.fraction);
        const a = ringPoint(cx, cy, inner + 1, d);
        const b = ringPoint(cx, cy, inner + 5, d);
        const t = ringPoint(cx, cy, inner - 7, d);
        return (
          <g key={`corner-${c.label}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={tickColor} strokeWidth={1.4} />
            {showCornerNumbers && (
              <text
                x={t.x}
                y={t.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={6}
                fill={tickColor}
                fontFamily={FONT}
                fontWeight="800"
              >
                {c.label}
              </text>
            )}
          </g>
        );
      })}
      {[b2, b3].map((f, i) => {
        const d = toDisplay(scale, f);
        const a = ringPoint(cx, cy, inner - 3, d);
        const b = ringPoint(cx, cy, r + RING_WIDTH / 2 + 3, d);
        return (
          <line
            key={`boundary-${i}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="#9aa4be"
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.85}
          />
        );
      })}
      {sectors.map(({ n, from, to }) => {
        const d = toDisplay(scale, from + forwardSpan(from, to === 1 ? 0 : to) / 2);
        const p = ringPoint(cx, cy, inner - (showCornerNumbers ? 16 : 9), d);
        return (
          <text
            key={`sector-${n}`}
            x={p.x}
            y={p.y}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(${tangentRotation(d).toFixed(1)} ${p.x.toFixed(1)} ${p.y.toFixed(1)})`}
            fontSize={8}
            fill={labelColor}
            opacity={0.75}
            fontFamily={FONT}
            fontWeight="900"
            letterSpacing="0.08em"
          >
            S{n}
          </text>
        );
      })}
      {/* Start/finish at 12 o'clock. */}
      <rect
        x={cx - 3}
        y={cy - r - RING_WIDTH / 2 - 2}
        width={6}
        height={RING_WIDTH + 4}
        fill={`url(#${patternId})`}
        stroke={lightMode ? "#111318" : "#f2f4fb"}
        strokeWidth={0.8}
      />
    </g>
  );
});

/** Inner pit-lane arc between pit entry and exit, joined to the ring. */
export const RingPitLane = memo(function RingPitLane({
  cx,
  cy,
  r,
  ringR,
  model,
  scale,
  lightMode,
  pitLaneStatus,
}: RingFrame & { ringR: number; model: RingModel; scale: RingScale; lightMode: boolean; pitLaneStatus?: PitLaneStatus | null }) {
  const color = pitLaneStatus?.lane === "closed" ? TOKEN_HEX.red : pitLaneStatus?.lane === "open" ? TOKEN_HEX.green : lightMode ? "#b7c2d8" : "#2c3444";
  const labelColor = lightMode ? "#4b5468" : "#8d97ad";
  if (!model.pit) {
    // No baked pit lane: cars in the pits still drop to the inner circle.
    if (model.unitsPerMetre == null) return null;
    return <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeWidth={1.2} strokeDasharray="3 4" />;
  }
  const { entry, exit } = model.pit;
  const mid = toDisplay(scale, entry + forwardSpan(entry, exit) / 2);
  const join = (f: number) => {
    const d = toDisplay(scale, f);
    const a = ringPoint(cx, cy, ringR - RING_WIDTH / 2, d);
    const b = ringPoint(cx, cy, r, d);
    return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={PIT_WIDTH * 0.6} strokeLinecap="round" />;
  };
  // Outside the arc: pit cars' dots sit on it and their labels go inward.
  const label = ringPoint(cx, cy, r + PIT_WIDTH + 3, mid);
  return (
    <g>
      {join(entry)}
      {join(exit)}
      <path
        d={displayArc(scale, cx, cy, r, entry, exit)}
        fill="none"
        stroke={color}
        strokeWidth={PIT_WIDTH}
        strokeLinecap="round"
      />
      {(["entry", "exit"] as const).map((part) => {
        const state = pitLaneStatus?.[part];
        if (!state || state === "unknown") return null;
        const point = ringPoint(cx, cy, r, toDisplay(scale, part === "entry" ? entry : exit));
        return (
          <PitAccessLight key={part} part={part} state={state} x={point.x} y={point.y} />
        );
      })}
      <text
        x={label.x}
        y={label.y}
        textAnchor="middle"
        dominantBaseline="middle"
        transform={`rotate(${tangentRotation(mid).toFixed(1)} ${label.x.toFixed(1)} ${label.y.toFixed(1)})`}
        fontSize={7}
        fill={labelColor}
        fontFamily={FONT}
        fontWeight="900"
        letterSpacing="0.2em"
      >
        PIT LANE
      </text>
    </g>
  );
});

export interface RingStatus {
  label: string;
  color: string;
}

/** Optional key for the ring's gap labels, pit window and hover interaction. */
export function RingLegend() {
  return (
    <aside
      role="note"
      aria-label="Ring view legend"
      className="w-64 rounded-sm border border-fg/15 bg-track/95 p-2.5 text-fg shadow-lg backdrop-blur"
    >
      <div className="mb-1.5 text-tiny font-black uppercase tracking-eyebrow">Ring view key</div>
      <ul className="space-y-1.5 text-caption leading-snug">
        <li>
          <strong>Gap labels:</strong> + behind, − ahead of the focused driver. <strong>+1L · +2.4s</strong> shows
          lap deficit and timing gap when available.
        </li>
        <li>
          <strong className="text-purple-fg">Purple band:</strong> pit-loss window; the lighter section ahead marks
          cars that would drop behind if they pitted.
        </li>
        <li>
          <strong className="text-orange-fg">Orange ticks:</strong> alternate pit loss for Green, VSC or Safety Car
          conditions.
        </li>
        <li>
          <strong>Compare:</strong> hover another car with a driver focused to see their on-track time gap. Requires
          time spacing.
        </li>
      </ul>
    </aside>
  );
}

/** Centre dashboard for lap context, focused-driver data, weather and tyre guidance. */
export function RingCenter({
  cx,
  cy,
  lapLabel,
  status,
  reference,
  focusInfo = null,
  weather = null,
  tyreGuidance = null,
  lightMode,
}: {
  cx: number;
  cy: number;
  lapLabel: string | null;
  status: RingStatus | null;
  reference: { title: string };
  focusInfo?: {
    number: number;
    acronym: string;
    position: number | null;
    color: string;
    gapAhead: string | null;
    gapBehind: string | null;
    compound: Stint["compound"] | null;
    tyreAge: number | null;
    speed: string | null;
  } | null;
  weather?: {
    track: string;
    air: string;
    humidity: string;
    wind: string;
    raining: boolean;
  } | null;
  tyreGuidance?: {
    suggested: Stint["compound"];
    fastest: Stint["compound"] | null;
  } | null;
  lightMode: boolean;
}) {
  const fg = "rgb(var(--color-fg))";
  const muted = "rgb(var(--color-muted))";
  const chipW = status ? Math.max(34, status.label.length * 5.4 + 12) : 0;
  return (
    <g fontFamily={FONT} pointerEvents="none" data-testid="ring-center-dashboard">
      <rect
        data-testid="ring-center-panel"
        x={cx - 88}
        y={cy - 78}
        width={176}
        height={156}
        rx={8}
        fill="rgb(var(--color-surface))"
      />
      <text
        x={cx}
        y={cy - 62}
        textAnchor="middle"
        fontSize={4.5}
        fontWeight="800"
        fill={muted}
        letterSpacing="0.16em"
        dominantBaseline="middle"
      >
        LAP
      </text>
      {lapLabel && (
        <text
          data-testid="ring-lap-label"
          x={cx}
          y={cy - 44}
          textAnchor="middle"
          fontSize={20}
          fontWeight="900"
          fill={fg}
          dominantBaseline="middle"
        >
          {lapLabel}
        </text>
      )}
      {status && (
        <g>
          <rect x={cx - chipW / 2} y={cy - 28} width={chipW} height={12} rx={3} fill={status.color} />
          <text
            x={cx}
            y={cy - 22}
            textAnchor="middle"
            fontSize={6}
            fontWeight="900"
            fill={labelTextColor(status.color)}
            dominantBaseline="middle"
            letterSpacing="0.04em"
          >
            {status.label}
          </text>
        </g>
      )}
      <text
        x={cx}
        y={cy - 11}
        textAnchor="middle"
        fontSize={5.5}
        fill={muted}
        dominantBaseline="middle"
      >
        {reference.title}
      </text>
      <line
        x1={cx - 72}
        y1={cy - 4}
        x2={cx + 72}
        y2={cy - 4}
        stroke="rgb(var(--color-surface))"
        strokeWidth={0.6}
      />
      {focusInfo ? (
        <g data-testid="ring-focused-driver-info" aria-label={`Focused driver ${focusInfo.acronym}`}>
          <text x={cx - 67} y={cy + 8} textAnchor="start" fontSize={9} dominantBaseline="middle">
            <tspan fill={focusInfo.color} fontWeight="900">
              {focusInfo.position == null ? "P—" : `P${focusInfo.position}`}
            </tspan>
          </text>
          <text x={cx - 31} y={cy + 8} textAnchor="start" fontSize={8} fill={fg} fontWeight="800" dominantBaseline="middle">
            {focusInfo.acronym}
          </text>
          <text x={cx + 67} y={cy + 8} textAnchor="end" fontSize={5.5} fill={muted} dominantBaseline="middle">
            #{focusInfo.number}
          </text>
          <g aria-label="Focused driver gaps">
            <rect x={cx - 72} y={cy + 17} width={69} height={28} rx={3} fill="rgb(var(--color-panel))" />
            <rect x={cx + 3} y={cy + 17} width={69} height={28} rx={3} fill="rgb(var(--color-panel))" />
            <text x={cx - 64} y={cy + 25} textAnchor="start" fontSize={4.5} fill={muted} letterSpacing="0.1em" dominantBaseline="middle">
              AHEAD
            </text>
            <text x={cx - 64} y={cy + 38} textAnchor="start" fontSize={7} fill={fg} fontWeight="800" dominantBaseline="middle">
              {formatCenterGap(focusInfo.gapAhead)}
            </text>
            <text x={cx + 11} y={cy + 25} textAnchor="start" fontSize={4.5} fill={muted} letterSpacing="0.1em" dominantBaseline="middle">
              BEHIND
            </text>
            <text x={cx + 11} y={cy + 38} textAnchor="start" fontSize={7} fill={fg} fontWeight="800" dominantBaseline="middle">
              {formatCenterGap(focusInfo.gapBehind)}
            </text>
          </g>
          <text x={cx} y={cy + 54} textAnchor="middle" fontSize={5.5} dominantBaseline="middle">
            <tspan fill={focusInfo.compound ? COMPOUND_COLORS[focusInfo.compound] : muted} fontWeight="800">
              {focusInfo.compound
                ? `${focusInfo.compound} · ${focusInfo.tyreAge == null ? "—" : `${focusInfo.tyreAge}L`}`
                : "TYRE DATA UNAVAILABLE"}
            </tspan>
            {focusInfo.speed && <tspan fill={fg}> · {focusInfo.speed}</tspan>}
          </text>
        </g>
      ) : weather ? (
        <g data-testid="ring-center-weather" aria-label="Track weather">
          {[
            { label: "TRACK", value: weather.track, x: cx - 72 },
            { label: "AIR", value: weather.air, x: cx - 23 },
            { label: "HUMIDITY", value: weather.humidity, x: cx + 26 },
          ].map(({ label, value, x }) => (
            <g key={label}>
              <rect x={x} y={cy + 2} width={46} height={29} rx={3} fill="rgb(var(--color-panel))" />
              <text x={x + 23} y={cy + 12} textAnchor="middle" fontSize={4.2} fill={muted} letterSpacing="0.08em" dominantBaseline="middle">
                {label}
              </text>
              <text x={x + 23} y={cy + 25} textAnchor="middle" fontSize={7} fill={fg} fontWeight="800" dominantBaseline="middle">
                {value}
              </text>
            </g>
          ))}
          <g
            data-testid="ring-weather-bottom-row"
            transform={`translate(${cx} ${cy + 46})`}
            fontSize={5.5}
            dominantBaseline="middle"
          >
            <Wind x={-48} y={-3} size={7} strokeWidth={1.8} color={muted} aria-hidden="true" />
            <text x={-37} y={0} fill={fg} textAnchor="start">
              {weather.wind}
            </text>
            {weather.raining ? (
              <CloudRain
                x={17}
                y={-3}
                size={7}
                strokeWidth={1.8}
                color={TOKEN_HEX.blue}
                role="img"
                aria-label="Rain"
              />
            ) : (
              <CloudSun
                x={17}
                y={-3}
                size={7}
                strokeWidth={1.8}
                color={muted}
                aria-hidden="true"
              />
            )}
            <text
              x={27}
              y={0}
              fill={weather.raining ? TOKEN_HEX.blue : muted}
              textAnchor="start"
              fontSize={5}
              fontWeight="800"
              letterSpacing="0.04em"
            >
              {weather.raining ? "RAIN" : "DRY"}
            </text>
          </g>
        </g>
      ) : null}
      {tyreGuidance && (
        <g
          data-testid="ring-center-tyre-guidance"
          aria-label="Tyre recommendation and fastest clean lap compound"
        >
          <line
            x1={cx - 72}
            y1={cy + 62}
            x2={cx + 72}
            y2={cy + 62}
            stroke="rgb(var(--color-surface))"
            strokeWidth={0.5}
          />
          <text x={cx - 68} y={cy + 70} textAnchor="start" fontSize={4.2} fill={muted} letterSpacing="0.08em" dominantBaseline="middle">
            SUGGESTED
          </text>
          <g
            role="img"
            aria-label={`Suggested tyre: ${tyreGuidance.suggested}`}
            transform={`translate(${cx - 20} ${cy + 70})`}
          >
            <circle r={4.5} fill="none" stroke={compoundBadgeColor(tyreGuidance.suggested, lightMode)} strokeWidth={1.5} />
            <text y={0.3} textAnchor="middle" fontSize={4.2} fill={fg} fontWeight="900" dominantBaseline="middle">
              {COMPOUND_LETTERS[tyreGuidance.suggested]}
            </text>
          </g>
          <text x={cx + 5} y={cy + 70} textAnchor="start" fontSize={4.2} fill={muted} letterSpacing="0.08em" dominantBaseline="middle">
            FASTEST
          </text>
          {tyreGuidance.fastest ? (
            <g
              role="img"
              aria-label={`Fastest clean-lap tyre: ${tyreGuidance.fastest}`}
              transform={`translate(${cx + 53} ${cy + 70})`}
            >
              <circle r={4.5} fill="none" stroke={compoundBadgeColor(tyreGuidance.fastest, lightMode)} strokeWidth={1.5} />
              <text y={0.3} textAnchor="middle" fontSize={4.2} fill={fg} fontWeight="900" dominantBaseline="middle">
                {COMPOUND_LETTERS[tyreGuidance.fastest]}
              </text>
            </g>
          ) : (
            <text
              x={cx + 53}
              y={cy + 70}
              textAnchor="middle"
              fontSize={5}
              fill={muted}
              dominantBaseline="middle"
              aria-label="Fastest clean-lap tyre unavailable"
            >
              —
            </text>
          )}
        </g>
      )}
    </g>
  );
}

/**
 * Pit window for the focused car, on the ring itself: the band behind it is
 * how far it would fall if it pitted now (cars in it would pass it), the band
 * ahead how far a car ahead would fall (cars in it would drop behind it if
 * they pitted). The rejoin point carries the projected position; hatched
 * ticks show the pit loss under the other track conditions (SC, VSC, green).
 * With `inPit` the car is already in the lane: only the rejoin point is drawn.
 */
export function RingPitWindow({
  cx,
  cy,
  r,
  scale,
  carTf,
  behindTf,
  aheadTf,
  markers,
  position,
  lossS,
  inPit = false,
}: RingFrame & {
  scale: RingScale;
  /** Lap time fractions (unwrapped is fine) of the car, its rejoin point and the window's far end ahead. */
  carTf: number;
  behindTf: number;
  aheadTf: number | null;
  markers: readonly { tf: number; condition: PitLossCondition }[];
  position: number;
  lossS: number;
  inPit?: boolean;
}) {
  const bandW = RING_WIDTH + 8;
  const ghostD = fromTimeFraction(scale, wrapFraction(behindTf));
  const ghost = ringPoint(cx, cy, r, ghostD);
  const tag = ringPoint(cx, cy, r - 30, ghostD);
  const tagHalfW = inPit ? 25 : 21;
  return (
    <g pointerEvents="none" data-testid="ring-pit-window">
      {!inPit && (
        <path
          d={timeArc(scale, cx, cy, r, behindTf, carTf)}
          fill="none"
          stroke={PIT_WINDOW_COLOR}
          strokeWidth={bandW}
          strokeOpacity={0.55}
        />
      )}
      {aheadTf !== null && (
        <path
          d={timeArc(scale, cx, cy, r, carTf, aheadTf)}
          fill="none"
          stroke={PIT_WINDOW_COLOR}
          strokeWidth={bandW}
          strokeOpacity={0.25}
        />
      )}
      {markers.map(({ tf, condition }) => {
        const d = fromTimeFraction(scale, wrapFraction(tf));
        const a = ringPoint(cx, cy, r - bandW / 2, d);
        const b = ringPoint(cx, cy, r + bandW / 2, d);
        const t = ringPoint(cx, cy, r + bandW / 2 + 6, d);
        return (
          <g key={condition}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={PIT_MARKER_COLOR}
              strokeWidth={4}
              strokeDasharray="2 1.5"
            />
            <text
              x={t.x}
              y={t.y}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(${tangentRotation(d).toFixed(1)} ${t.x.toFixed(1)} ${t.y.toFixed(1)})`}
              fontSize={5.5}
              fontWeight="900"
              fill={PIT_MARKER_COLOR}
              fontFamily={FONT}
            >
              {PIT_CONDITION_LABEL[condition]}
            </text>
          </g>
        );
      })}
      <circle cx={ghost.x} cy={ghost.y} r={7} fill="none" stroke="#ffffff" strokeWidth={1.6} strokeDasharray="2.5 2" />
      <g fontFamily={FONT} textAnchor="middle">
        <rect
          x={tag.x - tagHalfW}
          y={tag.y - 9}
          width={tagHalfW * 2}
          height={18}
          rx={2}
          fill={PIT_WINDOW_COLOR}
          fillOpacity={0.9}
        />
        <text x={tag.x} y={tag.y - 2.5} fontSize={6.5} fontWeight="900" fill="#ffffff" dominantBaseline="middle">
          {inPit ? `REJOIN P${position}` : `PIT → P${position}`}
        </text>
        <text x={tag.x} y={tag.y + 4.5} fontSize={5.5} fill="#f3e8ff" dominantBaseline="middle">
          −{lossS.toFixed(1)}s
        </text>
      </g>
    </g>
  );
}

/** On-track time between two cars: an arc just inside the ring and a "4.0 s" bubble. */
export function RingGapMeasure({
  cx,
  cy,
  r,
  scale,
  fromTf,
  toTf,
  gapMs,
  lightMode,
}: RingFrame & { scale: RingScale; fromTf: number; toTf: number; gapMs: number; lightMode: boolean }) {
  const delta = signedTimeDelta(fromTf, toTf);
  const [a, b] = delta >= 0 ? [fromTf, fromTf + delta] : [fromTf + delta, fromTf];
  const arcR = r - RING_WIDTH / 2 - 5;
  const mid = fromTimeFraction(scale, wrapFraction(fromTf + delta / 2));
  const bubble = ringPoint(cx, cy, r - 34, mid);
  const fg = lightMode ? "#111318" : "#ffffff";
  const text = `${(gapMs / 1000).toFixed(1)} s`;
  const w = text.length * 5 + 10;
  return (
    <g pointerEvents="none" data-testid="ring-gap-measure">
      <path d={timeArc(scale, cx, cy, arcR, a, b)} fill="none" stroke={fg} strokeWidth={2.2} strokeLinecap="round" />
      <rect
        x={bubble.x - w / 2}
        y={bubble.y - 8}
        width={w}
        height={16}
        rx={3}
        fill={lightMode ? "#ffffff" : "#111318"}
        stroke={fg}
        strokeWidth={0.9}
      />
      <text
        x={bubble.x}
        y={bubble.y + 0.5}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={8.5}
        fontWeight="800"
        fill={fg}
        fontFamily={FONT}
      >
        {text}
      </text>
    </g>
  );
}

interface RingCarsProps {
  cars: readonly RingCarLayout[];
  driverByNumber: ReadonlyMap<number, Driver>;
  focusDriver: number | null;
  /** With a focused car: cars that stay at full opacity (pit window rivals, the measured car). */
  highlightDrivers?: ReadonlySet<number>;
  gapText?: ReadonlyMap<number, string>;
  pulseDrivers?: readonly number[];
  battlingDrivers?: ReadonlySet<number>;
  activeCompounds?: ReadonlyMap<number, { compound: Stint["compound"]; age: number }>;
  safetyCarSirenOn: boolean;
  lightMode: boolean;
  showAcronym: boolean;
  showNumberInside: boolean;
  onSelectDriver?: (driverNumber: number) => void;
  /** Pointer over a car (null when it leaves): drives the gap measure. */
  onHoverDriver?: (driverNumber: number | null) => void;
}

/** Car dots with leader-lined label boxes; the focused car paints last. */
export function RingCars({ cars, focusDriver, pulseDrivers, ...rest }: RingCarsProps) {
  const pulseSet = new Set(pulseDrivers ?? []);
  const ordered = cars
    .slice()
    .sort((a, b) => (a.num === focusDriver ? 1 : 0) - (b.num === focusDriver ? 1 : 0));
  return (
    <>
      {ordered.map((car) => (
        <RingCarMarker
          key={car.num}
          {...rest}
          car={car}
          focusDriver={focusDriver}
          pulsing={pulseSet.has(car.num)}
        />
      ))}
    </>
  );
}

function RingCarMarker({
  car,
  driverByNumber,
  focusDriver,
  highlightDrivers,
  gapText,
  pulsing,
  battlingDrivers,
  activeCompounds,
  safetyCarSirenOn,
  lightMode,
  showAcronym,
  showNumberInside,
  onSelectDriver,
  onHoverDriver,
}: Omit<RingCarsProps, "cars" | "pulseDrivers"> & { car: RingCarLayout; pulsing: boolean }) {
  const { num } = car;
  const driver = driverByNumber.get(num);
  const special = SPECIAL_TRACK_VEHICLES[num];
  const sirenOn = SAFETY_CAR_NUMBERS.has(num) && safetyCarSirenOn;
  const color = special ? special.fill : teamColor(driver?.team_colour, "#ffffff");
  const focused = focusDriver === num;
  const highlighted = highlightDrivers?.has(num) ?? false;
  const hasInspection = focused || (highlightDrivers?.size ?? 0) > 0;
  const dimmed = hasInspection && !focused && !highlighted;
  const markerScale = car.inPit && !special ? TRACK_PIT_CAR_SCALE : 1;
  const r = markerScale * (showNumberInside || special ? (focused ? 8 : 6.6) : focused ? 6.5 : 5);
  const compound = activeCompounds?.get(num);
  const label = special ? special.shortLabel : (driver?.name_acronym ?? String(num));
  const gap = special ? null : (gapText?.get(num) ?? null);
  const textColor = labelTextColor(color);
  const boxW = gap ? Math.max(34, gap.length * 4.5 + 8) : 34;
  const boxH = gap ? 20 : 13;
  const boxX = car.labelX - boxW / 2;
  const boxY = car.labelY - boxH / 2;

  return (
    <g
      opacity={dimmed ? (highlightDrivers?.size ? 0.3 : 0.4) : 1}
      onClick={() => {
        trackEvent("trackmap_driver_selected", { driver_number: num, view: "ring" });
        onSelectDriver?.(num);
      }}
      onPointerEnter={onHoverDriver ? () => onHoverDriver(num) : undefined}
      onPointerLeave={onHoverDriver ? () => onHoverDriver(null) : undefined}
      style={onSelectDriver ? { cursor: "pointer" } : undefined}
    >
      {showAcronym && (
        <>
          <line {...car.leader} stroke={color} strokeWidth={focused ? 1.2 : 0.8} strokeOpacity={0.55} />
          <rect
            x={boxX}
            y={boxY}
            width={boxW}
            height={boxH}
            rx={2}
            fill={color}
            stroke={focused ? (lightMode ? "#111318" : "#ffffff") : mapBackgroundColor(lightMode)}
            strokeWidth={focused ? 1.4 : 0.6}
          />
          <text
            x={car.labelX}
            y={boxY + 7}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={8.5}
            fill={textColor}
            fontFamily={FONT}
            fontWeight="900"
            letterSpacing="0.03em"
          >
            {label}
          </text>
          {gap && (
            <text
              x={car.labelX}
              y={boxY + 15.5}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={6}
              fill={textColor}
              opacity={0.85}
              fontFamily={FONT}
              fontWeight="700"
            >
              {gap}
            </text>
          )}
        </>
      )}
      <g transform={`translate(${car.x.toFixed(1)},${car.y.toFixed(1)})`}>
        {battlingDrivers?.has(num) && !pulsing && (
          <circle
            r={focused ? 12 : 9}
            fill="none"
            stroke="#ffd700"
            strokeWidth={1.5}
            strokeOpacity={0.75}
            strokeDasharray="3 2"
          />
        )}
        {pulsing && (
          <circle r={6} fill="none" stroke="#ffffff" strokeWidth={1.5}>
            <animate attributeName="r" from="6" to="14" dur="0.8s" repeatCount="indefinite" />
            <animate attributeName="stroke-opacity" from="0.9" to="0" dur="0.8s" repeatCount="indefinite" />
          </circle>
        )}
        {(focused || sirenOn) && (
          <circle r={r + 2.5} fill="none" stroke={special ? special.halo : color} strokeWidth={1.5} strokeOpacity={0.6} />
        )}
        <circle
          r={r}
          fill={color}
          stroke={special ? special.stroke : "#ffffff"}
          strokeWidth={focused ? 1.6 : 1.1}
          strokeOpacity={focused ? 0.9 : 0.75}
        />
        {(showNumberInside || special) && (
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={markerScale * (special ? 4 : focused ? (num >= 10 ? 5.6 : 6.2) : 4.8)}
            fill={special ? (lightMode ? special.text : (special.textDark ?? special.text)) : "#ffffff"}
            stroke="rgba(0,0,0,0.58)"
            strokeWidth={0.6}
            paintOrder="stroke"
            fontFamily={FONT}
            fontWeight="900"
          >
            {special ? special.shortLabel : num}
          </text>
        )}
        {compound && (
          <circle
            cx={r * 0.8}
            cy={r * 0.8}
            r={focused ? 2.5 : 2}
            fill={COMPOUND_COLORS[compound.compound]}
            stroke={mapBackgroundColor(lightMode)}
            strokeWidth={0.5}
          />
        )}
      </g>
    </g>
  );
}
