import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DriverEndLabels } from "@/components/RaceChart/DriverEndLabels";
import type { Driver } from "@/api/types";

const drivers = [
  { driver_number: 1, name_acronym: "VER", team_colour: "3671C6" },
  { driver_number: 16, name_acronym: "LEC", team_colour: "E8002D" },
] as unknown as Driver[];

const RealResizeObserver = globalThis.ResizeObserver;

function stubHeight(height: number) {
  globalThis.ResizeObserver = class {
    constructor(private readonly cb: (entries: ResizeObserverEntry[], ro: ResizeObserver) => void) {}
    observe() {
      this.cb([{ contentRect: { height } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

afterEach(() => {
  globalThis.ResizeObserver = RealResizeObserver;
});

describe("DriverEndLabels", () => {
  it("places labels on the value scale, then hovers and selects them", () => {
    stubHeight(120);
    const onHover = vi.fn();
    const onSelect = vi.fn();
    render(
      <DriverEndLabels
        labels={[
          { driverNumber: 16, value: 2 },
          { driverNumber: 1, value: 1 },
        ]}
        drivers={drivers}
        domain={[1, 2]}
        plotTop={10}
        plotBottom={10}
        highlight={1}
        onHover={onHover}
        onSelect={onSelect}
        widthPx={40}
      />,
    );

    const ver = screen.getByRole("button", { name: "Focus VER" });
    const lec = screen.getByRole("button", { name: "Focus LEC" });
    expect(ver).toHaveStyle({ top: "10px" });
    expect(lec).toHaveStyle({ top: "110px" });
    expect(lec.className).toContain("opacity-35");
    expect(ver.className).not.toContain("opacity-35");

    fireEvent.mouseEnter(lec);
    expect(onHover).toHaveBeenCalledWith(16);
    fireEvent.click(lec);
    expect(onSelect).toHaveBeenCalledWith(16);
  });

  it("renders nothing until the column has a height", () => {
    stubHeight(0);
    render(
      <DriverEndLabels
        labels={[{ driverNumber: 1, value: 1 }]}
        drivers={drivers}
        domain={[1, 2]}
        plotTop={10}
        plotBottom={10}
        highlight={null}
        widthPx={40}
      />,
    );
    expect(screen.queryByText("VER")).not.toBeInTheDocument();
  });
});
