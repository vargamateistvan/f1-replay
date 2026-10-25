import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommentaryRow } from "./CommentaryRow";

describe("CommentaryRow", () => {
  it("renders time, badge, title, meta and a jump button", () => {
    const onJump = vi.fn();
    const { container } = render(
      <CommentaryRow
        ms={83_000}
        badge={{ label: "Pit" }}
        accent="#ff8000"
        title="Pit stop"
        meta={<span>Stop 2.4</span>}
        jumpLabel="pit stop for NOR"
        onJump={onJump}
      />,
    );

    expect(screen.getByText("01:23")).toBeInTheDocument();
    expect(screen.getByText("Pit")).toHaveAttribute("data-commentary-badge");
    expect(screen.getByText("Stop 2.4")).toBeInTheDocument();
    expect(container.querySelector("[data-commentary-accent]")).toHaveStyle({
      backgroundColor: "rgb(255, 128, 0)",
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Jump to pit stop for NOR at 01:23" }),
    );
    expect(onJump).toHaveBeenCalledWith(83_000);
  });

  it("seeks from anywhere on a clickable row and dims upcoming items", () => {
    const onJump = vi.fn();
    render(
      <CommentaryRow
        ms={5_000}
        badge={{ label: "Lead" }}
        title="VER takes the lead"
        rowClickable
        upcoming
        onJump={onJump}
      />,
    );

    const row = screen.getByRole("button");
    expect(row).toHaveClass("opacity-50");
    fireEvent.click(screen.getByText("VER takes the lead"));
    expect(onJump).toHaveBeenCalledWith(5_000);
  });
});
