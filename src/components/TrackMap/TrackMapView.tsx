import type { ComponentProps } from "react";
import { useSettings } from "@/stores/settings";
import { TrackMap } from "./TrackMap";

export type { LeaderboardRow } from "./TrackMap";

type TrackMapProps = ComponentProps<typeof TrackMap>;

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-2 text-muted">
      <span className="text-[13px] font-bold text-white/60">{label} view</span>
      <span className="text-[11px]">Coming soon</span>
    </div>
  );
}

export function TrackMapView(props: TrackMapProps) {
  const { mapViewMode } = useSettings();

  if (mapViewMode === "3d") return <ComingSoon label="3D" />;
  if (mapViewMode === "satellite") return <ComingSoon label="Satellite" />;
  return <TrackMap {...props} />;
}
