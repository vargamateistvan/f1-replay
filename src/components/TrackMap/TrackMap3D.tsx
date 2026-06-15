import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line } from "@react-three/drei";
import * as THREE from "three";
import { useSettings } from "@/stores/settings";
import { useTimeline } from "@/timeline/clock";
import { getCircuitGeometry } from "@/data/circuitGeometry";
import { useTrackOutline } from "@/hooks/useTrackMap";
import { useCarPositions } from "@/hooks/useCarPositions";
import { teamColor } from "@/utils/color";
import type { Driver, Location, Stint } from "@/api/types";
import type { LeaderboardRow } from "./TrackMap";

// ── Coordinate normalization ──────────────────────────────────────────────────
// Maps F1 Cartesian (arbitrary scale/origin) into a Three.js world space where
// the track fits in a ~100-unit bounding box centred at the origin.
// Three.js is Y-up: F1 x→WorldX, F1 y→WorldZ (negated), F1 z→WorldY (elevation).

const WORLD_SIZE = 100;

interface WorldTransform {
  cx: number;
  cy: number;
  scale: number;
  minZ: number;
  zRange: number;
}

function makeTransform(
  xs: readonly number[],
  ys: readonly number[],
  zs?: readonly number[],
): WorldTransform {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = 0, maxZ = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!, y = ys[i]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (zs?.length) {
    minZ = Infinity; maxZ = -Infinity;
    for (const z of zs) {
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  const scale = WORLD_SIZE / Math.max(maxX - minX, maxY - minY, 1);
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    scale,
    minZ,
    zRange: maxZ - minZ || 1,
  };
}

function toWorld(
  x: number,
  y: number,
  z: number,
  tr: WorldTransform,
  elevScale: number,
  useElev: boolean,
): [number, number, number] {
  // Normalize elevation to [0, elevScale * 8] world units so the track never
  // looks flat even at 1× or overwhelmingly tall at 8×.
  const wy = useElev
    ? ((z - tr.minZ) / tr.zRange) * elevScale * 8
    : 0;
  return [(x - tr.cx) * tr.scale, wy, -(y - tr.cy) * tr.scale];
}

// ── Inner scene (must live inside <Canvas>) ───────────────────────────────────

interface SceneProps {
  trackPts: [number, number, number][];
  carPositions: Array<{
    num: number;
    worldPos: [number, number, number];
    color: string;
    focused: boolean;
  }>;
  autoRotate: boolean;
  playing: boolean;
}

function TrackScene({ trackPts, carPositions, autoRotate, playing }: SceneProps) {
  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[50, 80, 30]} intensity={0.6} />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        maxPolarAngle={Math.PI / 2.05}
        autoRotate={autoRotate && !playing}
        autoRotateSpeed={0.8}
      />

      {/* Track ribbon — three layered lines for base / surface / highlight */}
      {trackPts.length > 2 && (
        <>
          <Line points={trackPts} color="#38383f" lineWidth={12} />
          <Line points={trackPts} color="#4a4a55" lineWidth={7} />
          <Line points={trackPts} color="#ffffff" lineWidth={1} transparent opacity={0.12} />
        </>
      )}

      {/* Car dots */}
      {carPositions.map(({ num, worldPos, color, focused }) => (
        <group key={num} position={worldPos}>
          {focused && (
            <mesh rotation={[-Math.PI / 2, 0, 0] as [number, number, number]}>
              <ringGeometry args={[1.5, 2.0, 32]} />
              <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
            </mesh>
          )}
          <mesh>
            <sphereGeometry args={[focused ? 1.0 : 0.65, 10, 10]} />
            <meshStandardMaterial color={color} roughness={0.3} metalness={0.4} />
          </mesh>
        </group>
      ))}
    </>
  );
}

// ── Public component ──────────────────────────────────────────────────────────

export interface Props {
  readonly sessionKey: number | null;
  readonly drivers: Driver[];
  readonly locationData: Location[];
  readonly sessionStartMs: number;
  readonly focusDriver?: number | null;
  readonly circuitKey?: number | null;
  readonly retiredDrivers?: ReadonlySet<number>;
  readonly leaderboard?: readonly LeaderboardRow[];
  readonly activeCompounds?: ReadonlyMap<
    number,
    { compound: Stint["compound"]; age: number }
  >;
  readonly onSelectDriver?: (driverNumber: number) => void;
}

export function TrackMap3D({
  sessionKey,
  drivers,
  locationData,
  sessionStartMs,
  focusDriver = null,
  circuitKey = null,
  retiredDrivers,
  leaderboard,
}: Props) {
  const { map3dElevation, map3dElevationScale, map3dAutoRotate } = useSettings();
  const { playing } = useTimeline();

  const circuitGeom = circuitKey != null ? getCircuitGeometry(circuitKey) : null;
  const fallbackDriverNum = !circuitGeom
    ? (drivers[0]?.driver_number ?? null)
    : null;

  const { data: outline } = useTrackOutline(
    sessionKey,
    fallbackDriverNum,
    circuitKey,
  );

  const driverByNumber = useMemo(
    () => new Map(drivers.map((d) => [d.driver_number, d])),
    [drivers],
  );

  const worldTransform = useMemo((): WorldTransform | null => {
    if (circuitGeom?.x.length) {
      return makeTransform(circuitGeom.x, circuitGeom.y, circuitGeom.z);
    }
    if (outline?.points.length) {
      const xs = outline.points.map((p) => p.x);
      const ys = outline.points.map((p) => p.y);
      return makeTransform(xs, ys);
    }
    return null;
  }, [circuitGeom, outline]);

  const trackPts = useMemo((): [number, number, number][] => {
    if (!worldTransform) return [];
    let pts: [number, number, number][];
    if (circuitGeom?.x.length) {
      pts = circuitGeom.x.map((x, i) =>
        toWorld(
          x,
          circuitGeom.y[i]!,
          circuitGeom.z?.[i] ?? 0,
          worldTransform,
          map3dElevationScale,
          map3dElevation,
        ),
      );
    } else if (outline?.points.length) {
      pts = outline.points.map((p) =>
        toWorld(p.x, p.y, 0, worldTransform, map3dElevationScale, false),
      );
    } else {
      return [];
    }
    // Manually close the loop so the track ribbon has no gap.
    if (pts.length > 2) pts = [...pts, pts[0]!];
    return pts;
  }, [circuitGeom, outline, worldTransform, map3dElevation, map3dElevationScale]);

  // 60 Hz car positions
  const rawPositions = useCarPositions(locationData, sessionStartMs, retiredDrivers);

  const carPositions = useMemo(() => {
    if (!worldTransform) return [];
    return rawPositions.map(({ num, x, y, z }) => {
      const driver = driverByNumber.get(num);
      return {
        num,
        worldPos: toWorld(
          x, y, z, worldTransform, map3dElevationScale, map3dElevation,
        ) as [number, number, number],
        color: teamColor(driver?.team_colour),
        focused: focusDriver === num,
      };
    });
  }, [rawPositions, worldTransform, driverByNumber, focusDriver, map3dElevation, map3dElevationScale]);

  if (!worldTransform) {
    return (
      <div className="flex items-center justify-center w-full h-full text-muted text-sm animate-pulse">
        Loading track…
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <Canvas
        camera={{ position: [0, 80, 90], fov: 50 }}
        dpr={[1, 2]}
        style={{ background: "#15151e" }}
        gl={{ antialias: true }}
      >
        <TrackScene
          trackPts={trackPts}
          carPositions={carPositions}
          autoRotate={map3dAutoRotate}
          playing={playing}
        />
      </Canvas>

      {leaderboard && leaderboard.length > 0 && (
        <div
          className="absolute bottom-2 left-2 flex flex-col gap-px pointer-events-none"
          style={{ minWidth: 110 }}
        >
          {leaderboard.map((row) => (
            <div
              key={row.num}
              className="flex items-center gap-1.5 px-1.5 py-0.5"
              style={{
                background: "rgba(21,21,30,0.82)",
                backdropFilter: "blur(4px)",
              }}
            >
              <span className="text-[9px] font-black tabular-nums text-muted w-4 text-right shrink-0">
                {row.pos}
              </span>
              <span
                className="w-[2px] self-stretch shrink-0 rounded-sm"
                style={{ background: row.color }}
              />
              <span
                className="text-[10px] font-black uppercase tracking-wide flex-1"
                style={{ color: row.color }}
              >
                {row.acronym}
              </span>
              <span className="text-[9px] font-mono tabular-nums text-muted shrink-0">
                {row.gap}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="absolute top-2 right-2 pointer-events-none">
        <div className="text-[9px] text-muted/60 bg-[#15151e]/60 px-1.5 py-1 rounded">
          Drag to orbit · Scroll to zoom
        </div>
      </div>
    </div>
  );
}
