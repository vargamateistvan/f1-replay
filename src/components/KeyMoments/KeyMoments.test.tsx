import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { KeyMoments } from "@/components/KeyMoments/KeyMoments";

describe("KeyMoments", () => {
  it("covers empty state and jump interactions", () => {
    const onJump = vi.fn();
    const { rerender } = render(
      <KeyMoments moments={[]} sessionTimeMs={0} onJump={onJump} />,
    );
    expect(
      screen.getByText("No key moments yet — scrub forward or select a session"),
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
        sessionTimeMs={20_000}
        onJump={onJump}
      />,
    );

    fireEvent.click(screen.getByText("VER takes the lead"));
    expect(onJump).toHaveBeenCalledWith(10_000);
    expect(screen.getByText("+0.220")).toBeInTheDocument();
    expect(screen.getByText("VSC")).toBeInTheDocument();
    expect(screen.getByText("VSC deployed").closest("button")).toHaveClass("opacity-40");
  });
});
