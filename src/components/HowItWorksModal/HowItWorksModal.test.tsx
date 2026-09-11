import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HowItWorksModal } from "@/components/HowItWorksModal/HowItWorksModal";

const state = vi.hoisted(() => ({
  isHelpOpen: false,
  closeHelp: vi.fn(),
}));

vi.mock("@/stores/settings", () => ({
  useSettings: () => ({
    isHelpOpen: state.isHelpOpen,
    closeHelp: state.closeHelp,
  }),
}));

describe("HowItWorksModal", () => {
  beforeEach(() => {
    state.isHelpOpen = false;
    state.closeHelp.mockReset();
  });

  it("is hidden when help is closed", () => {
    render(<HowItWorksModal />);
    expect(screen.queryByText("How It Works")).not.toBeInTheDocument();
  });

  it("supports close via header button and escape", () => {
    state.isHelpOpen = true;
    render(<HowItWorksModal />);

    fireEvent.click(screen.getByRole("button", { name: "Close help" }));
    expect(state.closeHelp).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(state.closeHelp).toHaveBeenCalledTimes(2);
  });

  it("explains live timing colors", () => {
    state.isHelpOpen = true;
    render(<HowItWorksModal />);

    expect(screen.getByText("🎨 Timing Colours")).toBeInTheDocument();
    expect(
      screen.getByText(
        /absolute fastest time recorded by any driver/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/personal best time for that specific driver/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/slower than that specific driver's personal best/i),
    ).toBeInTheDocument();
  });

  it("explains track flags and status indicators", () => {
    state.isHelpOpen = true;
    render(<HowItWorksModal />);

    expect(screen.getByText("🚩 Track Flags & Status")).toBeInTheDocument();
    expect(
      screen.getByText(/hazard on track; slow down and no overtaking/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/drivers must follow a regulated delta time/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/session or race is complete/i),
    ).toBeInTheDocument();
  });
});
