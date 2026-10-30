import { StrictMode, type PropsWithChildren } from "react";
import { act, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trackEvent } from "@/lib/analytics";
import { useSettings } from "@/stores/settings";
import { useReplayWelcome } from "./useReplayWelcome";

vi.mock("@/lib/analytics", () => ({ trackEvent: vi.fn() }));

describe("useReplayWelcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSettings.setState({
      tourSeenVersion: 0, replayWelcomeSeen: false, isTourOpen: false,
      isOpen: false, isHelpOpen: false,
    });
  });

  function wrapper({ children }: PropsWithChildren) {
    return <StrictMode><MemoryRouter future={{
      v7_startTransition: true, v7_relativeSplatPath: true,
    }}>{children}</MemoryRouter></StrictMode>;
  }

  it("offers a nonblocking prompt when ready without opening the tour", () => {
    const { result, rerender } = renderHook(({ ready }) =>
      useReplayWelcome(ready, false, false),
    { initialProps: { ready: false }, wrapper });
    expect(result.current.visible).toBe(false);
    rerender({ ready: true });
    expect(result.current.visible).toBe(true);
    expect(useSettings.getState().isTourOpen).toBe(false);
    expect(useSettings.getState().replayWelcomeSeen).toBe(true);
    expect(vi.mocked(trackEvent).mock.calls.filter(
      ([name]) => name === "replay_welcome_viewed",
    )).toHaveLength(1);
  });

  it.each(["/?t=120", "/?focus=44", "/?compare=1", "/?cam=chase"])(
    "never interrupts a shared replay at %s", (path) => {
      function sharedWrapper({ children }: PropsWithChildren) {
        return <MemoryRouter initialEntries={[path]} future={{
          v7_startTransition: true, v7_relativeSplatPath: true,
        }}>{children}</MemoryRouter>;
      }
      const { result } = renderHook(() => useReplayWelcome(true, false, false), {
        wrapper: sharedWrapper,
      });
      expect(result.current.visible).toBe(false);
      expect(trackEvent).not.toHaveBeenCalled();
    },
  );

  it("does not offer the prompt to returning visitors or tour veterans", () => {
    useSettings.setState({ replayWelcomeSeen: true });
    const first = renderHook(() => useReplayWelcome(true, false, false), { wrapper });
    expect(first.result.current.visible).toBe(false);
    first.unmount();
    useSettings.setState({ replayWelcomeSeen: false, tourSeenVersion: 1 });
    const second = renderHook(() => useReplayWelcome(true, false, false), { wrapper });
    expect(second.result.current.visible).toBe(false);
  });

  it("does not show over live sessions, playing replays or other dialogs", () => {
    const { result, rerender } = renderHook(({ live, playing }) =>
      useReplayWelcome(true, live, playing),
    { initialProps: { live: true, playing: false }, wrapper });
    expect(result.current.visible).toBe(false);
    act(() => useSettings.setState({ isHelpOpen: true }));
    rerender({ live: false, playing: false });
    expect(result.current.visible).toBe(false);
    act(() => useSettings.setState({ isHelpOpen: false }));
    expect(result.current.visible).toBe(true);
    rerender({ live: false, playing: true });
    rerender({ live: false, playing: false });
    expect(result.current.visible).toBe(false);
  });

  it("opens the tour only when explicitly requested", () => {
    const { result } = renderHook(() => useReplayWelcome(true, false, false), { wrapper });
    act(() => result.current.takeTour());
    expect(result.current.visible).toBe(false);
    expect(useSettings.getState().isTourOpen).toBe(true);
    expect(trackEvent).toHaveBeenCalledWith("tour_started", { source: "welcome" });
  });

  it("keeps dismissal across remounts without pretending the tour was completed", () => {
    const first = renderHook(() => useReplayWelcome(true, false, false), { wrapper });
    act(() => first.result.current.dismiss("dismiss"));
    expect(first.result.current.visible).toBe(false);
    expect(useSettings.getState().tourSeenVersion).toBe(0);
    first.unmount();
    const next = renderHook(() => useReplayWelcome(true, false, false), { wrapper });
    expect(next.result.current.visible).toBe(false);
  });
});
