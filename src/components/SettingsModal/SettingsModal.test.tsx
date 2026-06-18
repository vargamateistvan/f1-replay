import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SettingsModal } from "@/components/SettingsModal/SettingsModal";

const state = vi.hoisted(() => ({
  isOpen: false,
  closeModal: vi.fn(),
}));

vi.mock("@/stores/settings", () => ({
  useSettings: () => ({
    isOpen: state.isOpen,
    closeModal: state.closeModal,
  }),
}));

vi.mock("@/components/SettingsModal/SettingsControls", () => ({
  SettingsBody: () => <div>Settings body stub</div>,
}));

describe("SettingsModal", () => {
  beforeEach(() => {
    state.isOpen = false;
    state.closeModal.mockReset();
  });

  it("is hidden when modal is closed", () => {
    render(<SettingsModal />);
    expect(screen.queryByText("Settings")).not.toBeInTheDocument();
  });

  it("supports close via button, backdrop, and escape", () => {
    state.isOpen = true;
    const { container } = render(<SettingsModal />);

    expect(screen.getByText("Settings body stub")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close settings" }));
    expect(state.closeModal).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(state.closeModal).toHaveBeenCalledTimes(2);

    fireEvent.click(container.firstChild as HTMLElement);
    expect(state.closeModal).toHaveBeenCalledTimes(3);
  });
});
