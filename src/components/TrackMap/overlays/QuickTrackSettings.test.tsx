import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useSettings } from "@/stores/settings";
import { QuickTrackSettings } from "./QuickTrackSettings";

beforeEach(() => {
  useSettings.getState().reset();
  useSettings.getState().closeModal();
});

function open(view: "2d" | "ring" | "3d" = "2d", onOpenSettings?: () => void) {
  const result = render(<QuickTrackSettings view={view} buttonClass="test-button" onOpenSettings={onOpenSettings} />);
  fireEvent.click(screen.getByRole("button", { name: "Quick track settings" }));
  return result;
}

describe("QuickTrackSettings", () => {
  it("toggles sector markers on the 2D map only, enabled by default", () => {
    const result = open("2d");
    const markers = screen.getByRole("switch", { name: "Sector markers" });
    expect(markers).toHaveAttribute("aria-checked", "true");
    fireEvent.click(markers);
    expect(useSettings.getState().mapShowSectorMarkers).toBe(false);
    expect(markers).toHaveAttribute("aria-checked", "false");
    result.unmount();

    const ring = open("ring");
    expect(screen.queryByRole("switch", { name: "Sector markers" })).not.toBeInTheDocument();
    ring.unmount();
    open("3d");
    expect(screen.queryByRole("switch", { name: "Sector markers" })).not.toBeInTheDocument();
  });

  it.each(["2d", "ring", "3d", "timing"] as const)("allows an iOS tap to toggle a %s switch after focus clears", (view) => {
    const timing = view === "timing";
    const label = timing ? "Quick timing settings" : "Quick track settings";
    const key = timing ? "timingMobileShowGap" : view === "3d" ? "mapView3dWeatherEffects" : "mapWeatherEffectsEnabled";
    const before = useSettings.getState()[key];
    render(<QuickTrackSettings view={view} buttonClass="test-button" mobileTiming={timing} />);
    fireEvent.click(screen.getByRole("button", { name: label }));
    const option = screen.getByRole("switch", { name: timing ? "Gap" : "Weather effects" });
    fireEvent.pointerDown(option, { pointerType: "touch" });
    fireEvent.blur(screen.getByRole("button", { name: `Close ${label.toLowerCase()}` }), { relatedTarget: null });
    fireEvent.pointerUp(option, { pointerType: "touch" });
    fireEvent.click(option);
    expect(useSettings.getState()[key]).toBe(!before);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(option).toHaveAttribute("aria-checked", String(!before));
  });

  it.each([false, true])("toggles all sectors together (mobile: %s)", (mobileTiming) => {
    const keys = mobileTiming
      ? ["timingMobileShowS1", "timingMobileShowS2", "timingMobileShowS3"] as const
      : ["trackerTimingShowS1", "trackerTimingShowS2", "trackerTimingShowS3"] as const;
    const otherKeys = mobileTiming
      ? ["trackerTimingShowS1", "trackerTimingShowS2", "trackerTimingShowS3"] as const
      : ["timingMobileShowS1", "timingMobileShowS2", "timingMobileShowS3"] as const;
    useSettings.setState({ [keys[0]]: true, [keys[1]]: false, [keys[2]]: true });
    const otherValues = otherKeys.map((key) => useSettings.getState()[key]);
    render(<QuickTrackSettings view="timing" buttonClass="test-button" mobileTiming={mobileTiming} />);
    fireEvent.click(screen.getByRole("button", { name: "Quick timing settings" }));

    const sectors = screen.getByRole("switch", { name: "Sectors" });
    expect(sectors).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("switch", { name: /Sector [123]/ })).not.toBeInTheDocument();
    fireEvent.click(sectors);
    expect(keys.map((key) => useSettings.getState()[key])).toEqual([true, true, true]);
    expect(sectors).toHaveAttribute("aria-checked", "true");
    fireEvent.click(sectors);
    expect(keys.map((key) => useSettings.getState()[key])).toEqual([false, false, false]);
    expect(otherKeys.map((key) => useSettings.getState()[key])).toEqual(otherValues);
  });

  it("uses the same popover for desktop timing columns", () => {
    render(<QuickTrackSettings view="timing" buttonClass="test-button" />);
    fireEvent.click(screen.getByRole("button", { name: "Quick timing settings" }));
    expect(screen.getByRole("dialog", { name: "Quick timing settings" })).toBeInTheDocument();
    const before = useSettings.getState().trackerTimingShowGap;
    fireEvent.click(screen.getByRole("switch", { name: "Gap" }));
    expect(useSettings.getState().trackerTimingShowGap).toBe(!before);
    expect(screen.getByRole("switch", { name: "Speed" })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Weather effects" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All timing settings" }));
    expect(useSettings.getState().modalTab).toBe("timing");
  });

  it("changes mobile timing columns independently of desktop columns", () => {
    render(<QuickTrackSettings view="timing" buttonClass="test-button" mobileTiming />);
    fireEvent.click(screen.getByRole("button", { name: "Quick timing settings" }));
    const before = useSettings.getState().timingMobileShowGap;
    const desktop = useSettings.getState().trackerTimingShowGap;
    fireEvent.click(screen.getByRole("switch", { name: "Gap" }));
    expect(useSettings.getState().timingMobileShowGap).toBe(!before);
    expect(useSettings.getState().trackerTimingShowGap).toBe(desktop);
    expect(screen.getByRole("switch", { name: "Mobile telemetry" })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Speed" })).not.toBeInTheDocument();
  });

  it("opens an accessible popover and focuses its close button", () => {
    open();
    expect(screen.getByRole("dialog", { name: "Quick track settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quick track settings" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Close quick track settings" })).toHaveFocus();
  });

  it("updates shared persisted settings immediately without closing", () => {
    open();
    fireEvent.click(screen.getByRole("switch", { name: "Weather effects" }));
    expect(useSettings.getState().mapWeatherEffectsEnabled).toBe(true);
    expect(screen.getByRole("switch", { name: "Weather effects" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("switch", { name: "Driver labels" }));
    expect(useSettings.getState().mapShowDriverAcronym).toBe(false);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows and toggles 2D kerbs, but hides that option for ring view", () => {
    expect(useSettings.getState().mapShowKerbs).toBe(false);
    const mapSettings = open("2d");
    fireEvent.click(screen.getByRole("switch", { name: "Track kerbs" }));
    expect(useSettings.getState().mapShowKerbs).toBe(true);
    mapSettings.unmount();

    open("ring");
    expect(screen.queryByRole("switch", { name: "Track kerbs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Run-off areas" })).not.toBeInTheDocument();
  });

  it("shows ring options without 2D or 3D-only controls", () => {
    open("ring");
    expect(screen.getByRole("switch", { name: "Space by lap time" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Anticlockwise" }));
    expect(useSettings.getState().mapRingReverse).toBe(true);
    expect(screen.queryByRole("switch", { name: "Terrain" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Driver heatmap" })).not.toBeInTheDocument();
  });

  it("toggles 3D kerbs and run-off independently of 2D kerbs", () => {
    open("3d");
    const kerbs = screen.getByRole("switch", { name: "Track kerbs" });
    const runoff = screen.getByRole("switch", { name: "Run-off areas" });
    expect(kerbs).toHaveAttribute("aria-checked", "true");
    expect(runoff).toHaveAttribute("aria-checked", "false");
    fireEvent.click(kerbs);
    fireEvent.click(runoff);
    expect(useSettings.getState().mapView3dKerbs).toBe(false);
    expect(useSettings.getState().mapView3dRunoff).toBe(true);
    expect(useSettings.getState().mapShowKerbs).toBe(false);
  });

  it("keeps 3D weather independent and provides 3D-only options", () => {
    open("3d");
    fireEvent.click(screen.getByRole("switch", { name: "Weather effects" }));
    expect(useSettings.getState().mapView3dWeatherEffects).toBe(false);
    expect(useSettings.getState().mapWeatherEffectsEnabled).toBe(false);
    expect(screen.getByRole("switch", { name: "Terrain" })).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Compass" })).not.toBeInTheDocument();
  });

  it("dismisses on Escape with focus restored and on outside pointer press", () => {
    open();
    fireEvent.keyDown(screen.getByRole("button", { name: "Close quick track settings" }), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quick track settings" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Quick track settings" }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes when keyboard focus leaves the popover", () => {
    render(<button type="button">Outside control</button>);
    open();
    act(() => screen.getByRole("button", { name: "Outside control" }).focus());
    expect(screen.getByRole("button", { name: "Outside control" })).toHaveFocus();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the popover open when keyboard focus moves to a switch", () => {
    open();
    const option = screen.getByRole("switch", { name: "Driver labels" });
    act(() => option.focus());
    expect(option).toHaveFocus();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("opens all settings after an iOS tap clears focus", () => {
    open();
    const button = screen.getByRole("button", { name: "All track settings" });
    fireEvent.pointerDown(button, { pointerType: "touch" });
    fireEvent.blur(screen.getByRole("button", { name: "Close quick track settings" }), { relatedTarget: null });
    fireEvent.pointerUp(button, { pointerType: "touch" });
    fireEvent.click(button);
    expect(useSettings.getState().isOpen).toBe(true);
    expect(useSettings.getState().modalTab).toBe("track");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens all settings using the existing gear callback", () => {
    const callback = vi.fn();
    open("2d", callback);
    fireEvent.click(screen.getByRole("button", { name: "All track settings" }));
    expect(callback).toHaveBeenCalledOnce();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("can open full track settings without a gear callback on mobile", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "All track settings" }));
    expect(useSettings.getState().isOpen).toBe(true);
    expect(useSettings.getState().modalTab).toBe("track");
  });
});
