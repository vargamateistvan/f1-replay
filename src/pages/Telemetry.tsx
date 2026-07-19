import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lap } from "@/api/types";
import { ErrorMessage } from "@/components/ErrorMessage";
import { TelemetryChart } from "@/components/TelemetryChart/TelemetryChart";
import {
  computeTrackAutoRotationDeg,
  locationToSvg,
  useTrackOutline,
} from "@/hooks/useTrackMap";
import { useSearchParams } from "react-router-dom";
import {
  useCarDataForLap,
  type TelemetrySample,
} from "@/hooks/useCarDataForLap";
import { useDrivers, useLaps, useSessions } from "@/hooks/useSession";
import { useNumberParam, useStringParam } from "@/hooks/useSearchParamState";
import { useSettings } from "@/stores/settings";
import { teamColor } from "@/utils/color";
import { computeDelta, resampleToAxis, smooth } from "@/utils/telemetry";
import { speedUnitLabel, toDisplaySpeed } from "@/utils/units";

interface PlotSlot {
  num: number;
  label: string;
  color: string;
  data: TelemetrySample[];
}

interface SplitRow {
  num: number;
  lapNo: number;
  color: string;
  acr: string;
  s1: number | null;
  s2: number | null;
  s3: number | null;
  lap: number | null;
}

interface LapMeta {
  timeText: string;
  statusLabel: string;
  statusClass: string;
}

interface SparklineStats {
  min: number;
  max: number;
  avg: number;
}

interface DeltaHint {
  text: string;
  className: string;
}

interface SectorWins {
  s1: boolean;
  s2: boolean;
  s3: boolean;
  total: number;
}

interface TrackPreviewPoint {
  sx: number;
  sy: number;
  dist: number;
}

type SlotKey = "a" | "b" | "c";

const PANEL = "bg-surface border border-panel";
const PANEL_TITLE =
  "text-[10px] font-bold text-muted px-3 py-2 border-b border-[#38383f] uppercase tracking-[0.12em] border-l-2 border-l-f1red bg-track";
const LABEL = "text-[10px] font-bold uppercase tracking-widest text-muted";
const SELECT =
  "bg-[#191922] text-white border border-[#3b3b49] text-xs font-medium px-3 py-2 focus:outline-none focus:border-[#66667a] transition-colors";
const SLOT_COLORS = ["#e8002d", "#0067ff", "#23c552"];
const EMPTY_SECTOR_WINS: SectorWins = {
  s1: false,
  s2: false,
  s3: false,
  total: 0,
};
const TRACK_SVG_W = 360;
const TRACK_SVG_H = 180;

function interpolateTrackPoint(
  points: TrackPreviewPoint[],
  targetDist: number,
): { sx: number; sy: number } | null {
  if (points.length === 0) return null;
  if (targetDist <= 0) {
    const first = points[0]!;
    return { sx: first.sx, sy: first.sy };
  }

  const last = points[points.length - 1]!;
  if (targetDist >= last.dist) return { sx: last.sx, sy: last.sy };

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (points[mid]!.dist < targetDist) lo = mid + 1;
    else hi = mid;
  }

  const right = points[lo]!;
  const left = points[Math.max(0, lo - 1)]!;
  const span = Math.max(1e-6, right.dist - left.dist);
  const t = Math.max(0, Math.min(1, (targetDist - left.dist) / span));
  return {
    sx: left.sx + (right.sx - left.sx) * t,
    sy: left.sy + (right.sy - left.sy) * t,
  };
}

function formatLapTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "--:--.---";
  const minutes = Math.floor(seconds / 60);
  const secs = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${secs.toFixed(3).padStart(6, "0")}`;
}

function sparklineStats(values: number[]): SparklineStats | null {
  if (values.length === 0) return null;
  let min = values[0]!;
  let max = values[0]!;
  let sum = 0;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
  }
  return { min, max, avg: sum / values.length };
}

function formatDeltaHint(deltaSeconds: number | null): DeltaHint {
  if (deltaSeconds === null || !Number.isFinite(deltaSeconds)) {
    return {
      text: "Δ N/A",
      className: "text-muted border-[#4a4a5d] bg-[#171823]",
    };
  }

  if (Math.abs(deltaSeconds) < 0.001) {
    return {
      text: "Δ 0.000s",
      className: "text-muted border-[#4a4a5d] bg-[#171823]",
    };
  }

  const ahead = deltaSeconds > 0;
  return {
    text: `${ahead ? "+" : ""}${deltaSeconds.toFixed(3)}s`,
    className: ahead
      ? "text-[#3fd35a] border-[#276d33] bg-[#112419]"
      : "text-[#ff8a8a] border-[#7a2d38] bg-[#2a1217]",
  };
}

export default function Telemetry() {
  const lightMode = useSettings((s) => s.lightMode);
  const metricSystem = useSettings((s) => s.metricSystem);
  const [activeMode, setActiveMode] = useState<"quali" | "race" | null>(null);
  const [isCardsAccordionOpen, setIsCardsAccordionOpen] = useState(true);
  const [searchParams] = useSearchParams();
  const [isNarrowViewport, setIsNarrowViewport] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(max-width: 1023px)").matches,
  );

  const rawCardDensity = searchParams.get("card");
  const cardDensity: "compact" | "expanded" =
    rawCardDensity === "compact" || rawCardDensity === "expanded"
      ? rawCardDensity
      : isNarrowViewport
        ? "compact"
        : "expanded";
  const [meetingKey] = useNumberParam("meeting", null);
  const [sessionKey] = useNumberParam("session", null);

  const [driverA, setDriverA] = useNumberParam("a", null);
  const [driverB, setDriverB] = useNumberParam("b", null);
  const [driverC, setDriverC] = useNumberParam("c", null);

  const [lapA, setLapA] = useNumberParam("la", null);
  const [lapB, setLapB] = useNumberParam("lb", null);
  const [lapC, setLapC] = useNumberParam("lc", null);

  // Backward-compatible shared lap. Individual lap selectors can override this.
  const [sharedLap, setSharedLap] = useNumberParam("lap", null);

  const [smoothParam, setSmooth] = useStringParam<"0" | "1">("smooth", "0");
  const smoothing = smoothParam === "1";

  const sessions = useSessions(meetingKey);
  const drivers = useDrivers(sessionKey);
  const laps = useLaps(sessionKey);

  const selectedLapA = lapA ?? sharedLap;
  const selectedLapB = lapB ?? sharedLap;
  const selectedLapC = lapC ?? sharedLap;

  const dataA = useCarDataForLap(sessionKey, driverA, selectedLapA);
  const dataB = useCarDataForLap(sessionKey, driverB, selectedLapB);
  const dataC = useCarDataForLap(sessionKey, driverC, selectedLapC);
  const [hoveredDistM, setHoveredDistM] = useState<number | null>(null);

  const session = sessions.data?.find((s) => s.session_key === sessionKey);

  const driverByNumber = useMemo(
    () => new Map((drivers.data ?? []).map((d) => [d.driver_number, d])),
    [drivers.data],
  );

  const availableLaps = useMemo(() => {
    if (!laps.data) return [];
    return [...new Set(laps.data.map((l) => l.lap_number))]
      .sort((a, b) => a - b)
      .filter((lapNo) => lapNo > 0);
  }, [laps.data]);

  const lapsByDriver = useMemo(() => {
    const out = new Map<number, number[]>();
    for (const lap of laps.data ?? []) {
      if (lap.lap_duration === null) continue;
      const prev = out.get(lap.driver_number) ?? [];
      if (!prev.includes(lap.lap_number)) prev.push(lap.lap_number);
      out.set(lap.driver_number, prev);
    }
    for (const values of out.values()) values.sort((a, b) => a - b);
    return out;
  }, [laps.data]);

  const lapLookup = useMemo(() => {
    const out = new Map<string, Lap>();
    for (const lap of laps.data ?? []) {
      out.set(`${lap.driver_number}:${lap.lap_number}`, lap);
    }
    return out;
  }, [laps.data]);

  const trackOutlineA = useTrackOutline(
    sessionKey,
    driverA,
    session?.circuit_key ?? null,
    session?.circuit_short_name ?? null,
  );

  const bestLapByDriver = useMemo(() => {
    const out = new Map<number, number>();
    const bestDuration = new Map<number, number>();

    for (const lap of laps.data ?? []) {
      if (lap.lap_duration === null || lap.is_pit_out_lap) continue;
      const current = bestDuration.get(lap.driver_number);
      if (current === undefined || lap.lap_duration < current) {
        bestDuration.set(lap.driver_number, lap.lap_duration);
        out.set(lap.driver_number, lap.lap_number);
      }
    }

    return out;
  }, [laps.data]);

  const latestLapByDriver = useMemo(() => {
    const out = new Map<number, number>();
    for (const lap of laps.data ?? []) {
      if (lap.lap_duration === null) continue;
      const current = out.get(lap.driver_number);
      if (current === undefined || lap.lap_number > current) {
        out.set(lap.driver_number, lap.lap_number);
      }
    }
    return out;
  }, [laps.data]);

  const acr = (num: number | null, fallback: string) =>
    (num !== null && driverByNumber.get(num)?.name_acronym) || fallback;

  const colorFor = (num: number | null, i: number) =>
    teamColor(
      num !== null ? driverByNumber.get(num)?.team_colour : undefined,
      SLOT_COLORS[i],
    );

  const setSlotLap = (slot: SlotKey, value: number | null) => {
    setActiveMode(null);
    if (slot === "a") setLapA(value);
    if (slot === "b") setLapB(value);
    if (slot === "c") setLapC(value);
  };

  const applyPresetLap = (slot: SlotKey, preset: "best" | "latest") => {
    const selectedDriver =
      slot === "a" ? driverA : slot === "b" ? driverB : driverC;
    if (selectedDriver === null) return;

    const candidate =
      preset === "best"
        ? bestLapByDriver.get(selectedDriver)
        : latestLapByDriver.get(selectedDriver);

    if (candidate !== undefined) setSlotLap(slot, candidate);
  };

  const applyBestToAll = () => {
    setActiveMode(null);
    if (driverA !== null) {
      const best = bestLapByDriver.get(driverA);
      if (best !== undefined) setLapA(best);
    }
    if (driverB !== null) {
      const best = bestLapByDriver.get(driverB);
      if (best !== undefined) setLapB(best);
    }
    if (driverC !== null) {
      const best = bestLapByDriver.get(driverC);
      if (best !== undefined) setLapC(best);
    }
  };

  const syncOtherLapsToA = () => {
    setActiveMode(null);
    if (selectedLapA === null) return;
    if (driverB !== null) setLapB(selectedLapA);
    if (driverC !== null) setLapC(selectedLapA);
  };

  const applyQualiMode = () => {
    setActiveMode("quali");
    setSharedLap(null);
    setSmooth("1");
    applyBestToAll();
  };

  const applyRaceMode = () => {
    setActiveMode("race");
    setSharedLap(null);
    setSmooth("0");
    if (driverA !== null) {
      const latest = latestLapByDriver.get(driverA);
      if (latest !== undefined) setLapA(latest);
    }
    if (driverB !== null) {
      const latest = latestLapByDriver.get(driverB);
      if (latest !== undefined) setLapB(latest);
    }
    if (driverC !== null) {
      const latest = latestLapByDriver.get(driverC);
      if (latest !== undefined) setLapC(latest);
    }
  };

  const getLapMeta = useCallback(
    (driver: number | null, lapNo: number | null): LapMeta => {
      if (driver === null || lapNo === null) {
        return {
          timeText: "No lap selected",
          statusLabel: "Idle",
          statusClass: "text-muted border-[#444458] bg-[#171822]",
        };
      }

      const lap = lapLookup.get(`${driver}:${lapNo}`);
      if (!lap) {
        return {
          timeText: "No timing data",
          statusLabel: "Missing",
          statusClass: "text-[#f5d400] border-[#7e7422] bg-[#2a240f]",
        };
      }

      if (lap.is_pit_out_lap) {
        return {
          timeText: formatLapTime(lap.lap_duration),
          statusLabel: "Pit Out",
          statusClass: "text-[#f5a623] border-[#875d18] bg-[#2d1f0e]",
        };
      }

      if (lap.lap_duration === null) {
        return {
          timeText: "No timing data",
          statusLabel: "Invalid",
          statusClass: "text-[#f5d400] border-[#7e7422] bg-[#2a240f]",
        };
      }

      return {
        timeText: formatLapTime(lap.lap_duration),
        statusLabel: "Valid",
        statusClass: "text-[#39b54a] border-[#276d33] bg-[#112419]",
      };
    },
    [lapLookup],
  );

  const lapMetaA = useMemo(
    () => getLapMeta(driverA, selectedLapA),
    [driverA, selectedLapA, getLapMeta],
  );
  const lapMetaB = useMemo(
    () => getLapMeta(driverB, selectedLapB),
    [driverB, selectedLapB, getLapMeta],
  );

  // Reference axis = driver A; B and C are resampled onto it.
  const dataBResampled = useMemo(
    () =>
      dataA.data && dataB.data ? resampleToAxis(dataA.data, dataB.data) : null,
    [dataA.data, dataB.data],
  );

  const dataCResampled = useMemo(
    () =>
      dataA.data && dataC.data ? resampleToAxis(dataA.data, dataC.data) : null,
    [dataA.data, dataC.data],
  );

  const xDist = useMemo(
    () => dataA.data?.map((s) => s.distM) ?? [],
    [dataA.data],
  );

  const trackPreview = useMemo(() => {
    const outline = trackOutlineA.data;
    if (!outline || outline.points.length < 2) return null;

    const { points: outlinePoints, bounds } = outline;
    if (!Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) {
      return null;
    }

    let dist = 0;
    const points: TrackPreviewPoint[] = outlinePoints.map((point, idx) => {
      if (idx > 0) {
        const prev = outlinePoints[idx - 1]!;
        const dx = point.x - prev.x;
        const dy = point.y - prev.y;
        dist += Math.hypot(dx, dy);
      }

      const { sx, sy } = locationToSvg(
        point.x,
        point.y,
        bounds,
        TRACK_SVG_W,
        TRACK_SVG_H,
      );

      return { sx, sy, dist };
    });

    const polyline = points
      .map((p) => `${p.sx.toFixed(1)},${p.sy.toFixed(1)}`)
      .join(" ");
    return {
      points,
      polyline,
      totalDist: points[points.length - 1]!.dist,
      rotationDeg: computeTrackAutoRotationDeg(outlinePoints, true),
    };
  }, [trackOutlineA.data]);

  const hoveredTrackPoint = useMemo(() => {
    if (!trackPreview || hoveredDistM === null || xDist.length < 2) return null;
    const chartMaxDist = xDist[xDist.length - 1] ?? 0;
    if (chartMaxDist <= 0 || trackPreview.totalDist <= 0) return null;

    const progress = Math.max(0, Math.min(1, hoveredDistM / chartMaxDist));
    return interpolateTrackPoint(
      trackPreview.points,
      progress * trackPreview.totalDist,
    );
  }, [trackPreview, hoveredDistM, xDist]);

  const handleChartHoverX = useCallback((value: number | null) => {
    setHoveredDistM((prev) => {
      if (prev === value) return prev;
      if (prev !== null && value !== null && Math.abs(prev - value) < 0.5) {
        return prev;
      }
      return value;
    });
  }, []);

  const plotSlots = useMemo<PlotSlot[]>(() => {
    const out: PlotSlot[] = [];

    if (dataA.data?.length)
      out.push({
        num: driverA!,
        label: acr(driverA, "A"),
        color: colorFor(driverA, 0),
        data: dataA.data,
      });

    if (driverB && dataBResampled?.length)
      out.push({
        num: driverB,
        label: acr(driverB, "B"),
        color: colorFor(driverB, 1),
        data: dataBResampled,
      });

    if (driverC && dataCResampled?.length)
      out.push({
        num: driverC,
        label: acr(driverC, "C"),
        color: colorFor(driverC, 2),
        data: dataCResampled,
      });

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dataA.data,
    dataBResampled,
    dataCResampled,
    driverA,
    driverB,
    driverC,
    driverByNumber,
  ]);

  const series = useCallback(
    (
      key: keyof Omit<TelemetrySample, "distM" | "timeS">,
      smoothable: boolean,
      withFill = false,
    ) => {
      return plotSlots.map((s) => {
        const raw = s.data.map((d) => d[key] as number);
        return {
          label: s.label,
          color: s.color,
          fill: withFill ? `${s.color}26` : undefined,
          data: smoothing && smoothable ? smooth(raw) : raw,
        };
      });
    },
    [plotSlots, smoothing],
  );

  const speedSeries = useMemo(() => {
    const base = series("speed", true);
    return base.map((s) => ({
      ...s,
      data: s.data.map((value) => toDisplaySpeed(value, metricSystem)),
    }));
  }, [series, metricSystem]);
  const throttleSeries = useMemo(
    () => series("throttle", true, true),
    [series],
  );
  const brakeSeries = useMemo(() => series("brake", true, true), [series]);
  const gearSeries = useMemo(() => series("gear", false), [series]);
  const rpmSeries = useMemo(() => series("rpm", true), [series]);
  const speedUnit = speedUnitLabel(metricSystem);
  const speedChartMax = metricSystem === "imperial" ? 240 : 380;
  const distanceUnit = metricSystem === "imperial" ? "mi" : "m";
  const distanceScale = metricSystem === "imperial" ? 0.000621371 : 1;

  const deltaSeries = useMemo(() => {
    if (!dataA.data) return [];
    const out: {
      label: string;
      color: string;
      fill?: string;
      data: number[];
    }[] = [];

    if (driverB && dataBResampled)
      out.push({
        label: acr(driverB, "B"),
        color: colorFor(driverB, 1),
        data: computeDelta(dataA.data, dataBResampled),
      });

    if (driverC && dataCResampled)
      out.push({
        label: acr(driverC, "C"),
        color: colorFor(driverC, 2),
        data: computeDelta(dataA.data, dataCResampled),
      });

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dataA.data,
    dataBResampled,
    dataCResampled,
    driverB,
    driverC,
    driverByNumber,
  ]);

  const finishDeltaB = useMemo(() => {
    if (!dataA.data || !dataBResampled) return null;
    const values = computeDelta(dataA.data, dataBResampled);
    return values.length ? (values[values.length - 1] ?? null) : null;
  }, [dataA.data, dataBResampled]);

  const deltaHintA = useMemo<DeltaHint>(
    () => ({
      text: "Reference",
      className: "text-[#9bc9ff] border-[#385b8a] bg-[#172437]",
    }),
    [],
  );

  const deltaHintB = useMemo(
    () => formatDeltaHint(finishDeltaB),
    [finishDeltaB],
  );
  const splitRows = useMemo(() => {
    const slots = [
      { num: driverA, lapNo: selectedLapA, index: 0 },
      { num: driverB, lapNo: selectedLapB, index: 1 },
      { num: driverC, lapNo: selectedLapC, index: 2 },
    ];

    const rows = slots.flatMap(({ num, lapNo, index }) => {
      if (num === null || lapNo === null) return [];
      const lap = lapLookup.get(`${num}:${lapNo}`);
      if (!lap) return [];

      return [
        {
          num,
          lapNo,
          color: colorFor(num, index),
          acr: acr(num, String(num)),
          s1: lap.duration_sector_1,
          s2: lap.duration_sector_2,
          s3: lap.duration_sector_3,
          lap: lap.lap_duration,
        },
      ];
    });

    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    driverA,
    driverB,
    driverC,
    selectedLapA,
    selectedLapB,
    selectedLapC,
    lapLookup,
    driverByNumber,
  ]);

  const fastest = useMemo(() => {
    const min = (vals: (number | null)[]) => {
      const nums = vals.filter((v): v is number => v !== null);
      return nums.length ? Math.min(...nums) : null;
    };

    return {
      s1: min(splitRows.map((r) => r.s1)),
      s2: min(splitRows.map((r) => r.s2)),
      s3: min(splitRows.map((r) => r.s3)),
      lap: min(splitRows.map((r) => r.lap)),
    };
  }, [splitRows]);

  const sectorWinsByDriver = useMemo(() => {
    const wins = new Map<number, SectorWins>();

    for (const row of splitRows) {
      wins.set(row.num, { ...EMPTY_SECTOR_WINS });
    }

    const assign = (key: "s1" | "s2" | "s3") => {
      const best = fastest[key];
      if (best === null) return;

      for (const row of splitRows) {
        if (row[key] !== best) continue;
        const prev = wins.get(row.num) ?? { ...EMPTY_SECTOR_WINS };
        if (!prev[key]) {
          prev[key] = true;
          prev.total += 1;
        }
        wins.set(row.num, prev);
      }
    };

    assign("s1");
    assign("s2");
    assign("s3");

    return wins;
  }, [fastest, splitRows]);

  const isLoading =
    (dataA.isPending && driverA !== null) ||
    (dataB.isPending && driverB !== null) ||
    (dataC.isPending && driverC !== null);
  const isLoadingEventSession =
    meetingKey !== null &&
    (sessionKey === null ||
      sessions.isPending ||
      (sessionKey !== null && (drivers.isPending || laps.isPending)));

  const hasError = dataA.isError || dataB.isError || dataC.isError;

  const noTelemetry =
    driverA !== null &&
    selectedLapA !== null &&
    !dataA.isPending &&
    !dataA.isError &&
    (dataA.data == null || dataA.data.length === 0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 1023px)");
    const onChange = (event: MediaQueryListEvent) => {
      setIsNarrowViewport(event.matches);
    };

    setIsNarrowViewport(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  // When the session changes (driven by the global Nav picker), clear local state.
  useEffect(() => {
    setActiveMode(null);
    setDriverA(null);
    setDriverB(null);
    setDriverC(null);

    setLapA(null);
    setLapB(null);
    setLapC(null);
    setSharedLap(null);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // If a driver is removed, clear only their lap override.
  useEffect(() => {
    if (driverA === null) setLapA(null);
    if (driverB === null) setLapB(null);
    if (driverC === null) setLapC(null);
  }, [driverA, driverB, driverC, setLapA, setLapB, setLapC]);

  return (
    <div className="relative flex flex-col md:h-full md:overflow-hidden">
      {isLoadingEventSession && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#0b0c12]/86 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded border border-panel bg-surface px-4 py-4 text-center shadow-2xl">
            <div className="text-f1red text-[11px] font-black uppercase tracking-[0.16em] animate-pulse">
              Loading Event
            </div>
            <div className="mt-2 text-xs text-muted">
              Fetching sessions and loading telemetry context.
            </div>
          </div>
        </div>
      )}

      <div
        className={`px-3 py-3 ${
          lightMode
            ? "bg-[radial-gradient(circle_at_top_left,#edf1fb_0%,#e8edf8_40%,#e3e9f6_100%)]"
            : "bg-[radial-gradient(circle_at_top_left,#2a2136_0%,#1b1d28_40%,#16161f_100%)]"
        }`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={applyBestToAll}
            className="h-[34px] border border-[#4f4f65] bg-[#191922] px-3 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:border-f1red"
            title="Pick each selected driver's best recorded lap"
          >
            Best all
          </button>

          <button
            onClick={syncOtherLapsToA}
            className="h-[34px] border border-[#4f4f65] bg-[#191922] px-3 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:border-f1red"
            title="Use Driver A lap number for Driver B and Driver C"
          >
            Sync to A
          </button>

          <button
            onClick={applyQualiMode}
            className={`h-[34px] border px-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
              activeMode === "quali"
                ? "border-[#cb9dff] bg-[#3b2350] text-white shadow-[0_0_0_1px_rgba(203,157,255,0.35),0_0_24px_rgba(155,89,245,0.35)]"
                : "border-[#63407a] bg-[#23152d] text-[#dcc3ff] hover:border-[#a569d8]"
            }`}
            title="Quali mode: best laps + smoothing"
          >
            Quali mode
          </button>

          <button
            onClick={applyRaceMode}
            className={`h-[34px] border px-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
              activeMode === "race"
                ? "border-[#9bc9ff] bg-[#1a2639] text-white shadow-[0_0_0_1px_rgba(155,201,255,0.35),0_0_24px_rgba(0,103,255,0.3)]"
                : "border-[#4f4f65] bg-[#191922] text-white hover:border-[#95b7ff]"
            }`}
            title="Race mode: latest laps + raw traces"
          >
            Race mode
          </button>

          <div className="ml-auto flex items-center gap-2">
            <span className={LABEL}>Shared lap</span>
            <select
              value={sharedLap ?? ""}
              onChange={(e) => {
                setActiveMode(null);
                setSharedLap(Number(e.target.value) || null);
              }}
              disabled={!driverA}
              className={`${SELECT} min-w-[120px]`}
            >
              <option value="">None</option>
              {availableLaps.map((n) => (
                <option key={n} value={n}>
                  Lap {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
            Driver & track preview
          </span>
          <button
            type="button"
            onClick={() => setIsCardsAccordionOpen((open) => !open)}
            className="h-7 border border-[#4f4f65] bg-[#191922] px-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:border-[#95b7ff]"
            aria-expanded={isCardsAccordionOpen}
            title={
              isCardsAccordionOpen
                ? "Collapse preview cards"
                : "Expand preview cards"
            }
          >
            {isCardsAccordionOpen ? "Hide" : "Show"}
          </button>
        </div>

        {isCardsAccordionOpen && (
          <div className="grid grid-cols-1 gap-1.5 lg:grid-cols-3">
            <DriverLapCard
              slotLabel="Driver A"
              accent={colorFor(driverA, 0)}
              driverTag={acr(driverA, "A")}
              driverName={
                driverA !== null
                  ? (driverByNumber.get(driverA)?.full_name ??
                    acr(driverA, "A"))
                  : "Unselected"
              }
              driverHeadshotUrl={
                driverA !== null
                  ? (driverByNumber.get(driverA)?.headshot_url ?? null)
                  : null
              }
              driver={driverA}
              onDriverChange={setDriverA}
              driverOptions={drivers.data ?? []}
              driverPlaceholder="Select anchor"
              lap={selectedLapA}
              lapOptions={
                driverA !== null ? (lapsByDriver.get(driverA) ?? []) : []
              }
              onLapChange={setLapA}
              onBest={() => applyPresetLap("a", "best")}
              onLatest={() => applyPresetLap("a", "latest")}
              bestLap={
                driverA !== null ? (bestLapByDriver.get(driverA) ?? null) : null
              }
              latestLap={
                driverA !== null
                  ? (latestLapByDriver.get(driverA) ?? null)
                  : null
              }
              lapMeta={lapMetaA}
              speedTrace={dataA.data?.map((sample) => sample.speed) ?? []}
              deltaHint={deltaHintA}
              sectorWins={
                driverA !== null
                  ? (sectorWinsByDriver.get(driverA) ?? EMPTY_SECTOR_WINS)
                  : EMPTY_SECTOR_WINS
              }
              sectorAnimationSeed={selectedLapA}
              compact={cardDensity === "compact"}
              disabled={!sessionKey}
            />

            <DriverLapCard
              slotLabel="Driver B"
              accent={colorFor(driverB, 1)}
              driverTag={acr(driverB, "B")}
              driverName={
                driverB !== null
                  ? (driverByNumber.get(driverB)?.full_name ??
                    acr(driverB, "B"))
                  : "Unselected"
              }
              driverHeadshotUrl={
                driverB !== null
                  ? (driverByNumber.get(driverB)?.headshot_url ?? null)
                  : null
              }
              driver={driverB}
              onDriverChange={setDriverB}
              driverOptions={(drivers.data ?? []).filter(
                (d) =>
                  d.driver_number !== driverA && d.driver_number !== driverC,
              )}
              driverPlaceholder="Optional"
              lap={selectedLapB}
              lapOptions={
                driverB !== null ? (lapsByDriver.get(driverB) ?? []) : []
              }
              onLapChange={setLapB}
              onBest={() => applyPresetLap("b", "best")}
              onLatest={() => applyPresetLap("b", "latest")}
              bestLap={
                driverB !== null ? (bestLapByDriver.get(driverB) ?? null) : null
              }
              latestLap={
                driverB !== null
                  ? (latestLapByDriver.get(driverB) ?? null)
                  : null
              }
              lapMeta={lapMetaB}
              speedTrace={dataB.data?.map((sample) => sample.speed) ?? []}
              deltaHint={deltaHintB}
              sectorWins={
                driverB !== null
                  ? (sectorWinsByDriver.get(driverB) ?? EMPTY_SECTOR_WINS)
                  : EMPTY_SECTOR_WINS
              }
              sectorAnimationSeed={selectedLapB}
              compact={cardDensity === "compact"}
              disabled={!sessionKey}
            />

            <div className="h-full lg:h-[248px] rounded border border-[#353548] bg-[#10111a] p-1.5 flex flex-col">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-muted">
                  Track position preview
                </span>
                <span className="h-1.5 w-8 rounded-full bg-f1red" />
              </div>

              {trackPreview ? (
                <div className="relative min-h-[112px] flex-1 overflow-hidden rounded border border-panel bg-[#0b1020]">
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(39,68,158,0.2),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(232,0,45,0.1),transparent_40%)]" />
                  <svg
                    viewBox={`0 0 ${TRACK_SVG_W} ${TRACK_SVG_H}`}
                    className="relative h-full w-full"
                    role="img"
                    aria-label="Lap track preview"
                  >
                    <g
                      transform={`rotate(${trackPreview.rotationDeg.toFixed(1)} ${(TRACK_SVG_W / 2).toFixed(1)} ${(TRACK_SVG_H / 2).toFixed(1)})`}
                    >
                      <polyline
                        points={trackPreview.polyline}
                        fill="none"
                        stroke="#3e4a64"
                        strokeWidth={5.4}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        opacity={0.7}
                      />
                      <polyline
                        points={trackPreview.polyline}
                        fill="none"
                        stroke="#d7deee"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {hoveredTrackPoint && (
                        <>
                          <circle
                            cx={hoveredTrackPoint.sx}
                            cy={hoveredTrackPoint.sy}
                            r={9}
                            fill="#e8002d"
                            opacity={0.15}
                          />
                          <circle
                            cx={hoveredTrackPoint.sx}
                            cy={hoveredTrackPoint.sy}
                            r={4}
                            fill="#ff274f"
                            stroke="#ffffff"
                            strokeWidth={1.1}
                          />
                        </>
                      )}
                    </g>
                  </svg>
                </div>
              ) : (
                <div className="flex min-h-[112px] flex-1 items-center justify-center rounded border border-panel bg-[#10111a] px-3 text-center text-xs text-muted">
                  Select Driver A and a valid lap to draw the track.
                </div>
              )}
            </div>
          </div>
        )}

        {session && (
          <span className="mt-1 block text-xs text-muted sm:ml-auto">
            {session.circuit_short_name} · {session.session_name} ·{" "}
            {session.year}
          </span>
        )}

        {isLoading && (
          <span className="mt-1 block text-xs text-f1red animate-pulse">
            Loading telemetry...
          </span>
        )}
      </div>

      <div
        className={`panel-scroll space-y-2 border-t border-panel px-3 pb-3 pt-1 ${
          lightMode ? "bg-[#edf1f9]" : "bg-[#11131c]"
        }`}
      >
        {(() => {
          if (hasError) {
            return (
              <ErrorMessage message="Failed to load telemetry for a selected driver" />
            );
          }

          if (!driverA || !selectedLapA) {
            return (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                Select Driver A and a lap to view telemetry
              </div>
            );
          }

          if (noTelemetry) {
            return (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                No telemetry available for this lap - try another lap or driver
              </div>
            );
          }

          return (
            <>
              <div className="mb-1 flex flex-wrap gap-5 text-xs">
                {plotSlots.map((s) => {
                  const lapForSlot =
                    s.num === driverA
                      ? selectedLapA
                      : s.num === driverB
                        ? selectedLapB
                        : selectedLapC;

                  return (
                    <span
                      key={`${s.num}-${lapForSlot ?? "na"}`}
                      className="flex items-center gap-1.5"
                    >
                      <span
                        className="inline-block h-0.5 w-6"
                        style={{ background: s.color }}
                      />
                      <span className="font-bold" style={{ color: s.color }}>
                        {s.label} · L{lapForSlot ?? "-"}
                      </span>
                    </span>
                  );
                })}
              </div>

              <SplitsTable rows={splitRows} fastest={fastest} />

              <TelemetryChart
                title={`Speed (${speedUnit})`}
                xData={xDist}
                yMin={0}
                yMax={speedChartMax}
                height={280}
                interactiveControls
                onHoverX={handleChartHoverX}
                legendUnit={speedUnit}
                distanceUnit={distanceUnit}
                distanceScale={distanceScale}
                series={speedSeries}
              />
              <TelemetryChart
                title="Throttle (%)"
                xData={xDist}
                yMin={0}
                yMax={100}
                height={210}
                interactiveControls
                onHoverX={handleChartHoverX}
                legendUnit="%"
                distanceUnit={distanceUnit}
                distanceScale={distanceScale}
                series={throttleSeries}
              />
              <TelemetryChart
                title="Brake"
                xData={xDist}
                yMin={0}
                yMax={100}
                height={200}
                interactiveControls
                onHoverX={handleChartHoverX}
                legendUnit="%"
                distanceUnit={distanceUnit}
                distanceScale={distanceScale}
                series={brakeSeries}
              />
              <TelemetryChart
                title="Gear"
                xData={xDist}
                yMin={0}
                yMax={9}
                height={210}
                interactiveControls
                onHoverX={handleChartHoverX}
                legendUnit="gear"
                legendDecimals={0}
                distanceUnit={distanceUnit}
                distanceScale={distanceScale}
                series={gearSeries}
              />
              <TelemetryChart
                title="RPM"
                xData={xDist}
                yMin={0}
                yMax={15000}
                height={220}
                interactiveControls
                onHoverX={handleChartHoverX}
                legendUnit="rpm"
                distanceUnit={distanceUnit}
                distanceScale={distanceScale}
                series={rpmSeries}
              />

              {deltaSeries.length > 0 && (
                <div className={PANEL}>
                  <div className={PANEL_TITLE}>
                    Delta vs {acr(driverA, "A")}
                    <span className="ml-2 font-normal normal-case tracking-normal text-muted">
                      (+ = {acr(driverA, "A")} ahead)
                    </span>
                  </div>
                  <TelemetryChart
                    title=""
                    xData={xDist}
                    height={220}
                    interactiveControls
                    onHoverX={handleChartHoverX}
                    legendUnit="s"
                    distanceUnit={distanceUnit}
                    distanceScale={distanceScale}
                    series={deltaSeries}
                  />
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}

function DriverSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  options: { driver_number: number; name_acronym: string; full_name: string }[];
  disabled: boolean;
  placeholder: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
      <span className={LABEL}>{label}</span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(Number(e.target.value) || null)}
        disabled={disabled}
        className={`${SELECT} min-w-0 w-full sm:w-auto`}
      >
        <option value="">{placeholder}</option>
        {options.map((d) => (
          <option key={d.driver_number} value={d.driver_number}>
            {d.name_acronym} - {d.full_name}
          </option>
        ))}
      </select>
    </div>
  );
}

function DriverLapCard({
  slotLabel,
  accent,
  driverTag,
  driverName,
  driverHeadshotUrl,
  driver,
  onDriverChange,
  driverOptions,
  driverPlaceholder,
  lap,
  lapOptions,
  onLapChange,
  onBest,
  onLatest,
  bestLap,
  latestLap,
  lapMeta,
  speedTrace,
  deltaHint,
  sectorWins,
  sectorAnimationSeed,
  compact,
  disabled,
}: {
  slotLabel: string;
  accent: string;
  driverTag: string;
  driverName: string;
  driverHeadshotUrl: string | null;
  driver: number | null;
  onDriverChange: (value: number | null) => void;
  driverOptions: {
    driver_number: number;
    name_acronym: string;
    full_name: string;
  }[];
  driverPlaceholder: string;
  lap: number | null;
  lapOptions: number[];
  onLapChange: (value: number | null) => void;
  onBest: () => void;
  onLatest: () => void;
  bestLap: number | null;
  latestLap: number | null;
  lapMeta: LapMeta;
  speedTrace: number[];
  deltaHint: DeltaHint;
  sectorWins: SectorWins;
  sectorAnimationSeed: number | null;
  compact: boolean;
  disabled: boolean;
}) {
  const speedStats = useMemo(() => sparklineStats(speedTrace), [speedTrace]);
  const [headshotFailed, setHeadshotFailed] = useState(false);

  useEffect(() => {
    setHeadshotFailed(false);
  }, [driverHeadshotUrl, driver]);

  const hasHeadshot = !!driverHeadshotUrl && !headshotFailed;
  const avatarLabel = driverTag.toUpperCase().slice(0, 3);

  return (
    <div className="h-full lg:h-[248px] rounded border border-[#353548] bg-[#10111a] p-1.5">
      <div className="mb-1.5 flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded border border-[#444458] bg-[#171925]">
            {hasHeadshot ? (
              <img
                src={driverHeadshotUrl}
                alt={`${driverName} profile`}
                className="h-full w-full object-cover"
                onError={() => setHeadshotFailed(true)}
                loading="lazy"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[10px] font-black uppercase tracking-[0.12em] text-muted">
                {avatarLabel}
              </span>
            )}
          </div>

          <div className="min-w-0">
            <span className="block text-[10px] font-black uppercase tracking-[0.15em] text-muted">
              {slotLabel}
            </span>
            <div className="mt-0.5 flex items-center gap-2">
              <span
                className="truncate text-[11px] font-black uppercase tracking-[0.08em]"
                style={{ color: accent }}
                title={driverName}
              >
                {driverTag}
              </span>
              <span
                className="h-1.5 w-8 rounded-full"
                style={{ backgroundColor: accent }}
              />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <SectorChip
            label="S1"
            active={sectorWins.s1}
            animationSeed={sectorAnimationSeed}
          />
          <SectorChip
            label="S2"
            active={sectorWins.s2}
            animationSeed={sectorAnimationSeed}
          />
          <SectorChip
            label="S3"
            active={sectorWins.s3}
            animationSeed={sectorAnimationSeed}
          />
          <span
            key={`wins-${sectorAnimationSeed ?? "none"}-${sectorWins.total}`}
            className={`rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] ${
              sectorWins.total > 0
                ? "border-[#5f4c7c] bg-[#251a35] text-[#d4b7ff] animate-[pulse_0.45s_ease-out_1]"
                : "border-[#444458] bg-[#151723] text-muted"
            }`}
            title="Total sector wins for selected lap"
          >
            W{sectorWins.total}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[minmax(0,1fr)_108px]">
        <DriverSelect
          label="Driver"
          value={driver}
          onChange={onDriverChange}
          options={driverOptions}
          disabled={disabled}
          placeholder={driverPlaceholder}
        />

        <div className="flex min-w-0 flex-col gap-1">
          <span className={LABEL}>Lap</span>
          <select
            value={lap ?? ""}
            onChange={(e) => onLapChange(Number(e.target.value) || null)}
            disabled={disabled || driver === null}
            className={`${SELECT} min-w-0`}
          >
            <option value="">Select</option>
            {lapOptions.map((n) => (
              <option key={n} value={n}>
                Lap {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!compact && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <button
            onClick={onBest}
            disabled={driver === null || bestLap === null}
            className="h-6 border border-[#46465a] bg-[#181a24] px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
            title="Select best valid lap"
          >
            Best {bestLap !== null ? `L${bestLap}` : ""}
          </button>

          <button
            onClick={onLatest}
            disabled={driver === null || latestLap === null}
            className="h-6 border border-[#46465a] bg-[#181a24] px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
            title="Select latest valid lap"
          >
            Latest {latestLap !== null ? `L${latestLap}` : ""}
          </button>
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className="rounded border border-[#444458] bg-[#151723] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-muted">
          {lapMeta.timeText}
        </span>
        <span
          className={`rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${lapMeta.statusClass}`}
        >
          {lapMeta.statusLabel}
        </span>
        <span
          className={`rounded border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${deltaHint.className}`}
          title="Estimated lap-end delta versus Driver A"
        >
          {deltaHint.text}
        </span>
      </div>

      {!compact && (
        <div className="mt-1.5 overflow-hidden rounded border border-[#363648] bg-[#141521]">
          <div className="flex items-center justify-between border-b border-[#2d2d3b] px-2 py-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              Speed trace
            </span>
            {speedStats && (
              <span className="text-[10px] font-semibold text-muted">
                AVG {Math.round(speedStats.avg)} · MAX{" "}
                {Math.round(speedStats.max)}
              </span>
            )}
          </div>
          <div className="px-2 py-1">
            <SpeedSparkline
              values={speedTrace}
              color={accent}
              driverTag={driverTag}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SectorChip({
  label,
  active,
  animationSeed,
}: {
  label: string;
  active: boolean;
  animationSeed: number | null;
}) {
  return (
    <span
      key={`${label}-${animationSeed ?? "none"}-${active ? 1 : 0}`}
      className={`rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] ${
        active
          ? "border-[#6f54a2] bg-[#2a1b3f] text-[#dfcbff] animate-[pulse_0.45s_ease-out_1]"
          : "border-[#444458] bg-[#151723] text-muted"
      }`}
      title={active ? `${label} winner` : `${label} not quickest`}
    >
      {label}
    </span>
  );
}

function SpeedSparkline({
  values,
  color,
  driverTag,
}: {
  values: number[];
  color: string;
  driverTag: string;
}) {
  if (values.length < 2) {
    return (
      <div className="flex h-10 items-center justify-center text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        No trace
      </div>
    );
  }

  const width = 320;
  const height = 34;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);

  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / span) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const areaPoints = `0,${height} ${points} ${width},${height}`;
  const startY = height - ((values[0]! - min) / span) * height;
  const endY = height - ((values[values.length - 1]! - min) / span) * height;
  const tag = driverTag.toUpperCase().slice(0, 3);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="block h-10 w-full"
      preserveAspectRatio="none"
      aria-label="Lap speed sparkline"
      role="img"
    >
      <polyline points={areaPoints} fill={`${color}22`} stroke="none" />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      <circle cx={0} cy={startY} r="2.8" fill={color} />
      <circle cx={width} cy={endY} r="2.8" fill={color} />

      <g transform={`translate(8,${Math.max(9, startY - 7)})`}>
        <rect
          x="0"
          y="-8"
          width="24"
          height="12"
          rx="3"
          fill="#11131d"
          stroke={color}
          strokeWidth="1"
        />
        <text
          x="12"
          y="1"
          textAnchor="middle"
          fontSize="7"
          fontWeight="700"
          fill={color}
          letterSpacing="0.6"
        >
          {tag}
        </text>
      </g>

      <g transform={`translate(${width - 32},${Math.max(9, endY - 7)})`}>
        <rect
          x="0"
          y="-8"
          width="24"
          height="12"
          rx="3"
          fill="#11131d"
          stroke={color}
          strokeWidth="1"
        />
        <text
          x="12"
          y="1"
          textAnchor="middle"
          fontSize="7"
          fontWeight="700"
          fill={color}
          letterSpacing="0.6"
        >
          {tag}
        </text>
      </g>
    </svg>
  );
}

function SplitsTable({
  rows,
  fastest,
}: {
  rows: SplitRow[];
  fastest: {
    s1: number | null;
    s2: number | null;
    s3: number | null;
    lap: number | null;
  };
}) {
  if (rows.length === 0) return null;

  const fmt = (v: number | null) => (v === null ? "-" : v.toFixed(3));
  const fmtLap = (v: number | null) => formatLapTime(v);
  const cls = (v: number | null, best: number | null) =>
    v !== null && best !== null && v === best ? "text-[#b48ead]" : "text-white";

  return (
    <div className={PANEL}>
      <div className={PANEL_TITLE}>Sector splits</div>
      <table className="w-full font-mono text-xs">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-[#636369]">
            <th className="px-3 py-1 text-left">Driver</th>
            <th className="px-3 py-1 text-right">Lap #</th>
            <th className="px-3 py-1 text-right">S1</th>
            <th className="px-3 py-1 text-right">S2</th>
            <th className="px-3 py-1 text-right">S3</th>
            <th className="px-3 py-1 text-right">Lap</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((r) => (
            <tr
              key={`${r.num}-${r.lapNo}`}
              className="border-t border-[#2a2a35]"
            >
              <td className="px-3 py-1">
                <span className="font-black" style={{ color: r.color }}>
                  {r.acr}
                </span>
              </td>
              <td className="px-3 py-1 text-right tabular-nums text-muted">
                {r.lapNo}
              </td>
              <td
                className={`px-3 py-1 text-right tabular-nums ${cls(r.s1, fastest.s1)}`}
              >
                {fmt(r.s1)}
              </td>
              <td
                className={`px-3 py-1 text-right tabular-nums ${cls(r.s2, fastest.s2)}`}
              >
                {fmt(r.s2)}
              </td>
              <td
                className={`px-3 py-1 text-right tabular-nums ${cls(r.s3, fastest.s3)}`}
              >
                {fmt(r.s3)}
              </td>
              <td
                className={`px-3 py-1 text-right tabular-nums font-bold ${cls(
                  r.lap,
                  fastest.lap,
                )}`}
              >
                {fmtLap(r.lap)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
