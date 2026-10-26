import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloneElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Driver, Location, Weather } from "@/api/types";
import { RING_RADIUS, RING_SVG_H, RING_SVG_W } from "@/constants";
import { useCircuitGeometry } from "@/hooks/useCircuitGeometry";
import { TrackRing } from "./TrackRing";

const clock = vi.hoisted(() => ({ t: 500 }));
const ring = vi.hoisted(() => ({
  timeScale: false,
  gapMode: "interval" as "interval" | "leader" | "focus",
  reverse: false,
  showPitWindowOutcomes: false,
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

beforeEach(() => {
  clock.t = 500;
  ring.timeScale = false;
  ring.gapMode = "interval";
  ring.reverse = false;
  ring.showPitWindowOutcomes = false;
  ring.setSetting.mockReset();
  vi.mocked(useCircuitGeometry).mockReturnValue({ data: null, isPending: false } as never);
});

const LAP_MS = 60_000;

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
    expect(driverInfo).toHaveTextContent("AHEAD +1.2s · BEHIND +0.8s");
    expect(driverInfo).toHaveTextContent("MEDIUM · 12L");
    expect(driverInfo.querySelector("rect")).toBeNull();
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
    const centerWeather = screen.getByTestId("ring-center-weather");
    const centerGroup = centerWeather.parentElement;
    const lapLabel = centerGroup?.querySelector('text');
    expect(lapLabel).toHaveAttribute("y", String(RING_SVG_H / 2 - 24));
    const statusLabel = Array.from(centerGroup?.querySelectorAll("text") ?? []).find(
      (text) => text.textContent === "Green",
    );
    expect(statusLabel).toHaveAttribute("y", String(RING_SVG_H / 2 + 0.5));
    expect(centerWeather).toHaveTextContent("TRACK39°C");
    expect(centerWeather).toHaveTextContent("AIR24°C");
    expect(centerWeather).toHaveTextContent("48%");
    expect(centerWeather).toHaveTextContent("4 m/s W");
    expect(centerWeather.querySelector(".lucide-thermometer")).not.toBeNull();
    expect(centerWeather.querySelector(".lucide-droplets")).not.toBeNull();
    expect(centerWeather.querySelector(".lucide-wind")).not.toBeNull();
    expect(centerWeather.querySelector(".lucide-cloud-sun")).not.toBeNull();

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
    const driverInfo = screen.getByTestId("ring-focused-driver-info");
    const focusedLap = driverInfo.parentElement?.querySelector('text');
    expect(focusedLap).toHaveAttribute("y", lapLabel?.getAttribute("y"));
    expect(driverInfo).toHaveTextContent("P—");
    const focusedStatus = Array.from(driverInfo.parentElement?.querySelectorAll("text") ?? []).find(
      (text) => text.textContent === "Green",
    );
    expect(focusedStatus).toHaveAttribute("y", statusLabel?.getAttribute("y"));
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
