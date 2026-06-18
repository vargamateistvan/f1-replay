import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PlaybackBar } from "@/components/PlaybackBar";

const timelineState = {
  t: 0,
  playing: false,
  speed: 1,
  toggle: vi.fn(),
  setT: vi.fn(),
  setSpeed: vi.fn(),
  setPlaying: vi.fn(),
};

vi.mock("@/timeline/clock", () => ({
  useTimeline: () => timelineState,
}));

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => false,
}));

describe("PlaybackBar marker interactions", () => {
  beforeEach(() => {
    timelineState.setT.mockClear();
  });

  it("renders incident marker with accessible hover text and jumps on click", () => {
    render(
      <PlaybackBar
        durationMs={120_000}
        raceControlMarkers={[
          {
            id: "m1",
            ms: 45_000,
            severity: "warning",
            label: "Yellow Flag",
          },
        ]}
      />,
    );

    const markerButton = screen.getByRole("button", {
      name: "Jump to incident: Yellow Flag at 00:45",
    });

    expect(markerButton).toHaveAttribute("title", "Yellow Flag at 00:45");
    fireEvent.click(markerButton);

    expect(timelineState.setT).toHaveBeenCalledWith(45_000);
  });
});
