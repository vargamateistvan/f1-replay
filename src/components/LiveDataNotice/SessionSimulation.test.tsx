import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCircuitGeometry } from "@/hooks/useCircuitGeometry";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { SESSION_SIMULATION_CARS } from "@/constants";
import { SessionSimulation } from "./SessionSimulation";

vi.mock("@/hooks/useCircuitGeometry", () => ({ useCircuitGeometry: vi.fn() }));
vi.mock("@/hooks/useMediaQuery", () => ({ useMediaQuery: vi.fn() }));

const session = { circuit_key: 65, year: 2026, circuit_short_name: "Mexico City" };

describe("SessionSimulation", () => {
  beforeEach(() => {
    vi.mocked(useMediaQuery).mockReturnValue(false);
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
    const animations = container.querySelectorAll("animateMotion");
    expect(animations).toHaveLength(SESSION_SIMULATION_CARS);
    expect(animations[0]).toHaveAttribute("repeatCount", "indefinite");
    const cars = container.querySelectorAll("[data-simulation-car]");
    expect(cars).toHaveLength(SESSION_SIMULATION_CARS);
    expect(new Set([...animations].map((animation) => animation.getAttribute("path"))).size).toBe(1);
    expect(new Set([...animations].map((animation) => animation.getAttribute("begin"))).size)
      .toBe(SESSION_SIMULATION_CARS);
    for (const animation of animations) expect(animation).toHaveAttribute("rotate", "auto");
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("keeps a static track and cars when reduced motion is requested", () => {
    vi.mocked(useMediaQuery).mockReturnValue(true);
    const { container } = render(<SessionSimulation session={session} />);
    expect(container.querySelectorAll("animateMotion")).toHaveLength(0);
    const cars = container.querySelectorAll<SVGGElement>("[data-simulation-car]");
    expect(cars).toHaveLength(SESSION_SIMULATION_CARS);
    expect(new Set([...cars].map((car) => car.style.offsetDistance)).size)
      .toBe(SESSION_SIMULATION_CARS);
  });

  it("omits the simulation when circuit geometry is unavailable", () => {
    vi.mocked(useCircuitGeometry).mockReturnValue({ data: null, isPending: false });
    const { container } = render(<SessionSimulation session={undefined} />);
    expect(container).toBeEmptyDOMElement();
    expect(useCircuitGeometry).toHaveBeenCalledWith(undefined, undefined);
  });
});
