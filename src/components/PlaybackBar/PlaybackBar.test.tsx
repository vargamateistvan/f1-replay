import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PlaybackBar } from "@/components/PlaybackBar";
import { startLightsWindow } from "@/timeline/startLights";
import { SCRUBBER_THUMB_PX } from "@/constants";

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

  it("marks the race start and jumps to the start-light lead-in", () => {
    render(<PlaybackBar durationMs={600_000} raceStartMs={222_000} />);

    const marker = screen.getByRole("button", {
      name: "Jump to race start: lights out at 03:42",
    });
    expect(marker).toHaveStyle({ left: "37%" });
    fireEvent.click(marker);

    expect(timelineState.setT).toHaveBeenCalledWith(
      startLightsWindow(222_000).startMs,
    );
  });

  it("shows the time under the pointer when hovering the scrubber", () => {
    render(<PlaybackBar durationMs={6_000_000} raceStartMs={222_000} />);
    const scrubber = screen.getByRole("slider", { name: "Seek" })
      .parentElement as HTMLElement;
    vi.spyOn(scrubber, "getBoundingClientRect").mockReturnValue({
      left: 100,
      width: 816,
      top: 0,
      right: 916,
      bottom: 16,
      height: 16,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    });

    // Track travel is 816 - 16 = 800px, starting 8px in.
    fireEvent.mouseMove(scrubber, { clientX: 100 + 8 + 400 });
    expect(
      screen.getByRole("tooltip", { name: "Time at pointer" }),
    ).toHaveTextContent("50:00");

    fireEvent.mouseMove(scrubber, { clientX: 100 });
    expect(
      screen.getByRole("tooltip", { name: "Time at pointer" }),
    ).toHaveTextContent("00:00");

    // Markers show their own label instead.
    fireEvent.mouseMove(
      screen.getByRole("button", { name: /Jump to race start/ }),
      { clientX: 140 },
    );
    expect(
      screen.queryByRole("tooltip", { name: "Time at pointer" }),
    ).not.toBeInTheDocument();

    fireEvent.mouseMove(scrubber, { clientX: 300 });
    fireEvent.mouseLeave(scrubber);
    expect(
      screen.queryByRole("tooltip", { name: "Time at pointer" }),
    ).not.toBeInTheDocument();
  });

  it("lays markers out over the thumb's travel, not the full track", () => {
    render(<PlaybackBar durationMs={600_000} raceStartMs={222_000} />);
    const markerLayer = screen.getByRole("button", {
      name: /Jump to race start/,
    }).parentElement as HTMLElement;
    expect(markerLayer).toHaveStyle({
      left: `${SCRUBBER_THUMB_PX / 2}px`,
      right: `${SCRUBBER_THUMB_PX / 2}px`,
    });
  });

  it("marks the chequered flag and jumps to it", () => {
    render(<PlaybackBar durationMs={6_000_000} chequeredMs={5_726_000} />);

    const marker = screen.getByRole("button", {
      name: "Jump to chequered flag at 1:35:26",
    });
    expect(marker).toHaveAttribute("title", "Chequered flag at 1:35:26");
    expect(marker.firstElementChild).toHaveStyle({
      backgroundColor: "rgb(255, 255, 255)",
    });
    fireEvent.click(marker);

    expect(timelineState.setT).toHaveBeenCalledWith(5_726_000);
  });

  it("omits the race start marker when there is no race start", () => {
    render(<PlaybackBar durationMs={600_000} raceStartMs={null} />);
    expect(
      screen.queryByRole("button", { name: /Jump to race start/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Jump to chequered flag/ }),
    ).not.toBeInTheDocument();
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

  it("prefetches the clamped destination before a seek", () => {
    const onSeek = vi.fn();
    render(<PlaybackBar durationMs={60_000} onSeek={onSeek} />);

    fireEvent.click(screen.getByRole("button", { name: "Jump to end" }));

    expect(onSeek).toHaveBeenCalledWith(60_000);
    expect(onSeek.mock.invocationCallOrder[0]).toBeLessThan(
      timelineState.setT.mock.invocationCallOrder[0]!,
    );
  });

  it("prefetches scrubber destinations using the same seek path", () => {
    const onSeek = vi.fn();
    const { getByRole } = render(
      <PlaybackBar durationMs={120_000} onSeek={onSeek} />,
    );

    fireEvent.change(getByRole("slider", { name: "Seek" }), {
      target: { value: "45000" },
    });

    expect(onSeek).toHaveBeenCalledWith(45_000);
    expect(timelineState.setT).toHaveBeenCalledWith(45_000);
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
