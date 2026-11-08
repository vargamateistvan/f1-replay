import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloneElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Driver, Lap, Location, Stint, Weather } from "@/api/types";
import {
  RING_CARDINAL_LABEL_RADIUS,
  RING_RADIUS,
  RING_SVG_H,
  RING_SVG_W,
  TRACK_PIT_CAR_SCALE,
} from "@/constants";
import { useCircuitGeometry } from "@/hooks/useCircuitGeometry";
import { TrackRing } from "./TrackRing";
import { RingCars, RingPitLane } from "./RingLayers";
import { buildRingModel, type RingCarLayout } from "./ringModel";
import { buildTrackGeometry } from "../TrackMap/trackGeometry";
import { TOKEN_HEX } from "@/designTokens";

const clock = vi.hoisted(() => ({ t: 500 }));
const ring = vi.hoisted(() => ({
  timeScale: false,
  gapMode: "interval" as "interval" | "leader" | "focus",
  reverse: false,
  showPitWindowOutcomes: false,
  weatherEffects: false,
  setSetting: vi.fn(),
}));

vi.mock("@/hooks/useCoarseTime", () => ({ useCoarseTime: () => clock.t }));
vi.mock("@/hooks/useStartLightsSound", () => ({ useStartLightsSound: vi.fn() }));
vi.mock("@/hooks/useCarDataWindow", () => ({
  useCarDataWindow: vi.fn(() => ({ data: [] })),
}));
vi.mock("@/hooks/useLocationChunks", () => ({ chunkIndexFor: vi.fn(() => 0) }));
vi.mock("@/hooks/useCircuitGeometry", () => ({
  useCircuitGeometry: vi.fn(() => ({ data: null, isPending: false })),
}));

// 200 × 200 square outline, identity projection (+ the SVG pad).
function squareOutline() {
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < 20; i++) points.push({ x: i * 10, y: 0 });
  for (let i = 0; i < 20; i++) points.push({ x: 200, y: i * 10 });
  for (let i = 0; i < 20; i++) points.push({ x: 200 - i * 10, y: 200 });
  for (let i = 0; i < 20; i++) points.push({ x: 0, y: 200 - i * 10 });
  return {
    points,
    bounds: { minX: 0, maxX: 200, minY: 0, maxY: 200, width: 200, height: 200 },
    source: "gps" as const,
  };
}

vi.mock("@/hooks/useTrackMap", () => ({
  useTrackOutline: vi.fn(() => ({ data: squareOutline(), isPending: false })),
  locationToSvg: vi.fn((x: number, y: number) => ({ sx: x, sy: y })),
  isOffTrackPlaceholder: (pos: { x: number; y: number }) => pos.x === 0 && pos.y === 0,
}));

vi.mock("@/stores/settings", () => ({
  useSettings: vi.fn((selector) =>
    selector({
      lightMode: false,
      metricSystem: "metric",
      mapShowDriverAcronym: true,
      mapShowDriverNumberInside: false,
      mapShowCornerNumbers: false,
      mapShowRaceLeader: false,
      mapStartLightsSound: false,
      mapShowClock: false,
      mapRingTimeScale: ring.timeScale,
      mapRingGapMode: ring.gapMode,
      mapRingReverse: ring.reverse,
      mapRingShowPitWindowOutcomes: ring.showPitWindowOutcomes,
      mapWeatherEffectsEnabled: ring.weatherEffects,
      setSetting: ring.setSetting,
    }),
  ),
}));

const START = Date.UTC(2024, 0, 1, 12);

function loc(driver_number: number, x: number, y: number, ms: number): Location {
  return {
    date: new Date(START + ms).toISOString(),
    driver_number,
    x,
    y,
    z: 0,
    meeting_key: 1,
    session_key: 1,
  } as Location;
}

function lap(driver_number: number, lap_number: number, lap_duration: number): Lap {
  return {
    date_start: new Date(START + (lap_number - 1) * LAP_MS).toISOString(),
    driver_number,
    duration_sector_1: null,
    duration_sector_2: null,
    duration_sector_3: null,
    i1_speed: null,
    i2_speed: null,
    is_pit_out_lap: false,
    lap_duration,
    lap_number,
    meeting_key: 1,
    segments_sector_1: null,
    segments_sector_2: null,
    segments_sector_3: null,
    session_key: 1,
    st_speed: null,
  };
}

function stint(driver_number: number, compound: Stint["compound"]): Stint {
  return {
    compound,
    driver_number,
    lap_end: 4,
    lap_start: 2,
    meeting_key: 1,
    session_key: 1,
    stint_number: 1,
    tyre_age_at_start: 0,
  };
}

const drivers = [
  { driver_number: 1, name_acronym: "VER", team_colour: "3671C6" },
  { driver_number: 16, name_acronym: "LEC", team_colour: "E8002D" },
] as Driver[];

function renderRing(props: Partial<Parameters<typeof TrackRing>[0]> = {}) {
  return render(
    <TrackRing
      sessionKey={1}
      drivers={drivers}
      // VER an eighth of a lap in, LEC halfway round.
      locationData={[
        loc(1, 100, 0, 0),
        loc(1, 100, 0, 1000),
        loc(16, 200, 200, 0),
        loc(16, 200, 200, 1000),
      ]}
      sessionStartMs={START}
      {...props}
    />
  );
}

describe("ring rain effects", () => {
  it("uses real weather with readings hidden and shares the quick setting", () => {
    ring.weatherEffects = true;
    renderRing({
      weather: {
        date: new Date(START).toISOString(), rainfall: 1, humidity: 80,
        air_temperature: 20, track_temperature: 22, pressure: 1000,
        wind_direction: 0, wind_speed: 0, session_key: 1, meeting_key: 1,
      },
      weatherOverlay: null,
    });
    expect(screen.getByTestId("map-rain-effects")).toBeInTheDocument();
    expect(screen.queryByTestId("ring-center-weather")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Weather effects" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Flip the direction of travel" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Quick track settings" }));
    fireEvent.click(screen.getByRole("switch", { name: "Weather effects" }));
    expect(ring.setSetting).toHaveBeenCalledWith("mapWeatherEffectsEnabled", false);
  });
});

beforeEach(() => {
  clock.t = 500;
  window.localStorage.removeItem("f1-replay:ring-zoom:v1:1:none");
  ring.timeScale = false;
  ring.gapMode = "interval";
  ring.reverse = false;
  ring.showPitWindowOutcomes = false;
  ring.weatherEffects = false;
  ring.setSetting.mockReset();
  vi.mocked(useCircuitGeometry).mockReturnValue({ data: null, isPending: false } as never);
});

const LAP_MS = 60_000;

describe("RingCars", () => {
  it("scales pit-driver name tags without shrinking on-track or special-vehicle tags", () => {
    const car = (num: number, inPit: boolean, x: number): RingCarLayout => ({
      num, inPit, x, y: 10, fraction: 0, labelX: x, labelY: 20, anchor: "middle",
      leader: { x1: x, y1: 10, x2: x, y2: 20 },
    });
    const { container } = render(
      <svg>
        <RingCars
          cars={[car(1, true, 10), car(16, false, 20), car(241, true, 30)]}
          driverByNumber={new Map(drivers.map((d) => [d.driver_number, d]))}
          focusDriver={null}
          safetyCarSirenOn={false}
          lightMode={false}
          showAcronym
          showNumberInside={false}
        />
      </svg>,
    );
    const labels = container.querySelectorAll("[data-pit-scaled]");
    expect(labels).toHaveLength(1);
    expect(labels[0]).toHaveAttribute(
      "transform",
      `translate(10 20) scale(${TRACK_PIT_CAR_SCALE}) translate(-10 -20)`,
    );
    expect(container.querySelectorAll("rect")).toHaveLength(3);
    expect(container.querySelectorAll("[data-pit-scaled='true'] text")).toHaveLength(1);
    const [pitLeader, trackLeader, specialLeader] = container.querySelectorAll("line");
    expect(pitLeader).toHaveAttribute("y2", "20");
    expect(trackLeader).toHaveAttribute("y2", "20");
    expect(specialLeader).toHaveAttribute("y2", "20");
  });

  it("scales pit dots and numbers, restores them on rejoin, and leaves special vehicles unchanged", () => {
    const car = (num: number, inPit: boolean, x: number): RingCarLayout => ({
      num, inPit, x, y: 10, fraction: 0, labelX: x, labelY: 20, anchor: "middle",
      leader: { x1: x, y1: 10, x2: x, y2: 20 },
    });
    const props = {
      driverByNumber: new Map(drivers.map((d) => [d.driver_number, d])),
      focusDriver: 1,
      safetyCarSirenOn: false,
      lightMode: false,
      showAcronym: false,
      showNumberInside: true,
    };
    const cars = [car(1, true, 10), car(16, true, 20), car(241, true, 30)];
    const { container, rerender } = render(<svg><RingCars {...props} cars={cars} /></svg>);
    const marker = (x: number) => container.querySelector(`g[transform="translate(${x.toFixed(1)},10.0)"]`)!;
    expect(Number(marker(10).querySelectorAll("circle")[1]!.getAttribute("r"))).toBeCloseTo(8 * TRACK_PIT_CAR_SCALE);
    expect(Number(marker(10).querySelector("text")!.getAttribute("font-size"))).toBeCloseTo(6.2 * TRACK_PIT_CAR_SCALE);
    expect(Number(marker(20).querySelector("circle")!.getAttribute("r"))).toBeCloseTo(6.6 * TRACK_PIT_CAR_SCALE);
    expect(marker(30).querySelector("circle")!.getAttribute("r")).toBe("6.6");
    rerender(<svg><RingCars {...props} cars={[car(1, false, 10)]} /></svg>);
    expect(marker(10).querySelectorAll("circle")[1]!.getAttribute("r")).toBe("8");
    expect(marker(10).querySelector("text")!.getAttribute("font-size")).toBe("6.2");
  });
});

describe("RingPitLane", () => {
  it("colours a closed lane and marks the separately reported exit", () => {
    const geom = buildTrackGeometry(squareOutline());
    const model = buildRingModel({
      geom, circuitGeom: null, pitLane: { x: [10, 30, 60], y: [0, -30, 0] },
      totalMarshalPosts: 0, toScale: true,
    });
    const { container, rerender } = render(
      <svg><RingPitLane cx={230} cy={200} r={92} ringR={128} model={model}
        scale={{ profile: null, reverse: false }} lightMode={false}
        pitLaneStatus={{ lane: "closed", entry: "unknown", exit: "open" }} /></svg>,
    );
    expect(container.querySelector("path")).toHaveAttribute("stroke", TOKEN_HEX.red);
    expect(screen.getByTestId("pit-exit-status")).toHaveAttribute("fill", TOKEN_HEX.green);
    expect(screen.getByTestId("pit-exit-glow")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Pit exit open, last reported" })).toBeInTheDocument();
    rerender(<svg><RingPitLane cx={230} cy={200} r={92} ringR={128} model={model}
      scale={{ profile: null, reverse: false }} lightMode={false} /></svg>);
    expect(container.querySelector("path")).not.toHaveAttribute("stroke", TOKEN_HEX.red);
    expect(screen.queryByTestId("pit-exit-status")).toBeNull();
    expect(screen.queryByTestId("pit-exit-glow")).toBeNull();
  });
});

// VER laps the 800-unit square in 60 s; the first half of the distance takes
// 70 % of the time. LEC is parked a quarter of the way round (35 % in time).
function timedLocations(): Location[] {
  const locs: Location[] = [];
  for (let ms = 0; ms <= 3 * LAP_MS; ms += 250) {
    const tf = (ms % LAP_MS) / LAP_MS;
    const f = tf < 0.7 ? (tf / 0.7) * 0.5 : 0.5 + ((tf - 0.7) / 0.3) * 0.5;
    const d = f * 800;
    const [x, y] =
      d < 200 ? [d, 0] : d < 400 ? [200, d - 200] : d < 600 ? [600 - d, 200] : [0, 800 - d];
    // OpenF1's off-track placeholder is (0, 0): nudge the start line.
    locs.push(loc(1, x || 0.01, y, ms));
  }
  locs.push(loc(16, 200, 0, 0), loc(16, 200, 0, 3 * LAP_MS));
  return locs;
}

function carAt(container: HTMLElement, fraction: number) {
  const a = fraction * 2 * Math.PI - Math.PI / 2;
  const x = RING_SVG_W / 2 + RING_RADIUS * Math.cos(a);
  const y = RING_SVG_H / 2 + RING_RADIUS * Math.sin(a);
  return container.querySelector(`g[transform="translate(${x.toFixed(1)},${y.toFixed(1)})"]`);
}

describe("TrackRing", () => {
  it("does not display a pit status notification when the baked pit path is unavailable", () => {
    renderRing({ pitLaneStatus: { lane: "unknown", entry: "unknown", exit: "closed" } });
    expect(screen.queryByText(/pit exit closed · last reported/i)).not.toBeInTheDocument();
  });

  it("renders the concentric background behind the ring", () => {
    renderRing();
    expect(screen.getByTestId("map-background").querySelectorAll("circle")).toHaveLength(2);
  });

  it("shows cardinal directions around the ring in map orientation", () => {
    renderRing();
    const directions = screen.getByTestId("ring-cardinal-directions");
    const centerX = RING_SVG_W / 2;
    const centerY = RING_SVG_H / 2;
    const expected: [string, number, number][] = [
      ["N", centerX, centerY - RING_CARDINAL_LABEL_RADIUS],
      ["E", centerX + RING_CARDINAL_LABEL_RADIUS, centerY],
      ["S", centerX, centerY + RING_CARDINAL_LABEL_RADIUS],
      ["W", centerX - RING_CARDINAL_LABEL_RADIUS, centerY],
    ];

    for (const [direction, x, y] of expected) {
      const label = directions.querySelector(`[data-direction="${direction}"]`);
      expect(label).toHaveTextContent(direction);
      expect(Number(label?.getAttribute("x"))).toBeCloseTo(x);
      expect(Number(label?.getAttribute("y"))).toBeCloseTo(y);
    }
    expect(directions.querySelector('[data-direction="N"]')).toHaveAttribute("fill", TOKEN_HEX.f1red);
    const name = screen.getByText("VER");
    expect(directions.compareDocumentPosition(name) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByTitle("Compass")).not.toBeInTheDocument();
  });

  it("uses the circuit geometry rotation for the cardinal positions", () => {
    vi.mocked(useCircuitGeometry).mockReturnValue({
      data: { rotation: 90 },
      isPending: false,
    } as never);
    renderRing({ circuitKey: 2, year: 2026 });
    const directions = screen.getByTestId("ring-cardinal-directions");
    expect(screen.getByTestId("map-background").querySelector('[data-layer="ring-background-ticks"]'))
      .toHaveAttribute("transform", `rotate(90 ${RING_SVG_W / 2} ${RING_SVG_H / 2})`);
    const centerX = RING_SVG_W / 2;
    const centerY = RING_SVG_H / 2;
    const expected = [
      ["N", centerX + RING_CARDINAL_LABEL_RADIUS, centerY],
      ["E", centerX, centerY + RING_CARDINAL_LABEL_RADIUS],
      ["S", centerX - RING_CARDINAL_LABEL_RADIUS, centerY],
      ["W", centerX, centerY - RING_CARDINAL_LABEL_RADIUS],
    ] as const;

    for (const [direction, x, y] of expected) {
      const label = directions.querySelector(`[data-direction="${direction}"]`);
      expect(Number(label?.getAttribute("x"))).toBeCloseTo(x);
      expect(Number(label?.getAttribute("y"))).toBeCloseTo(y);
    }
  });

  it("zooms the ring with the mouse wheel and clamps the zoom range", () => {
    const { container } = renderRing();
    const svg = container.querySelector("svg")!;
    const zoomLayer = screen.getByTestId("ring-zoom-layer");

    expect(zoomLayer).toHaveAttribute(
      "transform",
      `translate(${RING_SVG_W / 2} ${RING_SVG_H / 2}) scale(1) translate(${-RING_SVG_W / 2} ${-RING_SVG_H / 2})`,
    );
    expect(fireEvent.wheel(svg, { deltaY: -100, cancelable: true })).toBe(false);
    expect(zoomLayer).toHaveAttribute(
      "transform",
      `translate(${RING_SVG_W / 2} ${RING_SVG_H / 2}) scale(1.2) translate(${-RING_SVG_W / 2} ${-RING_SVG_H / 2})`,
    );

    fireEvent.wheel(svg, { deltaY: 1, deltaMode: 1, cancelable: true });
    expect(zoomLayer.getAttribute("transform")).toContain("scale(1.168)");

    for (let i = 0; i < 10; i++) fireEvent.wheel(svg, { deltaY: -1000, cancelable: true });
    expect(zoomLayer.getAttribute("transform")).toContain("scale(3)");
    for (let i = 0; i < 10; i++) fireEvent.wheel(svg, { deltaY: 1000, cancelable: true });
    expect(zoomLayer.getAttribute("transform")).toContain("scale(0.6)");
    expect(fireEvent.wheel(svg, { deltaY: 0, cancelable: true })).toBe(true);
  });

  it("saves and restores the zoom for the same session and circuit", () => {
    const firstRender = renderRing();
    const svg = firstRender.container.querySelector("svg")!;
    fireEvent.wheel(svg, { deltaY: -100, cancelable: true });

    const savedZoom = window.localStorage.getItem("f1-replay:ring-zoom:v1:1:none");
    expect(Number(savedZoom)).toBeCloseTo(1.2);
    firstRender.unmount();

    const secondRender = renderRing();
    expect(screen.getByTestId("ring-zoom-layer").getAttribute("transform")).toContain(
      `scale(${savedZoom})`,
    );
    secondRender.unmount();

    const differentSession = renderRing({ sessionKey: 2 });
    expect(screen.getByTestId("ring-zoom-layer").getAttribute("transform")).toContain("scale(1)");
    differentSession.unmount();
  });

  it("places each car at its lap fraction round the ring", () => {
    const { container } = renderRing();
    const cx = RING_SVG_W / 2;
    const cy = RING_SVG_H / 2;
    const d = RING_RADIUS * Math.SQRT1_2;
    // 1/8 lap → 45° clockwise from 12 o'clock.
    expect(
      container.querySelector(`g[transform="translate(${(cx + d).toFixed(1)},${(cy - d).toFixed(1)})"]`),
    ).not.toBeNull();
    // 1/2 lap → 6 o'clock.
    expect(
      container.querySelector(`g[transform="translate(${cx.toFixed(1)},${(cy + RING_RADIUS).toFixed(1)})"]`),
    ).not.toBeNull();
    expect(screen.getByText("VER")).toBeInTheDocument();
    expect(screen.getByText("LEC")).toBeInTheDocument();
  });

  it("selects a driver on click and hides retired cars", () => {
    const onSelectDriver = vi.fn();
    renderRing({ onSelectDriver, retiredDrivers: new Set([16]) });
    fireEvent.click(screen.getByText("VER"));
    expect(onSelectDriver).toHaveBeenCalledWith(1);
    expect(screen.queryByText("LEC")).not.toBeInTheDocument();
  });

  it("offers the 2D and 3D maps from the toolbar", () => {
    const onEnter2d = vi.fn();
    const onEnter3d = vi.fn();
    renderRing({ onEnter2d, onEnter3d });
    fireEvent.click(screen.getByRole("button", { name: "Switch to 2D map" }));
    fireEvent.click(screen.getByRole("button", { name: "Switch to 3D map" }));
    expect(onEnter2d).toHaveBeenCalled();
    expect(onEnter3d).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /ring view/i })).not.toBeInTheDocument();
  });

  it("tints a flagged sector on the ring", () => {
    const { container } = renderRing({
      trackFlagState: {
        globalFlag: null,
        marshalFlags: { 1: "YELLOW" },
        maxMarshalSector: 3,
        updatedAtMs: START,
      },
    });
    expect(container.querySelector('path[stroke="#f5d400"]')).not.toBeNull();
  });

  it("labels gaps, shows the lap in the centre and toggles the gap mode", () => {
    renderRing({
      lapLabel: "21/52",
      intervalRows: new Map([
        [1, { interval: null, gap_to_leader: null }],
        [16, { interval: 1.234, gap_to_leader: 1.234 }],
      ]),
    });
    expect(screen.getByText("21/52")).toBeInTheDocument();
    expect(screen.getByText("LEAD")).toBeInTheDocument();
    expect(screen.getByText("+1.2")).toBeInTheDocument();
    expect(screen.queryByText("gap to the car ahead")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show gap to the leader" }));
    expect(ring.setSetting).toHaveBeenCalledWith("mapRingGapMode", "leader");
  });

  it("shows focused-driver race position, gap and tyre details in the centre", () => {
    renderRing({
      focusDriver: 16,
      positionByDriver: new Map([
        [16, 2],
        [1, 3],
      ]),
      intervalRows: new Map([
        [16, { interval: 1.234, gap_to_leader: 1.234 }],
        [1, { interval: 0.84, gap_to_leader: 2.074 }],
      ]),
      focusCompound: { compound: "MEDIUM", age: 12 },
    });
    const driverInfo = screen.getByTestId("ring-focused-driver-info");
    expect(driverInfo).toHaveTextContent("P2");
    expect(driverInfo).toHaveTextContent("LEC");
    expect(driverInfo).toHaveTextContent("#16");
    expect(driverInfo).toHaveTextContent("AHEAD+1.2s");
    expect(driverInfo).toHaveTextContent("BEHIND+0.8s");
    expect(driverInfo).toHaveTextContent("MEDIUM · 12L");
    expect(driverInfo.querySelectorAll("rect")).toHaveLength(2);
  });

  it("shows compact weather details in the centre only when no driver is focused", () => {
    const weather = {
      air_temperature: 24.2,
      date: new Date(START).toISOString(),
      humidity: 48,
      meeting_key: 1,
      pressure: 1012,
      rainfall: 0,
      session_key: 1,
      track_temperature: 38.6,
      wind_direction: 270,
      wind_speed: 3.7,
    } satisfies Weather;
    const { rerender } = renderRing({ weatherOverlay: weather, lapLabel: "21/52" });
    expect(
      screen.getByTestId("ring-center-dashboard").querySelector('rect[width="176"][height="156"]'),
    ).not.toBeInTheDocument();
    const tyreGuidance = screen.getByTestId("ring-center-tyre-guidance");
    expect(tyreGuidance).toHaveTextContent("SUGGESTED");
    expect(tyreGuidance).toHaveTextContent("FASTEST");
    expect(screen.getByLabelText("Suggested tyre: SOFT")).toBeInTheDocument();
    expect(screen.getByLabelText("Fastest clean-lap tyre unavailable")).toBeInTheDocument();
    const centerWeather = screen.getByTestId("ring-center-weather");
    const centerDashboard = screen.getByTestId("ring-center-dashboard");
    const lapLabel = screen.getByTestId("ring-lap-label");
    expect(lapLabel).toHaveAttribute("y", String(RING_SVG_H / 2 - 44));
    const statusLabel = Array.from(centerDashboard.querySelectorAll("text")).find(
      (text) => text.textContent === "Green",
    );
    expect(statusLabel).toHaveAttribute("y", String(RING_SVG_H / 2 - 22));
    expect(centerWeather).toHaveTextContent("TRACK39°C");
    expect(centerWeather).toHaveTextContent("AIR24°C");
    expect(centerWeather).toHaveTextContent("48%");
    expect(centerWeather).toHaveTextContent("4 m/s W");
    const bottomRow = screen.getByTestId("ring-weather-bottom-row");
    expect(bottomRow).toHaveAttribute(
      "transform",
      `translate(${RING_SVG_W / 2} ${RING_SVG_H / 2 + 46})`,
    );
    expect(screen.getByText("DRY").parentElement).toBe(bottomRow);
    expect(centerWeather.querySelectorAll("rect")).toHaveLength(3);
    expect(centerWeather.querySelector(".lucide-wind")).not.toBeNull();
    expect(centerWeather.querySelector(".lucide-cloud-sun")).not.toBeNull();
    expect(screen.queryByText("Track Weather")).not.toBeInTheDocument();

    rerender(
      <TrackRing
        sessionKey={1}
        drivers={drivers}
        locationData={[
          loc(1, 100, 0, 0),
          loc(1, 100, 0, 1000),
          loc(16, 200, 200, 0),
          loc(16, 200, 200, 1000),
        ]}
        sessionStartMs={START}
        focusDriver={16}
        weatherOverlay={weather}
        lapLabel="21/52"
      />,
    );
    expect(screen.queryByTestId("ring-center-weather")).not.toBeInTheDocument();
    expect(screen.getByTestId("ring-center-tyre-guidance")).toBeInTheDocument();
    const driverInfo = screen.getByTestId("ring-focused-driver-info");
    const focusedLap = screen.getByTestId("ring-lap-label");
    expect(focusedLap).toHaveAttribute("y", lapLabel.getAttribute("y"));
    expect(driverInfo).toHaveTextContent("P—");
    const focusedStatus = Array.from(screen.getByTestId("ring-center-dashboard").querySelectorAll("text")).find(
      (text) => text.textContent === "Green",
    );
    expect(focusedStatus).toHaveAttribute("y", statusLabel?.getAttribute("y"));
  });

  it("suggests intermediate tyres in rain and identifies the fastest clean lap compound", () => {
    clock.t = 500_000;
    renderRing({
      weatherOverlay: {
        air_temperature: 24,
        date: new Date(START).toISOString(),
        humidity: 70,
        meeting_key: 1,
        pressure: 1012,
        rainfall: 1,
        session_key: 1,
        track_temperature: 30,
        wind_direction: 270,
        wind_speed: 3,
      },
      laps: [
        lap(1, 2, 90),
        lap(1, 3, 89),
        lap(1, 4, 91),
        lap(16, 2, 92),
        lap(16, 3, 91),
        lap(16, 4, 93),
      ],
      stints: [stint(1, "SOFT"), stint(16, "MEDIUM")],
    });

    const guidance = screen.getByTestId("ring-center-tyre-guidance");
    expect(guidance).toHaveTextContent("SUGGESTED");
    expect(guidance).toHaveTextContent("FASTEST");
    expect(screen.getByLabelText("Suggested tyre: INTERMEDIATE")).toBeInTheDocument();
    expect(screen.getByLabelText("Fastest clean-lap tyre: SOFT")).toBeInTheDocument();
  });

  it("shows the compact legend on demand", () => {
    renderRing();
    expect(screen.queryByRole("note", { name: "Ring view legend" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show ring legend" }));
    expect(screen.getByRole("note", { name: "Ring view legend" })).toHaveTextContent("Gap labels");
    expect(screen.getByRole("note", { name: "Ring view legend" })).toHaveTextContent("Orange ticks");
    fireEvent.click(screen.getByRole("button", { name: "Hide ring legend" }));
    expect(screen.queryByRole("note", { name: "Ring view legend" })).not.toBeInTheDocument();
  });

  it("flips the direction of travel", () => {
    ring.reverse = true;
    const { container } = renderRing();
    // 1/8 lap anticlockwise.
    expect(carAt(container, 7 / 8)).not.toBeNull();
  });

  it("spaces the dial by lap time once a full lap is loaded", () => {
    const lapMs = LAP_MS;
    const locs = timedLocations();
    ring.timeScale = true;
    clock.t = 2.5 * lapMs;
    const { container } = render(
      <TrackRing sessionKey={1} drivers={drivers} locationData={locs} sessionStartMs={START} />,
    );
    // Distance 0.25 → 35 % of the lap time.
    expect(carAt(container, 0.35)).not.toBeNull();
    expect(screen.getByText("Reference lap 1:00.000")).toBeInTheDocument();
  });

  it("labels gaps relative to the focused car", () => {
    ring.gapMode = "focus";
    renderRing({
      focusDriver: 16,
      leaderNumber: 1,
      intervalRows: new Map([
        [1, { interval: null, gap_to_leader: null }],
        [16, { interval: 1.234, gap_to_leader: 1.234 }],
      ]),
    });
    expect(screen.getByText("−1.2")).toBeInTheDocument();
    expect(screen.queryByText("gap to LEC")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show gap to the car ahead" }));
    expect(ring.setSetting).toHaveBeenCalledWith("mapRingGapMode", "interval");
  });

  it("offers the gap to the focused car after the gap to the leader", () => {
    ring.gapMode = "leader";
    renderRing({
      focusDriver: 16,
      intervalRows: new Map([
        [1, { interval: null, gap_to_leader: null }],
        [16, { interval: 1.234, gap_to_leader: 1.234 }],
      ]),
    });
    fireEvent.click(screen.getByRole("button", { name: "Show gap to LEC" }));
    expect(ring.setSetting).toHaveBeenCalledWith("mapRingGapMode", "focus");
  });

  it("falls back to the gap to the car ahead without a focused car", () => {
    ring.gapMode = "focus";
    renderRing({
      intervalRows: new Map([
        [1, { interval: null, gap_to_leader: null }],
        [16, { interval: 1.234, gap_to_leader: 1.234 }],
      ]),
    });
    expect(screen.getByText("+1.2")).toBeInTheDocument();
    expect(screen.queryByText("gap to the car ahead")).not.toBeInTheDocument();
  });

  it("keeps the two nearest cars on either side of the focused driver bright", () => {
    const nearbyDrivers = [
      ...drivers,
      { driver_number: 44, name_acronym: "HAM", team_colour: "27F4D2" },
      { driver_number: 77, name_acronym: "BOT", team_colour: "52E252" },
      { driver_number: 11, name_acronym: "PER", team_colour: "3671C6" },
      { driver_number: 20, name_acronym: "RUS", team_colour: "52E252" },
      { driver_number: 30, name_acronym: "ALO", team_colour: "229971" },
    ] as Driver[];
    const locations = [
      loc(1, 100, 0, 0),
      loc(1, 100, 0, 1000),
      loc(16, 200, 200, 0),
      loc(16, 200, 200, 1000),
      loc(44, 150, 0, 0),
      loc(44, 150, 0, 1000),
      loc(77, 50, 0, 0),
      loc(77, 50, 0, 1000),
      loc(11, 25, 0, 0),
      loc(11, 25, 0, 1000),
      loc(20, 175, 0, 0),
      loc(20, 175, 0, 1000),
      loc(30, 200, 100, 0),
      loc(30, 200, 100, 1000),
    ];
    render(
      <TrackRing
        sessionKey={1}
        drivers={nearbyDrivers}
        locationData={locations}
        sessionStartMs={START}
        focusDriver={1}
      />,
    );
    expect(screen.getByText("HAM").closest("g[opacity]")).toHaveAttribute("opacity", "1");
    expect(screen.getByText("BOT").closest("g[opacity]")).toHaveAttribute("opacity", "1");
    expect(screen.getByText("LEC").closest("g[opacity]")).toHaveAttribute("opacity", "0.3");
  });

  it("measures the on-track time between the focused and the hovered car", () => {
    ring.timeScale = true;
    clock.t = 2.5 * LAP_MS;
    render(
      <TrackRing
        sessionKey={1}
        drivers={drivers}
        locationData={timedLocations()}
        sessionStartMs={START}
        focusDriver={1}
      />,
    );
    expect(screen.queryByTestId("ring-gap-measure")).not.toBeInTheDocument();
    fireEvent.pointerEnter(screen.getByText("LEC"));
    // VER halfway through the lap in time, LEC at 35 %: 15 % of 60 s.
    expect(screen.getByTestId("ring-gap-measure")).toHaveTextContent("9.0 s");
    fireEvent.pointerLeave(screen.getByText("LEC"));
    expect(screen.queryByTestId("ring-gap-measure")).not.toBeInTheDocument();
  });

  it("shows the focused car's pit window with SC/VSC markers and highlights the cars in it", () => {
    vi.mocked(useCircuitGeometry).mockReturnValue({
      data: { pitLoss: { normal: "20", sc: "10", vsc: "14" } },
      isPending: false,
    } as never);
    ring.timeScale = true;
    clock.t = 2.5 * LAP_MS;
    const drivers3 = [...drivers, { driver_number: 44, name_acronym: "HAM", team_colour: "27F4D2" }] as Driver[];
    const locs = [...timedLocations(), loc(44, 0.01, 200, 0), loc(44, 0.01, 200, 3 * LAP_MS)];
    const props = (
      <TrackRing
        sessionKey={1}
        drivers={drivers3}
        locationData={locs}
        sessionStartMs={START}
        focusDriver={1}
        leaderNumber={1}
        pitRejoinGaps={
          new Map([
            [1, 0],
            [16, 12],
            [44, 45],
          ])
        }
      />
    );
    const { rerender } = render(props);
    const window = screen.getByTestId("ring-pit-window");
    expect(window).toHaveTextContent("PIT → P2");
    expect(window).toHaveTextContent("SC");
    expect(window).toHaveTextContent("VSC");
    const pitPanel = screen.getByTestId("pit-rejoin-panel");
    expect(pitPanel).toHaveTextContent(/Pit now/i);
    expect(pitPanel).toHaveTextContent("P2");
    expect(pitPanel).toHaveTextContent(/Green20.0s/i);
    expect(screen.getByTitle("SC pit time loss")).toHaveTextContent("10.0s");
    expect(screen.getByTitle("VSC pit time loss")).toHaveTextContent("14.0s");
    expect(pitPanel).toHaveTextContent("Green");
    expect(screen.queryByRole("status", { name: "Pit window outcomes" })).not.toBeInTheDocument();
    ring.showPitWindowOutcomes = true;
    rerender(cloneElement(props));
    expect(screen.getByRole("status", { name: "Pit window outcomes" })).toHaveTextContent("Would pass: LEC");
    expect(screen.getByRole("status", { name: "Pit window outcomes" })).toHaveTextContent(
      "Would drop behind if they pit: None",
    );
    // LEC (12 s behind) would pass VER if it pitted now. HAM is outside that
    // pit window but still stays bright because this tiny field makes it nearby.
    expect(screen.getByText("LEC", { selector: "text" }).closest("g[opacity]")).toHaveAttribute("opacity", "1");
    expect(screen.getByText("HAM", { selector: "text" }).closest("g[opacity]")).toHaveAttribute("opacity", "1");
  });

  it("keeps projecting the rejoin while the focused car is in the pits", () => {
    vi.mocked(useCircuitGeometry).mockReturnValue({
      data: { pitLoss: { normal: "20", sc: "10", vsc: "14" } },
      isPending: false,
    } as never);
    ring.timeScale = true;
    ring.showPitWindowOutcomes = true;
    const drivers3 = [...drivers, { driver_number: 44, name_acronym: "HAM", team_colour: "27F4D2" }] as Driver[];
    // VER pits halfway through its third lap (time fraction 0.5) and sits
    // 30 m off the track (no baked pit lane) until the end.
    const pitAt = 2.5 * LAP_MS;
    const locs = timedLocations().filter((l) => l.driver_number !== 1 || Date.parse(l.date) - START <= pitAt);
    for (let ms = pitAt + 250; ms <= 3 * LAP_MS; ms += 250) locs.push(loc(1, -300, 100, ms));
    locs.push(loc(44, 0.01, 200, 0), loc(44, 0.01, 200, 3 * LAP_MS));
    const props = (
      <TrackRing
        sessionKey={1}
        drivers={drivers3}
        locationData={locs}
        sessionStartMs={START}
        focusDriver={1}
        leaderNumber={1}
        pitRejoinGaps={
          new Map([
            [1, 0],
            [16, 12],
            [44, 45],
          ])
        }
      />
    );
    // 10 s into the stop: had VER stayed out it would be at 0.5 + 10/60; the
    // 20 s loss puts the rejoin point at 1/3, 1 s behind LEC (0.35) → 13 s.
    clock.t = pitAt + 10_000;
    const { rerender } = render(props);
    const window = screen.getByTestId("ring-pit-window");
    expect(window).toHaveTextContent("REJOIN P2");
    expect(window).not.toHaveTextContent("VSC");
    const panel = screen.getByRole("status", { name: "Pit rejoin" });
    expect(panel).toHaveTextContent("VER in the pits → P2");
    expect(panel).toHaveTextContent(/Rejoins behind: LEC by 1\.\ds/);
    expect(panel).toHaveTextContent(/Ahead of: HAM by 3\d\.\ds/);
    expect(screen.getByTestId("pit-rejoin-panel")).toHaveTextContent(/Rejoin/i);
    expect(screen.getByTestId("pit-rejoin-panel")).toHaveTextContent("P2");
    expect(screen.queryByRole("status", { name: "Pit window outcomes" })).not.toBeInTheDocument();

    // The rejoin point moves on at field speed: 5 s later it is 4 s past the
    // parked LEC, so VER would now come out in front.
    clock.t = pitAt + 15_000;
    rerender(cloneElement(props));
    expect(screen.getByTestId("ring-pit-window")).toHaveTextContent("REJOIN P1");
    expect(screen.getByRole("status", { name: "Pit rejoin" })).toHaveTextContent(/Ahead of: LEC by 4\.\ds/);
  });

  it("needs the time dial to project a rejoin from the pits", () => {
    vi.mocked(useCircuitGeometry).mockReturnValue({
      data: { pitLoss: { normal: "20" } },
      isPending: false,
    } as never);
    const pitAt = 2.5 * LAP_MS;
    const locs = timedLocations().filter((l) => l.driver_number !== 1 || Date.parse(l.date) - START <= pitAt);
    for (let ms = pitAt + 250; ms <= 3 * LAP_MS; ms += 250) locs.push(loc(1, -300, 100, ms));
    clock.t = pitAt + 10_000;
    render(
      <TrackRing
        sessionKey={1}
        drivers={drivers}
        locationData={locs}
        sessionStartMs={START}
        focusDriver={1}
        leaderNumber={1}
        pitRejoinGaps={
          new Map([
            [1, 0],
            [16, 12],
          ])
        }
      />,
    );
    expect(screen.queryByTestId("ring-pit-window")).not.toBeInTheDocument();
  });
});
