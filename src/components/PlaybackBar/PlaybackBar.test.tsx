import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    timelineState.speed = 1;
    timelineState.setT.mockClear();
    timelineState.setSpeed.mockClear();
    timelineState.setPlaying.mockClear();
    timelineState.toggle.mockClear();
    vi.restoreAllMocks();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    window.history.replaceState({}, "", "/race");
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

  it("copies a replay link built from live timeline state", async () => {
    timelineState.t = 45_321;
    timelineState.speed = 4;
    window.history.replaceState({}, "", "/race?meeting=123&session=456");

    render(<PlaybackBar durationMs={120_000} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy replay link" }));

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    });

    const copiedUrl = new URL(
      vi.mocked(navigator.clipboard.writeText).mock.calls[0]![0],
    );

    expect(copiedUrl.searchParams.get("meeting")).toBe("123");
    expect(copiedUrl.searchParams.get("session")).toBe("456");
    expect(copiedUrl.searchParams.get("t")).toBe("45");
    expect(copiedUrl.searchParams.get("speed")).toBe("4");
    expect(await screen.findByText("Copied")).toBeInTheDocument();
  });
});
