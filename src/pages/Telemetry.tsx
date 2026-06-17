import { useCallback, useEffect, useMemo, useState } from "react";
import type { Lap } from "@/api/types";
import { ErrorMessage } from "@/components/ErrorMessage";
import { TelemetryChart } from "@/components/TelemetryChart/TelemetryChart";
import { useSearchParams } from "react-router-dom";
import {
  useCarDataForLap,
  type TelemetrySample,
} from "@/hooks/useCarDataForLap";
import { useDrivers, useLaps, useSessions } from "@/hooks/useSession";
import { useNumberParam, useStringParam } from "@/hooks/useSearchParamState";
import { teamColor } from "@/utils/color";
import { computeDelta, resampleToAxis, smooth } from "@/utils/telemetry";

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
const LAYOUT_HINT_DISMISSED_KEY = "telemetryLayoutHintDismissed";

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
  const [activeMode, setActiveMode] = useState<"quali" | "race" | null>(null);
  const [showLayoutHint, setShowLayoutHint] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(LAYOUT_HINT_DISMISSED_KEY) !== "1";
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const [isNarrowViewport, setIsNarrowViewport] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.matchMedia("(max-width: 1023px)").matches,
  );

  const rawCardDensity = searchParams.get("card");
  const hasCardDensityOverride =
    rawCardDensity === "compact" || rawCardDensity === "expanded";
  const cardDensity: "compact" | "expanded" = hasCardDensityOverride
    ? (rawCardDensity as "compact" | "expanded")
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
  const lapMetaC = useMemo(
    () => getLapMeta(driverC, selectedLapC),
    [driverC, selectedLapC, getLapMeta],
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

  function series(
    key: keyof Omit<TelemetrySample, "distM" | "timeS">,
    smoothable: boolean,
    withFill = false,
  ) {
    return plotSlots.map((s) => {
      const raw = s.data.map((d) => d[key] as number);
      return {
        label: s.label,
        color: s.color,
        fill: withFill ? `${s.color}26` : undefined,
        data: smoothing && smoothable ? smooth(raw) : raw,
      };
    });
  }

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

  const finishDeltaC = useMemo(() => {
    if (!dataA.data || !dataCResampled) return null;
    const values = computeDelta(dataA.data, dataCResampled);
    return values.length ? (values[values.length - 1] ?? null) : null;
  }, [dataA.data, dataCResampled]);

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
  const deltaHintC = useMemo(
    () => formatDeltaHint(finishDeltaC),
    [finishDeltaC],
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

  const hasError = dataA.isError || dataB.isError || dataC.isError;

  const noTelemetry =
    driverA !== null &&
    selectedLapA !== null &&
    !dataA.isPending &&
    !dataA.isError &&
    (dataA.data == null || dataA.data.length === 0);

  const modeLabel =
    activeMode === "quali"
      ? "Quali"
      : activeMode === "race"
        ? "Race"
        : "Custom";

  const modeClass =
    activeMode === "quali"
      ? "border-[#cb9dff] bg-[#3b2350] text-[#eddcff]"
      : activeMode === "race"
        ? "border-[#9bc9ff] bg-[#1a2639] text-[#d6e9ff]"
        : "border-[#4a4a5d] bg-[#171823] text-muted";

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

  const setCardDensity = (next: "compact" | "expanded") => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.set("card", next);
        return p;
      },
      { replace: true },
    );
  };

  const resetCardDensity = () => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete("card");
        return p;
      },
      { replace: true },
    );
  };

  const dismissLayoutHint = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LAYOUT_HINT_DISMISSED_KEY, "1");
    }
    setShowLayoutHint(false);
  };

  const reopenLayoutHint = () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LAYOUT_HINT_DISMISSED_KEY);
    }
    setShowLayoutHint(true);
  };

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
    <div className="flex flex-col md:h-full md:overflow-hidden">
      <div className="border-b border-panel bg-[radial-gradient(circle_at_top_left,#2a2136_0%,#1b1d28_40%,#16161f_100%)] px-3 py-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="rounded-sm border border-[#444458] bg-[#12131b] px-2 py-1">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
              Telemetry compare mode
            </span>
          </div>

          <button
            onClick={() =>
              setCardDensity(
                cardDensity === "expanded" ? "compact" : "expanded",
              )
            }
            className={`h-[34px] border px-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
              cardDensity === "expanded"
                ? "border-[#5483bf] bg-[#1a2940] text-[#d9ecff]"
                : "border-[#4f4f65] bg-[#191922] text-white hover:border-[#95b7ff]"
            }`}
            title="Switch between compact and expanded telemetry driver cards"
          >
            {cardDensity === "expanded" ? "Expanded cards" : "Compact cards"}
          </button>

          <button
            onClick={resetCardDensity}
            disabled={!hasCardDensityOverride}
            className="h-[34px] border border-[#4f4f65] bg-[#191922] px-3 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:border-[#95b7ff] disabled:cursor-not-allowed disabled:opacity-40"
            title="Clear manual card layout and return to responsive auto mode"
          >
            Reset layout
          </button>

          <span
            className={`h-[34px] inline-flex items-center rounded border px-2 text-[10px] font-black uppercase tracking-[0.12em] ${
              hasCardDensityOverride
                ? "border-[#4d5f79] bg-[#192233] text-[#c9ddff]"
                : "border-[#3b6b4e] bg-[#13261a] text-[#9ee0b6]"
            }`}
            title={
              hasCardDensityOverride
                ? "Manual card layout is active"
                : "Responsive auto card layout is active"
            }
          >
            {hasCardDensityOverride ? "Manual" : "Auto"}
          </span>

          <button
            onClick={() => setSmooth(smoothing ? "0" : "1")}
            className={`h-[34px] px-3 text-[10px] font-black uppercase tracking-widest transition-colors ${
              smoothing
                ? "bg-f1red text-white"
                : "bg-panel text-muted hover:text-white"
            }`}
            title="Low-pass smoothing on speed/throttle/brake/RPM"
          >
            Smooth
          </button>

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
            <button
              onClick={reopenLayoutHint}
              className="h-[34px] w-[34px] inline-flex items-center justify-center rounded border border-[#4f4f65] bg-[#191922] text-[12px] font-black text-white transition-colors hover:border-[#95b7ff]"
              title="Show layout help"
              aria-label="Show layout help"
            >
              ?
            </button>
          </div>
        </div>

        {showLayoutHint && (
          <div className="mb-3 flex items-start gap-2 rounded border border-[#35506e] bg-[#162337] p-2 text-[11px] text-[#d6e7ff]">
            <div className="leading-snug">
              <span className="font-black uppercase tracking-[0.1em] text-[#9bc9ff]">
                Layout tip
              </span>
              <span className="ml-2">
                Use Compact/Expanded to set card richness, Reset layout to
                return to responsive behavior, and the Auto/Manual badge to see
                who is in control.
              </span>
            </div>
            <button
              onClick={dismissLayoutHint}
              className="ml-auto h-6 shrink-0 rounded border border-[#4b6586] px-2 text-[10px] font-black uppercase tracking-[0.1em] text-[#d6e7ff] hover:border-[#8db2de]"
              title="Dismiss helper"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          <DriverLapCard
            slotLabel="Driver A"
            accent={colorFor(driverA, 0)}
            driverTag={acr(driverA, "A")}
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
              driverA !== null ? (latestLapByDriver.get(driverA) ?? null) : null
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
            driver={driverB}
            onDriverChange={setDriverB}
            driverOptions={(drivers.data ?? []).filter(
              (d) => d.driver_number !== driverA && d.driver_number !== driverC,
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
              driverB !== null ? (latestLapByDriver.get(driverB) ?? null) : null
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

          <DriverLapCard
            slotLabel="Driver C"
            accent={colorFor(driverC, 2)}
            driverTag={acr(driverC, "C")}
            driver={driverC}
            onDriverChange={setDriverC}
            driverOptions={(drivers.data ?? []).filter(
              (d) => d.driver_number !== driverA && d.driver_number !== driverB,
            )}
            driverPlaceholder="Optional"
            lap={selectedLapC}
            lapOptions={
              driverC !== null ? (lapsByDriver.get(driverC) ?? []) : []
            }
            onLapChange={setLapC}
            onBest={() => applyPresetLap("c", "best")}
            onLatest={() => applyPresetLap("c", "latest")}
            bestLap={
              driverC !== null ? (bestLapByDriver.get(driverC) ?? null) : null
            }
            latestLap={
              driverC !== null ? (latestLapByDriver.get(driverC) ?? null) : null
            }
            lapMeta={lapMetaC}
            speedTrace={dataC.data?.map((sample) => sample.speed) ?? []}
            deltaHint={deltaHintC}
            sectorWins={
              driverC !== null
                ? (sectorWinsByDriver.get(driverC) ?? EMPTY_SECTOR_WINS)
                : EMPTY_SECTOR_WINS
            }
            sectorAnimationSeed={selectedLapC}
            compact={cardDensity === "compact"}
            disabled={!sessionKey}
          />
        </div>

        {session && (
          <span className="mt-3 block text-xs text-muted sm:ml-auto">
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

      <div className="panel-scroll space-y-2 p-3">
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
              <div className="sticky top-0 z-10 -mx-1 mb-1 border-b border-[#2f2f3d] bg-[linear-gradient(180deg,rgba(21,21,30,0.96),rgba(21,21,30,0.86))] px-1 py-2 backdrop-blur">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span
                    className={`rounded border px-2 py-1 text-[10px] font-black uppercase tracking-[0.13em] ${modeClass}`}
                  >
                    {modeLabel} mode
                  </span>
                  <span
                    className={`rounded border px-2 py-1 text-[10px] font-black uppercase tracking-[0.13em] ${
                      smoothing
                        ? "border-[#9658d9] bg-[#29163a] text-[#dec7ff]"
                        : "border-[#4a4a5d] bg-[#171823] text-muted"
                    }`}
                  >
                    Smooth {smoothing ? "On" : "Off"}
                  </span>
                  <span className="h-4 w-px bg-[#3a3a49]" />
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
                    Compared traces
                  </span>
                </div>
              </div>

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
                title="Speed (km/h)"
                xData={xDist}
                yMin={0}
                yMax={380}
                height={130}
                interactiveControls
                series={series("speed", true)}
              />
              <TelemetryChart
                title="Throttle (%)"
                xData={xDist}
                yMin={0}
                yMax={100}
                height={80}
                interactiveControls
                series={series("throttle", true, true)}
              />
              <TelemetryChart
                title="Brake"
                xData={xDist}
                yMin={0}
                yMax={100}
                height={70}
                interactiveControls
                series={series("brake", true, true)}
              />
              <TelemetryChart
                title="Gear"
                xData={xDist}
                yMin={0}
                yMax={9}
                height={80}
                interactiveControls
                series={series("gear", false)}
              />
              <TelemetryChart
                title="RPM"
                xData={xDist}
                yMin={0}
                yMax={15000}
                height={90}
                interactiveControls
                series={series("rpm", true)}
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
                    height={90}
                    interactiveControls
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

  return (
    <div className="rounded border border-[#353548] bg-[#10111a] p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-muted">
            {slotLabel}
          </span>
          <span
            className="h-1.5 w-8 rounded-full"
            style={{ backgroundColor: accent }}
          />
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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
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
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            onClick={onBest}
            disabled={driver === null || bestLap === null}
            className="h-7 border border-[#46465a] bg-[#181a24] px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
            title="Select best valid lap"
          >
            Best {bestLap !== null ? `L${bestLap}` : ""}
          </button>

          <button
            onClick={onLatest}
            disabled={driver === null || latestLap === null}
            className="h-7 border border-[#46465a] bg-[#181a24] px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
            title="Select latest valid lap"
          >
            Latest {latestLap !== null ? `L${latestLap}` : ""}
          </button>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
        <div className="mt-2 overflow-hidden rounded border border-[#363648] bg-[#141521]">
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
          <div className="px-2 py-1.5">
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
      <div className="flex h-12 items-center justify-center text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
        No trace
      </div>
    );
  }

  const width = 320;
  const height = 42;
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
      className="h-12 w-full"
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
                {fmt(r.lap)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
