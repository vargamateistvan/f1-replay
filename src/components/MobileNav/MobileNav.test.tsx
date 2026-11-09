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
  useSettings: (
    selector: ((state: { openHelp: () => void }) => unknown) | undefined,
  ) => {
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

  it("navigates to replay views and keeps existing query params", () => {
    render(<MobileNav />);

    fireEvent.click(screen.getByRole("button", { name: /Replay/ }));
    expect(mobileNavState.navigate).toHaveBeenCalledWith(
      "/?year=2025&meeting=22&view=tracker",
    );

    fireEvent.click(screen.getByRole("button", { name: /Feeds/ }));
    expect(mobileNavState.navigate).toHaveBeenCalledWith(
      "/?year=2025&meeting=22&view=commentary",
    );
  });

  it("navigates to standings and schedule while keeping existing query params", () => {
    render(<MobileNav />);

    fireEvent.click(screen.getByRole("button", { name: /Standings/ }));
    expect(mobileNavState.navigate).toHaveBeenCalledWith(
      "/standings?year=2025&meeting=22",
    );

    fireEvent.click(screen.getByRole("button", { name: /Schedule/ }));
    expect(mobileNavState.navigate).toHaveBeenCalledWith(
      "/schedule?year=2025&meeting=22",
    );
  });

  it("keeps telemetry accessible from More", () => {
    render(<MobileNav />);

    fireEvent.click(screen.getByRole("button", { name: /More/ }));
    fireEvent.click(screen.getByRole("button", { name: "Telemetry" }));

    expect(mobileNavState.navigate).toHaveBeenCalledWith(
      "/telemetry?year=2025&meeting=22",
    );
  });

  it("toggles More panel and triggers help action", () => {
    render(<MobileNav />);

    fireEvent.click(screen.getByRole("button", { name: /More/ }));
    expect(
      screen.getByRole("button", { name: "Telemetry" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(mobileNavState.openHelp).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole("button", { name: "Telemetry" }),
    ).not.toBeInTheDocument();
  });

  it("navigates to Home & About from More", () => {
    render(<MobileNav />);

    fireEvent.click(screen.getByRole("button", { name: /More/ }));
    fireEvent.click(screen.getByRole("button", { name: "Home & About" }));
    expect(mobileNavState.navigate).toHaveBeenCalledWith(
      "/home?year=2025&meeting=22",
    );
  });

  it("forces leaderboard view back to tracker on mobile main route", () => {
    mobileNavState.view = "leaderboard";
    render(<MobileNav />);
    expect(mobileNavState.setView).toHaveBeenCalledWith("tracker");
  });

  it("normalizes invalid view params back to tracker on mobile main route", () => {
    mobileNavState.view = "invalid";
    render(<MobileNav />);
    expect(mobileNavState.setView).toHaveBeenCalledWith("tracker");
  });
});
