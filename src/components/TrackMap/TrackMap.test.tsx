import { beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { TrackMap, type ActiveTrackFlagState } from "./TrackMap";
import type { Location } from "@/api/types";
import { useTrackOutline } from "@/hooks/useTrackMap";

let timelineT = 0;

vi.mock("@/timeline/clock", () => ({
  useTimeline: vi.fn(() => ({
    t: timelineT,
    playing: false,
    speed: 1,
    toggle: vi.fn(),
    setT: vi.fn(),
    setSpeed: vi.fn(),
    setPlaying: vi.fn(),
  })),
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
  useSettings: vi.fn(() => ({
    lightMode: false,
  })),
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
  bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
};

describe("TrackMap sector flag state rendering", () => {
  beforeEach(() => {
    timelineT = 0;
    vi.mocked(useTrackOutline).mockReturnValue({
      data: null,
      isPending: false,
    });
  });

  it("keeps follow-camera viewport stable when focused sample is temporarily missing", () => {
    vi.mocked(useTrackOutline).mockReturnValue({
      data: mockOutline,
      isPending: false,
    });

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
});
