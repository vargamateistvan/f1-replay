import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { TOUR_VERSION } from "@/constants";
import { useSettings } from "@/stores/settings";
import { useAutoStartTour } from "./useAutoStartTour";

function setUrl(search: string) {
  window.history.replaceState(null, "", `/${search}`);
}

describe("useAutoStartTour", () => {
  beforeEach(() => {
    setUrl("?session=9999");
    useSettings.setState({
      tourSeenVersion: 0,
      isTourOpen: false,
      isOpen: false,
      isHelpOpen: false,
    });
  });
  afterEach(() => setUrl(""));

  it("opens the tour once the page is ready", () => {
    const { rerender } = renderHook(({ ready }) => useAutoStartTour(ready), {
      initialProps: { ready: false },
    });
    expect(useSettings.getState().isTourOpen).toBe(false);
    rerender({ ready: true });
    expect(useSettings.getState().isTourOpen).toBe(true);
  });

  it("stays closed once this tour version has been seen", () => {
    useSettings.setState({ tourSeenVersion: TOUR_VERSION });
    renderHook(() => useAutoStartTour(true));
    expect(useSettings.getState().isTourOpen).toBe(false);
  });

  it("comes back for a newer tour version", () => {
    useSettings.setState({ tourSeenVersion: TOUR_VERSION - 1 });
    renderHook(() => useAutoStartTour(true));
    expect(useSettings.getState().isTourOpen).toBe(true);
  });

  it("never starts on a link to a moment (?t=)", () => {
    setUrl("?session=9999&t=120000");
    renderHook(() => useAutoStartTour(true));
    expect(useSettings.getState().isTourOpen).toBe(false);
  });

  it("waits for another modal to close", () => {
    useSettings.setState({ isHelpOpen: true });
    renderHook(() => useAutoStartTour(true));
    expect(useSettings.getState().isTourOpen).toBe(false);
    act(() => useSettings.setState({ isHelpOpen: false }));
    expect(useSettings.getState().isTourOpen).toBe(true);
  });

  it("doesn't reopen in the same page load after being closed", () => {
    const { rerender } = renderHook(() => useAutoStartTour(true));
    act(() => useSettings.setState({ isTourOpen: false, isOpen: true }));
    act(() => useSettings.setState({ isOpen: false }));
    rerender();
    expect(useSettings.getState().isTourOpen).toBe(false);
  });
});
