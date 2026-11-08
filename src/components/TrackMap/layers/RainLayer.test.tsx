import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { Weather } from "@/api/types";
import { RainLayer } from "./RainLayer";
import { weatherAtSessionTime } from "@/utils/weather";

const state = vi.hoisted(() => ({ playing: true, reducedMotion: false }));
vi.mock("@/timeline/clock", () => ({
  useTimeline: (selector: (value: { playing: boolean }) => unknown) => selector(state),
}));
vi.mock("@/hooks/useMediaQuery", () => ({
  useMediaQuery: () => state.reducedMotion,
}));

const weather: Weather = {
  date: "2026-11-08T12:00:00Z",
  air_temperature: 20,
  track_temperature: 25,
  humidity: 70,
  pressure: 1010,
  rainfall: 1,
  wind_direction: 180,
  wind_speed: 2,
  session_key: 1,
  meeting_key: 1,
};
const view = { x: 10, y: 20, w: 600, h: 400 };
let resize: (width: number, height: number) => void;
const disconnect = vi.fn();

beforeEach(() => {
  state.playing = true;
  state.reducedMotion = false;
  disconnect.mockReset();
  vi.stubGlobal("ResizeObserver", class implements ResizeObserver {
    target: Element = document.createElement("div");
    constructor(callback: ConstructorParameters<typeof ResizeObserver>[0]) {
      resize = (width, height) => callback(
        [{
          target: this.target,
          contentRect: new DOMRect(0, 0, width, height),
          borderBoxSize: [],
          contentBoxSize: [],
          devicePixelContentBoxSize: [],
        }],
        this,
      );
    }
    observe(target: Element) { this.target = target; }
    unobserve() {}
    disconnect = disconnect;
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("RainLayer", () => {
  it("fills horizontal and vertical letterboxing after resize and camera changes", () => {
    const { container, rerender, unmount } = render(
      <svg><RainLayer enabled weather={weather} view={view} /></svg>,
    );
    act(() => resize(1000, 400));
    let clip = container.querySelector("clipPath rect");
    expect(clip).toHaveAttribute("x", "-190");
    expect(clip).toHaveAttribute("width", "1000");
    expect(clip).toHaveAttribute("height", "400");
    act(() => resize(300, 400));
    clip = container.querySelector("clipPath rect");
    expect(clip).toHaveAttribute("y", "-180");
    expect(clip).toHaveAttribute("width", "600");
    expect(clip).toHaveAttribute("height", "800");
    rerender(<svg><RainLayer enabled weather={weather} view={{ x: 100, y: 200, w: 300, h: 200 }} /></svg>);
    clip = container.querySelector("clipPath rect");
    expect(clip).toHaveAttribute("y", "100");
    expect(clip).toHaveAttribute("height", "400");
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("follows rain transitions and backward seeks without leaking weather across sessions", () => {
    const start = Date.parse(weather.date);
    const entries = [
      { ...weather, rainfall: 0 },
      { ...weather, date: new Date(start + 10_000).toISOString() },
      { ...weather, rainfall: 0, date: new Date(start + 20_000).toISOString() },
    ];
    const at = (t: number, rows = entries) => (
      <svg><RainLayer enabled weather={weatherAtSessionTime(rows, start, t)} view={view} /></svg>
    );
    const { rerender } = render(at(0));
    expect(screen.queryByTestId("map-rain-effects")).not.toBeInTheDocument();
    rerender(at(10_000));
    expect(screen.getByTestId("map-rain-effects")).toBeInTheDocument();
    rerender(at(20_000));
    expect(screen.queryByTestId("map-rain-effects")).not.toBeInTheDocument();
    rerender(at(15_000));
    expect(screen.getByTestId("map-rain-effects")).toBeInTheDocument();
    rerender(at(15_000, []));
    expect(screen.queryByTestId("map-rain-effects")).not.toBeInTheDocument();
  });

  it("requires both an opt-in and reported rain", () => {
    const { rerender } = render(
      <svg><RainLayer enabled={false} weather={weather} view={view} /></svg>,
    );
    expect(screen.queryByTestId("map-rain-effects")).not.toBeInTheDocument();
    rerender(<svg><RainLayer enabled weather={null} view={view} /></svg>);
    expect(screen.queryByTestId("map-rain-effects")).not.toBeInTheDocument();
    rerender(<svg><RainLayer enabled weather={{ ...weather, rainfall: 0 }} view={view} /></svg>);
    expect(screen.queryByTestId("map-rain-effects")).not.toBeInTheDocument();
    rerender(<svg><RainLayer enabled weather={weather} view={view} /></svg>);
    expect(screen.getByTestId("map-rain-effects")).toHaveAttribute("pointer-events", "none");
    expect(screen.getByTestId("map-rain-effects")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByTestId("map-rain-streaks")).toHaveStyle({ animationPlayState: "running" });
    rerender(<svg><RainLayer enabled weather={{ ...weather, rainfall: 0 }} view={view} /></svg>);
    expect(screen.queryByTestId("map-rain-effects")).not.toBeInTheDocument();
  });

  it("freezes streaks while paused or previewing", () => {
    state.playing = false;
    const { rerender } = render(<svg><RainLayer enabled weather={weather} view={view} /></svg>);
    expect(screen.getByTestId("map-rain-streaks")).toHaveStyle({ animationPlayState: "paused" });
    state.playing = true;
    rerender(<svg><RainLayer enabled weather={weather} view={view} preview /></svg>);
    expect(screen.getByTestId("map-rain-streaks")).toHaveStyle({ animationPlayState: "paused" });
    rerender(<svg><RainLayer enabled weather={weather} view={view} /></svg>);
    expect(screen.getByTestId("map-rain-streaks")).toHaveStyle({ animationPlayState: "running" });
  });

  it("keeps only the static tint for reduced motion", () => {
    state.reducedMotion = true;
    render(<svg><RainLayer enabled weather={weather} view={view} /></svg>);
    expect(screen.getByTestId("map-rain-effects")).toBeInTheDocument();
    expect(screen.queryByTestId("map-rain-streaks")).not.toBeInTheDocument();
  });

  it("clips to the current viewport, uses unique SVG IDs and cleans up on unmount", () => {
    const { container, unmount } = render(
      <svg>
        <RainLayer enabled weather={weather} view={view} />
        <RainLayer enabled weather={weather} view={view} />
      </svg>,
    );
    const clips = container.querySelectorAll("clipPath");
    expect(clips).toHaveLength(2);
    expect(clips[0].id).not.toBe(clips[1].id);
    expect(clips[0].querySelector("rect")).toHaveAttribute("x", "10");
    expect(clips[0].querySelector("rect")).toHaveAttribute("height", "400");
    unmount();
    expect(screen.queryByTestId("map-rain-effects")).not.toBeInTheDocument();
  });
});
