import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TelemetrySample } from "@/hooks/useCarDataForLap";
import type { CornerZone } from "@/utils/corners";
import { X_SYNC_EVENT } from "@/components/TelemetryChart/sync";
import { CornerAnalysis, type CornerAnalysisLap } from "./CornerAnalysis";

function makeLap(minSpeed: number): TelemetrySample[] {
  const speed = (d: number) => {
    if (d < 400 || d > 600) return 300;
    if (d <= 500) return 300 - ((300 - minSpeed) * (d - 400)) / 100;
    return minSpeed + ((300 - minSpeed) * (d - 500)) / 100;
  };
  const out: TelemetrySample[] = [];
  let timeS = 0;
  for (let d = 0; d <= 1000; d += 10) {
    if (d > 0) timeS += 10 / (((speed(d - 10) + speed(d)) / 2) / 3.6);
    out.push({
      distM: d,
      timeS,
      speed: speed(d),
      throttle: d >= 380 && d < 540 ? 0 : 100,
      brake: d >= 380 && d <= 480 ? 100 : 0,
      rpm: 0,
      gear: 0,
      drs: 0,
    });
  }
  return out;
}

const zones: CornerZone[] = [
  {
    key: "corner-zone-1",
    labels: ["1"],
    apexes: [500],
    startDistance: 400,
    endDistance: 600,
    speedClass: "low",
    minSpeed: 100,
  },
];

const laps: CornerAnalysisLap[] = [
  { key: "a", label: "VER", lapNo: 10, color: "#3671C6", samples: makeLap(100), timing: { lapS: null } },
  { key: "b", label: "LEC", lapNo: 12, color: "#E8002D", samples: makeLap(120), timing: { lapS: null } },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CornerAnalysis", () => {
  it("renders nothing without corner zones", () => {
    const { container } = render(
      <CornerAnalysis zones={[]} laps={laps} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows per-corner metrics and the delta versus the reference lap", () => {
    render(<CornerAnalysis zones={zones} laps={laps} />);

    const panel = screen.getByTestId("corner-analysis");
    expect(within(panel).getByText(/Δ vs VER/)).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /T1/ })).toBeInTheDocument();

    const rows = within(panel).getAllByRole("row");
    const lecRow = rows.find((row) => within(row).queryByText("LEC"))!;
    // LEC carries 20 km/h more through the corner → faster, negative delta.
    expect(within(lecRow).getByText("120")).toBeInTheDocument();
    expect(within(lecRow).getByText(/^−0\.\d{3}$/)).toBeInTheDocument();
    expect(within(rows.find((row) => within(row).queryByText("VER"))!).getByText("ref"))
      .toBeInTheDocument();
    expect(within(panel).getByRole("img", { name: /LEC versus VER/ })).toBeInTheDocument();
  });

  it("zooms the charts to a corner and reports hover distance", () => {
    const onFocusSegment = vi.fn();
    const onHoverDistance = vi.fn();
    const listener = vi.fn();
    window.addEventListener(X_SYNC_EVENT, listener);

    render(
      <CornerAnalysis
        zones={zones}
        laps={laps}
       
        onFocusSegment={onFocusSegment}
        onHoverDistance={onHoverDistance}
      />,
    );

    const cornerButton = screen.getByRole("button", { name: /T1/ });
    fireEvent.click(cornerButton);
    expect(onFocusSegment).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
    const detail = (listener.mock.calls[0]![0] as CustomEvent).detail;
    expect(detail.min).toBeLessThan(400);
    expect(detail.max).toBeGreaterThan(600);

    fireEvent.mouseEnter(cornerButton.closest("tr")!);
    expect(onHoverDistance).toHaveBeenLastCalledWith(500);

    window.removeEventListener(X_SYNC_EVENT, listener);
  });

  it("highlights every lap that ties for the best value", () => {
    const tied: CornerAnalysisLap[] = [laps[0]!, { ...laps[0]!, key: "b", label: "LEC" }];
    render(<CornerAnalysis zones={zones} laps={tied} />);
    const minCells = screen
      .getAllByRole("row")
      .filter((row) => within(row).queryByText(/^(VER|LEC)$/))
      .map((row) => within(row).getByText("100"));
    expect(minCells).toHaveLength(2);
    for (const cell of minCells) expect(cell.className).toContain("text-[#b48ead]");
  });

  it("omits the delta column with a single lap", () => {
    render(
      <CornerAnalysis zones={zones} laps={laps.slice(0, 1)} />,
    );
    expect(screen.queryByText("Δ")).not.toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});
