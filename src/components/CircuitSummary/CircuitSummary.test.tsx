import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CircuitGeometry } from "@/data/circuitGeometryTypes";
import melbourne from "@/data/circuit-geometry/10-2025.json";
import { useSettings } from "@/stores/settings";
import { CircuitSummary } from "./CircuitSummary";

const mockUseCircuitGeometry = vi.fn();
vi.mock("@/hooks/useCircuitGeometry", () => ({
  useCircuitGeometry: (...args: unknown[]) => mockUseCircuitGeometry(...args),
}));

const meeting = {
  circuit_key: 10,
  circuit_short_name: "Melbourne",
  circuit_type: "Temporary - Street",
} as const;

describe("CircuitSummary", () => {
  beforeEach(() => {
    useSettings.setState({ metricSystem: "metric" });
  });

  it("draws the outline and lists facts from the baked geometry", () => {
    mockUseCircuitGeometry.mockReturnValue({
      data: melbourne as CircuitGeometry,
      isPending: false,
    });
    render(<CircuitSummary meeting={meeting} year={2025} />);
    expect(mockUseCircuitGeometry).toHaveBeenCalledWith(10, 2025);
    expect(screen.getByRole("img", { name: "Melbourne track outline" })).toBeTruthy();
    expect(screen.getByText(/^5\.2\d km$/)).toBeTruthy();
    expect(screen.getByText("14")).toBeTruthy();
    expect(screen.getByText("Clockwise")).toBeTruthy();
    expect(screen.getByText("Street")).toBeTruthy();
    expect(screen.getByText("20.8s · SC 13.2s")).toBeTruthy();
  });

  it("converts length to miles for imperial users", () => {
    useSettings.setState({ metricSystem: "imperial" });
    mockUseCircuitGeometry.mockReturnValue({
      data: melbourne as CircuitGeometry,
      isPending: false,
    });
    render(<CircuitSummary meeting={meeting} year={2025} />);
    expect(screen.getByText(/^3\.2\d mi$/)).toBeTruthy();
  });

  it("falls back to the meeting's circuit type without geometry", () => {
    mockUseCircuitGeometry.mockReturnValue({ data: null, isPending: false });
    render(<CircuitSummary meeting={meeting} year={2025} />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Street")).toBeTruthy();
    expect(screen.queryByText("Length")).toBeNull();
  });
});
