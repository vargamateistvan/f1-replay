export const PUSH_ALERT_TYPES = ["reminder", "started", "results"] as const;
export const PUSH_SESSION_TYPES = ["race", "sprint", "qualifying", "sprintQualifying", "practice"] as const;

export type PushAlertType = typeof PUSH_ALERT_TYPES[number];
export type PushSessionType = typeof PUSH_SESSION_TYPES[number];
export interface PushPreferences {
  alerts: Record<PushAlertType, boolean>;
  sessions: Record<PushSessionType, boolean>;
}

// Automatic alerts must be explicitly opted into, including existing devices.
export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  alerts: { reminder: false, started: false, results: false },
  sessions: { race: true, sprint: true, qualifying: true, sprintQualifying: true, practice: false },
};

function isBooleanRecord(value: unknown, keys: readonly string[]): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === keys.length &&
    keys.every((key) => Object.hasOwn(record, key) && typeof record[key] === "boolean");
}

export function isPushPreferences(value: unknown): value is PushPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2 &&
    isBooleanRecord(record.alerts, PUSH_ALERT_TYPES) &&
    isBooleanRecord(record.sessions, PUSH_SESSION_TYPES);
}
