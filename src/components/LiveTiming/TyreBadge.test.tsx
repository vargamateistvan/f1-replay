import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TyreBadge } from "@/components/LiveTiming/TyreBadge";
import type { Stint } from "@/api/types";

describe("TyreBadge", () => {
  it("covers no-active and changed-compound branches", () => {
    const stints = [
      {
        compound: "SOFT",
        driver_number: 1,
        lap_end: 10,
        lap_start: 1,
        meeting_key: 1,
        session_key: 1,
        stint_number: 1,
        tyre_age_at_start: 0,
      },
    ] as Stint[];

    const { rerender } = render(
      <TyreBadge stints={stints} driverNumber={16} currentLap={5} />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();

    rerender(
      <TyreBadge
        stints={stints}
        driverNumber={1}
        currentLap={5}
        startCompound="MEDIUM"
      />,
    );

    expect(screen.getByText("4")).toBeInTheDocument();
    expect(
      screen.getByText("Starting compound was MEDIUM"),
    ).toBeInTheDocument();
    expect(screen.getByTitle("SOFT · 4 laps old")).toBeInTheDocument();
  });
});
