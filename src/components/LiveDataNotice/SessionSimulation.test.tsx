import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCircuitGeometry } from "@/hooks/useCircuitGeometry";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useCachedSimulationDrivers } from "@/hooks/useSession";
import { SESSION_SIMULATION_CARS, SESSION_SIMULATION_SC_FIRST_DELAY_S } from "@/constants";
import type { Driver } from "@/api/types";
import { useSettings } from "@/stores/settings";
import { SessionSimulation } from "./SessionSimulation";

vi.mock("@/hooks/useCircuitGeometry", () => ({ useCircuitGeometry: vi.fn() }));
vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: vi.fn() }));
vi.mock("@/hooks/useSession", () => ({ useCachedSimulationDrivers: vi.fn() }));
vi.mock("@/data/pitLanes", () => ({
  getPitLane: () => ({ x: [5, 50, 95], y: [-5, -5, -5] }),
}));

const session = {
  circuit_key: 65, year: 2026, circuit_short_name: "Mexico City",
  session_key: 11397, date_start: "2026-10-30T12:00:00Z",
};
const driver = (team_colour: string): Driver => ({
  driver_number: 1, broadcast_name: "", full_name: "", name_acronym: "",
  team_name: "", team_colour, first_name: "", last_name: "",
  headshot_url: null, country_code: null, session_key: 11397, meeting_key: 1298,
});

describe("SessionSimulation", () => {
  beforeEach(() => {
    vi.mocked(useMediaQuery).mockReturnValue(false);
    vi.mocked(useCachedSimulationDrivers).mockReturnValue(undefined);
    vi.mocked(useCircuitGeometry).mockReturnValue({
      isPending: false,
      data: {
        circuitKey: 65, circuitName: "Mexico City", year: 2026, rotation: 0,
        x: [0, 100, 100, 0], y: [0, 0, 100, 100],
        corners: [], marshalSectors: [], marshalLights: [],
      },
    });
  });

  it("uses the selected circuit and clearly labels synthetic animation", () => {
    const { container } = render(<SessionSimulation session={session} />);
    expect(useCircuitGeometry).toHaveBeenCalledWith(65, 2026);
    expect(screen.getByText("Mexico City · Simulation · Not live data")).toBeInTheDocument();
    const cars = [...container.querySelectorAll("[data-simulation-car]")];
    expect(cars).toHaveLength(SESSION_SIMULATION_CARS);
    expect(new Set(cars.map((car) => car.getAttribute("transform"))).size)
      .toBe(SESSION_SIMULATION_CARS);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps a static track and cars without a safety car when reduced motion is requested", async () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    const raf = vi.spyOn(window, "requestAnimationFrame");
    const { container } = render(<SessionSimulation session={session} />);
    await act(async () => {});
    expect(raf).not.toHaveBeenCalled();
    expect(container.querySelectorAll("[data-simulation-car]")).toHaveLength(SESSION_SIMULATION_CARS);
    expect(container.querySelector("[data-simulation-safety-car]")).toBeNull();
    raf.mockRestore();
  });

  it("draws the track like the 2D map and keeps the background variant faint", () => {
    useSettings.setState({ mapShowKerbs: false, mapShowSectorMarkers: true });
    const angles = Array.from({ length: 40 }, (_, i) => (i / 40) * Math.PI * 2);
    vi.mocked(useCircuitGeometry).mockReturnValue({
      isPending: false,
      data: {
        circuitKey: 65, circuitName: "Mexico City", year: 2026, rotation: 0,
        x: angles.map((a) => Math.cos(a) * 100), y: angles.map((a) => Math.sin(a) * 60),
        corners: [], marshalSectors: [], marshalLights: [],
      },
    } as unknown as ReturnType<typeof useCircuitGeometry>);
    const { container, rerender } = render(<SessionSimulation session={session} />);
    expect(container.querySelector("svg")).toHaveClass("opacity-40");
    expect(container.querySelector('[data-testid="map-background"]')).not.toBeNull();
    expect(container.querySelector('[data-track-layer="asphalt"]')?.getAttribute("stroke")).toMatch(/^url\(#sim-asphalt-/);
    expect(container.querySelector('[data-sector-marker="S1"]')).not.toBeNull();
    expect(container.querySelector('[data-track-layer="kerbs-red"]')).toBeNull();
    act(() => useSettings.setState({ mapShowKerbs: true, mapShowSectorMarkers: false }));
    rerender(<SessionSimulation session={session} variant="preview" />);
    expect(container.querySelector("svg")).toHaveClass("opacity-100");
    expect(container.querySelector("[data-sector-marker]")).toBeNull();
    expect(container.querySelector('[data-track-layer="kerbs-red"]')).not.toBeNull();
  });

  it("sends a safety car out of the pit lane and announces it", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const frames: ((time: number) => void)[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb));
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const { container } = render(<SessionSimulation session={session} variant="preview" />);
    await waitFor(() => expect(container.querySelector("[data-simulation-pit-lane]")).not.toBeNull());
    const safetyCar = container.querySelector<SVGGElement>("[data-simulation-safety-car]")!;
    expect(safetyCar.style.display).toBe("none");
    const run = (seconds: number) => act(() => {
      for (let i = 0; i < seconds * 10; i++) {
        const cb = frames.pop()!;
        frames.length = 0;
        cb(now);
        now += 100;
      }
    });
    let now = 0;
    run(SESSION_SIMULATION_SC_FIRST_DELAY_S[0] + 1);
    expect(safetyCar.style.display).toBe("");
    expect(screen.getByText("Safety car")).toBeInTheDocument();
    vi.restoreAllMocks();
  });
  it.each([
    [0.5, "yellow", "Yellow flag", "[data-simulation-yellow-zone]"],
    [0.9, "red", "Red flag", "[data-simulation-red-flag]"],
  ])("stages a random %s roll as a %s flag", async (roll, phase, label, overlay) => {
    vi.spyOn(Math, "random").mockReturnValue(roll);
    const frames: ((time: number) => void)[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => frames.push(cb));
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
    const { container } = render(<SessionSimulation session={session} variant="preview" />);
    await waitFor(() => expect(container.querySelector("[data-simulation-pit-lane]")).not.toBeNull());
    expect(container.querySelector(overlay)).toBeNull();
    act(() => {
      for (let now = 0; now <= (SESSION_SIMULATION_SC_FIRST_DELAY_S[1] + 1) * 1000; now += 100) {
        const cb = frames.pop()!;
        frames.length = 0;
        cb(now);
      }
    });
    expect(screen.getByText(label)).toHaveAttribute("data-simulation-flag-banner", phase);
    expect(container.querySelector(overlay)).not.toBeNull();
    expect(container.querySelector<SVGGElement>("[data-simulation-safety-car]")!.style.display).toBe("none");
    vi.restoreAllMocks();
  });

  it.each([false, true])("uses team colours with reduced motion %s", (reducedMotion) => {
    vi.mocked(useMediaQuery).mockReturnValue(reducedMotion);
    vi.mocked(useCachedSimulationDrivers).mockReturnValue([
      driver("123456"), driver("123456"), driver("#ABCDEF"), driver(""),
    ]);
    const { container } = render(<SessionSimulation session={session} />);
    expect(useCachedSimulationDrivers).toHaveBeenCalledWith(session);
    const cars = container.querySelectorAll<SVGGElement>("[data-simulation-car]");
    cars.forEach((car, index) => {
      expect(car).toHaveStyle({
        color: ["#123456", "#ABCDEF"][index % 2],
      });
    });
    expect(new Set([...cars].map((car) => car.style.color)).size)
      .toBe(2);
  });

  it("uses a neutral token when the selected year's team data is unavailable", () => {
    const { container } = render(<SessionSimulation session={session} />);
    const cars = container.querySelectorAll<SVGGElement>("[data-simulation-car]");
    for (const car of cars) {
      expect(car).toHaveClass("text-muted");
      expect(car.style.color).toBe("");
    }
  });

  it.each([false, true])("colours the Home preview without cached drivers with reduced motion %s", (reducedMotion) => {
    vi.mocked(useMediaQuery).mockReturnValue(reducedMotion);
    const { container } = render(<SessionSimulation session={session} variant="preview" />);
    const cars = [...container.querySelectorAll<SVGGElement>("[data-simulation-car]")];
    expect(cars).toHaveLength(SESSION_SIMULATION_CARS);
    expect(cars.every((car) => car.style.color !== "")).toBe(true);
    expect(new Set(cars.map((car) => car.style.color)).size).toBeGreaterThan(1);
  });

  it("prefers cached team colours over the Home preview palette", () => {
    vi.mocked(useCachedSimulationDrivers).mockReturnValue([driver("123456")]);
    const { container } = render(<SessionSimulation session={session} variant="preview" />);
    for (const car of container.querySelectorAll("[data-simulation-car]")) {
      expect(car).toHaveStyle({ color: "#123456" });
    }
  });

  it("omits the simulation when circuit geometry is unavailable", () => {
    vi.mocked(useCircuitGeometry).mockReturnValue({ data: null, isPending: false });
    const { container } = render(<SessionSimulation session={undefined} />);
    expect(container).toBeEmptyDOMElement();
    expect(useCircuitGeometry).toHaveBeenCalledWith(undefined, undefined);
  });
});
