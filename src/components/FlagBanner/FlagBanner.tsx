import type { RaceControl } from "@/api/types";
import { useSettings } from "@/stores/settings";
import { deriveTrackFlagState } from "@/timeline/raceControl";

interface Props {
  entries: RaceControl[];
  sessionTimeMs: number;
  sessionStartMs: number;
  /** Earliest session-relative ms when lap 1 starts (= lights out). Race/sprint only. */
  lightsOutMs?: number | null;
  isRaceSession?: boolean;
}

interface BannerStyle {
  bg: string;
  text: string;
  label: string;
}

const LIGHTS_OUT_STYLE: BannerStyle = {
  bg: "#00c851",
  text: "#fff",
  label: "🚦 LIGHTS OUT",
};

const FLAG_STYLES: Record<string, BannerStyle> = {
  YELLOW: { bg: "#f5d400", text: "#000", label: "⚑ YELLOW FLAG" },
  DOUBLE_YELLOW: { bg: "#f5d400", text: "#000", label: "⚑⚑ DOUBLE YELLOW" },
  RED: { bg: "#e8002d", text: "#fff", label: "⚑ RED FLAG" },
  SAFETY_CAR: { bg: "#f5a623", text: "#000", label: "🚗 SAFETY CAR" },
  VIRTUAL_SC: { bg: "#f5a623", text: "#000", label: "VSC DEPLOYED" },
  VIRTUAL_SAFETY_CAR: { bg: "#f5a623", text: "#000", label: "VSC DEPLOYED" },
  CHEQUERED: { bg: "#fff", text: "#000", label: "🏁 CHEQUERED FLAG" },
  BLACK_AND_WHITE: { bg: "#888", text: "#fff", label: "◩ BLACK & WHITE FLAG" },
};

// The active track flag state at or before the current time.
function activeFlag(
  entries: RaceControl[],
  sessionStartMs: number,
  currentT: number,
): BannerStyle | null {
  if (!sessionStartMs) return null;
  const state = deriveTrackFlagState(entries, sessionStartMs, currentT);
  if (!state) return null;

  const flag = state.globalFlag;
  if (flag && FLAG_STYLES[flag] && flag !== "GREEN" && flag !== "CLEAR") {
    return FLAG_STYLES[flag];
  }

  const hasSectorYellow = Object.values(state.sectorFlags).some(
    (f) => f === "YELLOW" || f === "DOUBLE_YELLOW",
  );
  if (hasSectorYellow) {
    return FLAG_STYLES.YELLOW;
  }

  return null;
}

const LIGHTS_OUT_DURATION_MS = 3_500;

export function FlagBanner({
  entries,
  sessionTimeMs,
  sessionStartMs,
  lightsOutMs,
  isRaceSession,
}: Props) {
  const lightMode = useSettings((s) => s.lightMode);
  const currentT = sessionStartMs + sessionTimeMs;
  const formationStyle: BannerStyle = lightMode
    ? { bg: "#e8ecf8", text: "#4a5575", label: "FORMATION LAP" }
    : { bg: "#1c1c2e", text: "#c8c8ff", label: "FORMATION LAP" };

  // Formation lap / lights out take priority over regular flags.
  // Suppress the formation-lap text once the lights sequence starts (5 s before
  // lights out) — StartingLights handles that window visually.
  const LIGHTS_SEQUENCE_MS = 5_000;
  let banner: BannerStyle | null = null;
  if (isRaceSession && lightsOutMs != null) {
    if (
      sessionTimeMs >= lightsOutMs &&
      sessionTimeMs < lightsOutMs + LIGHTS_OUT_DURATION_MS
    ) {
      banner = LIGHTS_OUT_STYLE;
    } else if (
      sessionTimeMs >= 0 &&
      sessionTimeMs < lightsOutMs - LIGHTS_SEQUENCE_MS
    ) {
      banner = formationStyle;
    }
    // lightsOutMs - LIGHTS_SEQUENCE_MS ≤ t < lightsOutMs → no banner (StartingLights shown)
  }
  if (!banner) banner = activeFlag(entries, sessionStartMs, currentT);

  if (!banner) return null;

  return (
    <div
      className="w-full px-4 py-1 flex items-center justify-center gap-2"
      style={{ backgroundColor: banner.bg, color: banner.text }}
    >
      <span className="text-[12px] sm:text-[11px] font-black uppercase tracking-[0.25em]">
        {banner.label}
      </span>
    </div>
  );
}
