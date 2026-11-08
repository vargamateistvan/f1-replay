import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TrackControls } from "./TrackControls";

vi.mock("@/lib/motion", () => ({ animateMotion: vi.fn(), pressMotion: vi.fn() }));

const handlers = () => ({
  onRotateLeft: vi.fn(),
  onRotateRight: vi.fn(),
  onZoomOut: vi.fn(),
  onZoomIn: vi.fn(),
  onResetView: vi.fn(),
  onSnapshot: vi.fn(),
  onOpenSettings: vi.fn(),
  onEnter3d: vi.fn(),
  onEnterRing: vi.fn(),
});

describe("TrackControls", () => {
  it("adds quick settings without replacing the gear, even with controls hidden", () => {
    const h = handlers();
    render(<TrackControls showTrackControls={false} {...h} quickSettingsView="2d" />);
    expect(screen.getByRole("button", { name: "Quick track settings" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Track map settings" }));
    expect(h.onOpenSettings).toHaveBeenCalledOnce();
  });

  it("keeps the accessible weather toggle beside the view switch with controls hidden", () => {
    const onToggleWeather = vi.fn();
    const { rerender } = render(
      <TrackControls showTrackControls={false} {...handlers()} onToggleWeather={onToggleWeather} weatherEffectsOn />,
    );
    const button = screen.getByRole("button", { name: "Weather effects" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(onToggleWeather).toHaveBeenCalledOnce();
    rerender(<TrackControls showTrackControls={false} {...handlers()} onToggleWeather={onToggleWeather} />);
    expect(screen.getByRole("button", { name: "Weather effects" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows one toolbar with view switch, rotate, zoom/fit, snapshot and settings", () => {
    const h = handlers();
    render(<TrackControls showTrackControls {...h} />);
    expect(screen.getByRole("toolbar", { name: "Track map controls" })).toHaveClass(
      "bg-surface/70", "backdrop-blur-sm",
    );
    for (const [label, fn] of [
      ["Switch to 3D map", h.onEnter3d],
      ["Switch to ring view (lap progress)", h.onEnterRing],
      ["Rotate left", h.onRotateLeft],
      ["Rotate right", h.onRotateRight],
      ["Zoom out", h.onZoomOut],
      ["Fit track", h.onResetView],
      ["Zoom in", h.onZoomIn],
      ["Download map snapshot as PNG", h.onSnapshot],
      ["Track map settings", h.onOpenSettings],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(fn).toHaveBeenCalledTimes(1);
    }
  });

  it("keeps the view switch, snapshot and settings when track controls are off", () => {
    render(<TrackControls showTrackControls={false} {...handlers()} />);
    expect(screen.getByRole("button", { name: "Switch to 3D map" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Switch to ring view (lap progress)" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Download map snapshot as PNG" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Track map settings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Zoom in" })).not.toBeInTheDocument();
  });

  it("flags a modified view on the fit button and disables snapshot without cars", () => {
    render(
      <TrackControls
        showTrackControls
        {...handlers()}
        viewModified
        snapshotDisabled
      />,
    );
    expect(
      screen.getByRole("button", { name: "Fit track (reset zoom and rotation)" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Snapshot available once cars are on track" }),
    ).toBeDisabled();
  });

  it("renders nothing when there is nothing to show", () => {
    const { container } = render(
      <TrackControls
        showTrackControls={false}
        onRotateLeft={vi.fn()}
        onRotateRight={vi.fn()}
        onZoomOut={vi.fn()}
        onZoomIn={vi.fn()}
        onResetView={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
