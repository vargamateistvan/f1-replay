import type { Driver, RaceControl, SessionResult, Weather } from "@/api/types";

type SafetyPhaseSignal = {
  phase: string | null;
};

export function formatSessionDateLabel(dateStart: string) {
  const parsed = new Date(dateStart);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function buildTopFinisherLabel(
  sessionResults: SessionResult[],
  drivers: Driver[],
) {
  const winner = sessionResults.find((entry) => entry.position === 1);
  if (!winner) return null;
  const driver = drivers.find(
    (entry) => entry.driver_number === winner.driver_number,
  );
  if (!driver) return `#${winner.driver_number}`;
  return `${driver.full_name} (${driver.name_acronym})`;
}

export function countRaceControlPhaseStarts(
  signals: SafetyPhaseSignal[],
  phase: "safety_car_start" | "vsc_start",
) {
  return signals.filter((signal) => signal.phase === phase).length;
}

export function countRedFlags(raceControlEntries: RaceControl[]) {
  return raceControlEntries.filter((entry) => entry.flag === "RED").length;
}

export function getLatestWeatherSnapshot(entries: Weather[]) {
  if (!entries.length) return null;
  return entries.at(-1) ?? null;
}
