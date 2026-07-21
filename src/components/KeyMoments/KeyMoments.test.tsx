import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { KeyMoments } from "@/components/KeyMoments/KeyMoments";
import type { Lap } from "@/api/types";

describe("KeyMoments", () => {
  it("covers empty state and jump interactions", () => {
    const onJump = vi.fn();
    const sessionStartMs = Date.parse("2024-01-01T00:00:00.000Z");
    const laps: Lap[] = [
      {
        lap_number: 1,
        date_start: "2024-01-01T00:00:00.000Z",
      },
      {
        lap_number: 2,
        date_start: "2024-01-01T00:00:20.000Z",
      },
    ] as Lap[];
    const { rerender } = render(
      <KeyMoments
        moments={[]}
        laps={[]}
        sessionStartMs={0}
        sessionTimeMs={0}
        onJump={onJump}
      />,
    );
    expect(
      screen.getByText(
        "No key moments yet — scrub forward or select a session",
      ),
    ).toBeInTheDocument();

    rerender(
      <KeyMoments
        moments={[
          {
            ms: 10_000,
            kind: "lead_change",
            label: "VER takes the lead",
            sublabel: "+0.220",
            color: "#e8002d",
          },
          {
            ms: 30_000,
            kind: "vsc",
            label: "VSC deployed",
            color: "#f5a623",
          },
        ]}
        laps={laps}
        sessionStartMs={sessionStartMs}
        sessionTimeMs={20_000}
        onJump={onJump}
      />,
    );

    expect(screen.getAllByText("Lap 1").length).toBeGreaterThan(0);
    expect(screen.queryByText("Lap 2")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("VER takes the lead"));
    expect(onJump).toHaveBeenCalledWith(10_000);
    expect(screen.getByText("+0.220")).toBeInTheDocument();
    expect(screen.queryByText("VSC")).not.toBeInTheDocument();
    expect(screen.queryByText("VSC deployed")).not.toBeInTheDocument();
  });
});
