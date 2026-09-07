import type { RaceControl } from "@/api/types";

interface RaceControlLike {
  flag: string | null;
  message: string;
  scope?: string | null;
  sector?: number | null;
}

const VSC_FLAGS = new Set(["VIRTUAL_SC", "VIRTUAL_SAFETY_CAR", "VSC"]);

function normalizeFlag(flag: string | null): string {
  return (flag ?? "").trim().toUpperCase().replace(/\s+/g, "_");
}

function normalizeMessage(message: string): string {
  return message.toUpperCase();
}

function includesAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export type SafetyControlPhase =
  | "safety_car_start"
  | "safety_car_end"
  | "vsc_start"
  | "vsc_end";

export function isSectorScopedRaceControl(entry: RaceControlLike): boolean {
  const scopeKey = (entry.scope ?? "").toLowerCase();
  if (scopeKey.includes("track")) return false;
  if (scopeKey.includes("sector")) return true;
  return entry.sector !== null && entry.sector !== undefined;
}

export function isTrackClearSignal(entry: RaceControlLike): boolean {
  const flagKey = normalizeFlag(entry.flag);
  if (flagKey === "GREEN" || flagKey === "CLEAR") return true;

  const msg = normalizeMessage(entry.message);
  return includesAny(msg, [
    "TRACK CLEAR",
    "CLEAR IN TRACK",
    "CLEAR IN SECTOR",
    "SECTOR CLEAR",
    "GREEN FLAG",
    "YELLOW FLAG CLEARED",
    "FLAG CLEARED",
    "RESTART",
    "END OF SAFETY CAR",
    "END OF VSC",
    "SAFETY CAR ENDING",
    "SAFETY CAR LIGHTS OUT",
    "SAFETY CAR IN THIS LAP",
    "VSC ENDING",
    "VSC LIGHTS OUT",
    "VSC IN THIS LAP",
  ]);
}

export function isGlobalTrackClearSignal(entry: RaceControlLike): boolean {
  if (!isTrackClearSignal(entry)) return false;

  const msg = normalizeMessage(entry.message);
  const phase = getSafetyControlPhase(entry);

  if (phase === "safety_car_end" || phase === "vsc_end") return true;

  if (
    includesAny(msg, [
      "GREEN FLAG",
      "TRACK CLEAR",
      "RESTART",
      "END OF SAFETY CAR",
      "END OF VSC",
      "SAFETY CAR IN",
      "VSC IN",
      "SAFETY CAR ENDING",
      "VSC ENDING",
      "SAFETY CAR LIGHTS OUT",
      "VSC LIGHTS OUT",
    ])
  ) {
    return true;
  }

  if (msg.includes("CLEAR IN TRACK") && !msg.includes("SECTOR")) {
    return true;
  }

  return !isSectorScopedRaceControl(entry);
}

export function getSafetyControlPhase(
  entry: Pick<RaceControl, "flag" | "message">,
): SafetyControlPhase | null {
  const msg = normalizeMessage(entry.message);
  const flagKey = normalizeFlag(entry.flag);

  if (msg.includes("LIGHTS ON")) {
    return null;
  }

  const safetyCarEnding =
    (msg.includes("SAFETY CAR") &&
      includesAny(msg, [
        "IN THIS LAP",
        "THIS LAP",
        "ENDING",
        "HAS ENDED",
        "RETURN",
        "WITHDRAW",
        "RESTART",
        "LIGHTS OUT",
      ])) ||
    msg.includes("SAFETY CAR IN");

  const vscEnding =
    (msg.includes("VSC") || msg.includes("VIRTUAL SAFETY CAR")) &&
    includesAny(msg, ["ENDING", "HAS ENDED", "END OF", "RESTART", "LIGHTS OUT"]);

  if (vscEnding) return "vsc_end";
  if (safetyCarEnding) return "safety_car_end";

  const vscStartByMessage = includesAny(msg, [
    "VSC DEPLOYED",
    "VSC",
    "VIRTUAL SAFETY CAR DEPLOYED",
    "VIRTUAL SAFETY CAR",
  ]);

  const safetyCarStartByMessage =
    msg.includes("SAFETY CAR") &&
    !msg.includes("VIRTUAL") &&
    !msg.includes("LIGHTS OUT") &&
    !msg.includes("LIGHTS ON");

  if (VSC_FLAGS.has(flagKey) || vscStartByMessage) return "vsc_start";
  if (
    (flagKey === "SAFETY_CAR" || safetyCarStartByMessage) &&
    !msg.includes("LIGHTS ON")
  ) {
    return "safety_car_start";
  }

  return null;
}

export function isSafetyRelatedRaceControl(
  entry: Pick<RaceControl, "flag" | "message">,
): boolean {
  return getSafetyControlPhase(entry) !== null;
}
