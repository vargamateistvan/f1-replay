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
        gap_to_leader: "+8.765",
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
    expect(screen.getByText("DNS")).toBeInTheDocument();
    expect(screen.getByText("DNS noted")).toBeInTheDocument();
    expect(screen.getAllByText("01:24:01.250").length).toBeGreaterThan(0);
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

    fireEvent.click(screen.getByRole("button", { name: "Close results dialog" }));
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
