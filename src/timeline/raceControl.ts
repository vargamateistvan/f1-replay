import type { RaceControl, Position, Pit } from "@/api/types";
import {
  getSafetyControlPhase,
  isGlobalTrackClearSignal,
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
const SAFETY_CONTROL_FLAGS = new Set([
  "SAFETY_CAR",
  "VIRTUAL_SC",
  "VIRTUAL_SAFETY_CAR",
]);

export function toFlagKey(flag: string | null): string {
  return (flag ?? "").trim().toUpperCase().replace(/\s+/g, "_");
}

/**
 * Current flag state at a playhead, modelled the way OpenF1 actually reports it.
 *
 * The `scope` field on a race-control row is authoritative and is only ever
 * "Track", "Sector", "Driver" or absent. Critically, the `sector` number on a
 * sector-scoped row is a *marshal post* (circuits run roughly 15-23 of them),
 * NOT a timing sector. Storing only timing sectors 1/2/3 silently discards
 * almost every yellow flag, so raw marshal numbers are the source of truth here
 * and the three-sector view is a projection on top (see
 * `projectToTimingSectors`).
 */
export interface TrackFlagState {
  /** Track-wide flag: RED, SAFETY_CAR, VIRTUAL_SC, CHEQUERED, … */
  globalFlag: string | null;
  /** Keyed by the raw OpenF1 sector number, i.e. marshal post number. */
  marshalFlags: Record<number, string>;
  /**
   * Highest marshal post number seen anywhere in the feed, including after the
   * cutoff. Used as the denominator when projecting posts onto timing sectors
   * so the projection doesn't shift as the playhead moves.
   */
  maxMarshalSector: number;
  updatedAtMs: number;
}

/** Flags for timing sectors 1/2/3, projected from marshal posts. */
export type TimingSectorFlags = Record<1 | 2 | 3, string | null>;

/**
 * Flags that change how the track is being driven, so they are worth painting.
 *
 * Deliberately excludes CHEQUERED (the session is simply over; sector yellows
 * during the cool-down lap must still show) and GREEN/CLEAR (nothing to draw).
 * BLUE and BLACK_AND_WHITE are shown to a single car and never describe the
 * track, so they are excluded too.
 */
const ACTIVE_TRACK_FLAGS = new Set([
  "YELLOW",
  "DOUBLE_YELLOW",
  "RED",
  "SAFETY_CAR",
  "VIRTUAL_SC",
  "VIRTUAL_SAFETY_CAR",
]);

export function isActiveTrackFlag(
  flag: string | null | undefined,
): flag is string {
  return flag != null && ACTIVE_TRACK_FLAGS.has(flag);
}

/** Higher wins when two marshal posts in the same timing sector disagree. */
const FLAG_SEVERITY: Record<string, number> = {
  RED: 5,
  SAFETY_CAR: 4,
  VIRTUAL_SC: 4,
  VIRTUAL_SAFETY_CAR: 4,
  DOUBLE_YELLOW: 3,
  YELLOW: 2,
};

function flagSeverity(flag: string | null): number {
  return flag === null ? -1 : (FLAG_SEVERITY[flag] ?? 0);
}

export type RaceControlFlagScope = "sector" | "track" | "driver" | "unscoped";

/**
 * Classifies which part of the session a race-control row describes.
 *
 * Scope is trusted when present. "Driver" rows (waved blue, black-and-white)
 * are addressed to one car and must never become track state.
 */
export function flagScopeOf(entry: {
  scope?: string | null;
  sector?: number | null;
}): RaceControlFlagScope {
  const scope = (entry.scope ?? "").toLowerCase();
  if (scope.includes("sector")) return "sector";
  if (scope.includes("track")) return "track";
  if (scope.includes("driver")) return "driver";
  // Defensive: a feed that omits scope but carries a marshal post number.
  if (entry.sector !== null && entry.sector !== undefined && entry.sector !== 0)
    return "sector";
  return "unscoped";
}

function shouldPreserveRedFlag(
  currentFlag: string | null,
  nextFlag: string,
): boolean {
  return currentFlag === "RED" && SAFETY_CONTROL_FLAGS.has(nextFlag);
}

/**
 * "GREEN LIGHT - PIT EXIT OPEN" reopens the pit lane. It is track-scoped and
 * carries a GREEN flag, but it does not restart the session, so it must not
 * clear a red flag or a safety car.
 */
function isPitLaneOnlyMessage(message: string): boolean {
  return /\bPIT (?:EXIT|LANE)\b/.test(message);
}

/**
 * Whether a row clears flag state.
 *
 * Note what is deliberately absent: "SAFETY CAR IN THIS LAP" and "VSC ENDING"
 * are advance notice, not a restart, so they no longer clear. Every one of the
 * 17 such messages sampled across 2023, 2025 and 2026 was followed by a
 * track-scoped clear 12-113 s later, so the state always resolves.
 *
 * This is intentionally separate from `isGlobalTrackClearSignal`, which governs
 * incident windows and race chapters. When an incident *window* closes and when
 * the flags go green are different questions.
 */
function isFlagStateClear(entry: RaceControl): boolean {
  const message = (entry.message ?? "").toUpperCase();
  const flagKey = toFlagKey(entry.flag);

  if (flagKey === "CLEAR" || flagKey === "GREEN") {
    return !isPitLaneOnlyMessage(message);
  }
  if (flagKey) return false;

  return /\bTRACK CLEAR\b|\bCLEAR IN TRACK\b|\bSECTOR CLEAR\b|\bFLAG CLEARED\b|\bRESTART\b/.test(
    message,
  );
}

/**
 * The flag a row asserts, for state purposes.
 *
 * Message matching is anchored on word boundaries: "CHEQUERED FLAG" contains
 * the substring "RED FLAG", so a plain `includes` check turns the end of every
 * session into a red flag.
 */
function stateFlagKeyFor(entry: RaceControl): string | null {
  const message = (entry.message ?? "").toUpperCase();
  // "SAFETY CAR LIGHTS ON" is the car arming its lights, not a deployment.
  if (/\bLIGHTS ON\b/.test(message)) return null;

  const flagKey = toFlagKey(entry.flag);
  if (flagKey) return flagKey;

  // Only reached when OpenF1 leaves the flag field empty, which it does for
  // SafetyCar-category rows and some older seasons.
  if (/\bDOUBLE YELLOW\b/.test(message)) return "DOUBLE_YELLOW";
  if (/\bYELLOW IN TRACK SECTOR\b/.test(message)) return "YELLOW";
  if (/\bRED FLAG\b/.test(message)) return "RED";
  if (/\bCHEQUERED FLAG\b/.test(message)) return "CHEQUERED";
  if (/\bVIRTUAL SAFETY CAR DEPLOYED\b|\bVSC DEPLOYED\b/.test(message))
    return "VIRTUAL_SC";
  if (/\bSAFETY CAR DEPLOYED\b/.test(message)) return "SAFETY_CAR";
  return null;
}

function resolveFlagKeyFromRaceControlEntry(entry: RaceControl): string | null {
  const message = (entry.message ?? "").toUpperCase();
  if (message.includes("LIGHTS ON")) return null;

  const flagKey = toFlagKey(entry.flag);
  if (flagKey) return flagKey;

  const safetyPhase = getSafetyControlPhase(entry);
  if (safetyPhase === "safety_car_end" || safetyPhase === "vsc_end") {
    return "GREEN";
  }
  if (safetyPhase === "safety_car_start") return "SAFETY_CAR";
  if (safetyPhase === "vsc_start") return "VIRTUAL_SC";

  // OpenF1 can leave `flag` empty while still sending a structured flag message.
  const isYellowFlagPenaltyMessage =
    message.includes("YELLOW FLAG INFRINGEMENT") ||
    (message.includes("YELLOW FLAG") &&
      (message.includes("PENALTY") || message.includes("INFRINGEMENT")));

  if (message.includes("DOUBLE YELLOW")) return "DOUBLE_YELLOW";
  if (
    (message.includes("YELLOW FLAG") || message.includes("YELLOW IN")) &&
    !isYellowFlagPenaltyMessage
  ) {
    return "YELLOW";
  }
  // Word-boundary anchored: "CHEQUERED FLAG" contains "RED FLAG".
  if (/\bRED FLAG\b/.test(message)) return "RED";
  if (
    message.includes("VIRTUAL SAFETY CAR") ||
    message.includes("VSC DEPLOYED")
  ) {
    return "VIRTUAL_SC";
  }
  if (message.includes("SAFETY CAR DEPLOYED")) {
    return "SAFETY_CAR";
  }
  if (
    message.includes("GREEN FLAG") ||
    message.includes("TRACK CLEAR") ||
    message.includes("CLEAR IN TRACK") ||
    message.includes("CLEAR IN SECTOR") ||
    message.includes("SECTOR CLEAR") ||
    message.includes("YELLOW FLAG CLEARED") ||
    message.includes("FLAG CLEARED") ||
    message.includes("END OF SAFETY CAR") ||
    message.includes("END OF VSC") ||
    message.includes("SAFETY CAR ENDING") ||
    message.includes("SAFETY CAR LIGHTS OUT") ||
    message.includes("SAFETY CAR IN THIS LAP") ||
    message.includes("VSC ENDING") ||
    message.includes("VSC LIGHTS OUT") ||
    message.includes("VSC IN THIS LAP") ||
    message.includes("RESTART")
  ) {
    return "GREEN";
  }

  return null;
}

/**
 * Derive the global + per-marshal-post flag state up to a playhead time.
 *
 * Driver-scoped rows (waved blue, black-and-white) are skipped entirely: they
 * describe one car, and letting them through was painting the whole track with
 * a flag colour and hiding every real sector yellow underneath.
 */
export function deriveTrackFlagState(
  entries: RaceControl[],
  sessionStartMs: number,
  cutoffMs: number,
): TrackFlagState | null {
  if (!sessionStartMs || entries.length === 0) return null;

  let maxMarshalSector = 0;
  for (const entry of entries) {
    const sector = entry.sector;
    if (sector !== null && sector !== undefined && sector > maxMarshalSector) {
      maxMarshalSector = sector;
    }
  }

  const state: TrackFlagState = {
    globalFlag: null,
    marshalFlags: {},
    maxMarshalSector,
    updatedAtMs: 0,
  };

  const sorted = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  for (const entry of sorted) {
    const eventMs = new Date(entry.date).getTime();
    if (eventMs > cutoffMs) break;

    const scope = flagScopeOf(entry);
    // Addressed to a single car; never track state.
    if (scope === "driver") continue;

    if (isFlagStateClear(entry)) {
      state.updatedAtMs = eventMs;
      if (scope === "sector") {
        if (entry.sector !== null && entry.sector !== undefined) {
          delete state.marshalFlags[entry.sector];
        }
      } else {
        state.globalFlag = null;
        state.marshalFlags = {};
      }
      continue;
    }

    const flagKey = stateFlagKeyFor(entry);
    if (!flagKey) continue;
    // GREEN and CLEAR only ever act as clears, handled above. Reaching here
    // means the row did not qualify as one ("GREEN LIGHT - PIT EXIT OPEN"), so
    // it is a no-op rather than a flag to store.
    if (flagKey === "GREEN" || flagKey === "CLEAR") continue;

    state.updatedAtMs = eventMs;
    if (scope === "sector") {
      if (entry.sector !== null && entry.sector !== undefined) {
        state.marshalFlags[entry.sector] = flagKey;
      }
    } else {
      if (shouldPreserveRedFlag(state.globalFlag, flagKey)) continue;
      state.globalFlag = flagKey;
    }
  }

  if (
    state.globalFlag === null &&
    Object.keys(state.marshalFlags).length === 0
  ) {
    return null;
  }

  return state;
}

/**
 * Maps a marshal post onto a timing sector by splitting the posts into thirds.
 *
 * Posts are numbered in track order and spaced roughly evenly, so thirds are a
 * good approximation. It is an approximation either way, because real timing
 * sector boundaries do not fall at exact thirds of a lap.
 */
export function timingSectorForMarshalPost(
  post: number,
  totalPosts: number,
): 1 | 2 | 3 {
  if (totalPosts <= 0) return 1;
  const clamped = Math.min(Math.max(post, 1), totalPosts);
  const third = totalPosts / 3;
  if (clamped <= third) return 1;
  if (clamped <= third * 2) return 2;
  return 3;
}

/**
 * Projects marshal-post flags onto timing sectors 1/2/3, for the consumers that
 * display three sectors. An active track-wide flag covers all three.
 *
 * `totalPosts` should be the circuit's real marshal post count. Callers with
 * baked geometry should pass the larger of the baked count and
 * `state.maxMarshalSector`, because the two disagree on some circuits.
 */
export function projectToTimingSectors(
  state: TrackFlagState | null,
  totalPosts: number,
): TimingSectorFlags {
  const out: TimingSectorFlags = { 1: null, 2: null, 3: null };
  if (!state) return out;

  if (isActiveTrackFlag(state.globalFlag)) {
    out[1] = state.globalFlag;
    out[2] = state.globalFlag;
    out[3] = state.globalFlag;
    return out;
  }

  const denominator = Math.max(totalPosts, state.maxMarshalSector, 1);
  for (const [postKey, flag] of Object.entries(state.marshalFlags)) {
    const sector = timingSectorForMarshalPost(Number(postKey), denominator);
    if (flagSeverity(flag) > flagSeverity(out[sector])) out[sector] = flag;
  }
  return out;
}

/**
 * The flag in force at one marshal post: an active track-wide flag if there is
 * one, otherwise that post's own flag.
 *
 * An inactive global flag such as CHEQUERED falls through rather than
 * suppressing the post's flag.
 */
export function resolveFlagForMarshalPost(
  state: TrackFlagState | null,
  post: number,
): string | null {
  if (!state) return null;
  if (isActiveTrackFlag(state.globalFlag)) return state.globalFlag;
  return state.marshalFlags[post] ?? null;
}

/** True when any marshal post is showing a yellow or double yellow. */
export function hasAnyMarshalYellow(state: TrackFlagState | null): boolean {
  if (!state) return false;
  return Object.values(state.marshalFlags).some(
    (flag) => flag === "YELLOW" || flag === "DOUBLE_YELLOW",
  );
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
  if (kind === "other") {
    const message = (entry.message ?? "").trim();
    if (message !== "") return message;
  }
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
    String(entry.scope ?? ""),
    String(entry.sector ?? ""),
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
    const inferredFlagKey = resolveFlagKeyFromRaceControlEntry(entry) ?? "";
    const explicitFlag = (entry.flag ?? "").trim();
    const normalizedFlag =
      explicitFlag !== "" ? entry.flag : inferredFlagKey || null;
    const kind = classifyKind(entry, inferredFlagKey);
    const description = (entry.message ?? "").trim() || "Race control update";

    out.push({
      id: key,
      ms,
      kind,
      severity: classifySeverity(kind, inferredFlagKey, description),
      date: entry.date,
      driverNumber: entry.driver_number,
      lapNumber: entry.lap_number,
      sector: entry.sector,
      scope: entry.scope,
      flag: normalizedFlag,
      category: entry.category,
      title: titleFor(entry, kind, inferredFlagKey),
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
 * single representative marker. The label/severity shown come from the
 * highest-severity event in the group, but the jump target (`ms`) is always
 * the earliest event in the cluster so clicking the marker lands at the
 * actual start of the incident rather than skipping ahead to a later,
 * more-severe follow-up message.
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
    // Pick the item with the highest severity for the label; break ties by
    // earliest ms.
    const rep = group.reduce((best, cur) =>
      SEV_RANK[cur.severity] > SEV_RANK[best.severity] ? cur : best,
    );
    // The jump target must always be the earliest event in the cluster
    // (`group` is sorted by ms, so that's `group[0]`) — otherwise clicking the
    // marker skips past the start of the incident to whichever later event
    // happened to be classified as most severe (e.g. a follow-up
    // investigation message a few seconds after the initial flag).
    const earliestMs = group[0]!.ms;

    clusters.push({
      id: rep.id,
      ms: earliestMs,
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

export type IncidentWindowKind =
  | "safety_car"
  | "vsc"
  | "red_flag"
  | "yellow_flag";

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
  if (flagKey === "YELLOW" || flagKey === "DOUBLE_YELLOW") {
    return "yellow_flag";
  }
  return null;
}

function isTrackClear(e: NormalizedRaceControlEvent): boolean {
  const phase = getSafetyControlPhase(e.raw);
  if (phase === "safety_car_end" || phase === "vsc_end") return true;
  return isGlobalTrackClearSignal(e.raw);
}

export function buildIncidentWindows(
  events: NormalizedRaceControlEvent[],
): IncidentWindow[] {
  const windows: IncidentWindow[] = [];
  const counters: Record<IncidentWindowKind, number> = {
    safety_car: 0,
    vsc: 0,
    red_flag: 0,
    yellow_flag: 0,
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
            : kind === "red_flag"
              ? `Red Flag ${num > 1 ? num : ""}`.trim()
              : `Yellow Flag ${num > 1 ? num : ""}`.trim();
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
  | "yellow"
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
      kind: w.kind === "yellow_flag" ? "yellow" : w.kind,
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
