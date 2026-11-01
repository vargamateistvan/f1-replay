import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus } from "lucide-react";
import { getCircuitLocation } from "@/data/circuitLocations";
import { WORLD_LAND_PATH } from "@/data/worldLand";
import { FOCUS_RING, buttonClass } from "@/components/Button/buttonClass";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { prefersReducedMotion } from "@/lib/motion";
import { useSettings } from "@/stores/settings";
import { distanceUnitLabel, toDisplayDistanceKm } from "@/utils/units";
import type { ScheduleRound, ScheduleStatus } from "@/utils/schedule";
import {
  cameraViewBox,
  clampCamera,
  clusterMarkers,
  fitCamera,
  legArcPath,
  lerpCamera,
  mapToScreen,
  projectLngLat,
  screenToMap,
  travelDistanceKm,
  worldBounds,
  zoomCameraAt,
  type LngLat,
  type MapCamera,
  type MapPoint,
} from "@/utils/worldMap";
import {
  SCHEDULE_MAP_ANIM_MS,
  SCHEDULE_MAP_ARC_BOW,
  SCHEDULE_MAP_CLUSTER_PX,
  SCHEDULE_MAP_DRAG_THRESHOLD_PX,
  SCHEDULE_MAP_FIT_PAD_PX,
  SCHEDULE_MAP_MAX_LAT,
  SCHEDULE_MAP_MIN_LAT,
  SCHEDULE_MAP_MIN_VIEW_DEG,
  SCHEDULE_MAP_WHEEL_ZOOM,
  SCHEDULE_MAP_ZOOM_STEP,
} from "@/constants";

const BOUNDS = worldBounds(SCHEDULE_MAP_MAX_LAT, SCHEDULE_MAP_MIN_LAT);
const GRATICULE_LNG = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
const GRATICULE_LAT = [-30, 0, 30, 60];
// A cluster click only zooms when it gets meaningfully closer; co-located
// rounds (testing and the race at one venue) open a list instead.
const CLUSTER_MIN_ZOOM_GAIN = 0.75;
// Selected rounds this close to the edge (px) are panned into view.
const EDGE_MARGIN_PX = 32;

const STATUS_LABEL: Record<ScheduleStatus, string> = {
  completed: "completed",
  live: "live weekend",
  upcoming: "upcoming",
  cancelled: "cancelled",
};

interface LocatedRound {
  round: ScheduleRound;
  location: LngLat;
  point: MapPoint;
}

function roundKicker(round: ScheduleRound): string {
  if (round.isTesting) return "Testing";
  return round.round !== null ? `Round ${round.round}` : "Cancelled";
}

function markerText(round: ScheduleRound): string {
  if (round.isTesting) return "T";
  return round.round !== null ? String(round.round) : "–";
}

function markerTone(round: ScheduleRound): string {
  if (round.status === "live" || round.isNext) return "border-f1red bg-f1red text-white";
  if (round.status === "completed") return "border-line bg-surface text-muted";
  if (round.status === "cancelled") return "border-panel bg-track text-faint line-through";
  return "border-fg/70 bg-track text-fg";
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setSize({ width: el.clientWidth, height: el.clientHeight });
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

/**
 * Season calendar on a world map: one numbered marker per round (clustered
 * when they crowd), the travel route between race weekends, and the selected
 * round's card beside the map. Drag to pan, wheel or buttons to zoom.
 */
export function ScheduleMap({
  rounds,
  selectedKey,
  onSelect,
  renderRound,
}: {
  rounds: ScheduleRound[];
  selectedKey: number | null;
  onSelect: (meetingKey: number) => void;
  renderRound: (round: ScheduleRound) => ReactNode;
}) {
  const metricSystem = useSettings((s) => s.metricSystem);
  // Side-by-side layout only: below lg the page scrolls past the map.
  const wheelZoom = useMediaQuery("(min-width: 1024px)");
  const [mapRef, size] = useElementSize<HTMLDivElement>();
  const aspect = size.width > 0 && size.height > 0 ? size.width / size.height : 0;

  const located = useMemo<LocatedRound[]>(
    () =>
      rounds.flatMap((round) => {
        const location = getCircuitLocation(round.meeting.circuit_key);
        return location ? [{ round, location, point: projectLngLat(location) }] : [];
      }),
    [rounds],
  );
  const byKey = useMemo(
    () => new Map(located.map((item) => [item.round.meeting.meeting_key, item])),
    [located],
  );

  // The championship route: numbered rounds in calendar order.
  const route = useMemo(
    () => located.filter((item) => item.round.round !== null),
    [located],
  );
  const legs = useMemo(
    () =>
      route.slice(1).map((to, i) => ({
        key: to.round.meeting.meeting_key,
        d: legArcPath(route[i].point, to.point, SCHEDULE_MAP_ARC_BOW),
        done: to.round.status !== "upcoming",
      })),
    [route],
  );
  const travelKm = useMemo(
    () => travelDistanceKm(route.map((item) => item.location)),
    [route],
  );

  // ── Camera ──────────────────────────────────────────────────────────────
  const [camera, setCameraState] = useState<MapCamera | null>(null);
  const cameraRef = useRef<MapCamera | null>(null);
  const aspectRef = useRef(aspect);
  aspectRef.current = aspect;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const byKeyRef = useRef(byKey);
  byKeyRef.current = byKey;
  const animRef = useRef<number | null>(null);
  const [openCluster, setOpenCluster] = useState<number[] | null>(null);

  const setCamera = useCallback((next: MapCamera) => {
    const clamped = clampCamera(next, aspectRef.current, BOUNDS, SCHEDULE_MAP_MIN_VIEW_DEG);
    cameraRef.current = clamped;
    setCameraState(clamped);
  }, []);

  const stopAnimation = useCallback(() => {
    if (animRef.current !== null) cancelAnimationFrame(animRef.current);
    animRef.current = null;
  }, []);

  const flyTo = useCallback(
    (target: MapCamera) => {
      stopAnimation();
      setOpenCluster(null);
      const from = cameraRef.current;
      const to = clampCamera(target, aspectRef.current, BOUNDS, SCHEDULE_MAP_MIN_VIEW_DEG);
      if (!from || prefersReducedMotion()) {
        setCamera(to);
        return;
      }
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / SCHEDULE_MAP_ANIM_MS);
        setCamera(lerpCamera(from, to, 1 - (1 - t) ** 3));
        animRef.current = t < 1 ? requestAnimationFrame(tick) : null;
      };
      animRef.current = requestAnimationFrame(tick);
    },
    [setCamera, stopAnimation],
  );
  useEffect(() => stopAnimation, [stopAnimation]);

  const fitSeason = useCallback(
    () =>
      fitCamera(
        located.map((item) => item.point),
        aspectRef.current,
        BOUNDS,
        {
          padPx: SCHEDULE_MAP_FIT_PAD_PX,
          widthPx: sizeRef.current.width,
          minW: SCHEDULE_MAP_MIN_VIEW_DEG,
        },
      ),
    [located],
  );

  // Fit the season once the map has a size (again if the circuits arrive
  // later); afterwards a resize keeps centre and zoom, re-clamped.
  const fittedWithPoints = useRef(false);
  const hasPoints = located.length > 0;
  useEffect(() => {
    if (aspect === 0) return;
    if (!cameraRef.current || (hasPoints && !fittedWithPoints.current)) {
      fittedWithPoints.current = hasPoints;
      setCamera(fitSeason());
    } else {
      setCamera(cameraRef.current);
    }
    // fitSeason changes on every schedule clock tick; only aspect and the
    // arrival of circuits should refit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, hasPoints, setCamera]);

  const view = camera && aspect ? cameraViewBox(camera, aspect) : null;

  const clusters = useMemo(
    () =>
      view
        ? clusterMarkers(
            located.map((item) => ({
              id: item.round.meeting.meeting_key,
              ...mapToScreen(item.point, view, size.width, size.height),
            })),
            SCHEDULE_MAP_CLUSTER_PX,
          )
        : [],
    // `view` is derived from these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [located, camera, aspect, size.width, size.height],
  );

  // Keep the selected round on screen when it changes from outside the map
  // (panel arrows, URL) — but not on every clock tick or resize.
  useEffect(() => {
    const item = selectedKey === null ? undefined : byKeyRef.current.get(selectedKey);
    const cam = cameraRef.current;
    const { width, height } = sizeRef.current;
    if (!item || !cam || !aspectRef.current) return;
    const p = mapToScreen(item.point, cameraViewBox(cam, aspectRef.current), width, height);
    const inside =
      p.x >= EDGE_MARGIN_PX &&
      p.x <= width - EDGE_MARGIN_PX &&
      p.y >= EDGE_MARGIN_PX &&
      p.y <= height - EDGE_MARGIN_PX;
    if (!inside) flyTo({ ...cam, cx: item.point.x, cy: item.point.y });
  }, [selectedKey, flyTo]);

  const zoomBy = useCallback(
    (factor: number) => {
      const cam = cameraRef.current;
      if (cam) flyTo(zoomCameraAt(cam, factor));
    },
    [flyTo],
  );

  // ── Pan (drag) ──────────────────────────────────────────────────────────
  const dragRef = useRef<{
    id: number;
    x: number;
    y: number;
    camera: MapCamera;
    moved: boolean;
  } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const cam = cameraRef.current;
    if (!cam || e.button !== 0 || (e.target as Element).closest("button, ul")) return;
    stopAnimation();
    dragRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, camera: cam, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== e.pointerId || !size.width) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < SCHEDULE_MAP_DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      setOpenCluster(null);
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    const unitsPerPx = drag.camera.w / size.width;
    setCamera({
      ...drag.camera,
      cx: drag.camera.cx - dx * unitsPerPx,
      cy: drag.camera.cy - dy * unitsPerPx,
    });
  };
  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.id === e.pointerId) dragRef.current = null;
  };

  // ── Wheel zoom (desktop; non-passive so the page doesn't scroll) ────────
  useEffect(() => {
    const el = mapRef.current;
    if (!el || !wheelZoom) return;
    const onWheel = (e: WheelEvent) => {
      const cam = cameraRef.current;
      const a = aspectRef.current;
      if (!cam || !a) return;
      e.preventDefault();
      stopAnimation();
      setOpenCluster(null);
      const rect = el.getBoundingClientRect();
      const anchor = screenToMap(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        cameraViewBox(cam, a),
        rect.width,
        rect.height,
      );
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      setCamera(zoomCameraAt(cam, SCHEDULE_MAP_WHEEL_ZOOM ** (delta / 100), anchor));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [mapRef, wheelZoom, setCamera, stopAnimation]);

  useEffect(() => {
    if (!openCluster) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenCluster(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openCluster]);

  const onClusterClick = (ids: number[]) => {
    const cam = cameraRef.current;
    const { width } = sizeRef.current;
    if (!cam || !width) return;
    const points = ids.flatMap((id) => byKey.get(id)?.point ?? []);
    const target = fitCamera(points, aspectRef.current, BOUNDS, {
      padPx: SCHEDULE_MAP_FIT_PAD_PX,
      widthPx: width,
      minW: SCHEDULE_MAP_MIN_VIEW_DEG,
    });
    // Would the members still merge at the closest useful zoom?
    const spread = Math.max(
      ...points.map((p) => Math.hypot(p.x - points[0].x, p.y - points[0].y)),
    );
    const separable = (spread * width) / target.w > SCHEDULE_MAP_CLUSTER_PX;
    if (separable && target.w < cam.w * CLUSTER_MIN_ZOOM_GAIN) flyTo(target);
    else setOpenCluster((open) => (open?.[0] === ids[0] ? null : ids));
  };

  const select = (meetingKey: number) => {
    setOpenCluster(null);
    onSelect(meetingKey);
  };

  // ── Side panel ──────────────────────────────────────────────────────────
  const selectedIndex = rounds.findIndex((r) => r.meeting.meeting_key === selectedKey);
  const selected = selectedIndex >= 0 ? rounds[selectedIndex] : null;
  const step = (delta: number) => {
    const next = rounds[selectedIndex + delta];
    if (next) select(next.meeting.meeting_key);
  };

  const inView = (p: MapPoint) =>
    p.x >= -SCHEDULE_MAP_CLUSTER_PX &&
    p.x <= size.width + SCHEDULE_MAP_CLUSTER_PX &&
    p.y >= -SCHEDULE_MAP_CLUSTER_PX &&
    p.y <= size.height + SCHEDULE_MAP_CLUSTER_PX;

  const travel = toDisplayDistanceKm(travelKm, metricSystem);
  const zoomButton = `flex h-8 w-8 items-center justify-center bg-surface text-muted transition-colors hover:text-fg ${FOCUS_RING}`;

  return (
    <div className="flex flex-col md:min-h-0 md:flex-1 md:overflow-auto lg:flex-row lg:overflow-hidden">
      <div className="flex shrink-0 flex-col lg:min-h-0 lg:min-w-0 lg:flex-1 lg:shrink">
        <div
          ref={mapRef}
          role="group"
          aria-label="Season map"
          data-testid="schedule-map"
          className="relative h-[55vh] min-h-64 shrink-0 cursor-grab touch-pan-y select-none overflow-hidden bg-sunken active:cursor-grabbing lg:h-auto lg:min-h-0 lg:flex-1 lg:shrink lg:touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {view && (
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <g className="stroke-line/40" strokeWidth={1}>
                {GRATICULE_LNG.map((lng) => (
                  <line
                    key={`lng${lng}`}
                    x1={lng + 180}
                    x2={lng + 180}
                    y1={-90}
                    y2={270}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {GRATICULE_LAT.map((lat) => (
                  <line
                    key={`lat${lat}`}
                    x1={-180}
                    x2={540}
                    y1={90 - lat}
                    y2={90 - lat}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
              <path
                d={WORLD_LAND_PATH}
                className="fill-panel stroke-line"
                strokeWidth={0.75}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <g fill="none" strokeLinecap="round">
                {legs.map((leg) => (
                  <path
                    key={leg.key}
                    d={leg.d}
                    className={leg.done ? "stroke-fg/25" : "stroke-f1red/70"}
                    strokeWidth={1.5}
                    strokeDasharray={leg.done ? undefined : "3 4"}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            </svg>
          )}

          <div className="pointer-events-none absolute inset-0">
            {clusters.map((cluster) => {
              if (!inView(cluster)) return null;
              const style = { left: cluster.x, top: cluster.y };
              if (cluster.ids.length > 1) {
                const members = cluster.ids.flatMap((id) => byKey.get(id)?.round ?? []);
                const hasSelected = selectedKey !== null && cluster.ids.includes(selectedKey);
                const hasNext = members.some((r) => r.isNext || r.status === "live");
                const isOpen = openCluster?.[0] === cluster.ids[0];
                return (
                  <div
                    key={`c${cluster.ids[0]}`}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 ${isOpen || hasSelected ? "z-20" : "z-10"}`}
                    style={style}
                  >
                    <button
                      type="button"
                      onClick={() => onClusterClick(cluster.ids)}
                      aria-expanded={isOpen}
                      aria-label={`${members.length} rounds: ${members
                        .map((r) => r.meeting.location)
                        .join(", ")}`}
                      title={members
                        .map((r) => `${roundKicker(r)} · ${r.meeting.meeting_name}`)
                        .join("\n")}
                      className={`pointer-events-auto flex h-7 min-w-7 items-center justify-center rounded-full border-2 bg-fg px-1.5 font-mono text-caption font-bold text-track shadow-md transition-transform hover:scale-110 ${
                        hasNext ? "border-f1red" : "border-track"
                      } ${hasSelected ? "ring-2 ring-f1red ring-offset-2 ring-offset-sunken" : ""} ${FOCUS_RING}`}
                    >
                      {members.length}
                    </button>
                    {isOpen && (
                      <ul
                        className="pointer-events-auto absolute left-1/2 top-full mt-2 w-56 -translate-x-1/2 overflow-hidden rounded-sm border border-panel bg-surface py-1 shadow-xl"
                        aria-label="Rounds at this location"
                      >
                        {members.map((r) => (
                          <li key={r.meeting.meeting_key}>
                            <button
                              type="button"
                              onClick={() => select(r.meeting.meeting_key)}
                              className={`flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left hover:bg-panel/60 ${FOCUS_RING}`}
                            >
                              <span className="shrink-0 font-mono text-tiny font-bold uppercase tracking-wider text-muted">
                                {roundKicker(r)}
                              </span>
                              <span className="truncate text-small text-fg">
                                {r.meeting.meeting_name}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              }

              const item = byKey.get(cluster.ids[0]);
              if (!item) return null;
              const { round } = item;
              const isSelected = round.meeting.meeting_key === selectedKey;
              return (
                <div
                  key={round.meeting.meeting_key}
                  className={`absolute -translate-x-1/2 -translate-y-1/2 ${isSelected ? "z-20" : ""}`}
                  style={style}
                >
                  {round.status === "live" && (
                    <span className="absolute inset-0 rounded-full bg-f1red opacity-60 motion-safe:animate-ping" />
                  )}
                  <button
                    type="button"
                    onClick={() => select(round.meeting.meeting_key)}
                    aria-pressed={isSelected}
                    aria-label={`${roundKicker(round)}: ${round.meeting.meeting_name}, ${STATUS_LABEL[round.status]}`}
                    title={`${roundKicker(round)} · ${round.meeting.meeting_name}`}
                    className={`pointer-events-auto relative flex h-6 min-w-6 items-center justify-center rounded-full border-2 px-1 font-mono text-tiny font-bold shadow-md transition-transform ${markerTone(round)} ${
                      isSelected
                        ? "scale-125 ring-2 ring-fg ring-offset-2 ring-offset-sunken"
                        : "hover:scale-110"
                    } ${FOCUS_RING}`}
                  >
                    {markerText(round)}
                  </button>
                  {isSelected && (
                    <span className="pointer-events-none absolute bottom-full left-1/2 mb-2.5 -translate-x-1/2 whitespace-nowrap rounded-sm border border-panel bg-surface px-1.5 py-0.5 text-tiny font-bold uppercase tracking-wider text-fg shadow-md">
                      {round.meeting.location}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="absolute right-2 top-2 z-30 flex flex-col divide-y divide-panel overflow-hidden rounded-sm border border-panel shadow-md">
            <button
              type="button"
              className={zoomButton}
              onClick={() => zoomBy(1 / SCHEDULE_MAP_ZOOM_STEP)}
              aria-label="Zoom in"
              title="Zoom in"
            >
              <Plus aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={zoomButton}
              onClick={() => zoomBy(SCHEDULE_MAP_ZOOM_STEP)}
              aria-label="Zoom out"
              title="Zoom out"
            >
              <Minus aria-hidden="true" className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={zoomButton}
              onClick={() => flyTo(fitSeason())}
              aria-label="Show the whole season"
              title="Show the whole season"
            >
              <Maximize2 aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-panel bg-track px-3 py-1.5">
          <ul
            aria-label="Legend"
            className="flex flex-wrap gap-x-3 gap-y-1 text-tiny font-bold uppercase tracking-wider text-muted"
          >
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-f1red bg-f1red" />
              Next
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-fg/70 bg-track" />
              Upcoming
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-line bg-surface" />
              Completed
            </li>
          </ul>
          {route.length > 1 && (
            <div className="flex items-baseline gap-2">
              <span className="text-tiny font-bold uppercase tracking-widest text-muted">
                Season travel
              </span>
              <span className="font-mono text-small text-fg">
                ≈ {Math.round(travel).toLocaleString()} {distanceUnitLabel(metricSystem)}
              </span>
            </div>
          )}
        </div>
      </div>

      <aside
        aria-label="Selected round"
        className="flex flex-col gap-2 border-t border-panel bg-track p-3 sm:p-4 lg:w-[30rem] lg:shrink-0 lg:overflow-auto lg:border-l lg:border-t-0"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={selectedIndex <= 0}
            aria-label="Previous round"
            className={buttonClass("quiet", "sm", "h-8 w-8 px-0")}
          >
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1 text-center text-tiny font-black uppercase tracking-widest text-muted">
            {selected ? roundKicker(selected) : "Pick a round on the map"}
          </div>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={selectedIndex < 0 || selectedIndex >= rounds.length - 1}
            aria-label="Next round"
            className={buttonClass("quiet", "sm", "h-8 w-8 px-0")}
          >
            <ChevronRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
        {selected && !byKey.has(selected.meeting.meeting_key) && (
          <p className="text-small text-muted">This circuit isn&apos;t on the map yet.</p>
        )}
        {selected && renderRound(selected)}
      </aside>
    </div>
  );
}
