export interface KeyMoment {
  ms: number;
  kind: "lead_change" | "fastest_lap" | "safety_car" | "vsc" | "red_flag";
  label: string;
  sublabel?: string;
  color: string;
}
