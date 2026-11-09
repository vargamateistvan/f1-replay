import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import Home from "./Home";
import { useSettings } from "@/stores/settings";

const mockTrackEvent = vi.fn();
vi.mock("@/lib/analytics", () => ({
  trackEvent: (...args: unknown[]) => mockTrackEvent(...args),
}));
vi.mock("@/hooks/useReleaseDate", () => ({
  useReleaseDate: () => "2026-09-20T10:00:00Z",
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function setup(search = "") {
  return render(
    <MemoryRouter initialEntries={[`/home${search}`]}>
      <Routes>
        <Route path="/home" element={<Home />} />
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Home page", () => {
  afterEach(() => {
    mockTrackEvent.mockClear();
    useSettings.setState({ isTourOpen: false, isHelpOpen: false, isOpen: false });
  });

  it("introduces the app with a link straight into the driver tracker", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("F1|Replay");
    expect(screen.getByRole("link", { name: "Open Driver Tracker" })).toHaveAttribute(
      "href",
      "/?view=tracker",
    );
  });

  it("links every feature page, keeping the selected session", () => {
    setup("?year=2025&meeting=22&session=202&view=leaderboard");
    const features = screen.getByRole("region", { name: "Features" });
    const hrefs = within(features)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/?year=2025&meeting=22&session=202&view=tracker",
      "/?year=2025&meeting=22&session=202&view=leaderboard",
      "/?year=2025&meeting=22&session=202&view=commentary",
      "/telemetry?year=2025&meeting=22&session=202",
      "/schedule?year=2025&meeting=22&session=202",
      "/standings?year=2025&meeting=22&session=202",
    ]);
  });

  it("tracks feature clicks", () => {
    setup();
    fireEvent.click(screen.getByRole("link", { name: /Telemetry/ }));
    expect(mockTrackEvent).toHaveBeenCalledWith("home_link_clicked", {
      destination: "telemetry",
    });
    expect(screen.getByTestId("location")).toHaveTextContent("/telemetry");
  });

  it("asks for support with external links that open in a new tab", () => {
    setup();
    const support = screen.getByRole("region", { name: "Keep F1 Replay on track" });
    const coffee = within(support).getByRole("link", { name: "Buy me a coffee" });
    expect(coffee).toHaveAttribute("href", "https://buymeacoffee.com/matt_varga");
    expect(coffee).toHaveAttribute("target", "_blank");
    expect(coffee.getAttribute("rel")).toContain("noopener");
    expect(within(support).getByRole("link", { name: "Star on GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/vargamateistvan/f1-replay",
    );
    fireEvent.click(coffee);
    expect(mockTrackEvent).toHaveBeenCalledWith("home_support_clicked", { target: "coffee" });
  });

  it("includes the About information on the Home page", () => {
    setup();

    expect(
      screen.getByRole("heading", { name: "About F1 Replay" }),
    ).toBeInTheDocument();
    expect(screen.getByText("dev")).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "OpenF1 API" })).toHaveAttribute(
      "href",
      "https://openf1.org/",
    );
    expect(screen.getByRole("link", { name: "Release notes" })).toHaveAttribute(
      "href",
      "https://github.com/vargamateistvan/f1-replay/releases",
    );
    expect(screen.getByRole("link", { name: "Security" })).toHaveAttribute(
      "href",
      "/.well-known/security.txt",
    );
  });

  it("starts the tour on the replay page", () => {
    setup("?year=2025");
    fireEvent.click(screen.getByRole("button", { name: "Take the tour" }));
    expect(useSettings.getState().isTourOpen).toBe(true);
    expect(screen.getByTestId("location")).toHaveTextContent("/?year=2025&view=tracker");
    expect(mockTrackEvent).toHaveBeenCalledWith("tour_started", { source: "home" });
  });

  it("opens help and settings", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "How it works" }));
    expect(useSettings.getState().isHelpOpen).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(useSettings.getState().isOpen).toBe(true);
  });
});
