import type { Driver, Stint } from "@/api/types";
import { COMPOUND_COLORS, SAFETY_CAR_NUMBERS } from "@/constants";
import { trackEvent } from "@/lib/analytics";
import { teamColor } from "@/utils/color";
import { mapBackgroundColor } from "../trackMapFormat";
import { projectToSvg, type TrackGeometry } from "../trackGeometry";

interface SpecialVehicleStyle {
  shortLabel: string;
  fullLabel: string;
  fill: string;
  stroke: string;
  text: string;
  /** Marker text colour in dark mode; falls back to `text`. */
  textDark?: string;
  halo: string;
}

const SAFETY_CAR_STYLE: SpecialVehicleStyle = {
  shortLabel: "SC",
  fullLabel: "SAFETY CAR",
  fill: "#f5a623",
  stroke: "#7a5400",
  text: "#101010",
  textDark: "#ffffff",
  halo: "rgba(245,166,35,0.55)",
};

const SPECIAL_TRACK_VEHICLES: Record<number, SpecialVehicleStyle> = {
  // Both safety cars share one presentation; whichever is deployed for the
  // event is the one that reports real coordinates.
  241: SAFETY_CAR_STYLE,
  242: SAFETY_CAR_STYLE,
  243: SAFETY_CAR_STYLE,
  244: {
    shortLabel: "MC",
    fullLabel: "MEDICAL CAR",
    fill: "#e8002d",
    stroke: "#5f121d",
    text: "#ffffff",
    halo: "rgba(232,0,45,0.55)",
  },
};

export interface CarPosition {
  num: number;
  /** OpenF1 coordinates (not yet projected to SVG). */
  x: number;
  y: number;
}

interface CarLayerProps {
  geom: TrackGeometry;
  carPositions: readonly CarPosition[];
  driverByNumber: ReadonlyMap<number, Driver>;
  focusDriver: number | null;
  pulseDrivers?: readonly number[];
  battlingDrivers?: ReadonlySet<number>;
  activeCompounds?: ReadonlyMap<
    number,
    { compound: Stint["compound"]; age: number }
  >;
  safetyCarSirenOn: boolean;
  rotationDeg: number;
  lightMode: boolean;
  showAcronym: boolean;
  showNumberInside: boolean;
  onSelectDriver?: (driverNumber: number) => void;
}

/** Car dots — when a driver is focused, dim the rest and enlarge the pick. */
export function CarLayer({
  carPositions,
  focusDriver,
  pulseDrivers,
  ...rest
}: CarLayerProps) {
  const pulseSet = new Set(pulseDrivers ?? []);
  // Focused car last so it paints on top.
  const ordered = carPositions
    .slice()
    .sort(
      (a, b) =>
        (a.num === focusDriver ? 1 : 0) - (b.num === focusDriver ? 1 : 0),
    );
  return (
    <>
      {ordered.map((pos) => (
        <CarMarker
          key={pos.num}
          {...rest}
          pos={pos}
          focusDriver={focusDriver}
          pulsing={pulseSet.has(pos.num)}
        />
      ))}
    </>
  );
}

function CarMarker({
  geom,
  pos: { num, x, y },
  driverByNumber,
  focusDriver,
  pulsing,
  battlingDrivers,
  activeCompounds,
  safetyCarSirenOn,
  rotationDeg,
  lightMode,
  showAcronym,
  showNumberInside,
  onSelectDriver,
}: Omit<CarLayerProps, "carPositions" | "pulseDrivers"> & {
  pos: CarPosition;
  pulsing: boolean;
}) {
  const driver = driverByNumber.get(num);
  const specialVehicle = SPECIAL_TRACK_VEHICLES[num];
  const isSafetyCar = SAFETY_CAR_NUMBERS.has(num);
  const sirenOn = isSafetyCar && safetyCarSirenOn;
  const color = specialVehicle
    ? specialVehicle.fill
    : teamColor(driver?.team_colour, "#ffffff");
  const { sx, sy } = projectToSvg(geom, x, y);
  const focused = focusDriver === num;
  const dimmed = focusDriver !== null && !focused;
  const showLabel = (focusDriver === null || focused) && showAcronym;
  const isBattling = battlingDrivers?.has(num) ?? false;
  const compoundInfo = activeCompounds?.get(num);
  const dotRadius = showNumberInside
    ? focused
      ? 8
      : 6.6
    : focused
      ? 6.5
      : 4.5;
  const serviceRadius = focused ? dotRadius + 0.7 : dotRadius + 0.4;
  const markerStroke = specialVehicle ? specialVehicle.stroke : "#ffffff";
  const markerTextColor = specialVehicle
    ? lightMode
      ? specialVehicle.text
      : (specialVehicle.textDark ?? specialVehicle.text)
    : "#ffffff";
  const markerText = specialVehicle ? specialVehicle.shortLabel : String(num);
  const markerLabel = specialVehicle
    ? specialVehicle.fullLabel
    : (driver?.name_acronym ?? num);
  const labelX = 10;
  const labelY = focused ? -9 : -7;

  return (
    <g
      transform={`translate(${sx.toFixed(1)},${sy.toFixed(1)})`}
      opacity={dimmed ? 0.3 : 1}
      onClick={() => {
        trackEvent("trackmap_driver_selected", { driver_number: num });
        onSelectDriver?.(num);
      }}
      style={onSelectDriver ? { cursor: "pointer" } : undefined}
    >
      {/* Battle ring: dashed amber ring for cars within 1 s of the car ahead */}
      {isBattling && !pulsing && (
        <circle
          r={focused ? 13 : 8}
          fill="none"
          stroke="#ffd700"
          strokeWidth={1.5}
          strokeOpacity={0.75}
          strokeDasharray="3 2"
        />
      )}
      {pulsing && (
        <circle r={6} fill="none" stroke="#ffffff" strokeWidth={1.5}>
          <animate
            attributeName="r"
            from="6"
            to="14"
            dur="0.8s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="stroke-opacity"
            from="0.9"
            to="0"
            dur="0.8s"
            repeatCount="indefinite"
          />
        </circle>
      )}
      {focused && (
        <circle
          r={dotRadius + 2.5}
          fill="none"
          stroke={specialVehicle ? specialVehicle.halo : color}
          strokeWidth={1.5}
          strokeOpacity={0.5}
        />
      )}
      {specialVehicle && (
        <circle
          r={serviceRadius + 1.8}
          fill="none"
          stroke={specialVehicle.stroke}
          strokeWidth={1.1}
          strokeDasharray="2.2 1.6"
          strokeOpacity={0.8}
        />
      )}
      {sirenOn && (
        <circle
          r={serviceRadius + 3.2}
          fill="none"
          stroke={specialVehicle?.fill ?? "#f5a623"}
          strokeWidth={1.2}
          strokeOpacity={0.78}
        >
          <animate
            attributeName="r"
            values={`${(serviceRadius + 2.4).toFixed(1)};${(serviceRadius + 5.8).toFixed(1)};${(serviceRadius + 2.4).toFixed(1)}`}
            dur="0.95s"
            repeatCount="indefinite"
          />
          <animate
            attributeName="stroke-opacity"
            values="0.85;0.25;0.85"
            dur="0.95s"
            repeatCount="indefinite"
          />
        </circle>
      )}
      {isSafetyCar && !sirenOn && (
        <circle
          r={serviceRadius + 3.4}
          fill="none"
          stroke="#9aa4be"
          strokeWidth={0.9}
          strokeOpacity={0.34}
        />
      )}
      <circle
        r={specialVehicle ? serviceRadius : dotRadius}
        fill={color}
        stroke={markerStroke}
        strokeWidth={focused ? 1.6 : 1.2}
        strokeOpacity={focused ? 0.9 : 0.78}
      />
      {(showNumberInside || specialVehicle) && (
        <text
          x={0}
          y={0}
          transform={`rotate(${-rotationDeg.toFixed(1)} 0 0)`}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={
            specialVehicle
              ? focused
                ? 4.1
                : 3.8
              : focused
                ? num >= 10
                  ? 5.2
                  : 5.8
                : 4.4
          }
          fill={markerTextColor}
          stroke="rgba(0,0,0,0.58)"
          strokeWidth={0.6}
          paintOrder="stroke"
          fontFamily="Inter, sans-serif"
          fontWeight="900"
        >
          {markerText}
        </text>
      )}
      {/* Compound badge: small dot in tyre-compound colour */}
      {compoundInfo && (
        <circle
          cx={focused ? 8 : 5}
          cy={focused ? 8 : 5}
          r={focused ? 2.5 : 1.8}
          fill={COMPOUND_COLORS[compoundInfo.compound]}
          stroke={mapBackgroundColor(lightMode)}
          strokeWidth={0.5}
        />
      )}
      {showLabel && (
        <text
          x={labelX}
          y={labelY}
          textAnchor="start"
          transform={`rotate(${-rotationDeg.toFixed(1)} ${labelX.toFixed(1)} ${labelY.toFixed(1)})`}
          fontSize={focused ? 9 : 8}
          fill={specialVehicle ? markerTextColor : color}
          fontFamily="Inter, sans-serif"
          fontWeight="900"
          letterSpacing="0.04em"
        >
          {markerLabel}
        </text>
      )}
    </g>
  );
}
