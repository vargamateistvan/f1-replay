import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Driver, Location } from "@/api/types";
import monacoJson from "@/data/circuit-geometry/22-2025.json";
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import { MAP3D_DIRECTOR_FADE_MS } from "@/constants";
import { buildPositionIndex } from "@/timeline/director";
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
    // Keyed "source:id", as Mapbox scopes feature state per source.
    featureState = new Map<string, Record<string, unknown>>();
    handlers: Array<{ type: string; layer?: string; fn: Handler }> = [];
    // Like Mapbox, style edits throw until "style.load" has fired.
    styleLoaded = false;
    fitBounds = vi.fn();
    jumpTo = vi.fn();
    setTerrain = vi.fn();
    setConfigProperty = vi.fn();
    setLayoutProperty = vi.fn();
    setPaintProperty = vi.fn();
    setRain = vi.fn();
    addModel = vi.fn();
    resize = vi.fn();
    addControl = vi.fn();
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
    off(type: string, fn: Handler) {
      this.handlers = this.handlers.filter((h) => !(h.type === type && h.fn === fn));
      return this;
    }
    emit(type: string, e: unknown = {}, layer?: string) {
      if (type === "style.load") this.styleLoaded = true;
      for (const h of this.handlers) if (h.type === type && h.layer === layer) h.fn(e);
    }
    checkLoaded() {
      if (!this.styleLoaded) throw new Error("Style is not done loading");
    }
    addSource(id: string, spec: { data?: unknown }) {
      this.checkLoaded();
      const source = { data: spec.data, setData: vi.fn((d: unknown) => (source.data = d)) };
      this.sources.set(id, source);
    }
    getSource(id: string) {
      return this.sources.get(id);
    }
    addLayer(layer: Record<string, unknown>) {
      this.checkLoaded();
      this.layers.set(layer.id as string, layer);
    }
    getLayer(id: string) {
      return this.layers.get(id);
    }
    setFeatureState(target: { source: string; id: string | number }, state: Record<string, unknown>) {
      this.featureState.set(`${target.source}:${target.id}`, state);
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

vi.mock("mapbox-gl", () => ({
  default: {
    Map: FakeMap,
    accessToken: "",
    AttributionControl: class {
      constructor(public options: unknown) {}
    },
  },
}));
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

// Mutable so a test can flip a setting; reset in beforeEach.
const { settings, DEFAULT_SETTINGS } = vi.hoisted(() => {
  const DEFAULT_SETTINGS = {
    lightMode: false,
    metricSystem: "metric",
    mapShowCornerNumbers: true,
    mapShowRaceLeader: true,
    mapStartLightsSound: false,
    mapShowClock: false,
    mapView3dFlagColors: true,
    mapView3dSectorRibbon: true,
    mapView3dWeatherEffects: true,
    mapView3dBuildings: true,
    mapView3dCarModels: true,
  };
  return { settings: { ...DEFAULT_SETTINGS }, DEFAULT_SETTINGS };
});

vi.mock("@/stores/settings", () => {
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
    Object.assign(settings, DEFAULT_SETTINGS);
  });

  it("explains the missing token and offers a way back to 2D", () => {
    vi.mocked(mapboxToken).mockReturnValue(null);
    const { onExit3d } = renderMap();
    expect(screen.getByText(/needs a Mapbox token/i)).toBeInTheDocument();
    expect(FakeMap.instances).toHaveLength(0);
    fireEvent.click(screen.getByTitle("Switch to 2D map"));
    expect(onExit3d).toHaveBeenCalled();
  });

  it("waits for the session instead of reporting the circuit unsupported", () => {
    renderMap({ circuitKey: null });
    expect(screen.getByText(/loading track/i)).toBeInTheDocument();
    expect(FakeMap.instances).toHaveLength(0);
  });

  it("keeps the 2D and settings controls while the map can't be shown", () => {
    const onOpenSettings = vi.fn();
    const { onExit3d } = renderMap({ circuitKey: 9999, onOpenSettings });
    expect(screen.getByText(/isn't available for this circuit/i)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Track map settings"));
    expect(onOpenSettings).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Switch to 2D map"));
    expect(onExit3d).toHaveBeenCalled();
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
    expect(map!.featureState.get(`map3d-marshal:${flagged}`)).toEqual({ active: false, color: "#000000" });
    // Sector ribbon starts clear (green), like the 2D condition ribbon.
    for (const sector of [1, 2, 3]) {
      expect(map!.featureState.get(`map3d-sector-ribbon:${sector}`)).toEqual({
        active: false,
        color: "#39b54a",
      });
    }

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
    expect(map!.featureState.get(`map3d-marshal:${flagged}`)).toEqual({ active: true, color: "#f5d400" });
    expect(map!.featureState.get(`map3d-marshal:${other}`)).toMatchObject({ active: false });
    // Exactly the timing sector holding the flagged post turns yellow.
    const sectorStates = [1, 2, 3].map((n) => map!.featureState.get(`map3d-sector-paint:${n}`));
    expect(sectorStates.filter((st) => st?.active)).toEqual([{ active: true, color: "#f5d400" }]);
  });

  it("leaves the track unpainted when flag colours are off", () => {
    settings.mapView3dFlagColors = false;
    const vsc: TrackFlagState = {
      globalFlag: "VIRTUAL_SC",
      marshalFlags: {},
      maxMarshalSector: 0,
      updatedAtMs: 0,
    };
    const { map } = renderMap({ trackFlagState: vsc });
    act(() => map!.emit("style.load"));
    const post = monaco.marshalSectors[0]!.number;
    expect(map!.featureState.get(`map3d-marshal:${post}`)).toMatchObject({ active: false });
    for (const sector of [1, 2, 3]) {
      expect(map!.featureState.get(`map3d-sector-paint:${sector}`)).toMatchObject({ active: false });
    }
  });

  it("applies the 3D buildings, car models and ribbon settings", () => {
    settings.mapView3dBuildings = false;
    settings.mapView3dCarModels = false;
    settings.mapView3dSectorRibbon = false;
    const { map } = renderMap();
    expect(map!.options.config).toMatchObject({ basemap: { show3dObjects: false } });
    act(() => map!.emit("style.load"));
    expect(map!.setConfigProperty).toHaveBeenCalledWith("basemap", "show3dObjects", false);
    // Models hidden; markers keep their plain opacity instead of fading out.
    expect(map!.layers.get("map3d-car-models")).toMatchObject({ layout: { visibility: "none" } });
    expect(
      (map!.layers.get("map3d-cars") as { paint: Record<string, unknown> }).paint["icon-opacity"],
    ).toEqual(["get", "opacity"]);
    expect(map!.setLayoutProperty).toHaveBeenCalledWith("map3d-sector-ribbon", "visibility", "none");
  });

  it("selects a driver when their marker is clicked", () => {
    const { map, onSelectDriver } = renderMap();
    act(() =>
      map!.emit("click", { features: [{ properties: { num: 16 } }] }, "map3d-cars"),
    );
    expect(onSelectDriver).toHaveBeenCalledWith(16);
  });

  it("keeps the required attribution, in compact form", () => {
    const { map } = renderMap();
    expect(map!.options.attributionControl).toBe(false);
    const [control, position] = map!.addControl.mock.calls[0]!;
    expect((control as { options: unknown }).options).toEqual({ compact: true });
    expect(position).toBe("bottom-right");
  });

  it("waits for the new map's style before building layers on a circuit change", () => {
    const { map: first, rerender } = renderMap();
    act(() => first!.emit("style.load"));

    // A different geometry year swaps the georef, so the map is replaced.
    rerender(
      <TrackMap3D
        sessionKey={1}
        drivers={[lec]}
        locationData={locations}
        sessionStartMs={0}
        circuitKey={22}
        year={2024}
        onExit3d={vi.fn()}
      />,
    );
    const second = FakeMap.instances[FakeMap.instances.length - 1]!;
    expect(second).not.toBe(first);
    expect(first!.remove).toHaveBeenCalled();
    expect(second.layers.size).toBe(0);

    act(() => second.emit("style.load"));
    expect([...second.layers.keys()]).toEqual(
      expect.arrayContaining(["map3d-track-surface", "map3d-cars"]),
    );
  });

  describe("director cut fade", () => {
    const director = {
      cues: [],
      positions: buildPositionIndex([
        { date: new Date(0).toISOString(), driver_number: 16, meeting_key: 1, position: 1, session_key: 1 },
      ]),
      battling: new Set<number>(),
    };

    it("flashes black and fades out when the TV director cuts to a shot", () => {
      renderMap({ director, initialCameraMode: "tv" });
      const veil = screen.getByTestId("director-cut-fade");
      expect(veil.style.transition).toBe(`opacity ${MAP3D_DIRECTOR_FADE_MS}ms ease-out`);
      expect(veil.style.opacity).toBe("0");
    });

    it("leaves the picture alone outside TV mode", () => {
      renderMap({ director, initialCameraMode: "follow" });
      expect(screen.getByTestId("director-cut-fade").style.transition).toBe("");
    });

    it("skips the fade for reduced motion", () => {
      const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation(
        (query: string) => ({ matches: query.includes("reduced-motion") }) as MediaQueryList,
      );
      renderMap({ director, initialCameraMode: "tv" });
      expect(screen.getByTestId("director-cut-fade").style.transition).toBe("");
      matchMedia.mockRestore();
    });
  });

  it("removes the map on unmount", () => {
    const { map, unmount } = renderMap();
    unmount();
    expect(map!.remove).toHaveBeenCalled();
  });
});
