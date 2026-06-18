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
});
