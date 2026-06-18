import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LiveTiming } from "@/components/LiveTiming/LiveTiming";
import type {
  CarData,
  Driver,
  Interval,
  Lap,
  Pit,
  Position,
  RaceControl,
  Stint,
} from "@/api/types";

const drivers: Driver[] = [
  {
    driver_number: 1,
    name_acronym: "VER",
    full_name: "Max Verstappen",
    team_colour: "3671C6",
  },
  {
    driver_number: 16,
    name_acronym: "LEC",
    full_name: "Charles Leclerc",
    team_colour: "E8002D",
  },
] as unknown as Driver[];

describe("LiveTiming", () => {
  it("covers loading and empty states", () => {
    const baseProps = {
      drivers,
      positions: [] as Position[],
      intervals: [] as Interval[],
      pits: [] as Pit[],
      laps: [] as Lap[],
      sessionTimeMs: 0,
      sessionStartMs: 0,
    };

    const { rerender } = render(<LiveTiming {...baseProps} isLoading />);
    expect(screen.getByText("Loading timing data")).toBeInTheDocument();

    rerender(<LiveTiming {...baseProps} isLoading={false} />);
    expect(screen.getByText("No session selected")).toBeInTheDocument();

    rerender(<LiveTiming {...baseProps} sessionStartMs={1} />);
    expect(screen.getByText("Waiting for timing")).toBeInTheDocument();
  });

  it("covers no-sector-reference and dense hint paths", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");
    const positions = [
      {
        driver_number: 1,
        position: 1,
        date: "2024-01-01T00:00:10.000Z",
      },
    ] as Position[];

    const { rerender } = render(
      <LiveTiming
        drivers={drivers}
        positions={positions}
        intervals={[]}
        pits={[]}
        laps={[]}
        sessionTimeMs={20_000}
        sessionStartMs={sessionStartMs}
        dense={false}
      />,
    );

    expect(screen.getByText("First timed lap pending")).toBeInTheDocument();

    rerender(
      <LiveTiming
        drivers={drivers}
        positions={positions}
        intervals={[]}
        pits={[]}
        laps={[]}
        sessionTimeMs={20_000}
        sessionStartMs={sessionStartMs}
        dense
        onSelectDriver={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Tap driver A, then driver B to compare"),
    ).toBeInTheDocument();
  });

  it("covers populated race rows with select/pit/outlap/telemetry", () => {
    const onSelectDriver = vi.fn();
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");
    const carData = new Map<number, CarData>([
      [
        1,
        {
          brake: 5,
          date: "2024-01-01T00:00:12.000Z",
          driver_number: 1,
          drs: 12,
          meeting_key: 1,
          n_gear: 7,
          rpm: 12001,
          session_key: 1,
          speed: 301,
          throttle: 95,
        },
      ],
      [
        16,
        {
          brake: 75,
          date: "2024-01-01T00:00:12.000Z",
          driver_number: 16,
          drs: 8,
          meeting_key: 1,
          n_gear: 3,
          rpm: 9033,
          session_key: 1,
          speed: 123,
          throttle: 44,
        },
      ],
    ]);

    render(
      <LiveTiming
        drivers={drivers}
        positions={[
          {
            driver_number: 1,
            position: 1,
            date: "2024-01-01T00:00:10.000Z",
          },
          {
            driver_number: 16,
            position: 2,
            date: "2024-01-01T00:00:10.000Z",
          },
        ] as Position[]}
        intervals={[
          {
            driver_number: 1,
            date: "2024-01-01T00:00:10.000Z",
            gap_to_leader: 0,
            interval: null,
          },
          {
            driver_number: 16,
            date: "2024-01-01T00:00:10.000Z",
            gap_to_leader: 5.234,
            interval: 5.234,
          },
        ] as unknown as Interval[]}
        pits={[
          {
            date: "2024-01-01T00:01:45.000Z",
            driver_number: 16,
            lap_number: 1,
            meeting_key: 1,
            stop_duration: 2.4,
            lane_duration: 30,
            pit_duration: null,
            session_key: 1,
          },
        ] as Pit[]}
        laps={[
          {
            date_start: "2024-01-01T00:00:09.000Z",
            driver_number: 1,
            duration_sector_1: 29.5,
            duration_sector_2: 31.0,
            duration_sector_3: 30.1,
            i1_speed: null,
            i2_speed: null,
            is_pit_out_lap: false,
            lap_duration: 90.6,
            lap_number: 1,
            meeting_key: 1,
            segments_sector_1: [2064, 2051],
            segments_sector_2: [2049],
            segments_sector_3: [1],
            session_key: 1,
            st_speed: null,
          },
          {
            date_start: "2024-01-01T00:00:09.000Z",
            driver_number: 16,
            duration_sector_1: 30.5,
            duration_sector_2: 31.8,
            duration_sector_3: 31.2,
            i1_speed: null,
            i2_speed: null,
            is_pit_out_lap: false,
            lap_duration: 93.5,
            lap_number: 1,
            meeting_key: 1,
            segments_sector_1: [2051],
            segments_sector_2: [2049],
            segments_sector_3: [0],
            session_key: 1,
            st_speed: null,
          },
        ] as Lap[]}
        raceControl={[
          {
            category: "Incident",
            date: "2024-01-01T00:00:11.000Z",
            driver_number: 16,
            flag: null,
            lap_number: 1,
            meeting_key: 1,
            message: "Car 16 retired",
            qualifying_phase: null,
            scope: null,
            sector: null,
            session_key: 1,
          },
        ] as RaceControl[]}
        stints={[
          {
            compound: "MEDIUM",
            driver_number: 1,
            lap_end: 15,
            lap_start: 1,
            meeting_key: 1,
            session_key: 1,
            stint_number: 1,
            tyre_age_at_start: 0,
          },
          {
            compound: "SOFT",
            driver_number: 1,
            lap_end: 30,
            lap_start: 16,
            meeting_key: 1,
            session_key: 1,
            stint_number: 2,
            tyre_age_at_start: 0,
          },
        ] as Stint[]}
        grid={[
          {
            position: 2,
            driver_number: 1,
            lap_duration: 90.0,
            meeting_key: 1,
            session_key: 1,
          },
          {
            position: 1,
            driver_number: 16,
            lap_duration: 89.5,
            meeting_key: 1,
            session_key: 1,
          },
        ]}
        sessionTimeMs={120_000}
        sessionStartMs={sessionStartMs}
        sessionName="Race"
        totalLapCount={58}
        carData={carData}
        selectedDriver={1}
        compareDriver={16}
        onSelectDriver={onSelectDriver}
        chequeredMs={5_000}
      />,
    );

    expect(screen.getByText("LEAD")).toBeInTheDocument();
    expect(screen.getByText("OUTLAP")).toBeInTheDocument();
    expect(screen.getByText("RET")).toBeInTheDocument();
    expect(screen.getAllByText("SPD").length).toBeGreaterThan(0);
    expect(screen.getByTitle(/1 stop/)).toBeInTheDocument();
    expect(screen.getAllByText("A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("B").length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText("LEC")[0]!);
    expect(onSelectDriver).toHaveBeenCalledWith(16);
  });
});
