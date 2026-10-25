import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { HowItWorksModal } from "@/components/HowItWorksModal/HowItWorksModal";

const state = vi.hoisted(() => ({
  isHelpOpen: false,
  closeHelp: vi.fn(),
  openTour: vi.fn(),
}));

vi.mock("@/stores/settings", () => ({
  useSettings: () => ({
    isHelpOpen: state.isHelpOpen,
    closeHelp: state.closeHelp,
    openTour: state.openTour,
  }),
}));

function CurrentUrl() {
  const { pathname, search } = useLocation();
  return <div data-testid="url">{pathname + search}</div>;
}

function render(ui: ReactElement, path = "/") {
  return rtlRender(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <>
              {ui}
              <CurrentUrl />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("HowItWorksModal", () => {
  beforeEach(() => {
    state.isHelpOpen = false;
    state.closeHelp.mockReset();
    state.openTour.mockReset();
  });

  it("starts the tour from the replay page", () => {
    state.isHelpOpen = true;
    render(<HowItWorksModal />, "/?session=9165");
    fireEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    expect(state.closeHelp).toHaveBeenCalledTimes(1);
    expect(state.openTour).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("url")).toHaveTextContent("/?session=9165");
  });

  it("goes back to the replay page for the tour, keeping the session", () => {
    state.isHelpOpen = true;
    render(<HowItWorksModal />, "/telemetry?year=2026&session=9165");
    fireEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    expect(state.openTour).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("url")).toHaveTextContent(
      "/?year=2026&session=9165",
    );
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

    expect(screen.getByRole("heading", { name: /Timing Colours/ })).toBeInTheDocument();
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

    expect(screen.getByRole("heading", { name: /Track Flags & Status/ })).toBeInTheDocument();
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

  it("explains the 3D map cameras and TV mode", () => {
    state.isHelpOpen = true;
    render(<HowItWorksModal />);
    expect(screen.getByRole("heading", { name: /3D Track Map/ })).toBeInTheDocument();
    expect(screen.getByText("TV Mode")).toBeInTheDocument();
    expect(screen.getByText(/auto-director cuts between overtakes/)).toBeInTheDocument();
  });

  it("labels the dialog and lists every section in the contents", () => {
    state.isHelpOpen = true;
    render(<HowItWorksModal />);
    expect(
      screen.getByRole("dialog", { name: "How It Works" }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", { name: "Guide sections" });
    expect(nav).toHaveTextContent("Keyboard Shortcuts");
    fireEvent.click(screen.getByRole("button", { name: /Keyboard Shortcuts/ }));
  });
});
