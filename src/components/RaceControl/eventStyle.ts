import type { CSSProperties } from "react";
import {
  toFlagKey,
  type NormalizedRaceControlEvent,
  type RaceControlSeverity,
} from "@/timeline/raceControl";
import { teamColor } from "@/utils/color";
import { DEFAULT_FLAG_CONFIG, FLAG_CONFIG, flagAccentStyle } from "./flagConfig";

type StyledEvent = Pick<NormalizedRaceControlEvent, "flag" | "kind" | "severity">;

const SEVERITY_BADGE: Record<
  RaceControlSeverity,
  { label: string; cls: string }
> = {
  info: { label: "Info", cls: "bg-track text-white/80" },
  warning: { label: "Warn", cls: "bg-amber-500/20 text-amber-300" },
  critical: { label: "Critical", cls: "bg-red-500/20 text-red-300" },
};

export interface RaceControlEventBadge {
  label: string;
  /** Tailwind colour classes; empty when `style` carries the flag colours. */
  className: string;
  style?: CSSProperties;
}

/** Badge shown next to a race control message: flag colour, else penalty, else severity. */
export function raceControlEventBadge(e: StyledEvent): RaceControlEventBadge {
  const cfg = FLAG_CONFIG[toFlagKey(e.flag)] ?? DEFAULT_FLAG_CONFIG;
  const isPenalty = e.kind === "penalty";
  const severity = SEVERITY_BADGE[e.severity];
  const label = e.flag
    ? cfg.label || e.flag
    : isPenalty
      ? "Penalty"
      : severity.label;
  if (e.flag && cfg !== DEFAULT_FLAG_CONFIG) {
    return {
      label,
      className: "",
      style: { backgroundColor: cfg.badgeBg, color: cfg.badgeText },
    };
  }
  return {
    label,
    className: isPenalty ? "bg-red-500/25 text-red-200" : severity.cls,
  };
}

/** Left accent stripe: the flag colour/pattern, else the involved driver's team colour. */
export function raceControlEventAccent(
  e: Pick<StyledEvent, "flag">,
  teamColour?: string,
): CSSProperties | null {
  if (!e.flag) {
    return teamColour ? { backgroundColor: teamColor(teamColour) } : null;
  }
  return flagAccentStyle(FLAG_CONFIG[toFlagKey(e.flag)] ?? DEFAULT_FLAG_CONFIG);
}
