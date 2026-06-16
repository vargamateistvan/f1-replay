import type { RaceControl } from "@/api/types";

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
  CHEQUERED: "Chequered",
  BLUE: "Blue Flag",
  BLACK_AND_WHITE: "Black And White",
  CLEAR: "Track Clear",
};

const LOW_PRIORITY_FLAGS = new Set(["GREEN", "CLEAR", "BLUE", "CHEQUERED"]);

export function toFlagKey(flag: string | null): string {
  return (flag ?? "").trim().toUpperCase().replace(/\s+/g, "_");
}

function classifyKind(entry: RaceControl, flagKey: string): RaceControlKind {
  const category = (entry.category ?? "").toLowerCase();
  const message = (entry.message ?? "").toLowerCase();

  if (flagKey === "SAFETY_CAR" || flagKey === "VIRTUAL_SC") return "safety_car";
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
  if (flagKey === "SAFETY_CAR" || flagKey === "VIRTUAL_SC") return "critical";
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
