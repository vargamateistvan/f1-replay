import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { Meeting } from "@/api/types";
import type { ScheduleRound } from "@/utils/schedule";
import { RaceWeekendDialog } from "./RaceWeekendDialog";

const mockUseWeekendStints = vi.fn();
const mockUseDrivers = vi.fn();
vi.mock("@/hooks/useSession", () => ({
  useDrivers: (...args: unknown[]) => mockUseDrivers(...args),
  useWeekendStints: (...args: unknown[]) => mockUseWeekendStints(...args),
}));

const round: ScheduleRound = {
  meeting: {
    meeting_key: 1,
    meeting_name: "Bahrain Grand Prix",
    meeting_official_name: "Bahrain Grand Prix",
    circuit_short_name: "Sakhir",
    location: "Sakhir",
    date_start: "2026-04-03T00:00:00Z",
    date_end: "2026-04-05T00:00:00Z",
    gmt_offset: "03:00:00",
    is_cancelled: false,
    year: 2026,
  } as Meeting,
  round: 1,
  isTesting: false,
  isSprint: false,
  isNext: false,
  status: "completed",
  sessions: [
    {
      session: {
        session_key: 10,
        meeting_key: 1,
        session_name: "Practice 1",
        session_type: "Practice",
        date_start: "2026-04-03T10:00:00Z",
      } as ScheduleRound["sessions"][number]["session"],
      status: "completed",
    },
    {
      session: {
        session_key: 11,
        meeting_key: 1,
        session_name: "Race",
        session_type: "Race",
        date_start: "2026-04-05T12:00:00Z",
      } as ScheduleRound["sessions"][number]["session"],
      status: "completed",
    },
  ],
};

describe("RaceWeekendDialog", () => {
  it("splits tyre estimates by session and links driver names to their profiles", () => {
    mockUseDrivers.mockReturnValue({
      data: [
        {
          driver_number: 1,
          full_name: "Max Verstappen",
          name_acronym: "VER",
        },
      ],
    });
    mockUseWeekendStints.mockReturnValue({
      data: [
        {
          driver_number: 1,
          compound: "SOFT",
          tyre_age_at_start: 0,
          lap_start: 1,
          lap_end: 10,
          stint_number: 1,
          meeting_key: 1,
          session_key: 10,
        },
      ],
      isPending: false,
      isError: false,
    });
    const onClose = vi.fn();

    render(
      <MemoryRouter>
        <RaceWeekendDialog round={round} onClose={onClose} />
      </MemoryRouter>,
    );

    const dialog = screen.getByRole("dialog", { name: "Bahrain Grand Prix" });
    expect(dialog).toHaveTextContent("Tyre sets remaining by session");
    expect(dialog).toHaveTextContent("Max Verstappen");
    expect(dialog).toHaveTextContent("#1");
    expect(dialog).toHaveTextContent("7/8");
    expect(screen.getByRole("region", { name: "Practice 1 tyre usage" })).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Race");
    expect(
      screen.getByRole("link", { name: "Max Verstappen profile" }),
    ).toHaveAttribute("href", "/standings/driver/1?year=2026&session=11");
    expect(mockUseWeekendStints).toHaveBeenCalledWith([round.sessions[0].session]);
    expect(mockUseDrivers).toHaveBeenCalledWith(11);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
