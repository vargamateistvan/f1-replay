import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { EventToastStack } from "@/components/EventToast/EventToastStack";
import { TeamRadioFeed } from "@/components/TeamRadio/TeamRadio";
import { RaceChapters } from "@/components/RaceChapters/RaceChapters";
import { TrackMap } from "@/components/TrackMap/TrackMap";
import type { Driver, TeamRadio, Location } from "@/api/types";
import type { ActiveToast } from "@/hooks/useEventToasts";
import type { RaceChapter, WhatChangedSnapshot } from "@/timeline/raceControl";

const testState = vi.hoisted(() => ({
  timeline: { t: 10_000 },
  outlinePending: false,
  outline: {
    source: "layout",
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    bounds: {
      minX: 0,
      maxX: 100,
      minY: 0,
      maxY: 100,
      width: 100,
      height: 100,
    },
  } as unknown,
  carWindowData: [
    {
      date: "2024-01-01T00:00:10.000Z",
      speed: 250,
      n_gear: 7,
      throttle: 80,
      brake: 5,
    },
  ],
  lapHeatData: [
    { distM: 0, speed: 120 },
    { distM: 100, speed: 200 },
    { distM: 200, speed: 280 },
  ],
  layout: {
    sectors: [
      { number: 1, bounds: { minX: 0, minY: 0, maxX: 40, maxY: 100 } },
      { number: 2, bounds: { minX: 40, minY: 0, maxX: 70, maxY: 100 } },
      { number: 3, bounds: { minX: 70, minY: 0, maxX: 100, maxY: 100 } },
    ],
    drsZones: [{ line: { x1: 10, y1: 10, x2: 20, y2: 20 } }],
  },
  circuitGeom: null,
}));

vi.mock("@/timeline/clock", () => ({
  useTimeline: () => testState.timeline,
}));

vi.mock("@/hooks/useLocationChunks", () => ({
  chunkIndexFor: () => 0,
}));

vi.mock("@/hooks/useCarDataWindow", () => ({
  useCarDataWindow: () => ({ data: testState.carWindowData }),
}));

vi.mock("@/hooks/useCarDataForLap", () => ({
  useCarDataForLap: () => ({ data: testState.lapHeatData }),
}));

vi.mock("@/hooks/useTrackMap", () => ({
  useTrackOutline: () => ({
    data: testState.outline,
    isPending: testState.outlinePending,
  }),
  locationToSvg: (x: number, y: number) => ({ sx: x * 5, sy: y * 3 }),
}));

vi.mock("@/data/circuits", () => ({
  getCircuitLayout: () => testState.layout,
}));

vi.mock("@/data/circuitGeometry", () => ({
  getCircuitGeometry: () => testState.circuitGeom,
}));

const drivers: Driver[] = [
  { driver_number: 1, name_acronym: "VER", team_colour: "3671C6" },
  { driver_number: 16, name_acronym: "LEC", team_colour: "E8002D" },
] as unknown as Driver[];

describe("deep component coverage", () => {
  beforeEach(() => {
    testState.timeline = { t: 10_000 };
    testState.outlinePending = false;
    testState.outline = {
      source: "layout",
      points: [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 100 },
        { x: 0, y: 100 },
      ],
      bounds: {
        minX: 0,
        maxX: 100,
        minY: 0,
        maxY: 100,
        width: 100,
        height: 100,
      },
    } as unknown;
    testState.carWindowData = [
      {
        date: "2024-01-01T00:00:10.000Z",
        speed: 250,
        n_gear: 7,
        throttle: 80,
        brake: 5,
      },
    ];
    testState.lapHeatData = [
      { distM: 0, speed: 120 },
      { distM: 100, speed: 200 },
      { distM: 200, speed: 280 },
    ];
  });

  it("renders and interacts with all toast card variants", () => {
    const dismiss = vi.fn();
    const toasts = [
      {
        event: {
          id: "radio-1",
          kind: "radio",
          payload: {
            driverNumber: 1,
            recordingUrl: "https://example.com/radio.mp3",
          },
        },
      },
      {
        event: {
          id: "flag-1",
          kind: "flag",
          payload: {
            flag: "YELLOW",
            message: "Yellow in sector 2",
            lapNumber: 12,
          },
        },
      },
      {
        event: {
          id: "over-1",
          kind: "overtake",
          payload: { overtaking: 1, overtaken: 16, position: 2 },
        },
      },
      {
        event: {
          id: "pit-1",
          kind: "pit",
          payload: { driverNumber: 1, lapNumber: 15, pitDuration: 2.4 },
        },
      },
      {
        event: {
          id: "fl-1",
          kind: "fastest_lap",
          payload: { driverNumber: 16, lapNumber: 18, lapTime: 89.123 },
        },
      },
    ] as unknown as ActiveToast[];

    render(
      <EventToastStack
        toasts={toasts}
        drivers={drivers}
        onDismiss={dismiss}
        maxVisible={6}
      />,
    );

    expect(screen.getByText("Radio")).toBeInTheDocument();
    expect(screen.getByText("Overtake")).toBeInTheDocument();
    expect(screen.getByText("Fastest Lap")).toBeInTheDocument();
    expect(screen.getByText("Pit · L15")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Play"));
    expect(screen.getByText("Stop")).toBeInTheDocument();

    fireEvent.click(screen.getAllByLabelText("Dismiss")[0]!);
    expect(dismiss).toHaveBeenCalled();
  });

  it("covers TeamRadioFeed empty and playing states", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");

    const { rerender } = render(
      <TeamRadioFeed
        entries={[]}
        drivers={drivers}
        sessionTimeMs={0}
        sessionStartMs={0}
      />,
    );
    expect(screen.getByText("Select a session")).toBeInTheDocument();

    rerender(
      <TeamRadioFeed
        entries={[]}
        drivers={drivers}
        sessionTimeMs={0}
        sessionStartMs={1}
      />,
    );
    expect(
      screen.getByText("No radio messages yet — scrub forward"),
    ).toBeInTheDocument();

    rerender(
      <TeamRadioFeed
        entries={
          [
            {
              date: "2024-01-01T00:00:05.000Z",
              driver_number: 1,
              recording_url: "https://example.com/1.mp3",
            },
            {
              date: "2024-01-01T00:10:05.000Z",
              driver_number: 99,
              recording_url: "https://example.com/2.mp3",
            },
          ] as TeamRadio[]
        }
        drivers={drivers}
        sessionTimeMs={10_000}
        sessionStartMs={sessionStartMs}
      />,
    );

    fireEvent.click(screen.getByText("Play"));
    expect(screen.getByText("Stop")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Stop"));
    expect(screen.getByText("Play")).toBeInTheDocument();
  });

  it("covers RaceChapters filters, snapshot details, and actions", () => {
    const onJump = vi.fn();
    const onPlayWindow = vi.fn();

    const chapters = [
      {
        id: "ch-1",
        kind: "start",
        label: "Race Start",
        startMs: 0,
        endMs: 20_000,
        durationMs: 20_000,
        incidentWindowId: null,
      },
      {
        id: "w-1",
        kind: "safety_car",
        label: "Safety Car",
        startMs: 20_000,
        endMs: 40_000,
        durationMs: 20_000,
        incidentWindowId: "w-1",
      },
      {
        id: "ch-2",
        kind: "finish",
        label: "Finish",
        startMs: 40_000,
        endMs: 60_000,
        durationMs: 20_000,
        incidentWindowId: null,
      },
    ] as RaceChapter[];

    const snapshots = [
      {
        window: { id: "w-1" },
        positionChanges: [
          { driverNumber: 1, before: 3, after: 1, delta: 2 },
          { driverNumber: 16, before: 1, after: 3, delta: -2 },
        ],
        pitsDuringWindow: [1],
      },
    ] as WhatChangedSnapshot[];

    const { rerender } = render(
      <RaceChapters
        chapters={[]}
        snapshots={[]}
        drivers={drivers}
        sessionTimeMs={0}
        onJump={onJump}
      />,
    );
    expect(
      screen.getByText(
        "No session loaded — select a race session to see chapters",
      ),
    ).toBeInTheDocument();

    rerender(
      <RaceChapters
        chapters={chapters}
        snapshots={snapshots}
        drivers={drivers}
        sessionTimeMs={25_000}
        onJump={onJump}
        onPlayWindow={onPlayWindow}
      />,
    );

    expect(screen.getByText("What Changed")).toBeInTheDocument();
    expect(screen.getByText("Pitted:")).toBeInTheDocument();
    expect(screen.getByText("NOW")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Incident Only"));
    expect(screen.getByText("1 chapters")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Jump to/i })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /Replay Safety Car/i }));

    expect(onJump).toHaveBeenCalled();
    expect(onPlayWindow).toHaveBeenCalledWith(20_000, 40_000);
  });

  it("covers TrackMap early return states", () => {
    const { rerender } = render(
      <TrackMap
        sessionKey={null}
        drivers={drivers}
        locationData={[]}
        sessionStartMs={0}
      />,
    );
    expect(
      screen.getByText("Select a session to load the track"),
    ).toBeInTheDocument();

    testState.outlinePending = true;
    rerender(
      <TrackMap
        sessionKey={1}
        drivers={drivers}
        locationData={[]}
        sessionStartMs={0}
      />,
    );
    expect(screen.getByText("Loading track outline…")).toBeInTheDocument();

    testState.outlinePending = false;
    testState.outline = null as unknown;
    rerender(
      <TrackMap
        sessionKey={1}
        drivers={drivers}
        locationData={[]}
        sessionStartMs={0}
      />,
    );
    expect(
      screen.getByText("No location data available for this session"),
    ).toBeInTheDocument();
  });

  it("covers TrackMap main rendering, controls, and export action", () => {
    const onSelectDriver = vi.fn();

    render(
      <TrackMap
        sessionKey={1}
        drivers={drivers}
        locationData={
          [
            {
              driver_number: 1,
              date: "2024-01-01T00:00:09.000Z",
              x: 10,
              y: 15,
            },
            {
              driver_number: 1,
              date: "2024-01-01T00:00:10.000Z",
              x: 20,
              y: 25,
            },
            {
              driver_number: 16,
              date: "2024-01-01T00:00:10.000Z",
              x: 30,
              y: 35,
            },
          ] as Location[]
        }
        sessionStartMs={0}
        focusDriver={1}
        pulseDrivers={[16]}
        activeCompounds={new Map([[1, { compound: "SOFT", age: 2 }]])}
        battlingDrivers={new Set([16])}
        activeSectorFlag={{ flag: "YELLOW", scope: "sector", sector: 2 }}
        activeTrackVehicles={{ safetyCar: true, vsc: false, medicalCar: true }}
        onSelectDriver={onSelectDriver}
      />,
    );

    expect(screen.getByText("Safety Car")).toBeInTheDocument();
    expect(screen.getByText("Medical Car")).toBeInTheDocument();
    expect(screen.getByText("Fallback layout")).toBeInTheDocument();
    expect(screen.getByText("↓ PNG")).toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Zoom in"));
    fireEvent.click(screen.getByTitle("Zoom out"));
    fireEvent.click(screen.getByTitle("Reset zoom"));
    fireEvent.click(screen.getByTitle("Rotate left"));
    fireEvent.click(screen.getByTitle("Rotate right"));
    fireEvent.click(screen.getByTitle("Reset rotation"));

    fireEvent.click(screen.getByText("↓ PNG"));
    fireEvent.click(screen.getAllByText("VER")[0]!);

    expect(onSelectDriver).toHaveBeenCalled();
  });
});
