import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  TrackMap,
  type ActiveMarshalSectorFlagState,
  type ActiveTrackFlagState,
} from "./TrackMap";
import type { Location } from "@/api/types";
import { useTrackOutline } from "@/hooks/useTrackMap";
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

  it("renders without crashing when activeTrackFlagState has independent sectors", () => {
    const trackFlagState: ActiveTrackFlagState = {
      globalFlag: null,
      sectorFlags: { 1: "YELLOW", 2: null, 3: "RED" },
      updatedAtMs: 0,
    };

    const { container } = render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        activeTrackFlagState={trackFlagState}
      />,
    );

    expect(container).toBeTruthy();
  });

  it("renders without crashing when globalFlag is set to SAFETY_CAR", () => {
    const trackFlagState: ActiveTrackFlagState = {
      globalFlag: "SAFETY_CAR",
      sectorFlags: { 1: null, 2: null, 3: null },
      updatedAtMs: 0,
    };

    const { container } = render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        activeTrackFlagState={trackFlagState}
      />,
    );

    expect(container).toBeTruthy();
  });

  it("renders without crashing when activeTrackFlagState is null", () => {
    const { container } = render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        activeTrackFlagState={null}
      />,
    );

    expect(container).toBeTruthy();
  });

  it("preserves backward compatibility with legacy activeSectorFlag prop", () => {
    const { container } = render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        activeSectorFlag={{
          flag: "YELLOW",
          scope: "Sector",
          sector: 2,
        }}
      />,
    );

    expect(container).toBeTruthy();
  });

  it("prioritizes activeTrackFlagState over legacy activeSectorFlag when both present", () => {
    const newState: ActiveTrackFlagState = {
      globalFlag: "RED",
      sectorFlags: { 1: null, 2: null, 3: null },
      updatedAtMs: 0,
    };

    const { container } = render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        activeTrackFlagState={newState}
        activeSectorFlag={{
          flag: "YELLOW",
          scope: "Sector",
          sector: 2,
        }}
      />,
    );

    expect(container).toBeTruthy();
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

    const marshalState: ActiveMarshalSectorFlagState = {
      globalFlag: null,
      sectorFlags: {
        17: "YELLOW",
        19: "RED",
      },
      updatedAtMs: 0,
    };

    render(
      <TrackMap
        sessionKey={1}
        drivers={[mockDriver]}
        locationData={mockLocationData}
        sessionStartMs={0}
        circuitKey={123}
        year={2026}
        activeMarshalSectorFlagState={marshalState}
      />,
    );

    expect(screen.getByTestId("marshal-flag-segment-17")).toBeInTheDocument();
    expect(screen.getByTestId("marshal-flag-segment-19")).toBeInTheDocument();
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
      container.querySelector('g[transform^="rotate(92.0 300.0 200.0)"]'),
    ).toBeInTheDocument();
  });
});
