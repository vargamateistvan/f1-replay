import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import type uPlot from "uplot";
import { TelemetryChart } from "@/components/TelemetryChart/TelemetryChart";
import { TOKEN_HEX } from "@/designTokens";

const uPlotState = vi.hoisted(() => ({
  instances: [] as Array<{
    scales: { x: { min: number; max: number } };
    setScaleCalls: Array<{ min: number; max: number }>;
    setCursorIndex: (idx: number | null) => void;
    options: uPlot.Options;
  }>,
}));

vi.mock("uplot", () => {
  class UPlotMock {
    static pxRatio = 2;
    static rangeNum(min: number, max: number) {
      return [min, max];
    }
    bbox = { left: 80, width: 400 };
    scales = { x: { min: 0, max: 100 } };
    cursor: { idx: number | null } = { idx: null };
    hooks: { setScale?: Array<() => void>; setCursor?: Array<(plot: UPlotMock) => void> } = {};
    setScaleCalls: Array<{ min: number; max: number }> = [];
    options: uPlot.Options;

    constructor(opts: uPlot.Options, data: unknown[]) {
      this.options = opts;
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

    setCursorIndex(idx: number | null) {
      this.cursor.idx = idx;
      for (const hook of this.hooks.setCursor ?? []) hook(this);
    }

    destroy() {}
  }

  return {
    default: UPlotMock,
  };
});

describe("TelemetryChart", () => {
  beforeEach(() => {
    uPlotState.instances.length = 0;
  });

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
        cornerMarkers={[{ label: "1", distance: 50 }]}
        showCornerAxis
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Pan left" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    fireEvent.click(screen.getByRole("button", { name: "Pan right" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset zoom" }));

    const controls = screen.getByText("Zoom").closest("div");
    const chartArea = controls?.nextElementSibling as HTMLElement;
    act(() => uPlotState.instances[0]!.setCursorIndex(1));
    expect(onHoverX).toHaveBeenLastCalledWith(50);
    act(() => uPlotState.instances[0]!.setCursorIndex(null));

    expect(onHoverX).toHaveBeenCalled();
    expect(onHoverX).toHaveBeenLastCalledWith(null);
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(uPlotState.instances.length).toBeGreaterThan(0);
    expect(uPlotState.instances[0]!.setScaleCalls.length).toBeGreaterThan(0);

    fireEvent.doubleClick(chartArea);
    expect(container).toBeTruthy();
  });

  it("uses the plot cursor for hover and CSS pixels for corner markers on high-density displays", () => {
    const onHoverX = vi.fn();
    render(
      <TelemetryChart
        title="Delta"
        xData={[0, 50, 100]}
        series={[{ label: "Delta", color: "#e8002d", data: [0, 1, 2] }]}
        onHoverX={onHoverX}
        cornerMarkers={[{ label: "1", distance: 50 }]}
        showCornerAxis
      />,
    );

    expect(screen.getByText("1")).toHaveStyle({ left: "140px" });
    act(() => uPlotState.instances[0]!.setCursorIndex(1));
    const chartArea = screen.getByText("1").parentElement!.previousElementSibling!;
    fireEvent.mouseMove(chartArea, { clientX: 140 });
    expect(onHoverX).toHaveBeenLastCalledWith(50);
    act(() => uPlotState.instances[0]!.setCursorIndex(null));
    expect(onHoverX).toHaveBeenLastCalledWith(null);
  });

  it("shades each delta comparison by the leading driver and highlights zero", () => {
    render(
      <TelemetryChart
        title="Delta"
        xData={[0, 50, 100]}
        series={[
          { label: "B", color: "#123456", data: [0, 1, -1] },
          { label: "C", color: "#654321", data: [0, -1, 1] },
        ]}
        deltaReferenceColor="#abcdef"
      />,
    );

    const options = uPlotState.instances[0]!.options;
    const legendFill = options.legend?.markers?.fill;
    expect(typeof legendFill).toBe("function");
    if (typeof legendFill !== "function") throw new Error("Missing legend color");
    expect(legendFill({} as uPlot, 1)).toBe("#123456");
    const addColorStop = vi.fn();
    const ctx = {
      createLinearGradient: vi.fn(() => ({ addColorStop })),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };
    const plot = {
      bbox: { left: 80, top: 20, width: 400, height: 200 },
      ctx,
      valToPos: vi.fn(() => 120),
    } as unknown as uPlot;
    const range = options.scales!.y!.range;
    expect(typeof range).toBe("function");
    if (typeof range !== "function") throw new Error("Missing delta range");
    expect(range(plot, 1, 2, "y")).toEqual([0, 2]);
    expect(range(plot, -2, -1, "y")).toEqual([-2, 0]);

    for (const [index, color] of [[1, "#12345633"], [2, "#65432133"]] as const) {
      addColorStop.mockClear();
      const fill = options.series[index]!.fill;
      expect(typeof fill).toBe("function");
      if (typeof fill !== "function") throw new Error("Missing delta fill");
      fill(plot, index);
      expect(addColorStop.mock.calls).toEqual([
        [0, color],
        [0.5, color],
        [0.5, "#abcdef33"],
        [1, "#abcdef33"],
      ]);
      expect(options.series[index]!.fillTo).toBe(0);
    }

    options.hooks!.drawAxes![0]!(plot);
    expect(ctx.moveTo).toHaveBeenCalledWith(80, 120);
    expect(ctx.lineTo).toHaveBeenCalledWith(480, 120);
    expect(ctx.stroke).toHaveBeenCalledOnce();
  });

  it("uses distinct delta colors when drivers share a team color", () => {
    render(
      <TelemetryChart
        title="Delta"
        xData={[0, 100]}
        series={[
          { label: "B", color: "#ABCDEF", data: [0, 1] },
          { label: "C", color: "#abcdef", data: [0, -1] },
        ]}
        deltaReferenceColor="#abcdef"
      />,
    );

    const options = uPlotState.instances[0]!.options;
    expect(options.series[1]!.stroke).toBe(TOKEN_HEX.f1red);
    expect(options.series[2]!.stroke).toBe(TOKEN_HEX.blue);
    expect(screen.getByTitle("B series").querySelector("span"))
      .toHaveStyle({ backgroundColor: TOKEN_HEX.f1red });
  });

  it("syncs x zoom between chart instances", () => {
    render(
      <>
        <TelemetryChart
          title="Speed"
          xData={[0, 50, 100, 150]}
          series={[
            { label: "VER", color: "#e8002d", data: [100, 150, 140, 130] },
          ]}
          interactiveControls
        />
        <TelemetryChart
          title="Throttle"
          xData={[0, 50, 100, 150]}
          series={[{ label: "NOR", color: "#ff8800", data: [80, 70, 60, 55] }]}
          interactiveControls
        />
      </>,
    );

    const zoomInButtons = screen.getAllByRole("button", { name: "Zoom in" });
    fireEvent.click(zoomInButtons[0]!);

    expect(uPlotState.instances.length).toBe(2);
    expect(uPlotState.instances[0]!.setScaleCalls.length).toBeGreaterThan(0);
    expect(uPlotState.instances[1]!.setScaleCalls.length).toBeGreaterThan(0);

    const srcLast =
      uPlotState.instances[0]!.setScaleCalls[
        uPlotState.instances[0]!.setScaleCalls.length - 1
      ]!;
    const dstLast =
      uPlotState.instances[1]!.setScaleCalls[
        uPlotState.instances[1]!.setScaleCalls.length - 1
      ]!;

    expect(dstLast.min).toBe(srcLast.min);
    expect(dstLast.max).toBe(srcLast.max);
  });

  it("renders every corner speed class in the chart key", () => {
    render(
      <TelemetryChart
        title="Speed"
        xData={[0, 50, 100, 150]}
        series={[
          { label: "VER", color: "#e8002d", data: [100, 150, 140, 130] },
        ]}
        cornerZones={[
          {
            key: "turn-1",
            labels: ["1"],
            apexes: [50],
            startDistance: 25,
            endDistance: 75,
            speedClass: "low",
            minSpeed: 100,
          },
        ]}
        showCornerZoneLabels
      />,
    );

    expect(screen.getByText("Low speed")).toBeInTheDocument();
    expect(screen.getByText("Medium speed")).toBeInTheDocument();
    expect(screen.getByText("High speed")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("limits the chart key to the given corner speed classes", () => {
    render(
      <TelemetryChart
        title="Speed"
        xData={[0, 50, 100, 150]}
        series={[
          { label: "VER", color: "#e8002d", data: [100, 150, 140, 130] },
        ]}
        cornerZones={[
          {
            key: "turn-1",
            labels: ["1"],
            apexes: [50],
            startDistance: 25,
            endDistance: 75,
            speedClass: "low",
            minSpeed: 100,
          },
        ]}
        cornerSpeedClasses={["low", "high"]}
        showCornerZoneLabels
      />,
    );

    expect(screen.getByText("Low speed")).toBeInTheDocument();
    expect(screen.queryByText("Medium speed")).not.toBeInTheDocument();
    expect(screen.getByText("High speed")).toBeInTheDocument();
  });
});
