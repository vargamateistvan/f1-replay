import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TOUR_VERSION } from "@/constants";
import { useSettings } from "@/stores/settings";
import { AppTour } from "./AppTour";
import { TOUR_TARGET } from "./targets";
import type { TourContext } from "./steps";

const { trackEvent } = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ trackEvent }));

const desktop: TourContext = { isCompact: false, isRace: true, hasMapModes: true };

function renderTour() {
  return render(
    <>
      {Object.values(TOUR_TARGET).map((id) => (
        <div key={id} data-tour={id}>
          {id}
        </div>
      ))}
      <AppTour context={desktop} />
    </>,
  );
}

describe("AppTour", () => {
  beforeEach(() => {
    useSettings.setState({ tourSeenVersion: 0, isTourOpen: true });
    trackEvent.mockReset();
  });

  it("starts on the welcome step", async () => {
    renderTour();
    expect(await screen.findByText("Welcome to F1 Replay")).toBeInTheDocument();
    expect(screen.getByText("1 / 8")).toBeInTheDocument();
  });

  it("steps forward and back", async () => {
    renderTour();
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(await screen.findByText("Pick a session")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByText("Welcome to F1 Replay")).toBeInTheDocument();
  });

  it("marks the tour as seen when skipped", async () => {
    renderTour();
    fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("button", { name: "Skip tour" }));
    await waitFor(() => expect(useSettings.getState().isTourOpen).toBe(false));
    expect(useSettings.getState().tourSeenVersion).toBe(TOUR_VERSION);
    expect(trackEvent).toHaveBeenCalledWith("tour_step_viewed", {
      step: "session-picker",
      index: 1,
    });
    expect(trackEvent).toHaveBeenCalledWith("tour_skipped", {
      step: "session-picker",
      index: 1,
    });
  });

  it("skips on Escape", async () => {
    renderTour();
    await screen.findByText("Welcome to F1 Replay");
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(useSettings.getState().isTourOpen).toBe(false));
    expect(useSettings.getState().tourSeenVersion).toBe(TOUR_VERSION);
  });

  it("marks the tour as seen when finished", async () => {
    renderTour();
    for (let i = 0; i < 7; i++) {
      fireEvent.click(await screen.findByRole("button", { name: "Next" }));
    }
    fireEvent.click(await screen.findByRole("button", { name: "Done" }));
    await waitFor(() => expect(useSettings.getState().isTourOpen).toBe(false));
    expect(useSettings.getState().tourSeenVersion).toBe(TOUR_VERSION);
    expect(trackEvent).toHaveBeenCalledWith("tour_completed");
    expect(trackEvent).not.toHaveBeenCalledWith("tour_skipped", expect.anything());
  });
});
