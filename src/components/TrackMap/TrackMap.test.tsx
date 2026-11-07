import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import {
  TrackMap,
} from "./TrackMap";
import type { Location } from "@/api/types";
import { useTrackOutline } from "@/hooks/useTrackMap";
import { useCarDataForLap } from "@/hooks/useCarDataForLap";
import type { TrackFlagState } from "@/timeline/raceControl";
import {
  START_LIGHT_INTERVAL_MS,
  START_LIGHTS_SEQUENCE_MS,
  TRACK_PIT_CAR_SCALE,
  TRACK_SVG_PAD,
} from "@/constants";
import { getCircuitGeometry } from "@/data/circuitGeometry";
import { getPitLane } from "@/data/pitLanes";
import { TOKEN_HEX } from "@/designTokens";

let timelineT = 0;
const follow = vi.hoisted(() => ({ on: false, heatmap: true, numbers: false, setSetting: vi.fn() }));

vi.mock("@/timeline/clock", () => ({
  useTimeline: vi.fn(
    (
      selector?: (state: {
        t: number;
        playing: boolean;
        speed: number;
        toggle: () => void;
        setT: (value: number) => void;
        setSpeed: (value: number) => void;
        setPlaying: (value: boolean) => void;
      }) => unknown,
    ) => {
      const state = {
        t: timelineT,
        playing: false,
        speed: 1,
        toggle: vi.fn(),
        setT: vi.fn(),
        setSpeed: vi.fn(),
        setPlaying: vi.fn(),
      };
      return selector ? selector(state) : state;
    },
  ),
}));

vi.mock("@/hooks/useCarDataWindow", () => ({
  useCarDataWindow: vi.fn(() => ({ data: [] })),
}));

vi.mock("@/hooks/useCarDataForLap", () => ({
  useCarDataForLap: vi.fn(() => ({ data: [] })),
}));

vi.mock("@/hooks/useLocationChunks", () => ({
  chunkIndexFor: vi.fn(() => 0),
}));

vi.mock("@/hooks/useTrackMap", () => ({
  useTrackOutline: vi.fn(() => ({ data: null, isPending: false })),
  locationToSvg: vi.fn((x: number, y: number) => ({ sx: x, sy: y })),
  computeTrackAutoRotationDeg: vi.fn(() => 0),
  computeTrackBounds: vi.fn(() => ({ minX: 0, minY: 0, maxX: 1, maxY: 1 })),
  isOffTrackPlaceholder: (pos: { x: number; y: number }) =>
    pos.x === 0 && pos.y === 0,
}));

vi.mock("@/data/circuits", () => ({
  getCircuitLayout: vi.fn(() => null),
}));

vi.mock("@/data/circuitGeometry", () => ({
  getCircuitGeometry: vi.fn(() => null),
  // Geometry is served synchronously via getCircuitGeometry in tests.
  hasCircuitGeometry: () => false,
  loadCircuitGeometry: async () => null,
}));

vi.mock("@/data/pitLanes", () => ({
  getPitLane: vi.fn(() => null),
}));

vi.mock("@/stores/settings", () => ({
  useSettings: vi.fn((selector) =>
    selector({
      lightMode: false,
      metricSystem: "metric",
      mapShowDriverAcronym: true,
      mapShowDriverNumberInside: follow.numbers,
      mapShowRaceLeader: true,
      mapShowMarshalHeatmap: false,
      mapShowCornerNumbers: false,
      mapShowElevation: false,
      mapShowClock: false,
      mapFollowFocusedCar: follow.on,
      mapShowDriverHeatmap: follow.heatmap,
      setSetting: follow.setSetting,
    }),
  ),
}));

const mockDriver = {
  driver_number: 1,
  broadcast_name: "Test Driver",
  full_name: "Test Driver Full",
  name_acronym: "TST",
  team_name: "Test Team",
  team_colour: "#000000",
  first_name: "Test",
  last_name: "Driver",
  headshot_url: null,
  country_code: "GB",
  session_key: 1,
  meeting_key: 1,
};

const mockLocationData: Location[] = [
  {
    date: "2024-01-01T00:00:10.000Z",
    driver_number: 1,
    meeting_key: 1,
    session_key: 1,
    x: 100,
    y: 100,
    z: 0,
  },
  {
    date: "2024-01-01T00:00:11.000Z",
    driver_number: 1,
    meeting_key: 1,
    session_key: 1,
    x: 150,
    y: 100,
    z: 0,
  },
];

const mockOutline = {
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
  bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 },
  source: "layout" as const,
};

function mockTrackOutlineQueryResult(
  data: ReturnType<typeof useTrackOutline>["data"],
): ReturnType<typeof useTrackOutline> {
  return {
    data,
    isPending: false,
  } as ReturnType<typeof useTrackOutline>;
}

describe("TrackMap sector flag state rendering", () => {
  beforeEach(() => {
    timelineT = 0;
    follow.on = false;
    follow.heatmap = true;
    follow.numbers = false;
    follow.setSetting.mockReset();
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(null),
    );
    vi.mocked(getCircuitGeometry).mockReturnValue(null);
    vi.mocked(getPitLane).mockReturnValue(null);
  });

  it("renders the grid background behind the track", () => {
    vi.mocked(useTrackOutline).mockReturnValue(mockTrackOutlineQueryResult(mockOutline));
    render(<TrackMap sessionKey={1} drivers={[mockDriver]} locationData={mockLocationData} sessionStartMs={0} />);
    expect(screen.getByTestId("map-background").querySelector("pattern")).not.toBeNull();
  });

  it("zooms with the wheel, persists rapid input, respects limits and resets", () => {
    vi.mocked(useTrackOutline).mockReturnValue(mockTrackOutlineQueryResult(mockOutline));
    const key = "f1-replay:track-zoom:v2:987:22";
    window.localStorage.removeItem(key);
    const { container, unmount } = render(
      <TrackMap sessionKey={987} circuitKey={22} drivers={[mockDriver]} locationData={mockLocationData}
        sessionStartMs={0} showTrackControls />,
    );
    const svg = container.querySelector("svg")!;
    const zoom = () => Number(window.localStorage.getItem(key));
    expect(fireEvent.wheel(svg, { deltaY: -100, cancelable: true })).toBe(false);
    expect(zoom()).toBeCloseTo(1.35);
    act(() => {
      fireEvent.wheel(svg, { deltaY: -100, cancelable: true });
      fireEvent.wheel(svg, { deltaY: -100, cancelable: true });
    });
    expect(zoom()).toBeCloseTo(1.75);
    fireEvent.wheel(svg, { deltaY: 1, deltaMode: 1, cancelable: true });
    expect(zoom()).toBeCloseTo(1.718);
    fireEvent.wheel(svg, { deltaY: 100_000, cancelable: true });
    expect(zoom()).toBeCloseTo(1.318);
    for (let i = 0; i < 10; i++) fireEvent.wheel(svg, { deltaY: 1000, cancelable: true });
    expect(zoom()).toBeCloseTo(0.6);
    for (let i = 0; i < 10; i++) fireEvent.wheel(svg, { deltaY: -1000, cancelable: true });
    expect(zoom()).toBeCloseTo(3);
    fireEvent.click(screen.getByRole("button", { name: "Fit track (reset zoom and rotation)" }));
    expect(zoom()).toBeCloseTo(1.15);
    expect(fireEvent.wheel(svg, { deltaY: 0, cancelable: true })).toBe(true);
    unmount();
    window.localStorage.removeItem(key);
  });

  it("installs wheel zoom after the track outline finishes loading", () => {
    const key = "f1-replay:track-zoom:v2:988:none";
    window.localStorage.removeItem(key);
    vi.mocked(useTrackOutline).mockReturnValue({
      ...mockTrackOutlineQueryResult(undefined),
      data: undefined,
      isPending: true,
    } as ReturnType<typeof useTrackOutline>);
    const props = { sessionKey: 988, drivers: [mockDriver], locationData: mockLocationData, sessionStartMs: 0 };
    const { container, rerender, unmount } = render(<TrackMap {...props} />);
    expect(container.querySelector("svg")).toBeNull();
    vi.mocked(useTrackOutline).mockReturnValue(mockTrackOutlineQueryResult(mockOutline));
    rerender(<TrackMap {...props} />);
    fireEvent.wheel(container.querySelector("svg")!, { deltaY: -100, cancelable: true });
    expect(Number(window.localStorage.getItem(key))).toBeCloseTo(1.35);
    unmount();
    window.localStorage.removeItem(key);
  });

  it("shows a thin solid pit lane when baked circuit geometry is available", () => {
    vi.mocked(useTrackOutline).mockReturnValue(mockTrackOutlineQueryResult(mockOutline));
    vi.mocked(getCircuitGeometry).mockReturnValue({
      circuitKey: 22,
      circuitName: "Monaco",
      year: 2025,
      rotation: 0,
      x: [],
      y: [],
      corners: [],
      marshalSectors: [],
      marshalLights: [],
    });
    vi.mocked(getPitLane).mockReturnValue({ x: [25, 50], y: [25, 60] });
    const { rerender } = render(
      <TrackMap sessionKey={1} drivers={[mockDriver]} locationData={mockLocationData}
        sessionStartMs={0} circuitKey={22} year={2025} />,
    );
    const pitLane = screen.getByTestId("pit-lane");
    expect(pitLane).toHaveAttribute("d", "M49.0,49.0 L74.0,84.0");
    expect(pitLane).not.toHaveAttribute("stroke-dasharray");
    expect(pitLane).toHaveAttribute("stroke-width", "1.5");
    expect(pitLane).toHaveAttribute("stroke-linecap", "round");
    expect(pitLane).toHaveAttribute("stroke-opacity", "0.6");

    vi.mocked(getCircuitGeometry).mockReturnValue(null);
    rerender(
      <TrackMap sessionKey={1} drivers={[mockDriver]} locationData={mockLocationData}
        sessionStartMs={0} circuitKey={999} year={2025} />,
    );
    expect(screen.queryByTestId("pit-lane")).toBeNull();
  });

  it("distinguishes a closed exit from a closed lane, and updates the markers", () => {
    vi.mocked(useTrackOutline).mockReturnValue(mockTrackOutlineQueryResult(mockOutline));
    vi.mocked(getCircuitGeometry).mockReturnValue({
      circuitKey: 22, circuitName: "Monaco", year: 2025, rotation: 0,
      x: [], y: [], corners: [], marshalSectors: [], marshalLights: [],
    });
    vi.mocked(getPitLane).mockReturnValue({ x: [25, 50], y: [25, 60] });
    const props = { sessionKey: 1, drivers: [mockDriver], locationData: mockLocationData, sessionStartMs: 0, circuitKey: 22, year: 2025 };
    const { rerender } = render(<TrackMap {...props} pitLaneStatus={{ lane: "unknown", entry: "unknown", exit: "closed" }} />);
    expect(screen.queryByText(/pit exit closed · last reported/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("pit-exit-status")).toHaveAttribute("fill", TOKEN_HEX.red);
    expect(screen.getByTestId("pit-lane")).toHaveAttribute("stroke", TOKEN_HEX.fg);
    rerender(<TrackMap {...props} pitLaneStatus={{ lane: "closed", entry: "open", exit: "unknown" }} />);
    expect(screen.getByTestId("pit-lane")).toHaveAttribute("stroke", TOKEN_HEX.red);
    expect(screen.getByTestId("pit-entry-status")).toHaveAttribute("fill", TOKEN_HEX.green);
    expect(screen.queryByTestId("pit-exit-status")).not.toBeInTheDocument();
    rerender(<TrackMap {...props} />);
    expect(screen.getByTestId("pit-lane")).toHaveAttribute("stroke", TOKEN_HEX.fg);
    expect(screen.queryByTestId("pit-entry-status")).not.toBeInTheDocument();
  });

  it("shrinks only pit-lane cars and restores their size after rejoining", () => {
    const outline = {
      points: [
        { x: 0, y: 0 },
        { x: 0, y: 10000 },
        { x: 10000, y: 10000 },
        { x: 10000, y: 0 },
      ],
      bounds: { minX: 0, minY: 0, maxX: 10000, maxY: 10000, width: 10000, height: 10000 },
      source: "baked" as const,
    };
    vi.mocked(useTrackOutline).mockReturnValue(mockTrackOutlineQueryResult(outline));
    vi.mocked(getCircuitGeometry).mockReturnValue({
      circuitKey: 22,
      circuitName: "Test",
      year: 2025,
      rotation: 0,
      x: [],
      y: [],
      corners: [],
      marshalSectors: [],
      marshalLights: [],
    });
    vi.mocked(getPitLane).mockReturnValue({
      x: [-50, -300, -300, -300, -50],
      y: [1000, 1500, 2500, 3500, 4000],
    });
    const positions: Location[] = [1, 2].flatMap((num) =>
      [10, 11].map((second) => ({
        date: `2024-01-01T00:00:${second}.000Z`,
        driver_number: num,
        meeting_key: 1,
        session_key: 1,
        x: num === 1 && second === 10 ? -300 : 0,
        y: 2500,
        z: 0,
      })),
    );
    const drivers = [mockDriver, { ...mockDriver, driver_number: 2, name_acronym: "TWO" }];
    const props = {
      sessionKey: 1,
      drivers,
      locationData: positions,
      sessionStartMs: Date.parse("2024-01-01T00:00:00.000Z"),
      circuitKey: 22,
      year: 2025,
    };
    const dot = (label: string) => screen.getByText(label).closest("g")!.querySelector('circle[fill="#000000"]')!;
    timelineT = 10_000;
    const { rerender } = render(<TrackMap {...props} />);
    expect(dot("TST")).toHaveAttribute("r", String(4.5 * TRACK_PIT_CAR_SCALE));
    expect(dot("TWO")).toHaveAttribute("r", "4.5");

    follow.numbers = true;
    rerender(<TrackMap {...props} focusDriver={1} previewTimeMs={10_000} />);
    expect(dot("TST")).toHaveAttribute("r", String(8 * TRACK_PIT_CAR_SCALE));
    expect(screen.getByText("1")).toHaveAttribute("font-size", String(5.8 * TRACK_PIT_CAR_SCALE));

    timelineT = 11_000;
    rerender(<TrackMap {...props} focusDriver={1} previewTimeMs={11_000} />);
    expect(dot("TST")).toHaveAttribute("r", "8");
    expect(screen.getByText("1")).toHaveAttribute("font-size", "5.8");

    timelineT = 10_000;
    vi.mocked(getPitLane).mockReturnValue(null);
    rerender(<TrackMap {...props} circuitKey={999} previewTimeMs={10_000} />);
    expect(dot("TST")).toHaveAttribute("r", "6.6");

    vi.mocked(getPitLane).mockReturnValue({
      x: [-50, -300, -300, -300, -50],
      y: [1000, 1500, 2500, 3500, 4000],
    });
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult({ ...outline, source: "layout" }),
    );
    rerender(<TrackMap {...props} previewTimeMs={10_000} />);
    expect(dot("TST")).toHaveAttribute("r", "6.6");
  });

  it("only follows the focused car once following is switched on", () => {
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(mockOutline),
    );
    timelineT = 10_000;
    const props = {
      sessionKey: 1,
      drivers: [mockDriver],
      locationData: mockLocationData,
      sessionStartMs: 0,
      focusDriver: 1,
    };
    const viewW = (container: HTMLElement) =>
      Number(container.querySelector("svg")?.getAttribute("viewBox")?.split(" ")[2]);

    const first = render(<TrackMap {...props} />);
    expect(viewW(first.container)).toBe(600);
    const button = screen.getByRole("button", { name: "Follow the focused car" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(follow.setSetting).toHaveBeenCalledWith("mapFollowFocusedCar", true);
    first.unmount();

    follow.on = true;
    const second = render(<TrackMap {...props} />);
    expect(viewW(second.container)).toBeLessThan(600);
    expect(
      screen.getByRole("button", { name: "Stop following the focused car" }),
    ).toHaveAttribute("aria-pressed", "true");
    second.unmount();

    // No focused car: no follow toggle.
    render(<TrackMap {...props} focusDriver={null} />);
    expect(screen.queryByRole("button", { name: /focused car/ })).toBeNull();
  });

  it("toggles the driver heatmap and skips its lap data when off", () => {
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(mockOutline),
    );
    const props = {
      sessionKey: 1,
      drivers: [mockDriver],
      locationData: mockLocationData,
      sessionStartMs: 0,
      focusDriver: 1,
      focusDriverLap: 5,
    };
    vi.mocked(useCarDataForLap).mockClear();
    const on = render(<TrackMap {...props} />);
    expect(vi.mocked(useCarDataForLap)).toHaveBeenCalledWith(1, 1, 5, expect.anything());
    fireEvent.click(screen.getByRole("button", { name: "Hide the driver heatmap" }));
    expect(follow.setSetting).toHaveBeenCalledWith("mapShowDriverHeatmap", false);
    on.unmount();

    follow.heatmap = false;
    vi.mocked(useCarDataForLap).mockClear();
    render(<TrackMap {...props} />);
    expect(vi.mocked(useCarDataForLap)).not.toHaveBeenCalledWith(1, 1, 5, expect.anything());
    expect(vi.mocked(useCarDataForLap)).toHaveBeenCalledWith(1, null, 5, expect.anything());
    expect(
      screen.getByRole("button", { name: "Show the driver heatmap" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps follow-camera viewport stable when focused sample is temporarily missing", () => {
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(mockOutline),
    );
    follow.on = true;

    timelineT = 10_000;
    const { container, rerender } = render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        focusDriver={1}
      />,
    );

    const svgBefore = container.querySelector("svg");
    expect(svgBefore).toBeTruthy();
    const viewBoxBefore = svgBefore?.getAttribute("viewBox");
    expect(viewBoxBefore).toBeTruthy();

    // After the latest location sample, focused interpolation returns null.
    // Follow camera should keep the previous view instead of snapping away.
    timelineT = 12_000;
    rerender(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        focusDriver={1}
      />,
    );

    const svgAfter = container.querySelector("svg");
    expect(svgAfter?.getAttribute("viewBox")).toBe(viewBoxBefore);
  });

  it("renders acronym labels with a visible offset from the dot", () => {
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(mockOutline),
    );

    render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
      />,
    );

    const label = screen.getByText("TST");
    expect(label).toBeTruthy();
    expect(label.getAttribute("text-anchor")).toBe("start");
    expect(label.getAttribute("x")).toBe("10");
  });

  it("renders without crashing when marshal posts carry independent flags", () => {
    const trackFlagState: TrackFlagState = {
      globalFlag: null,
      marshalFlags: { 1: "YELLOW", 3: "RED" },
      maxMarshalSector: 3,
      updatedAtMs: 0,
    };

    const { container } = render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        trackFlagState={trackFlagState}
      />,
    );

    expect(container).toBeTruthy();
  });

  it("renders without crashing when globalFlag is set to SAFETY_CAR", () => {
    const trackFlagState: TrackFlagState = {
      globalFlag: "SAFETY_CAR",
      marshalFlags: {},
      maxMarshalSector: 0,
      updatedAtMs: 0,
    };

    const { container } = render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        trackFlagState={trackFlagState}
      />,
    );

    expect(container).toBeTruthy();
  });

  it("renders without crashing when trackFlagState is null", () => {
    const { container } = render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        trackFlagState={null}
      />,
    );

    expect(container).toBeTruthy();
  });

  it("badges a track-wide yellow once, not per sector", () => {
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(mockOutline),
    );

    render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        trackFlagState={{
          globalFlag: "YELLOW",
          marshalFlags: {},
          maxMarshalSector: 0,
          updatedAtMs: 0,
        }}
      />,
    );

    expect(screen.getByText("Yellow Flag")).toBeTruthy();
    expect(screen.queryByText("Yellow Flag S1")).toBeNull();
  });

  it("badges the chequered flag alongside an active sector yellow", () => {
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(mockOutline),
    );

    render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        trackFlagState={{
          globalFlag: "CHEQUERED",
          marshalFlags: { 1: "YELLOW" },
          maxMarshalSector: 3,
          updatedAtMs: 0,
        }}
        activeTrackVehicles={{
          safetyCar: false,
          vsc: false,
          medicalCar: false,
          chequeredFlag: true,
        }}
      />,
    );

    expect(screen.getByText("Chequered Flag")).toBeTruthy();
    expect(screen.getByText("Yellow Flag S1")).toBeTruthy();
  });

  it("shows the start-lights badge instead of the formation lap", () => {
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(mockOutline),
    );

    const { rerender } = render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        // t = 0 lands just after the third light comes on.
        lightsOutMs={START_LIGHTS_SEQUENCE_MS - 2 * START_LIGHT_INTERVAL_MS}
        activeTrackVehicles={{
          safetyCar: false,
          vsc: false,
          medicalCar: false,
          formationLap: true,
        }}
      />,
    );

    expect(
      screen.getByRole("img", { name: "3 of 5 start lights on" }),
    ).toBeTruthy();
    expect(screen.queryByText("Lights Out")).toBeNull();
    expect(screen.queryByText("Formation Lap")).toBeNull();

    rerender(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        lightsOutMs={0}
      />,
    );

    expect(screen.getByRole("img", { name: "Lights out" })).toBeTruthy();
    expect(screen.queryByText(/lights out/i)).toBeNull();
  });

  it("badges the projected timing sector for a marshal-post yellow", () => {
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(mockOutline),
    );

    render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        trackFlagState={{
          globalFlag: null,
          // Post 22 of 23 sits in the final third of the lap.
          marshalFlags: { 22: "YELLOW" },
          maxMarshalSector: 23,
          updatedAtMs: 0,
        }}
      />,
    );

    expect(screen.getByText("Yellow Flag S3")).toBeTruthy();
    expect(screen.queryByText("Yellow Flag S1")).toBeNull();
  });

  it("renders marshal-sector track overlays using raw sector numbers", () => {
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(mockOutline),
    );
    vi.mocked(getCircuitGeometry).mockReturnValue({
      marshalSectors: [
        {
          number: 17,
          trackPosition: { x: 10, y: 10 },
        },
        {
          number: 18,
          trackPosition: { x: 45, y: 45 },
        },
        {
          number: 19,
          trackPosition: { x: 80, y: 80 },
        },
      ],
      corners: [],
      metadata: {
        generatedAt: "2026-01-01T00:00:00.000Z",
        source: "test",
      },
    } as never);

    render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        circuitKey={123}
        year={2026}
        trackFlagState={{
          globalFlag: null,
          marshalFlags: { 17: "YELLOW", 19: "RED" },
          maxMarshalSector: 19,
          updatedAtMs: 0,
        }}
      />,
    );

    expect(screen.getByTestId("marshal-flag-segment-17")).toBeInTheDocument();
    expect(screen.getByTestId("marshal-flag-segment-19")).toBeInTheDocument();
  });

  it("keeps painting marshal-post flags under an inactive global flag", () => {
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(mockOutline),
    );
    vi.mocked(getCircuitGeometry).mockReturnValue({
      marshalSectors: [
        { number: 17, trackPosition: { x: 10, y: 10 } },
        { number: 18, trackPosition: { x: 45, y: 45 } },
      ],
      corners: [],
    } as never);

    render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        circuitKey={123}
        year={2026}
        trackFlagState={{
          // The chequered flag must not swallow a yellow raised on the
          // cool-down lap, which is what an unrecognised global flag used to do.
          globalFlag: "CHEQUERED",
          marshalFlags: { 17: "YELLOW" },
          maxMarshalSector: 18,
          updatedAtMs: 0,
        }}
      />,
    );

    expect(screen.getByTestId("marshal-flag-segment-17")).toBeInTheDocument();
  });

  it("labels both safety car numbers and hides the one that is parked", () => {
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(mockOutline),
    );

    // 241 and 242 are both safety cars. Only the car deployed for the event
    // reports real coordinates; the other sits at the sentinel origin.
    const vehicles: Location[] = [241, 242, 243].flatMap((num) =>
      [10, 11].map((sec) => ({
        date: `2024-01-01T00:00:${sec}.000Z`,
        driver_number: num,
        meeting_key: 1,
        session_key: 1,
        x: num === 241 ? 40 + sec : 0,
        y: num === 241 ? 40 + sec : 0,
        z: 0,
      })),
    );

    render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={[...mockLocationData, ...vehicles]}
        sessionStartMs={0}
      />,
    );

    // Exactly one safety car marker: 241 is on track, 242 and the medical car
    // are parked at the origin sentinel and must not be drawn at all.
    const safetyCarMarkers = screen.getAllByText("SC");
    expect(safetyCarMarkers).toHaveLength(1);
    expect(screen.queryByText("MC")).toBeNull();

    // And it is the deployed car's position, not the origin. The mocked
    // locationToSvg is the identity, so a parked car would land on the pad
    // offset alone.
    const marker = safetyCarMarkers[0]!.closest("g");
    expect(marker?.getAttribute("transform")).not.toContain(
      `translate(${TRACK_SVG_PAD.toFixed(1)},${TRACK_SVG_PAD.toFixed(1)})`,
    );
  });

  it("draws safety car dot text in white in dark mode", () => {
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(mockOutline),
    );

    const vehicles: Location[] = [241, 243].flatMap((num) =>
      [10, 11].map((sec) => ({
        date: `2024-01-01T00:00:${sec}.000Z`,
        driver_number: num,
        meeting_key: 1,
        session_key: 1,
        x: 40 + sec + num,
        y: 40 + sec,
        z: 0,
      })),
    );

    render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={[...mockLocationData, ...vehicles]}
        sessionStartMs={0}
      />,
    );

    const markers = screen.getAllByText("SC");
    expect(markers).toHaveLength(2);
    for (const marker of markers) {
      expect(marker.getAttribute("fill")).toBe("#ffffff");
    }
  });

  it("uses baked circuit rotation as the default track heading", () => {
    // locationToSvg is mocked as identity: a 500-unit-wide outline, turned
    // 92°, is taller than the 400-unit view.
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult({
        ...mockOutline,
        points: [
          { x: 26, y: 150 },
          { x: 526, y: 150 },
          { x: 526, y: 200 },
          { x: 26, y: 200 },
        ],
      }),
    );
    vi.mocked(getCircuitGeometry).mockReturnValue({
      circuitKey: 123,
      circuitName: "Test Circuit",
      year: 2026,
      rotation: 92,
      x: [],
      y: [],
      corners: [],
      marshalSectors: [],
      marshalLights: [],
    });

    const { container } = render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        circuitKey={123}
        year={2026}
      />,
    );

    expect(
      container.querySelector('g[transform*="rotate(-92.0 300.0 200.0)"]'),
    ).toBeInTheDocument();
    // The fit shrinks it below the default 1.15 zoom.
    const transform =
      container
        .querySelector('g[transform*="rotate(-92.0 300.0 200.0)"]')
        ?.getAttribute("transform") ?? "";
    const scale = Number(/scale\(([\d.]+)\)/.exec(transform)?.[1]);
    expect(scale).toBeCloseTo(352 / 500, 1);
  });

  it("converts the Cartesian circuit rotation for the SVG coordinate system", () => {
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(mockOutline),
    );
    vi.mocked(getCircuitGeometry).mockImplementation(
      () =>
        ({
          circuitKey: 123,
          circuitName: "Test Circuit",
          year: 2026,
          rotation: 92,
          x: [],
          y: [],
          corners: [],
          marshalSectors: [],
          marshalLights: [],
        }) as never,
    );
    window.localStorage.setItem("f1-replay:track-rotation:2:123", "150");

    const { container } = render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        circuitKey={123}
        year={2026}
      />,
    );

    expect(
      container.querySelector('g[transform*="rotate(-92.0 300.0 200.0)"]'),
    ).toBeInTheDocument();
  });

  it("renders the race leader notification badge with driver profile picture", () => {
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(mockOutline),
    );
    const leaderDriver = {
      ...mockDriver,
      full_name: "Max Verstappen",
      name_acronym: "VER",
      headshot_url: "https://example.com/ver.jpg",
    };
    const startMs = Date.parse("2024-01-01T00:00:00.000Z");

    render(
      <TrackMap
        sessionKey={1}
        drivers={[leaderDriver]}
        locationData={mockLocationData}
        sessionStartMs={startMs}
        raceLeader={leaderDriver}
      />,
    );

    expect(screen.getByText("RACE LEADER: VER")).toBeTruthy();
    const img = screen.getByAltText("Max Verstappen");
    expect(img).toBeTruthy();
    expect(img.getAttribute("src")).toBe("https://example.com/ver.jpg");
  });

  it("shows a settings shortcut only when onOpenSettings is provided", () => {
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(mockOutline),
    );
    const onOpenSettings = vi.fn();
    const { rerender } = render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
      />,
    );
    expect(screen.queryByLabelText("Track map settings")).toBeNull();

    rerender(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        showTrackControls={false}
        onOpenSettings={onOpenSettings}
      />,
    );
    fireEvent.click(screen.getByLabelText("Track map settings"));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });
});
