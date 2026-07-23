import type { RaceControl, Position, Pit } from "@/api/types";
import {
  getSafetyControlPhase,
  isTrackClearSignal,
} from "@/utils/raceControlFlags";

export type RaceControlSeverity = "info" | "warning" | "critical";

export type RaceControlKind =
  | "flag"
  | "safety_car"
  | "penalty"
  | "investigation"
  | "session_status"
  | "drs"
  | "car_event"
  | "other";

export interface NormalizedRaceControlEvent {
  id: string;
  ms: number;
  kind: RaceControlKind;
  severity: RaceControlSeverity;
  date: string;
  driverNumber: number | null;
  lapNumber: number | null;
  sector: number | null;
  scope: string | null;
  flag: string | null;
  category: string;
  title: string;
  description: string;
  qualifyingPhase: number | null;
  raw: RaceControl;
}

export interface RaceControlMarker {
  id: string;
  ms: number;
  severity: RaceControlSeverity;
  label: string;
}

const FLAG_TITLE: Record<string, string> = {
  GREEN: "Green Flag",
  YELLOW: "Yellow Flag",
  DOUBLE_YELLOW: "Double Yellow",
  RED: "Red Flag",
  SAFETY_CAR: "Safety Car",
  VIRTUAL_SC: "Virtual Safety Car",
  VIRTUAL_SAFETY_CAR: "Virtual Safety Car",
  CHEQUERED: "Chequered",
  BLUE: "Blue Flag",
  BLACK_AND_WHITE: "Black And White",
  CLEAR: "Track Clear",
};

const LOW_PRIORITY_FLAGS = new Set(["GREEN", "CLEAR", "BLUE", "CHEQUERED"]);

export function toFlagKey(flag: string | null): string {
  return (flag ?? "").trim().toUpperCase().replace(/\s+/g, "_");
}

export interface TrackFlagState {
  globalFlag: string | null;
  sectorFlags: {
    1: string | null;
    2: string | null;
    3: string | null;
  };
  updatedAtMs: number;
}

const TRACK_FLAG_STATE_EMPTY: TrackFlagState = {
  globalFlag: null,
  sectorFlags: { 1: null, 2: null, 3: null },
  updatedAtMs: 0,
};

function toSectorNumber(sector: number | null): 1 | 2 | 3 | null {
  if (sector === 1 || sector === 2 || sector === 3) return sector;
  return null;
}

function isSectorScoped(
  scope: string | null,
  sector: 1 | 2 | 3 | null,
): sector is 1 | 2 | 3 {
  if (sector === null) return false;
  const scopeKey = (scope ?? "").toLowerCase();
  if (scopeKey.includes("track")) return false;
  return true;
}

/**
 * Derive current global + sector flag state up to a playhead time.
 *
 * This enables independent sector coloring (S1/S2/S3) while preserving
 * global states such as Red Flag / Safety Car / VSC.
 */
export function deriveTrackFlagState(
  entries: RaceControl[],
  sessionStartMs: number,
  cutoffMs: number,
): TrackFlagState | null {
  if (!sessionStartMs || entries.length === 0) return null;

  const state: TrackFlagState = {
    globalFlag: null,
    sectorFlags: { 1: null, 2: null, 3: null },
    updatedAtMs: 0,
  };

  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  for (const entry of sorted) {
    const eventMs = new Date(entry.date).getTime();
    if (eventMs > cutoffMs) break;

    const flagKey = toFlagKey(entry.flag);
    const sector = toSectorNumber(entry.sector);
    const sectorScoped = isSectorScoped(entry.scope, sector);
    const clearSignal = isTrackClearSignal(entry);

    if (clearSignal) {
      state.updatedAtMs = eventMs;
      if (sectorScoped) {
        state.sectorFlags[sector] = null;
      } else {
        state.globalFlag = null;
        state.sectorFlags = { 1: null, 2: null, 3: null };
      }
      continue;
    }

    // Infer flag from message when flag field is null (OpenF1 sometimes omits it)
    const msg = (entry.message ?? "").toUpperCase();
    const resolvedFlagKey =
      flagKey ||
      (msg.includes("RED FLAG") ? "RED" : null) ||
      (msg.includes("SAFETY CAR DEPLOYED") || msg.includes("SAFETY CAR IN")
        ? "SAFETY_CAR"
        : null) ||
      (msg.includes("VIRTUAL SAFETY CAR DEPLOYED") ||
      msg.includes("VSC DEPLOYED")
        ? "VIRTUAL_SC"
        : null);

    if (!resolvedFlagKey) continue;

    state.updatedAtMs = eventMs;
    if (sectorScoped) {
      state.sectorFlags[sector] = resolvedFlagKey;
    } else {
      state.globalFlag = resolvedFlagKey;
    }
  }

  if (
    state.globalFlag === TRACK_FLAG_STATE_EMPTY.globalFlag &&
    state.sectorFlags[1] === TRACK_FLAG_STATE_EMPTY.sectorFlags[1] &&
    state.sectorFlags[2] === TRACK_FLAG_STATE_EMPTY.sectorFlags[2] &&
    state.sectorFlags[3] === TRACK_FLAG_STATE_EMPTY.sectorFlags[3]
  ) {
    return null;
  }

  return state;
}

function classifyKind(entry: RaceControl, flagKey: string): RaceControlKind {
  const category = (entry.category ?? "").toLowerCase();
  const message = (entry.message ?? "").toLowerCase();

  if (
    flagKey === "SAFETY_CAR" ||
    flagKey === "VIRTUAL_SC" ||
    flagKey === "VIRTUAL_SAFETY_CAR"
  ) {
    return "safety_car";
  }
  if (getSafetyControlPhase(entry) !== null) return "safety_car";
  if (flagKey !== "") return "flag";
  if (/penalty|drive through|stop\/go|disqualif|black flag/i.test(message))
    return "penalty";
  if (/investigation|noted|alleged/i.test(message)) return "investigation";
  if (category.includes("sessionstatus")) return "session_status";
  if (category.includes("drs")) return "drs";
  if (category.includes("carevent")) return "car_event";
  return "other";
}

function classifySeverity(
  kind: RaceControlKind,
  flagKey: string,
  description: string,
): RaceControlSeverity {
  if (flagKey === "RED") return "critical";
  if (
    flagKey === "SAFETY_CAR" ||
    flagKey === "VIRTUAL_SC" ||
    flagKey === "VIRTUAL_SAFETY_CAR"
  ) {
    return "critical";
  }
  if (flagKey === "YELLOW" || flagKey === "DOUBLE_YELLOW") return "warning";
  if (kind === "penalty") return "warning";
  if (kind === "investigation") return "info";
  if (kind === "session_status") return "info";

  if (
    /red flag|medical car|stopped|disqualif|black flag|safety car/i.test(
      description,
    )
  ) {
    return "critical";
  }
  if (/yellow|investigation|noted|track limits|vsc/i.test(description)) {
    return "warning";
  }

  if (flagKey && !LOW_PRIORITY_FLAGS.has(flagKey)) return "warning";
  return "info";
}

function titleFor(
  entry: RaceControl,
  kind: RaceControlKind,
  flagKey: string,
): string {
  if (flagKey && FLAG_TITLE[flagKey]) return FLAG_TITLE[flagKey];
  if (kind === "penalty") return "Penalty";
  if (kind === "investigation") return "Investigation";
  if (kind === "session_status") return "Session Status";
  if (kind === "drs") return "DRS";
  if (kind === "car_event") return "Car Event";
  const category = (entry.category ?? "").trim();
  if (category !== "") return category;
  return "Race Control";
}

function dedupeKey(entry: RaceControl): string {
  return [
    entry.date,
    entry.category,
    entry.message,
    String(entry.driver_number ?? ""),
    String(entry.flag ?? ""),
    String(entry.lap_number ?? ""),
  ].join("|");
}

export function normalizeRaceControl(
  entries: RaceControl[],
  sessionStartMs: number,
): NormalizedRaceControlEvent[] {
  if (!sessionStartMs || entries.length === 0) return [];

  const seen = new Set<string>();
  const out: NormalizedRaceControlEvent[] = [];

  for (const entry of entries) {
    const key = dedupeKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);

    const ms = new Date(entry.date).getTime() - sessionStartMs;
    const flagKey = toFlagKey(entry.flag);
    const kind = classifyKind(entry, flagKey);
    const description = (entry.message ?? "").trim() || "Race control update";

    out.push({
      id: key,
      ms,
      kind,
      severity: classifySeverity(kind, flagKey, description),
      date: entry.date,
      driverNumber: entry.driver_number,
      lapNumber: entry.lap_number,
      sector: entry.sector,
      scope: entry.scope,
      flag: entry.flag,
      category: entry.category,
      title: titleFor(entry, kind, flagKey),
      description,
      qualifyingPhase: entry.qualifying_phase,
      raw: entry,
    });
  }

  out.sort((a, b) => (a.ms === b.ms ? a.id.localeCompare(b.id) : a.ms - b.ms));
  return out;
}

export function buildRaceControlMarkers(
  events: NormalizedRaceControlEvent[],
): RaceControlMarker[] {
  return events
    .filter((event) => event.ms >= 0 && event.severity !== "info")
    .map((event) => ({
      id: event.id,
      ms: event.ms,
      severity: event.severity,
      label: event.title,
    }));
}

/**
 * Collapse markers that are closer than `windowMs` (default 20 s) into a
 * single representative marker. The representative keeps the highest severity
 * of the group and its ms is the earliest in the cluster.
 *
 * This prevents the scrubber from turning into a solid bar of markers during
 * heavy incident windows (e.g. VSC → yellow → investigation in quick succession).
 */
export function clusterRaceControlMarkers(
  markers: RaceControlMarker[],
  windowMs = 20_000,
): RaceControlMarker[] {
  if (markers.length === 0) return [];

  const SEV_RANK: Record<RaceControlSeverity, number> = {
    info: 0,
    warning: 1,
    critical: 2,
  };

  const sorted = [...markers].sort((a, b) => a.ms - b.ms);
  const clusters: RaceControlMarker[] = [];
  let groupStart = 0;

  while (groupStart < sorted.length) {
    const anchor = sorted[groupStart]!;
    let groupEnd = groupStart + 1;
    while (
      groupEnd < sorted.length &&
      sorted[groupEnd]!.ms - anchor.ms < windowMs
    ) {
      groupEnd++;
    }

    const group = sorted.slice(groupStart, groupEnd);
    // Pick the item with the highest severity; break ties by earliest ms.
    const rep = group.reduce((best, cur) =>
      SEV_RANK[cur.severity] > SEV_RANK[best.severity] ? cur : best,
    );

    clusters.push({
      id: rep.id,
      ms: anchor.ms, // always start of the cluster window
      severity: rep.severity,
      label:
        group.length > 1
          ? `${rep.label} (+${group.length - 1} more)`
          : rep.label,
    });

    groupStart = groupEnd;
  }

  return clusters;
}

/** Summary counts by severity — for the legend strip. */
export interface MarkerSummary {
  critical: number;
  warning: number;
}

export function summarizeMarkers(markers: RaceControlMarker[]): MarkerSummary {
  let critical = 0;
  let warning = 0;
  for (const m of markers) {
    if (m.severity === "critical") critical++;
    else if (m.severity === "warning") warning++;
  }
  return { critical, warning };
}

// ─── Penalty / investigation state machine ───────────────────────────────────

export type PenaltyStatus = "noted" | "investigating" | "penalty" | "cleared";

export interface PenaltyDriverState {
  driverNumber: number;
  status: PenaltyStatus;
  lapNumber: number | null;
  latestDescription: string;
}

function classifyPenaltyStatus(
  event: NormalizedRaceControlEvent,
): PenaltyStatus | null {
  if (event.kind !== "penalty" && event.kind !== "investigation") return null;
  const lower = event.description.toLowerCase();
  if (/no further investigation|no action taken|not investigated/i.test(lower))
    return "cleared";
  if (
    /penalty|drive.through|stop.go|time penalty|grid drop|disqualif|reprimand|lap time deleted/i.test(
      lower,
    )
  )
    return "penalty";
  if (/under investigation/i.test(lower)) return "investigating";
  if (/noted|alleged/i.test(lower)) return "noted";
  return event.kind === "penalty" ? "penalty" : "noted";
}

/**
 * Derive the current disciplinary state per driver from a sorted
 * (ascending ms) array of normalized events. The last event in time
 * for each driver defines their current state.
 */
export function buildPenaltyStates(
  events: NormalizedRaceControlEvent[],
): PenaltyDriverState[] {
  const byDriver = new Map<number, PenaltyDriverState>();
  for (const e of events) {
    if (e.driverNumber === null) continue;
    const status = classifyPenaltyStatus(e);
    if (status === null) continue;
    byDriver.set(e.driverNumber, {
      driverNumber: e.driverNumber,
      status,
      lapNumber: e.lapNumber,
      latestDescription: e.description,
    });
  }
  return [...byDriver.values()].sort((a, b) => a.driverNumber - b.driverNumber);
}

// ─── Lap-grouped events ───────────────────────────────────────────────────────

export interface LapGroup {
  lapNumber: number | null;
  events: NormalizedRaceControlEvent[];
}

/**
 * Group normalized events by lap number. Session-level events (null lap)
 * form their own group. Returns groups sorted ascending by lap (null first).
 */
export function groupEventsByLap(
  events: NormalizedRaceControlEvent[],
): LapGroup[] {
  const grouped = new Map<string, LapGroup>();
  for (const e of events) {
    const key = e.lapNumber !== null ? String(e.lapNumber) : "session";
    let group = grouped.get(key);
    if (!group) {
      group = { lapNumber: e.lapNumber, events: [] };
      grouped.set(key, group);
    }
    group.events.push(e);
  }
  return [...grouped.values()].sort((a, b) => {
    if (a.lapNumber === null) return -1;
    if (b.lapNumber === null) return 1;
    return a.lapNumber - b.lapNumber;
  });
}

export interface PhaseGroup {
  phase: number | null;
  events: NormalizedRaceControlEvent[];
}

/**
 * Group normalized events by qualifying phase (Q1/Q2/Q3).
 * For non-qualifying sessions, all events are in phase null.
 * Returns groups sorted descending (phase 3 → 1 → null).
 */
export function groupEventsByPhase(
  events: NormalizedRaceControlEvent[],
): PhaseGroup[] {
  const grouped = new Map<string, PhaseGroup>();
  for (const e of events) {
    const key =
      e.qualifyingPhase !== null ? String(e.qualifyingPhase) : "session";
    let group = grouped.get(key);
    if (!group) {
      group = { phase: e.qualifyingPhase, events: [] };
      grouped.set(key, group);
    }
    group.events.push(e);
  }
  return [...grouped.values()].sort((a, b) => {
    if (a.phase === null) return 1;
    if (b.phase === null) return -1;
    return b.phase - a.phase; // Descending: Q3, Q2, Q1
  });
}

// ─── Incident windows ─────────────────────────────────────────────────────────
// An incident window pairs the moment a SC/VSC/red-flag starts with the
// subsequent "track clear" or restart event.

export type IncidentWindowKind = "safety_car" | "vsc" | "red_flag";

export interface IncidentWindow {
  id: string;
  kind: IncidentWindowKind;
  label: string;
  startMs: number;
  /** null while the incident is still active (no clear event found yet). */
  endMs: number | null;
  startLap: number | null;
}

function incidentKindFor(
  e: NormalizedRaceControlEvent,
): IncidentWindowKind | null {
  const phase = getSafetyControlPhase(e.raw);
  if (phase === "safety_car_start") return "safety_car";
  if (phase === "vsc_start") return "vsc";

  const flagKey = toFlagKey(e.flag);
  if (flagKey === "SAFETY_CAR") return "safety_car";
  if (flagKey === "VIRTUAL_SC" || flagKey === "VIRTUAL_SAFETY_CAR")
    return "vsc";
  if (flagKey === "RED") return "red_flag";
  return null;
}

function isTrackClear(e: NormalizedRaceControlEvent): boolean {
  const phase = getSafetyControlPhase(e.raw);
  if (phase === "safety_car_end" || phase === "vsc_end") return true;
  return isTrackClearSignal(e.raw);
}

export function buildIncidentWindows(
  events: NormalizedRaceControlEvent[],
): IncidentWindow[] {
  const windows: IncidentWindow[] = [];
  const counters: Record<IncidentWindowKind, number> = {
    safety_car: 0,
    vsc: 0,
    red_flag: 0,
  };

  let openWindow: {
    kind: IncidentWindowKind;
    id: string;
    label: string;
    startMs: number;
    startLap: number | null;
  } | null = null;

  for (const e of events) {
    if (openWindow !== null && isTrackClear(e)) {
      windows.push({ ...openWindow, endMs: e.ms });
      openWindow = null;
    }

    const kind = incidentKindFor(e);

    if (kind !== null) {
      if (openWindow !== null && openWindow.kind !== kind) {
        windows.push({ ...openWindow, endMs: e.ms });
        openWindow = null;
      }

      if (openWindow !== null) continue;

      counters[kind]++;
      const num = counters[kind];
      const kindLabel: string =
        kind === "safety_car"
          ? `Safety Car ${num > 1 ? num : ""}`.trim()
          : kind === "vsc"
            ? `Virtual SC ${num > 1 ? num : ""}`.trim()
            : `Red Flag ${num > 1 ? num : ""}`.trim();
      openWindow = {
        kind,
        id: `${kind}-${e.ms}`,
        label: kindLabel,
        startMs: e.ms,
        startLap: e.lapNumber,
      };
    }
  }

  // Push any still-open window with endMs = null
  if (openWindow !== null) {
    windows.push({ ...openWindow, endMs: null });
  }

  return windows;
}

// ─── Race chapters ────────────────────────────────────────────────────────────
// Divide a session into named, jump-to-able chapters.

export type ChapterKind =
  | "start"
  | "green"
  | "safety_car"
  | "vsc"
  | "red_flag"
  | "finish";

export interface RaceChapter {
  id: string;
  kind: ChapterKind;
  label: string;
  startMs: number;
  endMs: number | null;
  durationMs: number | null;
  incidentWindowId: string | null;
}

export function buildRaceChapters(
  incidentWindows: IncidentWindow[],
  sessionDurationMs: number,
  chequeredMs: number | null,
): RaceChapter[] {
  const chapters: RaceChapter[] = [];
  const finishMs = chequeredMs ?? sessionDurationMs;
  let cursor = 0;
  let greenCount = 0;

  for (const w of [...incidentWindows].sort((a, b) => a.startMs - b.startMs)) {
    // Green / start segment before this incident
    if (w.startMs > cursor) {
      greenCount++;
      const label =
        cursor === 0
          ? "Race Start"
          : greenCount === 1
            ? "Green Flag"
            : `Green Flag ${greenCount}`;
      chapters.push({
        id: `green-${cursor}`,
        kind: cursor === 0 ? "start" : "green",
        label,
        startMs: cursor,
        endMs: w.startMs,
        durationMs: w.startMs - cursor,
        incidentWindowId: null,
      });
    }

    // Incident window chapter
    const end = w.endMs;
    chapters.push({
      id: w.id,
      kind: w.kind,
      label: w.label,
      startMs: w.startMs,
      endMs: end,
      durationMs: end !== null ? end - w.startMs : null,
      incidentWindowId: w.id,
    });

    if (end !== null) cursor = end;
  }

  // Final green / finish segment
  if (cursor < finishMs) {
    chapters.push({
      id: `finish-${cursor}`,
      kind: finishMs === chequeredMs ? "finish" : "green",
      label: finishMs === chequeredMs ? "Finish" : "Green Flag",
      startMs: cursor,
      endMs: finishMs,
      durationMs: finishMs - cursor,
      incidentWindowId: null,
    });
  }

  return chapters;
}

// ─── What Changed snapshots ───────────────────────────────────────────────────
// Correlate race_control incidents with position + pit data to show who
// gained/lost during the window and who used it to pit.

export interface PositionChange {
  driverNumber: number;
  before: number | null;
  after: number | null;
  /** positive = gained (position number decreased), negative = lost */
  delta: number;
}

export interface WhatChangedSnapshot {
  window: IncidentWindow;
  positionChanges: PositionChange[];
  /** Driver numbers who entered the pit lane during this window. */
  pitsDuringWindow: number[];
}

function positionAtMs(
  byDriver: Map<number, { ms: number; pos: number }[]>,
  driverNumber: number,
  cutoffMs: number,
): number | null {
  const arr = byDriver.get(driverNumber);
  if (!arr) return null;
  let result: number | null = null;
  for (const entry of arr) {
    if (entry.ms > cutoffMs) break;
    result = entry.pos;
  }
  return result;
}

export function computeWhatChanged(
  windows: IncidentWindow[],
  positions: Position[],
  pits: Pit[],
  sessionStartMs: number,
): WhatChangedSnapshot[] {
  if (!sessionStartMs || windows.length === 0) return [];

  // Pre-index positions by driver, sorted ascending ms
  const byDriver = new Map<number, { ms: number; pos: number }[]>();
  for (const p of positions) {
    const ms = new Date(p.date).getTime() - sessionStartMs;
    let arr = byDriver.get(p.driver_number);
    if (!arr) {
      arr = [];
      byDriver.set(p.driver_number, arr);
    }
    arr.push({ ms, pos: p.position });
  }
  for (const arr of byDriver.values()) arr.sort((a, b) => a.ms - b.ms);

  const allDrivers = [...byDriver.keys()];
  const snapshots: WhatChangedSnapshot[] = [];

  for (const w of windows) {
    if (w.endMs === null) continue; // incident still active, skip

    const SNAP_LEAD = 5_000; // snapshot 5 s before incident
    const SNAP_LAG = 10_000; // snapshot 10 s after clear

    const beforeMs = Math.max(0, w.startMs - SNAP_LEAD);
    const afterMs = w.endMs + SNAP_LAG;

    const changes: PositionChange[] = [];
    for (const dn of allDrivers) {
      const before = positionAtMs(byDriver, dn, beforeMs);
      const after = positionAtMs(byDriver, dn, afterMs);
      if (before === null && after === null) continue;
      const delta = before !== null && after !== null ? before - after : 0;
      changes.push({ driverNumber: dn, before, after, delta });
    }
    // Sort: biggest gainers first, then biggest losers
    changes.sort((a, b) => b.delta - a.delta);

    // Pits during window
    const pitsDuringWindow: number[] = [];
    const pitsSeen = new Set<number>();
    for (const p of pits) {
      const ms = new Date(p.date).getTime() - sessionStartMs;
      if (ms >= w.startMs && ms <= w.endMs && !pitsSeen.has(p.driver_number)) {
        pitsDuringWindow.push(p.driver_number);
        pitsSeen.add(p.driver_number);
      }
    }

    snapshots.push({ window: w, positionChanges: changes, pitsDuringWindow });
  }

  return snapshots;
}

// ─── Phase lookup for non-race-control events ─────────────────────────────────
// For team radio, overtakes, and other commentary tabs in qualifying, determine
// which qualifying phase (Q1, Q2, Q3) a timestamp falls into.

export function buildPhaseAtMsLookup(
  events: NormalizedRaceControlEvent[],
): (ms: number) => number | null {
  // Build a timeline of phase transitions, sorted by timestamp
  const transitions: Array<{ ms: number; phase: number | null }> = [];
  const seen = new Set<number | null>();

  for (const e of events) {
    if (e.qualifyingPhase !== null && !seen.has(e.qualifyingPhase)) {
      transitions.push({ ms: e.ms, phase: e.qualifyingPhase });
      seen.add(e.qualifyingPhase);
    }
  }

  transitions.sort((a, b) => a.ms - b.ms);

  // Return a function that finds the phase at a given timestamp
  return (ms: number): number | null => {
    let phase: number | null = null;
    for (const t of transitions) {
      if (t.ms <= ms) {
        phase = t.phase;
      } else {
        break;
      }
    }
    return phase;
  };
}
