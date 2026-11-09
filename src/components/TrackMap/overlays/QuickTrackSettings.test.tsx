import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("shows ring options without 2D or 3D-only controls", () => {
    open("ring");
    expect(screen.getByRole("switch", { name: "Space by lap time" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "Anticlockwise" }));
    expect(useSettings.getState().mapRingReverse).toBe(true);
    expect(screen.queryByRole("switch", { name: "Terrain" })).not.toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Driver heatmap" })).not.toBeInTheDocument();
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
    open();
    fireEvent.blur(screen.getByRole("button", { name: "Close quick track settings" }), { relatedTarget: document.body });
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
