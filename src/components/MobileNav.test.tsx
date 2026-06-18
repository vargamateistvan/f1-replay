import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MobileNav } from "@/components/MobileNav";

const mobileNavState = vi.hoisted(() => ({
  searchParams: new URLSearchParams("year=2025&meeting=22"),
  location: { pathname: "/" },
  navigate: vi.fn(),
  openHelp: vi.fn(),
  view: "tracker",
  setView: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useSearchParams: () => [mobileNavState.searchParams, vi.fn()],
  useLocation: () => mobileNavState.location,
  useNavigate: () => mobileNavState.navigate,
}));

vi.mock("@/stores/settings", () => ({
  useSettings: (selector: ((state: { openHelp: () => void }) => unknown) | undefined) => {
    const store = { openHelp: mobileNavState.openHelp };
    return selector ? selector(store) : store;
  },
}));

vi.mock("@/hooks/useSearchParamState", () => ({
  useStringParam: () => [mobileNavState.view, mobileNavState.setView],
}));

describe("MobileNav", () => {
  beforeEach(() => {
    mobileNavState.searchParams = new URLSearchParams("year=2025&meeting=22");
    mobileNavState.location = { pathname: "/" };
    mobileNavState.navigate.mockReset();
    mobileNavState.openHelp.mockReset();
    mobileNavState.setView.mockReset();
    mobileNavState.view = "tracker";
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
  });

  it("navigates to view links and keeps existing query params", () => {
    render(<MobileNav />);

    fireEvent.click(screen.getByRole("button", { name: /Tracker/ }));
    expect(mobileNavState.navigate).toHaveBeenCalledWith("/?year=2025&meeting=22&view=tracker");

    fireEvent.click(screen.getByRole("button", { name: /Feeds/ }));
    expect(mobileNavState.navigate).toHaveBeenCalledWith("/?year=2025&meeting=22&view=commentary");
  });

  it("toggles More panel and triggers help action", () => {
    render(<MobileNav />);

    fireEvent.click(screen.getByRole("button", { name: /More/ }));
    expect(screen.getByRole("button", { name: "Telemetry" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(mobileNavState.openHelp).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Telemetry" })).not.toBeInTheDocument();
  });

  it("forces leaderboard view back to tracker on mobile main route", () => {
    mobileNavState.view = "leaderboard";
    render(<MobileNav />);
    expect(mobileNavState.setView).toHaveBeenCalledWith("tracker");
  });
});
