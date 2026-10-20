import { memo } from "react";
import type { Driver, Stint } from "@/api/types";
import { COMPOUND_COLORS, FLAG_COLORS, SAFETY_CAR_NUMBERS } from "@/constants";
import type { TimingSectorFlags } from "@/timeline/raceControl";
import { trackEvent } from "@/lib/analytics";
import { teamColor } from "@/utils/color";
import { forwardSpan, ringPoint } from "@/utils/lapProgress";
import { SPECIAL_TRACK_VEHICLES } from "../TrackMap/layers/specialVehicles";
import { mapBackgroundColor } from "../TrackMap/trackMapFormat";
import { displayArc, toDisplay, type RingCarLayout, type RingModel, type RingScale } from "./ringModel";

const RING_WIDTH = 14;
const PIT_WIDTH = 6;
const FONT = "Inter, sans-serif";

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
}: RingFrame & { ringR: number; model: RingModel; scale: RingScale; lightMode: boolean }) {
  const color = lightMode ? "#b7c2d8" : "#2c3444";
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

/** Centre of the dial: lap, track status, reference lap and what the gaps mean. */
export function RingCenter({
  cx,
  cy,
  lapLabel,
  status,
  reference,
  gapCaption,
  lightMode,
}: {
  cx: number;
  cy: number;
  lapLabel: string | null;
  status: RingStatus | null;
  /** Reference lap line + its detail, or the distance-scale note. */
  reference: { title: string; detail: string };
  gapCaption: string | null;
  lightMode: boolean;
}) {
  const fg = lightMode ? "#111318" : "#ffffff";
  const muted = lightMode ? "#5b6478" : "#8d97ad";
  const chipW = status ? Math.max(34, status.label.length * 5.4 + 12) : 0;
  return (
    <g fontFamily={FONT} textAnchor="middle" pointerEvents="none">
      {lapLabel && (
        <text x={cx} y={cy - 24} fontSize={28} fontWeight="900" fill={fg} dominantBaseline="middle">
          {lapLabel}
        </text>
      )}
      {status && (
        <g>
          <rect x={cx - chipW / 2} y={cy - 6} width={chipW} height={13} rx={2} fill={status.color} />
          <text
            x={cx}
            y={cy + 0.5}
            fontSize={7.5}
            fontWeight="900"
            fill={labelTextColor(status.color)}
            dominantBaseline="middle"
            letterSpacing="0.04em"
          >
            {status.label}
          </text>
        </g>
      )}
      <text x={cx} y={cy + 20} fontSize={8} fill={fg} opacity={0.85} dominantBaseline="middle">
        {reference.title}
      </text>
      <text x={cx} y={cy + 30} fontSize={6} fill={muted} dominantBaseline="middle">
        {reference.detail}
      </text>
      {gapCaption && (
        <text x={cx} y={cy + 44} fontSize={7.5} fill={fg} opacity={0.75} dominantBaseline="middle">
          {gapCaption}
        </text>
      )}
    </g>
  );
}

/**
 * Pit window for the focused car: a hollow marker where it would rejoin if it
 * pitted now (its position minus the pit loss), an arc showing the loss, and
 * the projected position.
 */
export function RingPitWindow({
  cx,
  cy,
  r,
  carD,
  ghostD,
  reverse,
  color,
  position,
  lossS,
}: RingFrame & {
  /** Dial positions of the car and the rejoin point. */
  carD: number;
  ghostD: number;
  reverse: boolean;
  color: string;
  position: number;
  lossS: number;
}) {
  const arcR = r + 11;
  // The loss runs backwards from the car along the direction of travel.
  const from = reverse ? carD : ghostD;
  const to = reverse ? ghostD : carD;
  const span = forwardSpan(from, to);
  const a = ringPoint(cx, cy, arcR, from);
  const b = ringPoint(cx, cy, arcR, from + span);
  const ghost = ringPoint(cx, cy, r, ghostD);
  const tag = ringPoint(cx, cy, r - 22, ghostD);
  return (
    <g pointerEvents="none">
      <path
        d={`M${a.x.toFixed(2)} ${a.y.toFixed(2)}A${arcR} ${arcR} 0 ${span > 0.5 ? 1 : 0} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeOpacity={0.5}
        strokeDasharray="4 3"
      />
      <circle cx={ghost.x} cy={ghost.y} r={7} fill="none" stroke={color} strokeWidth={1.6} strokeDasharray="2.5 2" />
      <g fontFamily={FONT} textAnchor="middle">
        <rect x={tag.x - 19} y={tag.y - 9} width={38} height={18} rx={2} fill="rgba(0,0,0,0.6)" stroke={color} strokeWidth={0.8} />
        <text x={tag.x} y={tag.y - 2.5} fontSize={6.5} fontWeight="900" fill="#ffffff" dominantBaseline="middle">
          PIT → P{position}
        </text>
        <text x={tag.x} y={tag.y + 4.5} fontSize={5.5} fill="#d4dbee" dominantBaseline="middle">
          −{lossS.toFixed(1)}s
        </text>
      </g>
    </g>
  );
}

interface RingCarsProps {
  cars: readonly RingCarLayout[];
  driverByNumber: ReadonlyMap<number, Driver>;
  focusDriver: number | null;
  gapText?: ReadonlyMap<number, string>;
  pulseDrivers?: readonly number[];
  battlingDrivers?: ReadonlySet<number>;
  activeCompounds?: ReadonlyMap<number, { compound: Stint["compound"]; age: number }>;
  safetyCarSirenOn: boolean;
  lightMode: boolean;
  showAcronym: boolean;
  showNumberInside: boolean;
  onSelectDriver?: (driverNumber: number) => void;
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
  gapText,
  pulsing,
  battlingDrivers,
  activeCompounds,
  safetyCarSirenOn,
  lightMode,
  showAcronym,
  showNumberInside,
  onSelectDriver,
}: Omit<RingCarsProps, "cars" | "pulseDrivers"> & { car: RingCarLayout; pulsing: boolean }) {
  const { num } = car;
  const driver = driverByNumber.get(num);
  const special = SPECIAL_TRACK_VEHICLES[num];
  const sirenOn = SAFETY_CAR_NUMBERS.has(num) && safetyCarSirenOn;
  const color = special ? special.fill : teamColor(driver?.team_colour, "#ffffff");
  const focused = focusDriver === num;
  const dimmed = focusDriver !== null && !focused;
  const r = showNumberInside || special ? (focused ? 8 : 6.6) : focused ? 6.5 : 5;
  const compound = activeCompounds?.get(num);
  const label = special ? special.shortLabel : (driver?.name_acronym ?? String(num));
  const gap = special ? null : (gapText?.get(num) ?? null);
  const textColor = labelTextColor(color);
  const boxW = 34;
  const boxH = gap ? 20 : 13;
  const boxX = car.labelX - boxW / 2;
  const boxY = car.labelY - boxH / 2;

  return (
    <g
      opacity={dimmed ? 0.4 : 1}
      onClick={() => {
        trackEvent("trackmap_driver_selected", { driver_number: num, view: "ring" });
        onSelectDriver?.(num);
      }}
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
            fontSize={special ? 4 : focused ? (num >= 10 ? 5.6 : 6.2) : 4.8}
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
