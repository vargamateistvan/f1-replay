import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LiveTiming } from "@/components/LiveTiming/LiveTiming";
import { useSettings } from "@/stores/settings";
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
  beforeEach(() => {
    useSettings.setState({ metricSystem: "metric" });
  });

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

    expect(screen.getAllByText("VER").length).toBeGreaterThan(0);
  });

  it("shows full surnames when enabled", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");
    const positions = [
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
    ] as Position[];

    render(
      <LiveTiming
        drivers={drivers}
        positions={positions}
        intervals={[]}
        pits={[]}
        laps={[]}
        sessionTimeMs={20_000}
        sessionStartMs={sessionStartMs}
        showFullLastName
      />,
    );

    expect(screen.getByText("Verstappen")).toBeInTheDocument();
    expect(screen.getByText("Leclerc")).toBeInTheDocument();
    expect(screen.getAllByText("VER").length).toBeGreaterThan(0);
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
        positions={
          [
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
          ] as Position[]
        }
        intervals={
          [
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
              interval: 1.111,
            },
          ] as unknown as Interval[]
        }
        pits={
          [
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
          ] as Pit[]
        }
        laps={
          [
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
          ] as Lap[]
        }
        raceControl={
          [
            {
              category: "Investigation",
              date: "2024-01-01T00:00:10.500Z",
              driver_number: 1,
              flag: null,
              lap_number: 1,
              meeting_key: 1,
              message: "Car 1 under investigation for track limits",
              qualifying_phase: null,
              scope: null,
              sector: null,
              session_key: 1,
            },
            {
              category: "Penalty",
              date: "2024-01-01T00:00:10.700Z",
              driver_number: 16,
              flag: null,
              lap_number: 1,
              meeting_key: 1,
              message: "Car 16 time penalty 5 seconds",
              qualifying_phase: null,
              scope: null,
              sector: null,
              session_key: 1,
            },
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
          ] as RaceControl[]
        }
        stints={
          [
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
          ] as Stint[]
        }
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
    expect(screen.queryByText("Interval")).not.toBeInTheDocument();
    expect(screen.getByText("+5.234")).toBeInTheDocument();
    expect(screen.getByText("OUTLAP")).toBeInTheDocument();
    expect(screen.getByText("RET")).toBeInTheDocument();
    expect(screen.getByLabelText("Under investigation")).toBeInTheDocument();
    expect(screen.getByLabelText("Penalty issued")).toBeInTheDocument();
    expect(screen.getAllByText(/SPD|KMH|MPH/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByText("LEC")[0]!);
    expect(onSelectDriver).toHaveBeenCalledWith(16);
  });

  it("shows mph and converted speed in imperial mode", () => {
    useSettings.setState({ metricSystem: "imperial" });

    render(
      <LiveTiming
        drivers={drivers}
        positions={
          [
            {
              driver_number: 1,
              position: 1,
              date: "2024-01-01T00:00:10.000Z",
            },
          ] as Position[]
        }
        intervals={[]}
        pits={[]}
        laps={[]}
        sessionTimeMs={20_000}
        sessionStartMs={Date.parse("2024-01-01T00:00:00.000Z")}
        carData={
          new Map<number, CarData>([
            [
              1,
              {
                brake: 0,
                date: "2024-01-01T00:00:12.000Z",
                driver_number: 1,
                drs: 0,
                meeting_key: 1,
                n_gear: 7,
                rpm: 12001,
                session_key: 1,
                speed: 301,
                throttle: 95,
              },
            ],
          ])
        }
      />,
    );

    expect(screen.getAllByText(/mph/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText("187").length).toBeGreaterThan(0);
  });

  it("orders qualifying by best lap and keeps eliminated drivers locked", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");
    const fieldDrivers = Array.from({ length: 20 }, (_, i) => {
      const n = i + 1;
      return {
        driver_number: n,
        name_acronym: `D${String(n).padStart(2, "0")}`,
        full_name: `Driver ${n}`,
        team_colour: "3671C6",
      };
    }) as unknown as Driver[];

    const fieldPositions = Array.from({ length: 20 }, (_, i) => ({
      driver_number: i + 1,
      position: i + 1,
      date: "2024-01-01T00:09:50.000Z",
    })) as Position[];

    const fieldLaps = Array.from({ length: 20 }, (_, i) => {
      const n = i + 1;
      const lap = 80 + n;
      return {
        date_start: "2024-01-01T00:01:00.000Z",
        driver_number: n,
        duration_sector_1: 26 + n * 0.1,
        duration_sector_2: 26 + n * 0.1,
        duration_sector_3: 26 + n * 0.1,
        i1_speed: null,
        i2_speed: null,
        is_pit_out_lap: false,
        lap_duration: lap,
        lap_number: 1,
        meeting_key: 1,
        segments_sector_1: [2049],
        segments_sector_2: [2049],
        segments_sector_3: [2049],
        session_key: 1,
        st_speed: null,
      };
    }) as Lap[];

    render(
      <LiveTiming
        drivers={fieldDrivers}
        positions={fieldPositions}
        intervals={[]}
        pits={[]}
        laps={fieldLaps}
        raceControl={
          [
            {
              category: "Track Status",
              date: "2024-01-01T00:09:00.000Z",
              driver_number: 0,
              flag: null,
              lap_number: 0,
              meeting_key: 1,
              message: "Q2 STARTED",
              qualifying_phase: null,
              scope: null,
              sector: null,
              session_key: 1,
            },
          ] as unknown as RaceControl[]
        }
        sessionName="Qualifying"
        sessionTimeMs={600_000}
        sessionStartMs={sessionStartMs}
      />,
    );

    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("D01");
    expect(rows[2]).toHaveTextContent("D02");
    expect(rows[3]).toHaveTextContent("D03");
    expect(screen.getAllByText("OUT Q1").length).toBe(5);
  });

  it("highlights a row when a timed-session lap is just completed", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");

    render(
      <LiveTiming
        drivers={drivers}
        positions={
          [
            {
              driver_number: 1,
              position: 1,
              date: "2024-01-01T00:00:11.000Z",
            },
          ] as Position[]
        }
        intervals={[]}
        pits={[]}
        laps={
          [
            {
              date_start: "2024-01-01T00:00:00.000Z",
              driver_number: 1,
              duration_sector_1: 30,
              duration_sector_2: 30,
              duration_sector_3: 30,
              i1_speed: null,
              i2_speed: null,
              is_pit_out_lap: false,
              lap_duration: 10,
              lap_number: 1,
              meeting_key: 1,
              segments_sector_1: [2049],
              segments_sector_2: [2049],
              segments_sector_3: [2049],
              session_key: 1,
              st_speed: null,
            },
          ] as Lap[]
        }
        sessionName="Practice 1"
        sessionTimeMs={11_000}
        sessionStartMs={sessionStartMs}
      />,
    );

    const row = screen
      .getAllByRole("row")
      .find((candidate) => candidate.textContent?.includes("VER"));
    expect(row).toBeDefined();
    expect(row).toHaveClass("ring-1");
    expect(row).toHaveClass("ring-inset");
  });

  it("derives timed-session intervals from the car ahead", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");
    const timedDrivers = [
      ...drivers,
      {
        driver_number: 63,
        name_acronym: "RUS",
        full_name: "George Russell",
        team_colour: "00D2BE",
      },
    ] as unknown as Driver[];

    render(
      <LiveTiming
        drivers={timedDrivers}
        positions={
          [
            {
              driver_number: 1,
              position: 1,
              date: "2024-01-01T00:01:40.000Z",
            },
            {
              driver_number: 16,
              position: 2,
              date: "2024-01-01T00:01:40.000Z",
            },
            {
              driver_number: 63,
              position: 3,
              date: "2024-01-01T00:01:40.000Z",
            },
          ] as Position[]
        }
        intervals={[]}
        pits={[]}
        laps={
          [
            {
              date_start: "2024-01-01T00:00:00.000Z",
              driver_number: 1,
              duration_sector_1: 30,
              duration_sector_2: 30,
              duration_sector_3: 30,
              i1_speed: null,
              i2_speed: null,
              is_pit_out_lap: false,
              lap_duration: 90,
              lap_number: 1,
              meeting_key: 1,
              segments_sector_1: [2049],
              segments_sector_2: [2049],
              segments_sector_3: [2049],
              session_key: 1,
              st_speed: null,
            },
            {
              date_start: "2024-01-01T00:00:00.000Z",
              driver_number: 16,
              duration_sector_1: 30.4,
              duration_sector_2: 30.4,
              duration_sector_3: 30.4,
              i1_speed: null,
              i2_speed: null,
              is_pit_out_lap: false,
              lap_duration: 91.2,
              lap_number: 1,
              meeting_key: 1,
              segments_sector_1: [2049],
              segments_sector_2: [2049],
              segments_sector_3: [2049],
              session_key: 1,
              st_speed: null,
            },
            {
              date_start: "2024-01-01T00:00:00.000Z",
              driver_number: 63,
              duration_sector_1: 31,
              duration_sector_2: 31,
              duration_sector_3: 31,
              i1_speed: null,
              i2_speed: null,
              is_pit_out_lap: false,
              lap_duration: 93,
              lap_number: 1,
              meeting_key: 1,
              segments_sector_1: [2049],
              segments_sector_2: [2049],
              segments_sector_3: [2049],
              session_key: 1,
              st_speed: null,
            },
          ] as Lap[]
        }
        sessionName="Practice 1"
        sessionTimeMs={100_000}
        sessionStartMs={sessionStartMs}
        showIntervalColumn
      />,
    );

    expect(screen.getByText("Interval")).toBeInTheDocument();
    const rows = screen.getAllByRole("row");
    expect(rows[2]).toHaveTextContent("LEC");
    expect(rows[2]).toHaveTextContent("+1.200");
    expect(rows[3]).toHaveTextContent("RUS");
    expect(rows[3]).toHaveTextContent("+3.000");
    expect(rows[3]).toHaveTextContent("+1.800");
  });

  it("shows race-session interval values only when enabled", () => {
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");

    render(
      <LiveTiming
        drivers={drivers}
        positions={
          [
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
          ] as Position[]
        }
        intervals={
          [
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
              interval: 1.111,
            },
          ] as unknown as Interval[]
        }
        pits={[]}
        laps={[]}
        sessionName="Race"
        sessionTimeMs={20_000}
        sessionStartMs={sessionStartMs}
        showIntervalColumn
      />,
    );

    expect(screen.getByText("Interval")).toBeInTheDocument();
    expect(screen.getByText("+1.111")).toBeInTheDocument();
  });

  it("marks all drivers referenced in a multi-car noted incident", () => {
    const sessionStartMs = Date.parse("2024-01-01T15:00:00.000Z");
    const incidentDrivers = [
      {
        driver_number: 44,
        name_acronym: "HAM",
        full_name: "Lewis Hamilton",
        team_colour: "00D2BE",
      },
      {
        driver_number: 63,
        name_acronym: "RUS",
        full_name: "George Russell",
        team_colour: "00D2BE",
      },
    ] as unknown as Driver[];

    render(
      <LiveTiming
        drivers={incidentDrivers}
        positions={
          [
            {
              driver_number: 44,
              position: 1,
              date: "2024-01-01T15:04:20.000Z",
            },
            {
              driver_number: 63,
              position: 2,
              date: "2024-01-01T15:04:20.000Z",
            },
          ] as Position[]
        }
        intervals={[]}
        pits={[]}
        laps={[]}
        raceControl={
          [
            {
              category: "Incident",
              date: "2024-01-01T15:04:29.000Z",
              driver_number: null,
              flag: null,
              lap_number: 6,
              meeting_key: 1,
              message:
                "TURN 6 INCIDENT INVOLVING CARS 44 (HAM) AND 63 (RUS) NOTED - CAUSING A COLLISION",
              qualifying_phase: null,
              scope: null,
              sector: null,
              session_key: 1,
            },
          ] as unknown as RaceControl[]
        }
        sessionName="Race"
        sessionTimeMs={4 * 60_000 + 35_000}
        sessionStartMs={sessionStartMs}
      />,
    );

    expect(screen.getAllByLabelText("Under investigation").length).toBe(2);
    expect(screen.queryByText("PIT")).not.toBeInTheDocument();
  });

  it("clears the warning marker once a penalty is served", () => {
    const sessionStartMs = Date.parse("2024-01-01T15:00:00.000Z");
    const incidentDrivers = [
      {
        driver_number: 44,
        name_acronym: "HAM",
        full_name: "Lewis Hamilton",
        team_colour: "00D2BE",
      },
    ] as unknown as Driver[];

    render(
      <LiveTiming
        drivers={incidentDrivers}
        positions={
          [
            {
              driver_number: 44,
              position: 1,
              date: "2024-01-01T15:04:20.000Z",
            },
          ] as Position[]
        }
        intervals={[]}
        pits={[]}
        laps={[]}
        raceControl={
          [
            {
              category: "Incident",
              date: "2024-01-01T15:04:29.000Z",
              driver_number: 44,
              flag: null,
              lap_number: 6,
              meeting_key: 1,
              message:
                "TURN 6 INCIDENT INVOLVING CAR 44 (HAM) NOTED - CAUSING A COLLISION",
              qualifying_phase: null,
              scope: null,
              sector: null,
              session_key: 1,
            },
            {
              category: "Penalty",
              date: "2024-01-01T15:06:00.000Z",
              driver_number: 44,
              flag: null,
              lap_number: 8,
              meeting_key: 1,
              message: "CAR 44 TIME PENALTY SERVED",
              qualifying_phase: null,
              scope: null,
              sector: null,
              session_key: 1,
            },
          ] as unknown as RaceControl[]
        }
        sessionName="Race"
        sessionTimeMs={6 * 60_000 + 5_000}
        sessionStartMs={sessionStartMs}
      />,
    );

    expect(
      screen.queryByLabelText("Under investigation"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Penalty issued")).not.toBeInTheDocument();
  });
});
