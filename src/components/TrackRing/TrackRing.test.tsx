import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Driver, Location } from "@/api/types";
import { RING_RADIUS, RING_SVG_H, RING_SVG_W } from "@/constants";
import { useCircuitGeometry } from "@/hooks/useCircuitGeometry";
import { TrackRing } from "./TrackRing";

const clock = vi.hoisted(() => ({ t: 500 }));
const ring = vi.hoisted(() => ({
  timeScale: false,
  gapMode: "interval" as "interval" | "leader" | "focus",
  reverse: false,
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
    />,
  );
}

beforeEach(() => {
  clock.t = 500;
  ring.timeScale = false;
  ring.gapMode = "interval";
  ring.reverse = false;
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
    expect(screen.getByText("gap to the car ahead")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show gap to the leader" }));
    expect(ring.setSetting).toHaveBeenCalledWith("mapRingGapMode", "leader");
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
    expect(screen.getByText("gap to LEC")).toBeInTheDocument();
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
    expect(screen.getByText("gap to the car ahead")).toBeInTheDocument();
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
    render(
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
      />,
    );
    const window = screen.getByTestId("ring-pit-window");
    expect(window).toHaveTextContent("PIT → P2");
    expect(window).toHaveTextContent("SC");
    expect(window).toHaveTextContent("VSC");
    // LEC (12 s behind) would pass VER if it pitted now; HAM (45 s) wouldn't.
    expect(screen.getByText("LEC").closest("g[opacity]")).toHaveAttribute("opacity", "1");
    expect(screen.getByText("HAM").closest("g[opacity]")).toHaveAttribute("opacity", "0.3");
  });
});
