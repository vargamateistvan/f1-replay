import { lazy, Suspense, Component, type ReactNode, type ComponentProps } from "react";
import { useSettings } from "@/stores/settings";
import { TrackMap } from "./TrackMap";

export type { LeaderboardRow } from "./TrackMap";

type TrackMapProps = ComponentProps<typeof TrackMap>;

// Lazy-loaded renderers — their deps (three, maplibre) are separate chunks and
// never bundled with the main app unless the user switches to that mode.
const TrackMap3D = lazy(() =>
  import("./TrackMap3D").then((m) => ({ default: m.TrackMap3D })),
);
const TrackMapSatellite = lazy(() =>
  import("./TrackMapSatellite").then((m) => ({ default: m.TrackMapSatellite })),
);

function Fallback2D(props: TrackMapProps) {
  return <TrackMap {...props} />;
}

function LoadingPlaceholder() {
  return (
    <div className="flex items-center justify-center w-full h-full text-muted text-sm animate-pulse">
      Loading…
    </div>
  );
}

// Error boundary — falls back to 2D if the lazy chunk fails to load
interface EBState {
  error: boolean;
}
class ModeErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  EBState
> {
  state: EBState = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    if (this.state.error) return this.props.fallback;
    return this.props.children;
  }
}

export function TrackMapView(props: TrackMapProps) {
  const { mapViewMode } = useSettings();

  if (mapViewMode === "satellite") {
    return (
      <ModeErrorBoundary fallback={<Fallback2D {...props} />}>
        <Suspense fallback={<LoadingPlaceholder />}>
          <TrackMapSatellite {...props} />
        </Suspense>
      </ModeErrorBoundary>
    );
  }

  if (mapViewMode === "3d") {
    return (
      <ModeErrorBoundary fallback={<Fallback2D {...props} />}>
        <Suspense fallback={<LoadingPlaceholder />}>
          <TrackMap3D {...props} />
        </Suspense>
      </ModeErrorBoundary>
    );
  }

  return <TrackMap {...props} />;
}
