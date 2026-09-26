import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  FinalClassification,
  FinalClassificationDialog,
} from "@/components/FinalClassification";
import type { Driver, SessionResult } from "@/api/types";

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
  {
    driver_number: 63,
    name_acronym: "RUS",
    full_name: "George Russell",
    team_colour: "00D2BE",
  },
] as unknown as Driver[];

describe("FinalClassification", () => {
  it("renders sorted results with classified and dns branches", () => {
    const results = [
      {
        position: 2,
        driver_number: 16,
        number_of_laps: 58,
        points: 18,
        dnf: false,
        dns: false,
        dsq: false,
        duration: 5050.123,
        gap_to_leader: "8.765",
        meeting_key: 1,
        session_key: 1,
      },
      {
        position: 1,
        driver_number: 1,
        number_of_laps: 58,
        points: 25,
        dnf: false,
        dns: false,
        dsq: false,
        duration: [5041.25],
        gap_to_leader: null,
        meeting_key: 1,
        session_key: 1,
      },
      {
        position: null,
        driver_number: 63,
        number_of_laps: null,
        points: null,
        dnf: false,
        dns: true,
        dsq: false,
        duration: null,
        gap_to_leader: ["DNS noted"],
        meeting_key: 1,
        session_key: 1,
      },
    ] as SessionResult[];

    render(
      <FinalClassification
        results={results}
        drivers={drivers}
        sessionName="Race"
      />,
    );

    expect(screen.getByText("Final Classification")).toBeInTheDocument();
    expect(screen.getAllByText("P1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CLASSIFIED").length).toBeGreaterThan(0);
    expect(screen.queryByText("DNS")).not.toBeInTheDocument();
    expect(screen.getByText("DNS noted")).toBeInTheDocument();
    expect(screen.getAllByText("+8.765").length).toBeGreaterThan(0);
    expect(screen.getAllByText("01:24:01.250").length).toBeGreaterThan(0);
  });

  it("shows per-part qualifying lap times instead of Q1 duration clocks", () => {
    const results = [
      {
        position: 1,
        driver_number: 1,
        number_of_laps: 18,
        points: null,
        dnf: false,
        dns: false,
        dsq: false,
        duration: [76.0, 75.5, 74.321],
        gap_to_leader: [0.2, 0, 0],
        meeting_key: 1,
        session_key: 1,
      },
      {
        position: 2,
        driver_number: 16,
        number_of_laps: 18,
        points: null,
        dnf: false,
        dns: false,
        dsq: false,
        duration: [75.8, 75.6, 74.5],
        gap_to_leader: [0, 0.1, 0.179],
        meeting_key: 1,
        session_key: 1,
      },
      {
        position: 16,
        driver_number: 63,
        number_of_laps: 7,
        points: null,
        dnf: false,
        dns: false,
        dsq: false,
        duration: [77.25, null, null],
        gap_to_leader: [1.45, null, null],
        meeting_key: 1,
        session_key: 1,
      },
    ] as SessionResult[];

    render(
      <FinalClassification
        results={results}
        drivers={drivers}
        sessionName="Qualifying"
      />,
    );

    expect(screen.getByText("Q1")).toBeInTheDocument();
    expect(screen.getByText("Q3")).toBeInTheDocument();
    expect(screen.getAllByText("1:14.321").length).toBeGreaterThan(0);
    expect(screen.getByText("1:17.250")).toBeInTheDocument();
    // Podium detail uses the deciding (Q3) gap, not Q1's.
    expect(screen.getByText("+0.179")).toBeInTheDocument();
    expect(screen.queryByText(/00:01:16/)).not.toBeInTheDocument();
  });

  it("supports dialog close via escape, close button, and backdrop", () => {
    const onClose = vi.fn();
    const results = [
      {
        position: 1,
        driver_number: 1,
        number_of_laps: 58,
        points: 25,
        dnf: false,
        dns: false,
        dsq: false,
        duration: 5000,
        gap_to_leader: null,
        meeting_key: 1,
        session_key: 1,
      },
    ] as SessionResult[];

    const { rerender } = render(
      <FinalClassificationDialog
        results={results}
        drivers={drivers}
        sessionName="Grand Prix"
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Close results dialog" }),
    );
    expect(onClose).toHaveBeenCalledTimes(2);

    rerender(
      <FinalClassificationDialog
        results={results}
        drivers={drivers}
        sessionName="Grand Prix"
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByText("Grand Prix"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
