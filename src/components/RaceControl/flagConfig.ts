import type { CSSProperties } from "react";
import { toFlagKey } from "@/timeline/raceControl";

const CHEQUERED_BORDER_IMAGE = (() => {
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'>" +
    "<rect width='6' height='6' fill='#111'/>" +
    "<rect x='6' y='6' width='6' height='6' fill='#111'/>" +
    "<rect x='6' width='6' height='6' fill='#fff'/>" +
    "<rect y='6' width='6' height='6' fill='#fff'/>" +
    "</svg>";
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
})();

export interface FlagVisualConfig {
  label: string;
  bannerBg: string;
  bannerText: string;
  badgeBg: string;
  badgeText: string;
  border: string;
  borderPattern?: string;
}

export const FLAG_CONFIG: Record<string, FlagVisualConfig> = {
  GREEN: {
    label: "GREEN",
    bannerBg: "#39b54a",
    bannerText: "#fff",
    badgeBg: "#39b54a",
    badgeText: "#fff",
    border: "#39b54a",
  },
  YELLOW: {
    label: "YELLOW",
    bannerBg: "#f5d400",
    bannerText: "#000",
    badgeBg: "#f5d400",
    badgeText: "#000",
    border: "#f5d400",
  },
  DOUBLE_YELLOW: {
    label: "DBL YELLOW",
    bannerBg: "#f5d400",
    bannerText: "#000",
    badgeBg: "#f5d400",
    badgeText: "#000",
    border: "#f5d400",
  },
  RED: {
    label: "RED FLAG",
    bannerBg: "#e8002d",
    bannerText: "#fff",
    badgeBg: "#e8002d",
    badgeText: "#fff",
    border: "#e8002d",
  },
  CHEQUERED: {
    label: "CHEQUERED",
    bannerBg: "#fff",
    bannerText: "#000",
    badgeBg: "#fff",
    badgeText: "#000",
    border: "#e8e8e8",
    borderPattern: CHEQUERED_BORDER_IMAGE,
  },
  BLUE: {
    label: "BLUE",
    bannerBg: "#4da6ff",
    bannerText: "#000",
    badgeBg: "#4da6ff",
    badgeText: "#000",
    border: "#4da6ff",
  },
  BLACK_AND_WHITE: {
    label: "BLK/WHT",
    bannerBg: "#888",
    bannerText: "#fff",
    badgeBg: "#888",
    badgeText: "#fff",
    border: "#888",
  },
  BLACK_AND_ORANGE: {
    label: "BLK/ORG",
    bannerBg: "#f97316",
    bannerText: "#000",
    badgeBg: "#f97316",
    badgeText: "#000",
    border: "#f97316",
  },
  BLACK: {
    label: "BLACK",
    bannerBg: "#111",
    bannerText: "#fff",
    badgeBg: "#111",
    badgeText: "#fff",
    border: "#666",
  },
  SAFETY_CAR: {
    label: "SAFETY CAR",
    bannerBg: "#f5a623",
    bannerText: "#000",
    badgeBg: "#f5a623",
    badgeText: "#000",
    border: "#f5a623",
  },
  VIRTUAL_SC: {
    label: "VIRTUAL SC",
    bannerBg: "#f5a623",
    bannerText: "#000",
    badgeBg: "#f5a623",
    badgeText: "#000",
    border: "#f5a623",
  },
  VIRTUAL_SAFETY_CAR: {
    label: "VIRTUAL SC",
    bannerBg: "#f5a623",
    bannerText: "#000",
    badgeBg: "#f5a623",
    badgeText: "#000",
    border: "#f5a623",
  },
  CLEAR: {
    label: "CLEAR",
    bannerBg: "#39b54a",
    bannerText: "#fff",
    badgeBg: "#39b54a",
    badgeText: "#fff",
    border: "#39b54a",
  },
};

export const DEFAULT_FLAG_CONFIG: FlagVisualConfig = {
  label: "",
  bannerBg: "transparent",
  bannerText: "#fff",
  badgeBg: "transparent",
  badgeText: "#fff",
  border: "transparent",
};

/** Fill style for a flag's accent stripe (solid colour or chequered pattern). */
export function flagAccentStyle(
  cfg: FlagVisualConfig,
  patternSizePx = 12,
): CSSProperties {
  if (cfg.borderPattern) {
    return {
      backgroundImage: cfg.borderPattern,
      backgroundSize: `${patternSizePx}px ${patternSizePx}px`,
      backgroundRepeat: "repeat",
    };
  }
  return { backgroundColor: cfg.border };
}

/** Accent style for a raw/normalized flag string, or null when it has no known colour. */
export function flagAccentStyleFor(
  flag: string | null | undefined,
  patternSizePx?: number,
): CSSProperties | null {
  if (!flag) return null;
  const cfg = FLAG_CONFIG[toFlagKey(flag)];
  return cfg ? flagAccentStyle(cfg, patternSizePx) : null;
}
