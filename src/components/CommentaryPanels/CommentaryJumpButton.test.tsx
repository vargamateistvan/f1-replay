import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommentaryJumpButton } from "./CommentaryJumpButton";

describe("CommentaryJumpButton", () => {
  it("seeks to the event without triggering the row's own click", () => {
    const onJump = vi.fn();
    const onRowClick = vi.fn();
    render(
      <div onClick={onRowClick}>
        <CommentaryJumpButton ms={83_000} label="Safety car" onJump={onJump} />
      </div>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Jump to Safety car at 01:23" }),
    );

    expect(onJump).toHaveBeenCalledWith(83_000);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("clamps pre-session events to the session start", () => {
    const onJump = vi.fn();
    render(
      <CommentaryJumpButton
        ms={-5_000}
        label="Pit exit open"
        onJump={onJump}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Jump to Pit exit open at 00:00" }),
    );

    expect(onJump).toHaveBeenCalledWith(0);
  });
});
