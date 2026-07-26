import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PlaybackBar } from "@/components/PlaybackBar";

const { timelineState, mockUseTimeline } = vi.hoisted(() => {
  const timelineState = {
    t: 0,
    playing: false,
    speed: 1,
    toggle: vi.fn(),
    setT: vi.fn(),
    setSpeed: vi.fn(),
    setPlaying: vi.fn(),
  };

  type TimelineState = typeof timelineState;
  type SelectorReturn = number | boolean | (() => void);

  interface MockUseTimeline {
    (selector: (s: TimelineState) => SelectorReturn): SelectorReturn;
    (selector?: undefined): TimelineState;
    getState: () => TimelineState;
    subscribe: (listener: (s: TimelineState) => void) => () => void;
  }

  const mockUseTimeline = vi.fn(
    (selector?: (s: TimelineState) => SelectorReturn) => {
      if (typeof selector === "function") {
        return selector(timelineState);
      }
      return timelineState;
    },
  ) as unknown as MockUseTimeline;

  mockUseTimeline.getState = () => timelineState;
  mockUseTimeline.subscribe = vi.fn((listener: (s: TimelineState) => void) => {
    listener(timelineState);
    return () => {};
  });

  return { timelineState, mockUseTimeline };
});

vi.mock("@/timeline/clock", () => ({
  useTimeline: mockUseTimeline,
}));

vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => false,
}));

describe("PlaybackBar marker interactions", () => {
  beforeEach(() => {
    timelineState.t = 0;
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

  it("jumps forward to Q2 and Q3 phase starts", () => {
    render(
      <PlaybackBar
        durationMs={120_000}
        q2StartMs={30_000}
        q3StartMs={60_000}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Forward to Q2" }));
    fireEvent.click(screen.getByRole("button", { name: "Forward to Q3" }));

    expect(timelineState.setT).toHaveBeenCalledWith(30_000);
    expect(timelineState.setT).toHaveBeenCalledWith(60_000);
  });

  it("triggers replay current incident action when enabled", () => {
    const onReplayCurrentIncident = vi.fn();

    render(
      <PlaybackBar
        durationMs={120_000}
        canReplayCurrentIncident
        onReplayCurrentIncident={onReplayCurrentIncident}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Replay current incident window" }),
    );

    expect(onReplayCurrentIncident).toHaveBeenCalledTimes(1);
  });

  it("disables replay current incident action when unavailable", () => {
    render(
      <PlaybackBar durationMs={120_000} canReplayCurrentIncident={false} />,
    );

    expect(
      screen.getByRole("button", { name: "Replay current incident window" }),
    ).toBeDisabled();
  });

  it("disables replay next incident action when callback is missing", () => {
    render(<PlaybackBar durationMs={120_000} canReplayNextIncident />);

    expect(
      screen.getByRole("button", { name: "Replay next incident window" }),
    ).toBeDisabled();
  });

  it("supports typing MM:SS time and jumping on Enter", () => {
    render(<PlaybackBar durationMs={120_000} />);

    const input = screen.getByRole("textbox", { name: "Playback time" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "01:23" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(timelineState.setT).toHaveBeenCalledWith(83_000);
  });

  it("supports typing HH:MM:SS time", () => {
    render(<PlaybackBar durationMs={4_000_000} />);

    const input = screen.getByRole("textbox", { name: "Playback time" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1:02:03" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(timelineState.setT).toHaveBeenCalledWith(3_723_000);
  });

  it("rejects MM:SS values with invalid seconds", () => {
    render(<PlaybackBar durationMs={120_000} />);

    const input = screen.getByRole("textbox", { name: "Playback time" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "01:99" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(timelineState.setT).not.toHaveBeenCalled();
  });

  it("rejects HH:MM:SS values with invalid minute/second fields", () => {
    render(<PlaybackBar durationMs={4_000_000} />);

    const input = screen.getByRole("textbox", { name: "Playback time" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1:99:03" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(timelineState.setT).not.toHaveBeenCalled();
  });

  it("clamps typed seconds to the session duration", () => {
    render(<PlaybackBar durationMs={60_000} />);

    const input = screen.getByRole("textbox", { name: "Playback time" });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "90" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);

    expect(timelineState.setT).toHaveBeenCalledWith(60_000);
  });

  it("ignores invalid typed time values", () => {
    render(<PlaybackBar durationMs={120_000} />);

    const input = screen.getByRole("textbox", { name: "Playback time" });
    fireEvent.change(input, { target: { value: "oops" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(timelineState.setT).not.toHaveBeenCalled();
  });
});
