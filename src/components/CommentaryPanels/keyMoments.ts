import type { Driver, RaceControl } from "@/api/types";
import type { FastestLapPayload, ToastEvent } from "@/timeline/events";
import { getSafetyControlPhase } from "@/utils/raceControlFlags";
import { teamColor } from "@/utils/color";
import type { KeyMoment } from "@/components/KeyMoments/types";

export type TimedPositionPoint = {
  ms: number;
  num: number;
  position: number;
};

function collectLeadChangeMoments(
  timedPositions: TimedPositionPoint[],
  drivers: Driver[],
): KeyMoment[] {
  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
  const moments: KeyMoment[] = [];
  const p1Events = timedPositions
    .filter((p) => p.position === 1 && p.ms >= 0)
    .map((p) => ({ ms: p.ms, num: p.num }));

  let lastLeader = -1;
  for (const ev of p1Events) {
    if (ev.num === lastLeader) continue;
    if (lastLeader !== -1) {
      const d = driverMap.get(ev.num);
      moments.push({
        ms: ev.ms,
        kind: "lead_change",
        label: `${d?.name_acronym ?? ev.num} takes lead`,
        color: teamColor(d?.team_colour),
      });
    }
    lastLeader = ev.num;
  }

  return moments;
}

function collectFastestLapMoments(
  toastEvents: ToastEvent[],
  drivers: Driver[],
): KeyMoment[] {
  const driverMap = new Map(drivers.map((d) => [d.driver_number, d]));
  const moments: KeyMoment[] = [];

  for (const ev of toastEvents) {
    if (ev.kind !== "fastest_lap") continue;
    const payload = ev.payload as FastestLapPayload;
    const d = driverMap.get(payload.driverNumber);
    const minutes = Math.floor(payload.lapTime / 60);
    const seconds = (payload.lapTime % 60).toFixed(3).padStart(6, "0");
    moments.push({
      ms: ev.ms,
      kind: "fastest_lap",
      label: `Fastest: ${d?.name_acronym ?? payload.driverNumber}`,
      sublabel: minutes > 0 ? `${minutes}:${seconds}` : seconds,
      color: "#9b59f5",
    });
  }

  return moments;
}

function collectRaceControlMoments(
  raceControlEntries: RaceControl[],
  sessionStartMs: number,
): KeyMoment[] {
  const moments: KeyMoment[] = [];
  for (const entry of raceControlEntries) {
    const ms = new Date(entry.date).getTime() - sessionStartMs;
    if (ms < 0) continue;

    const phase = getSafetyControlPhase(entry);
    if (phase === "safety_car_start") {
      moments.push({
        ms,
        kind: "safety_car",
        label: "Safety Car deployed",
        color: "#f5a623",
      });
    }
    if (phase === "safety_car_end") {
      moments.push({
        ms,
        kind: "safety_car",
        label: "Safety Car in this lap",
        color: "#f5a623",
      });
    }
    if (phase === "vsc_start") {
      moments.push({
        ms,
        kind: "vsc",
        label: "Virtual Safety Car",
        color: "#f5a623",
      });
    }
    if (phase === "vsc_end") {
      moments.push({
        ms,
        kind: "vsc",
        label: "VSC ending",
        color: "#f5a623",
      });
    }
    if (entry.flag === "RED") {
      moments.push({
        ms,
        kind: "red_flag",
        label: "Red Flag",
        color: "#e8002d",
      });
    }
  }
  return moments;
}

export function buildKeyMoments(
  timedPositions: TimedPositionPoint[],
  toastEvents: ToastEvent[],
  raceControlEntries: RaceControl[],
  drivers: Driver[],
  sessionStartMs: number,
): KeyMoment[] {
  const leadChanges = collectLeadChangeMoments(timedPositions, drivers);
  const fastestLaps = collectFastestLapMoments(toastEvents, drivers);
  const raceControlMoments = collectRaceControlMoments(
    raceControlEntries,
    sessionStartMs,
  );
  return [...leadChanges, ...fastestLaps, ...raceControlMoments].sort(
    (a, b) => a.ms - b.ms,
  );
}
