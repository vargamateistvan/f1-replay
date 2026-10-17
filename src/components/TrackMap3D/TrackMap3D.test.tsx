import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Driver, Location } from "@/api/types";
import monacoJson from "@/data/circuit-geometry/22-2025.json";
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import type { TrackFlagState } from "@/timeline/raceControl";
import { mapboxToken } from "./availability";
import { TrackMap3D } from "./TrackMap3D";

type Handler = (e: unknown) => void;

// Minimal stand-in for mapboxgl.Map: records what the component asks of it.
// Hoisted so the vi.mock factory below can reference it.
const { FakeMap } = vi.hoisted(() => {
  class FakeMap {
    static instances: FakeMap[] = [];
    options: Record<string, unknown>;
    sources = new Map<string, { data?: unknown; setData: (d: unknown) => void }>();
    layers = new Map<string, Record<string, unknown>>();
    featureState = new Map<string | number, Record<string, unknown>>();
    handlers: Array<{ type: string; layer?: string; fn: Handler }> = [];
    fitBounds = vi.fn();
    jumpTo = vi.fn();
    setTerrain = vi.fn();
    setConfigProperty = vi.fn();
    setLayoutProperty = vi.fn();
    setPaintProperty = vi.fn();
    setRain = vi.fn();
    addModel = vi.fn();
    resize = vi.fn();
    hasImage = vi.fn(() => false);
    addImage = vi.fn();
    removeImage = vi.fn();
    remove = vi.fn();

    constructor(options: Record<string, unknown>) {
      this.options = options;
      FakeMap.instances.push(this);
    }
    on(type: string, layerOrFn: string | Handler, fn?: Handler) {
      if (typeof layerOrFn === "function") this.handlers.push({ type, fn: layerOrFn });
      else this.handlers.push({ type, layer: layerOrFn, fn: fn! });
      return this;
    }
    emit(type: string, e: unknown = {}, layer?: string) {
      for (const h of this.handlers) if (h.type === type && h.layer === layer) h.fn(e);
    }
    addSource(id: string, spec: { data?: unknown }) {
      const source = { data: spec.data, setData: vi.fn((d: unknown) => (source.data = d)) };
      this.sources.set(id, source);
    }
    getSource(id: string) {
      return this.sources.get(id);
    }
    addLayer(layer: Record<string, unknown>) {
      this.layers.set(layer.id as string, layer);
    }
    getLayer(id: string) {
      return this.layers.get(id);
    }
    setFeatureState(target: { id: string | number }, state: Record<string, unknown>) {
      this.featureState.set(target.id, state);
    }
    getCanvas() {
      return document.createElement("canvas");
    }
    getCenter() {
      return { lng: 7.42, lat: 43.73 };
    }
    getBearing() {
      return 0;
    }
    getZoom() {
      return 14;
    }
    getPitch() {
      return 50;
    }
  }
  return { FakeMap };
});

vi.mock("mapbox-gl", () => ({ default: { Map: FakeMap, accessToken: "" } }));
vi.mock("mapbox-gl/dist/mapbox-gl.css", () => ({}));

vi.mock("./availability", () => ({ mapboxToken: vi.fn(() => "pk.test") }));

vi.mock("@/hooks/useCircuitGeometry", () => ({
  useCircuitGeometry: vi.fn(() => ({ data: monacoJson, isPending: false })),
}));
vi.mock("@/hooks/useCarDataForLap", () => ({
  useCarDataForLap: vi.fn(() => ({ data: [] })),
}));
vi.mock("@/hooks/useCarDataWindow", () => ({
  useCarDataWindow: vi.fn(() => ({ data: [] })),
}));
vi.mock("@/hooks/useStartLightsSound", () => ({ useStartLightsSound: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

vi.mock("@/timeline/clock", () => {
  const state = { t: 500 };
  const useTimeline = Object.assign(
    vi.fn((selector?: (s: typeof state) => unknown) => (selector ? selector(state) : state)),
    { getState: () => state, subscribe: () => () => {} },
  );
  return { useTimeline };
});

vi.mock("@/stores/settings", () => {
  const settings = {
    lightMode: false,
    metricSystem: "metric",
    mapShowCornerNumbers: true,
    mapShowRaceLeader: true,
    mapStartLightsSound: false,
    mapShowClock: false,
  };
  const useSettings = Object.assign(
    vi.fn((selector: (s: typeof settings) => unknown) => selector(settings)),
    { getState: () => settings },
  );
  return { useSettings };
});

const monaco = monacoJson as CircuitGeometry;
const lec = { driver_number: 16, name_acronym: "LEC", team_colour: "E80020" } as Driver;
const locations: Location[] = [0, 1000].map((ms, i) => ({
  date: new Date(ms).toISOString(),
  driver_number: 16,
  meeting_key: 1,
  session_key: 1,
  x: monaco.x[i]!,
  y: monaco.y[i]!,
  z: 0,
}));

function renderMap(props: Partial<Parameters<typeof TrackMap3D>[0]> = {}) {
  const onExit3d = vi.fn();
  const onSelectDriver = vi.fn();
  const utils = render(
    <TrackMap3D
      sessionKey={1}
      drivers={[lec]}
      locationData={locations}
      sessionStartMs={0}
      circuitKey={22}
      year={2025}
      onExit3d={onExit3d}
      onSelectDriver={onSelectDriver}
      {...props}
    />,
  );
  const map = FakeMap.instances[FakeMap.instances.length - 1];
  return { ...utils, map, onExit3d, onSelectDriver };
}

describe("TrackMap3D", () => {
  beforeEach(() => {
    FakeMap.instances = [];
    vi.mocked(mapboxToken).mockReturnValue("pk.test");
  });

  it("explains the missing token and offers a way back to 2D", () => {
    vi.mocked(mapboxToken).mockReturnValue(null);
    const { onExit3d } = renderMap();
    expect(screen.getByText(/needs a Mapbox token/i)).toBeInTheDocument();
    expect(FakeMap.instances).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /back to 2d/i }));
    expect(onExit3d).toHaveBeenCalled();
  });

  it("waits for the session instead of reporting the circuit unsupported", () => {
    renderMap({ circuitKey: null });
    expect(screen.getByText(/loading track/i)).toBeInTheDocument();
    expect(FakeMap.instances).toHaveLength(0);
  });

  it("builds the circuit layers once the style loads and frames the track", () => {
    const { map } = renderMap();
    expect(map).toBeDefined();
    act(() => map!.emit("style.load"));

    // Terrain is opt-in (setting off in this mock): flattened, no DEM source.
    expect(map!.setTerrain).toHaveBeenCalledWith(null);
    expect(map!.sources.has("map3d-dem")).toBe(false);
    expect([...map!.layers.keys()]).toEqual(
      expect.arrayContaining(["map3d-track-surface", "map3d-flags", "map3d-cars", "map3d-corners"]),
    );
    const [, options] = map!.fitBounds.mock.calls[0]!;
    expect(options.bearing).toBeCloseTo(316.3, 0);
    expect(map!.setLayoutProperty).toHaveBeenCalledWith("map3d-corners", "visibility", "visible");
  });

  it("paints flagged marshal posts through feature state", () => {
    const yellow: TrackFlagState = {
      globalFlag: null,
      marshalFlags: { [monaco.marshalSectors[2]!.number]: "DOUBLE_YELLOW" },
      maxMarshalSector: 0,
      updatedAtMs: 0,
    };
    const { map, rerender } = renderMap();
    act(() => map!.emit("style.load"));
    const flagged = monaco.marshalSectors[2]!.number;
    const other = monaco.marshalSectors[3]!.number;
    expect(map!.featureState.get(flagged)).toEqual({ active: false, color: "#000000" });

    rerender(
      <TrackMap3D
        sessionKey={1}
        drivers={[lec]}
        locationData={locations}
        sessionStartMs={0}
        circuitKey={22}
        year={2025}
        trackFlagState={yellow}
        onExit3d={vi.fn()}
      />,
    );
    expect(map!.featureState.get(flagged)).toEqual({ active: true, color: "#f5d400" });
    expect(map!.featureState.get(other)).toMatchObject({ active: false });
  });

  it("selects a driver when their marker is clicked", () => {
    const { map, onSelectDriver } = renderMap();
    act(() =>
      map!.emit("click", { features: [{ properties: { num: 16 } }] }, "map3d-cars"),
    );
    expect(onSelectDriver).toHaveBeenCalledWith(16);
  });

  it("removes the map on unmount", () => {
    const { map, unmount } = renderMap();
    unmount();
    expect(map!.remove).toHaveBeenCalled();
  });
});
