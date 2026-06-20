import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TelemetryChart } from "@/components/TelemetryChart/TelemetryChart";

const uPlotState = vi.hoisted(() => ({
  instances: [] as Array<{
    scales: { x: { min: number; max: number } };
    setScaleCalls: Array<{ min: number; max: number }>;
  }>,
}));

vi.mock("uplot", () => {
  class UPlotMock {
    bbox = { left: 0, width: 200 };
    scales = { x: { min: 0, max: 100 } };
    hooks: { setScale?: Array<() => void> } = {};
    setScaleCalls: Array<{ min: number; max: number }> = [];

    constructor(_opts: unknown, data: unknown[]) {
      const x = (data[0] as Float64Array | number[]) ?? [];
      const min = Number((x as ArrayLike<number>)[0] ?? 0);
      const max = Number((x as ArrayLike<number>)[x.length - 1] ?? 100);
      this.scales.x = { min, max };
      uPlotState.instances.push(this);
    }

    setScale(_key: string, value: { min: number; max: number }) {
      this.scales.x = { min: value.min, max: value.max };
      this.setScaleCalls.push(value);
      for (const hook of this.hooks.setScale ?? []) hook();
    }

    setSize() {}

    destroy() {}
  }

  return {
    default: UPlotMock,
  };
});

describe("TelemetryChart", () => {
  it("covers no-data and interactive controls", () => {
    const onHoverX = vi.fn();
    const { container, rerender } = render(
      <TelemetryChart title="Speed" xData={[]} series={[]} height={160} />,
    );

    expect(screen.getByText("No data found")).toBeInTheDocument();

    rerender(
      <TelemetryChart
        title="Speed"
        xData={[0, 50, 100, 150]}
        series={[
          { label: "VER", color: "#e8002d", data: [100, 150, 140, 130] },
        ]}
        interactiveControls
        onHoverX={onHoverX}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Pan left" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Pan right" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));

    const controls = screen.getByText("Zoom").closest("div");
    const chartArea = controls?.nextElementSibling as HTMLElement;
    fireEvent.mouseMove(chartArea, { clientX: 50, clientY: 10 });
    fireEvent.mouseLeave(chartArea);

    expect(onHoverX).toHaveBeenCalled();
    expect(onHoverX).toHaveBeenLastCalledWith(null);
    expect(uPlotState.instances.length).toBeGreaterThan(0);
    expect(uPlotState.instances[0]!.setScaleCalls.length).toBeGreaterThan(0);

    fireEvent.doubleClick(chartArea);
    expect(container).toBeTruthy();
  });
});
