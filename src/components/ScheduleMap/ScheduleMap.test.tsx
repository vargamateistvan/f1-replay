import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Meeting } from "@/api/types";
import { buildSeasonSchedule, type ScheduleRound } from "@/utils/schedule";
import { ScheduleMap } from "./ScheduleMap";

vi.mock("@/lib/motion", () => ({ prefersReducedMotion: () => true }));

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 2, 1);
const iso = (ms: number) => new Date(ms).toISOString();

const meeting = (
  key: number,
  name: string,
  circuitKey: number,
  location: string,
  startMs: number,
): Meeting =>
  ({
    meeting_key: key,
    meeting_name: name,
    meeting_official_name: name,
    circuit_key: circuitKey,
    circuit_short_name: location,
    location,
    date_start: iso(startMs),
    date_end: iso(startMs + 2 * DAY),
    gmt_offset: "00:00:00",
    is_cancelled: false,
    year: 2026,
  }) as Meeting;

// Testing and round 1 share Bahrain; Monaco and Imola crowd at world zoom;
// circuit 999 has no baked location.
const MEETINGS = [
  meeting(1, "Pre-Season Testing", 63, "Sakhir", T0),
  meeting(2, "Bahrain Grand Prix", 63, "Sakhir", T0 + 7 * DAY),
  meeting(3, "Australian Grand Prix", 10, "Melbourne", T0 + 14 * DAY),
  meeting(4, "Monaco Grand Prix", 22, "Monte Carlo", T0 + 21 * DAY),
  meeting(5, "Emilia Romagna Grand Prix", 6, "Imola", T0 + 28 * DAY),
  meeting(6, "Atlantis Grand Prix", 999, "Atlantis", T0 + 35 * DAY),
];
const ROUNDS: ScheduleRound[] = buildSeasonSchedule(MEETINGS, [], T0 + 17 * DAY).rounds;

type SizeCallback = (entries: { contentRect: { width: number; height: number } }[]) => void;

class SizedResizeObserver {
  constructor(private readonly callback: SizeCallback) {}
  observe() {
    this.callback([{ contentRect: { width: 800, height: 400 } }]);
  }
  unobserve() {}
  disconnect() {}
}

function setup(selectedKey: number | null = 3) {
  const onSelect = vi.fn();
  const utils = render(
    <ScheduleMap
      rounds={ROUNDS}
      selectedKey={selectedKey}
      onSelect={onSelect}
      renderRound={(round) => <h2>{round.meeting.meeting_name}</h2>}
    />,
  );
  return { ...utils, onSelect };
}

const viewBoxWidth = (container: HTMLElement) =>
  Number(container.querySelector("svg")?.getAttribute("viewBox")?.split(" ")[2]);

describe("ScheduleMap", () => {
  beforeEach(() => vi.stubGlobal("ResizeObserver", SizedResizeObserver));
  afterEach(() => vi.unstubAllGlobals());

  it("places a numbered marker per located round and clusters crowded ones", () => {
    setup();
    expect(
      screen.getByRole("button", { name: "Round 2: Australian Grand Prix, completed" }),
    ).toHaveTextContent("2");
    expect(screen.getByRole("button", { name: "2 rounds: Sakhir, Sakhir" })).toHaveTextContent(
      "2",
    );
    expect(
      screen.getByRole("button", { name: "2 rounds: Monte Carlo, Imola" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Atlantis/ })).toBeNull();
  });

  it("draws the route between numbered rounds and totals the travel", () => {
    const { container } = setup();
    // Bahrain → Melbourne → Monaco → Imola (testing and unknown circuits skipped).
    expect(container.querySelectorAll('svg g[fill="none"] path')).toHaveLength(3);
    expect(screen.getByText("Season travel")).toBeInTheDocument();
  });

  it("selects a round from its marker and shows its card", () => {
    const { onSelect } = setup();
    const marker = screen.getByRole("button", { name: /Round 2: Australian/ });
    expect(marker).toHaveAttribute("aria-pressed", "true");
    expect(
      within(screen.getByRole("complementary", { name: "Selected round" })).getByRole(
        "heading",
        { name: "Australian Grand Prix" },
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Melbourne")).toBeInTheDocument();
    fireEvent.click(marker);
    expect(onSelect).toHaveBeenCalledWith(3);
  });

  it("steps through rounds from the panel", () => {
    const { onSelect } = setup(1);
    expect(screen.getByRole("button", { name: "Previous round" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next round" }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("notes rounds whose circuit isn't on the map", () => {
    setup(6);
    expect(screen.getByText("This circuit isn't on the map yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next round" })).toBeDisabled();
  });

  it("zooms into a cluster it can separate", () => {
    const { container } = setup();
    const before = viewBoxWidth(container);
    fireEvent.click(screen.getByRole("button", { name: "2 rounds: Monte Carlo, Imola" }));
    expect(viewBoxWidth(container)).toBeLessThan(before);
    expect(screen.getByRole("button", { name: /Round 3: Monaco/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Round 4: Emilia Romagna/ })).toBeInTheDocument();
  });

  it("lists co-located rounds instead of zooming", () => {
    const { container, onSelect } = setup();
    const before = viewBoxWidth(container);
    const cluster = screen.getByRole("button", { name: "2 rounds: Sakhir, Sakhir" });
    fireEvent.click(cluster);
    expect(viewBoxWidth(container)).toBe(before);
    expect(cluster).toHaveAttribute("aria-expanded", "true");
    const list = screen.getByRole("list", { name: "Rounds at this location" });
    fireEvent.click(within(list).getByRole("button", { name: /Bahrain Grand Prix/ }));
    expect(onSelect).toHaveBeenCalledWith(2);
    expect(screen.queryByRole("list", { name: "Rounds at this location" })).toBeNull();
  });

  it("closes the co-located list with Escape", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "2 rounds: Sakhir, Sakhir" }));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("list", { name: "Rounds at this location" })).toBeNull();
  });

  it("zooms with the buttons and returns to the whole season", () => {
    const { container } = setup();
    const season = viewBoxWidth(container);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(viewBoxWidth(container)).toBeLessThan(season);
    fireEvent.click(screen.getByRole("button", { name: "Show the whole season" }));
    expect(viewBoxWidth(container)).toBeCloseTo(season);
  });

  it("pans by dragging the map", () => {
    const { container } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const map = screen.getByRole("group", { name: "Season map" });
    const x = () => Number(container.querySelector("svg")?.getAttribute("viewBox")?.split(" ")[0]);
    const start = x();
    fireEvent.pointerDown(map, { pointerId: 1, button: 0, clientX: 400, clientY: 200 });
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 300, clientY: 200 });
    fireEvent.pointerUp(map, { pointerId: 1 });
    expect(x()).toBeGreaterThan(start);
  });
});
