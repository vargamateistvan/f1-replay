import type { RaceControl } from "@/api/types";

interface RaceControlLike {
  flag: string | null;
  message: string;
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

export function isTrackClearSignal(entry: RaceControlLike): boolean {
  const flagKey = normalizeFlag(entry.flag);
  if (flagKey === "GREEN" || flagKey === "CLEAR") return true;

  const msg = normalizeMessage(entry.message);
  return includesAny(msg, ["TRACK CLEAR", "GREEN FLAG", "RESTART"]);
}

export function getSafetyControlPhase(
  entry: Pick<RaceControl, "flag" | "message">,
): SafetyControlPhase | null {
  const msg = normalizeMessage(entry.message);
  const flagKey = normalizeFlag(entry.flag);

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
      ])) ||
    msg.includes("SAFETY CAR IN");

  const vscEnding =
    (msg.includes("VSC") || msg.includes("VIRTUAL SAFETY CAR")) &&
    includesAny(msg, ["ENDING", "HAS ENDED", "END OF", "RESTART"]);

  if (vscEnding) return "vsc_end";
  if (safetyCarEnding) return "safety_car_end";

  const vscStartByMessage = includesAny(msg, [
    "VSC DEPLOYED",
    "VSC",
    "VIRTUAL SAFETY CAR DEPLOYED",
    "VIRTUAL SAFETY CAR",
  ]);

  const safetyCarStartByMessage =
    msg.includes("SAFETY CAR") && !msg.includes("VIRTUAL");

  if (VSC_FLAGS.has(flagKey) || vscStartByMessage) return "vsc_start";
  if (flagKey === "SAFETY_CAR" || safetyCarStartByMessage)
    return "safety_car_start";

  return null;
}

export function isSafetyRelatedRaceControl(
  entry: Pick<RaceControl, "flag" | "message">,
): boolean {
  return getSafetyControlPhase(entry) !== null;
}
