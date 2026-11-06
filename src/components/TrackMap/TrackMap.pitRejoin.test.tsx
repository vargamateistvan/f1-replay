import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import type { Driver, Location } from "@/api/types";
import { TrackMap } from "./TrackMap";

let timelineT = 0;
let geometry: unknown = null;

vi.mock("@/hooks/useCoarseTime", () => ({ useCoarseTime: () => timelineT }));
vi.mock("@/hooks/useStartLightsSound", () => ({
  useStartLightsSound: () => {},
}));
vi.mock("@/hooks/useCarDataWindow", () => ({
  useCarDataWindow: () => ({ data: [] }),
}));
vi.mock("@/hooks/useCarDataForLap", () => ({
  useCarDataForLap: () => ({ data: [] }),
}));
vi.mock("@/hooks/useTrackMap", () => ({
  useTrackOutline: () => ({
    data: {
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      bounds: {
        minX: 0,
        minY: 0,
        maxX: 100,
        maxY: 100,
        width: 100,
        height: 100,
      },
      source: "baked",
    },
    isPending: false,
  }),
  locationToSvg: (x: number, y: number) => ({ sx: x, sy: y }),
  computeTrackAutoRotationDeg: () => 0,
  isOffTrackPlaceholder: (pos: { x: number; y: number }) =>
    pos.x === 0 && pos.y === 0,
}));
vi.mock("@/data/circuits", () => ({ getCircuitLayout: () => null }));
vi.mock("@/data/circuitGeometry", () => ({
  getCircuitGeometry: () => geometry,
  hasCircuitGeometry: () => false,
  loadCircuitGeometry: async () => null,
}));
vi.mock("@/stores/settings", () => ({
  useSettings: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      lightMode: false,
      metricSystem: "metric",
      mapShowDriverAcronym: true,
      mapShowDriverNumberInside: false,
      mapShowRaceLeader: false,
      mapShowMarshalHeatmap: false,
      mapShowCornerNumbers: false,
      mapShowElevation: false,
      mapShowClock: false,
    }),
}));

const START = Date.parse("2024-01-01T00:00:00.000Z");

function driver(driver_number: number, name_acronym: string): Driver {
  return {
    driver_number,
    name_acronym,
    broadcast_name: name_acronym,
    full_name: name_acronym,
    team_name: "Team",
    team_colour: "3671C6",
    first_name: "",
    last_name: name_acronym,
    headshot_url: null,
    country_code: "",
    session_key: 1,
    meeting_key: 1,
  } as Driver;
}

const drivers = [
  driver(1, "VER"),
  driver(44, "HAM"),
  driver(16, "LEC"),
  driver(63, "RUS"),
];

// Car 1 drives along the bottom edge for 40 s.
const locationData: Location[] = Array.from({ length: 41 }, (_, s) => ({
  date: new Date(START + s * 1000).toISOString(),
  driver_number: 1,
  meeting_key: 1,
  session_key: 1,
  x: 10 + s * 2,
  y: 20,
  z: 0,
}));

// 1 is 2 s behind the leader; +21 s pit loss → 23 s: behind LEC, ahead of RUS.
const gaps = new Map([
  [44, 0],
  [1, 2],
  [16, 15],
  [63, 30],
]);

const bakedGeometry = {
  rotation: 0,
  x: [],
  y: [],
  corners: [],
  marshalSectors: [],
  marshalLights: [],
  pitLoss: { normal: "21.0", sc: "13.0", vsc: "15.0" },
};

function renderMap(props: Partial<ComponentProps<typeof TrackMap>> = {}) {
  return render(
    <TrackMap
      sessionKey={1}
      drivers={drivers}
      locationData={locationData}
      sessionStartMs={START}
      circuitKey={9}
      year={2024}
      focusDriver={1}
      pitRejoinGaps={gaps}
      showFocusedHud={false}
      {...props}
    />,
  );
}

describe("TrackMap pit rejoin projection", () => {
  it("shows the projected position, neighbours and a ghost marker", () => {
    geometry = bakedGeometry;
    timelineT = 30_000;
    renderMap();

    const panel = screen.getByTestId("pit-rejoin-panel");
    expect(panel.textContent).toContain("P3");
    expect(panel.textContent).toContain("LEC 8.0s");
    expect(panel.textContent).toContain("RUS 7.0s");
    expect(screen.getByTitle("Green pit time loss (current)")).toHaveTextContent("21.0s");
    expect(screen.getByTitle("SC pit time loss")).toHaveTextContent("13.0s");
    expect(screen.getByTitle("VSC pit time loss")).toHaveTextContent("15.0s");
    expect(panel.textContent).toContain("Green");

    // Ghost sits where car 1 was 21 s ago: x = 10 + 9 * 2 (+ SVG padding).
    const ghost = screen.getByTestId("pit-rejoin-ghost");
    expect(ghost.getAttribute("transform")).toBe("translate(52.0,44.0)");
    expect(ghost.textContent).toBe("PIT P3");
  });

  it("uses the cheaper safety-car pit loss when the SC is out", () => {
    geometry = bakedGeometry;
    timelineT = 30_000;
    renderMap({
      activeTrackVehicles: { safetyCar: true, vsc: false, medicalCar: false },
    });
    const panel = screen.getByTestId("pit-rejoin-panel");
    // 2 + 13 = 15 → ties with LEC, who keeps the place.
    expect(panel.textContent).toContain("P3");
    expect(screen.getByTitle("SC pit time loss (current)")).toHaveTextContent("13.0s");
    expect(screen.getByTitle("Green pit time loss")).toHaveTextContent("21.0s");
    expect(screen.getByTitle("VSC pit time loss")).toHaveTextContent("15.0s");
    expect(panel.textContent).toContain("SC");
  });

  it("draws the pit window behind the car, the other conditions' ticks and rings the rivals", () => {
    geometry = bakedGeometry;
    timelineT = 30_000;
    const parked = (driver_number: number, x: number): Location => ({
      date: new Date(START + 30_000).toISOString(),
      driver_number,
      meeting_key: 1,
      session_key: 1,
      x,
      y: 0,
      z: 0,
    });
    renderMap({
      locationData: [...locationData, parked(16, 40), parked(44, 95), parked(63, 5)],
    });

    // From the ghost (x = 28 at t = 9 s) forward to the car (x = 70), on the outline.
    expect(screen.getByTestId("pit-window-behind").getAttribute("d")).toBe(
      "M52.0,24.0L94.0,24.0",
    );
    // No reference lap yet: no band ahead.
    expect(screen.queryByTestId("pit-window-ahead")).toBeNull();
    // SC (13 s) and VSC (15 s) ticks; green is the current condition.
    expect(screen.getByTestId("pit-window-marker-sc").textContent).toBe("SC");
    expect(screen.getByTestId("pit-window-marker-vsc").textContent).toBe("VSC");
    expect(screen.queryByTestId("pit-window-marker-normal")).toBeNull();
    // LEC (15 s) would pass a 23 s car; HAM (0 s) would drop behind if he
    // pitted instead. RUS (30 s) is outside the window.
    expect(screen.getAllByTestId("pit-window-ring")).toHaveLength(2);
  });

  it("hides the ghost when the look-back is before the loaded location data", () => {
    geometry = bakedGeometry;
    timelineT = 10_000;
    renderMap();
    expect(screen.getByTestId("pit-rejoin-panel")).toBeTruthy();
    expect(screen.queryByTestId("pit-rejoin-ghost")).toBeNull();
  });

  it("renders nothing when disabled, unfocused, or the circuit has no pit loss", () => {
    timelineT = 30_000;
    geometry = bakedGeometry;
    const { unmount } = renderMap({ pitRejoinGaps: null });
    expect(screen.queryByTestId("pit-rejoin-panel")).toBeNull();
    unmount();

    const second = renderMap({ focusDriver: null });
    expect(screen.queryByTestId("pit-rejoin-panel")).toBeNull();
    second.unmount();

    geometry = { ...bakedGeometry, pitLoss: undefined };
    renderMap();
    expect(screen.queryByTestId("pit-rejoin-panel")).toBeNull();
    expect(screen.queryByTestId("pit-rejoin-ghost")).toBeNull();
  });
});
