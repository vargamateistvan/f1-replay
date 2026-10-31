import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { StartReplayHint } from "./StartReplayHint";
import { useTimeline } from "@/timeline/clock";
import { trackEvent } from "@/lib/analytics";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

describe("StartReplayHint", () => {
  afterEach(() => {
    useTimeline.setState({ playing: false });
    vi.mocked(trackEvent).mockClear();
  });

  it("starts playback from the play button", () => {
    useTimeline.setState({ playing: false, t: 1234 });
    render(<StartReplayHint />);

    fireEvent.click(screen.getByRole("button", { name: "Start replay" }));

    expect(useTimeline.getState().playing).toBe(true);
    expect(trackEvent).toHaveBeenCalledWith("playback_toggle", {
      action: "play",
      current_ms: 1234,
      source: "map_hint",
    });
  });

  it("shows a waiting state instead of the call to action while playing", () => {
    useTimeline.setState({ playing: true });
    render(<StartReplayHint />);

    expect(
      screen.queryByRole("button", { name: "Start replay" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Waiting for car positions",
    );
  });
});
