import { useEffect, useMemo } from "react";
import type { Lap } from "@/api/types";
import { ErrorMessage } from "@/components/ErrorMessage";
import { TelemetryChart } from "@/components/TelemetryChart/TelemetryChart";
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

type SlotKey = "a" | "b" | "c";

const PANEL = "bg-surface border border-panel";
const PANEL_TITLE =
  "text-[10px] font-bold text-muted px-3 py-2 border-b border-[#38383f] uppercase tracking-[0.12em] border-l-2 border-l-f1red bg-track";
const LABEL = "text-[10px] font-bold uppercase tracking-widest text-muted";
const SELECT =
  "bg-[#191922] text-white border border-[#3b3b49] text-xs font-medium px-3 py-2 focus:outline-none focus:border-[#66667a] transition-colors";
const SLOT_COLORS = ["#e8002d", "#0067ff", "#23c552"];

export default function Telemetry() {
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
    if (selectedLapA === null) return;
    if (driverB !== null) setLapB(selectedLapA);
    if (driverC !== null) setLapC(selectedLapA);
  };

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

  // When the session changes (driven by the global Nav picker), clear local state.
  useEffect(() => {
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

          <div className="ml-auto flex items-center gap-2">
            <span className={LABEL}>Shared lap</span>
            <select
              value={sharedLap ?? ""}
              onChange={(e) => setSharedLap(Number(e.target.value) || null)}
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

        <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
          <DriverLapCard
            slotLabel="Driver A"
            accent={colorFor(driverA, 0)}
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
            disabled={!sessionKey}
          />

          <DriverLapCard
            slotLabel="Driver B"
            accent={colorFor(driverB, 1)}
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
            disabled={!sessionKey}
          />

          <DriverLapCard
            slotLabel="Driver C"
            accent={colorFor(driverC, 2)}
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
  disabled,
}: {
  slotLabel: string;
  accent: string;
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
  disabled: boolean;
}) {
  return (
    <div className="rounded border border-[#353548] bg-[#10111a] p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-muted">
          {slotLabel}
        </span>
        <span
          className="h-1.5 w-8 rounded-full"
          style={{ backgroundColor: accent }}
        />
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
    </div>
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
