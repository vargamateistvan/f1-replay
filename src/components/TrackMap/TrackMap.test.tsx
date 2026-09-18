import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  TrackMap,
} from "./TrackMap";
import type { Location } from "@/api/types";
import { useTrackOutline } from "@/hooks/useTrackMap";
import type { TrackFlagState } from "@/timeline/raceControl";
import { getCircuitGeometry } from "@/data/circuitGeometry";

let timelineT = 0;

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
}));

vi.mock("@/data/circuits", () => ({
  getCircuitLayout: vi.fn(() => null),
}));

vi.mock("@/data/circuitGeometry", () => ({
  getCircuitGeometry: vi.fn(() => null),
}));

vi.mock("@/stores/settings", () => ({
  useSettings: vi.fn((selector) =>
    selector({
      lightMode: false,
      metricSystem: "metric",
      mapShowDriverAcronym: true,
      mapShowDriverNumberInside: false,
      mapShowRaceLeader: true,
      mapShowMarshalHeatmap: false,
      mapShowCornerNumbers: false,
      mapShowElevation: false,
      mapShowClock: false,
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
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(null),
    );
  });

  it("keeps follow-camera viewport stable when focused sample is temporarily missing", () => {
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(mockOutline),
    );

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

  it("uses baked circuit rotation as the default track heading", () => {
    vi.mocked(useTrackOutline).mockReturnValue(
      mockTrackOutlineQueryResult(mockOutline),
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
      container.querySelector('g[transform^="rotate(-92.0 300.0 200.0)"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('g[transform*="scale(1.15)"]'),
    ).toBeInTheDocument();
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
      container.querySelector('g[transform^="rotate(-92.0 300.0 200.0)"]'),
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
});
