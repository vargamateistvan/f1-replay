import type { RaceControl } from "@/api/types";

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

const FORMATION_STYLE: BannerStyle = { bg: "#1c1c2e", text: "#c8c8ff", label: "FORMATION LAP" };
const LIGHTS_OUT_STYLE: BannerStyle = { bg: "#00c851", text: "#fff", label: "🚦 LIGHTS OUT" };

const FLAG_STYLES: Record<string, BannerStyle> = {
  YELLOW: { bg: "#f5d400", text: "#000", label: "⚑ YELLOW FLAG" },
  DOUBLE_YELLOW: { bg: "#f5d400", text: "#000", label: "⚑⚑ DOUBLE YELLOW" },
  RED: { bg: "#e8002d", text: "#fff", label: "⚑ RED FLAG" },
  SAFETY_CAR: { bg: "#f5a623", text: "#000", label: "🚗 SAFETY CAR" },
  VIRTUAL_SAFETY_CAR: { bg: "#f5a623", text: "#000", label: "VSC DEPLOYED" },
  CHEQUERED: { bg: "#fff", text: "#000", label: "🏁 CHEQUERED FLAG" },
  BLACK_AND_WHITE: { bg: "#888", text: "#fff", label: "◩ BLACK & WHITE FLAG" },
};

// The most recent flag-type race control message at or before the current time.
function activeFlag(
  entries: RaceControl[],
  currentT: number,
): BannerStyle | null {
  let last: RaceControl | null = null;
  for (const e of entries) {
    if (e.flag === null) continue;
    if (new Date(e.date).getTime() > currentT) break;
    last = e;
  }
  if (!last || !last.flag) return null;
  if (last.flag === "CLEAR" || last.flag === "GREEN") return null;
  return FLAG_STYLES[last.flag] ?? null;
}

const LIGHTS_OUT_DURATION_MS = 3_500;

export function FlagBanner({ entries, sessionTimeMs, sessionStartMs, lightsOutMs, isRaceSession }: Props) {
  const currentT = sessionStartMs + sessionTimeMs;

  // Formation lap / lights out take priority over regular flags.
  let banner: BannerStyle | null = null;
  if (isRaceSession && lightsOutMs != null) {
    if (sessionTimeMs >= lightsOutMs && sessionTimeMs < lightsOutMs + LIGHTS_OUT_DURATION_MS) {
      banner = LIGHTS_OUT_STYLE;
    } else if (sessionTimeMs >= 0 && sessionTimeMs < lightsOutMs) {
      banner = FORMATION_STYLE;
    }
  }
  if (!banner) banner = activeFlag(entries, currentT);

  if (!banner) return null;

  return (
    <div
      className="w-full px-4 py-1 flex items-center justify-center gap-2 animate-pulse-slow"
      style={{ backgroundColor: banner.bg, color: banner.text }}
    >
      <span className="text-[12px] sm:text-[11px] font-black uppercase tracking-[0.25em]">
        {banner.label}
      </span>
    </div>
  );
}
