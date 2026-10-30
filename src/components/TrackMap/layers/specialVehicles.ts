import { TOKEN_HEX } from "@/designTokens";
/** Marker styling for the safety and medical cars (shared by the 2D and 3D maps). */
export interface SpecialVehicleStyle {
  shortLabel: string;
  fullLabel: string;
  fill: string;
  stroke: string;
  text: string;
  /** Marker text colour in dark mode; falls back to `text`. */
  textDark?: string;
  halo: string;
}

const SAFETY_CAR_STYLE: SpecialVehicleStyle = {
  shortLabel: "SC",
  fullLabel: "SAFETY CAR",
  fill: TOKEN_HEX.orange,
  stroke: "#7a5400",
  text: "#101010",
  textDark: "#ffffff",
  halo: "rgba(245,166,35,0.55)",
};

export const SPECIAL_TRACK_VEHICLES: Record<number, SpecialVehicleStyle> = {
  // Both safety cars share one presentation; whichever is deployed for the
  // event is the one that reports real coordinates.
  241: SAFETY_CAR_STYLE,
  242: SAFETY_CAR_STYLE,
  243: SAFETY_CAR_STYLE,
  244: {
    shortLabel: "MC",
    fullLabel: "MEDICAL CAR",
    fill: TOKEN_HEX.f1red,
    stroke: "#5f121d",
    text: "#ffffff",
    halo: "rgba(232,0,45,0.55)",
  },
};
