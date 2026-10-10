import type { Driver } from "@/api/types";
import { START_LIGHT_COUNT } from "@/constants";
import {
  isActiveTrackFlag,
  type TimingSectorFlags,
  type TrackFlagState,
} from "@/timeline/raceControl";
import type { StartLightsState } from "@/timeline/startLights";
import { teamColor } from "@/utils/color";

export interface ActiveTrackVehicles {
  safetyCar: boolean;
  vsc: boolean;
  medicalCar: boolean;
  formationLap?: boolean;
  chequeredFlag?: boolean;
}

export interface StatusBadge {
  key: string;
  label: string;
  bg: string;
  border: string;
  text: string;
  driver?: Driver;
  chequered?: boolean;
  /** Start-light gantry: lights currently on. Rendered without text; `label` is its accessible name. */
  lightsLit?: number;
}

/** Badge / sector-chip colour and label per flag key. */
export const FLAG_PALETTE: Record<string, { color: string; label: string }> = {
  YELLOW: { color: "#f5d400", label: "Yellow" },
  DOUBLE_YELLOW: { color: "#f5d400", label: "Double Yellow" },
  RED: { color: "#e8002d", label: "Red Flag" },
  SAFETY_CAR: { color: "#f5a623", label: "Safety Car" },
  VIRTUAL_SC: { color: "#f5a623", label: "VSC" },
  VIRTUAL_SAFETY_CAR: { color: "#f5a623", label: "VSC" },
  GREEN: { color: "#39b54a", label: "Green" },
  CLEAR: { color: "#39b54a", label: "Clear" },
};

const FLAG_BADGE_LABELS: Record<string, string> = {
  YELLOW: "Yellow Flag",
  DOUBLE_YELLOW: "Double Yellow",
  RED: "Red Flag",
  SAFETY_CAR: "Safety Car",
  VIRTUAL_SC: "VSC",
  VIRTUAL_SAFETY_CAR: "VSC",
};

export interface StatusBadgeInput {
  startLights: StartLightsState | null;
  activeTrackVehicles: ActiveTrackVehicles | null;
  trackFlagState: TrackFlagState | null;
  timingSectorFlags: TimingSectorFlags;
  /** Shown only when non-null; pass null to hide the race-leader badge. */
  raceLeader: Driver | null;
  lightMode: boolean;
}

/** The status chips stacked at the top of the map, in display order. */
export function buildStatusBadges({
  startLights,
  activeTrackVehicles,
  trackFlagState,
  timingSectorFlags,
  raceLeader,
  lightMode,
}: StatusBadgeInput): StatusBadge[] {
  const badges: StatusBadge[] = [];
  const seen = new Set<string>();

  const push = (badge: StatusBadge) => {
    if (seen.has(badge.key)) return;
    seen.add(badge.key);
    badges.push(badge);
  };

  if (startLights) {
    // Lights only: they go on one by one, then all go dark at the start.
    const lightsOut = startLights.phase === "out";
    push({
      key: "start_lights",
      label: lightsOut
        ? "Lights out"
        : `${startLights.lit} of ${START_LIGHT_COUNT} start lights on`,
      bg: "#0c0c18",
      border: lightsOut ? "#00c851" : "#5f121d",
      text: "#c8c8ff",
      lightsLit: lightsOut ? 0 : startLights.lit,
    });
  }
  if (activeTrackVehicles?.chequeredFlag) {
    push({
      key: "chequered",
      label: "Chequered Flag",
      bg: "#ffffff",
      border: "#111111",
      text: "#101010",
      chequered: true,
    });
  }
  if (activeTrackVehicles?.formationLap && !startLights) {
    push({
      key: "formation",
      label: "Formation Lap",
      bg: "#1c1c2e",
      border: "#2d3550",
      text: "#c8c8ff",
    });
  }
  if (activeTrackVehicles?.safetyCar) {
    push({
      key: "safety_car",
      label: "Safety Car",
      bg: "#f5a623",
      border: "#704600",
      text: "#101010",
    });
  }
  if (activeTrackVehicles?.vsc) {
    push({
      key: "vsc",
      label: "VSC",
      bg: "#ffd166",
      border: "#7a5400",
      text: "#101010",
    });
  }
  if (activeTrackVehicles?.medicalCar) {
    push({
      key: "medical",
      label: "Medical Car",
      bg: "#e8002d",
      border: "#5f121d",
      text: "#ffffff",
    });
  }

  const addFlagBadge = (flag: string, suffix = "") => {
    if (flag === "GREEN" || flag === "CLEAR") return;

    // Avoid duplicate chips when the same state is already represented by
    // active track-vehicle status (e.g. SC or VSC).
    if (
      (flag === "SAFETY_CAR" && activeTrackVehicles?.safetyCar) ||
      ((flag === "VIRTUAL_SC" || flag === "VIRTUAL_SAFETY_CAR") &&
        activeTrackVehicles?.vsc)
    ) {
      return;
    }

    const color = FLAG_PALETTE[flag]?.color;
    const label = FLAG_BADGE_LABELS[flag];
    if (!color || !label) return;
    const text = flag === "RED" ? "#ffffff" : "#101010";
    push({
      key: `flag_${flag}${suffix}`,
      label: `${label}${suffix}`,
      bg: color,
      border: `${color}99`,
      text,
    });
  };

  const globalTrackFlag = trackFlagState?.globalFlag ?? null;
  if (isActiveTrackFlag(globalTrackFlag)) {
    addFlagBadge(globalTrackFlag);
  } else {
    ([1, 2, 3] as const).forEach((sector) => {
      const flag = timingSectorFlags[sector];
      if (!flag) return;
      addFlagBadge(flag, ` S${sector}`);
    });
  }

  if (raceLeader) {
    const acronym =
      raceLeader.name_acronym ||
      raceLeader.last_name ||
      `#${raceLeader.driver_number}`;
    const teamCol = teamColor(raceLeader.team_colour, "#ffd700");
    push({
      key: "race_leader",
      label: `RACE LEADER: ${acronym}`,
      bg: lightMode ? "#eaf1ff" : "#131520",
      border: teamCol,
      text: lightMode ? "#101010" : "#ffffff",
      driver: raceLeader,
    });
  }

  return badges;
}
