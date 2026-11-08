import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  RING_BACKGROUND_CARDINAL_TICK_EVERY,
  RING_BACKGROUND_CARDINAL_TICK_LENGTH,
  RING_BACKGROUND_CARDINAL_TICK_WIDTH,
  RING_BACKGROUND_MAJOR_TICK_EVERY,
  RING_BACKGROUND_MAJOR_TICK_LENGTH,
  RING_BACKGROUND_OFFSETS,
  RING_BACKGROUND_MAJOR_TICK_OPACITY_LIGHT,
  RING_BACKGROUND_TICK_COUNT,
  RING_BACKGROUND_TICK_OPACITY_LIGHT,
  RING_BACKGROUND_TICK_LENGTH,
  TRACK_BACKGROUND_GRID_SIZE,
  TRACK_BACKGROUND_LINE_OPACITY_LIGHT,
} from "@/constants";
import { TOKEN_HEX, TOKEN_HEX_LIGHT } from "@/designTokens";
import { MapBackground } from "./MapBackground";

const view = { x: -30, y: 10, w: 600, h: 400 };

describe("MapBackground", () => {
  it("renders a theme-aware glow and grid across the current camera view", () => {
    const { container, rerender } = render(<svg><MapBackground view={view} lightMode={false} /></svg>);
    const background = container.querySelector('[data-testid="map-background"]')!;
    expect(background).toHaveAttribute("pointer-events", "none");
    const pattern = background.querySelector("pattern");
    expect(pattern).toHaveAttribute("width", String(TRACK_BACKGROUND_GRID_SIZE));
    expect(pattern?.querySelector("path")).toHaveAttribute("stroke", TOKEN_HEX.fg);
    expect(background.querySelector("rect")).toHaveAttribute("x", "-30");
    expect(background.querySelector("rect")).toHaveAttribute("width", "600");
    rerender(<svg><MapBackground view={view} lightMode /></svg>);
    expect(background.querySelector("pattern path")).toHaveAttribute("stroke", TOKEN_HEX_LIGHT.fg);
    expect(background.querySelector("pattern path")).toHaveAttribute("stroke-opacity", String(TRACK_BACKGROUND_LINE_OPACITY_LIGHT));
  });

  it("uses concentric rings rather than a grid and gives each instance unique gradients", () => {
    const ring = { cx: 230, cy: 200, radius: 128 };
    const { container } = render(
      <svg>
        <MapBackground view={view} lightMode={false} ring={ring} />
        <MapBackground view={view} lightMode ring={ring} />
      </svg>,
    );
    const backgrounds = container.querySelectorAll('[data-testid="map-background"]');
    expect(backgrounds[0]!.querySelector("pattern")).toBeNull();
    expect([...backgrounds[0]!.querySelectorAll("circle")].map((c) => Number(c.getAttribute("r"))))
      .toEqual(RING_BACKGROUND_OFFSETS.map((offset) => ring.radius + offset));
    expect(backgrounds[0]!.querySelector('[data-layer="ring-background-ticks"]')?.children)
      .toHaveLength(RING_BACKGROUND_TICK_COUNT);
    expect(backgrounds[0]!.querySelector('[data-layer="ring-background-ticks"] path'))
      .toHaveAttribute("stroke", TOKEN_HEX.f1red);
    const ticks = backgrounds[0]!.querySelectorAll('[data-layer="ring-background-ticks"] path');
    expect(ticks[0]).toHaveAttribute("stroke-width", String(RING_BACKGROUND_CARDINAL_TICK_WIDTH));
    const tickLength = (index: number) => {
      const coordinates = ticks[index]!.getAttribute("d")!.match(/M ([\d.-]+) ([\d.-]+) L ([\d.-]+) ([\d.-]+)/);
      expect(coordinates).not.toBeNull();
      return Math.hypot(
        Number(coordinates![3]) - Number(coordinates![1]),
        Number(coordinates![4]) - Number(coordinates![2]),
      );
    };
    expect(tickLength(0)).toBeCloseTo(RING_BACKGROUND_CARDINAL_TICK_LENGTH);
    expect(ticks[RING_BACKGROUND_CARDINAL_TICK_EVERY]).toHaveAttribute(
      "stroke-width",
      String(RING_BACKGROUND_CARDINAL_TICK_WIDTH),
    );
    expect(tickLength(RING_BACKGROUND_MAJOR_TICK_EVERY)).toBeCloseTo(RING_BACKGROUND_MAJOR_TICK_LENGTH);
    expect(tickLength(1)).toBeCloseTo(RING_BACKGROUND_TICK_LENGTH);
    const lightTicks = backgrounds[1]!.querySelectorAll('[data-layer="ring-background-ticks"] path');
    expect(lightTicks[RING_BACKGROUND_MAJOR_TICK_EVERY]).toHaveAttribute("stroke-opacity", String(RING_BACKGROUND_MAJOR_TICK_OPACITY_LIGHT));
    expect(lightTicks[1]).toHaveAttribute("stroke-opacity", String(RING_BACKGROUND_TICK_OPACITY_LIGHT));
    const firstId = backgrounds[0]!.querySelector("radialGradient")!.id;
    const secondId = backgrounds[1]!.querySelector("radialGradient")!.id;
    expect(firstId).not.toBe(secondId);
    expect(backgrounds[0]!.querySelector("rect")).toHaveAttribute("fill", `url(#${firstId})`);
  });

  it("rotates the ring ticks around its center when a rotation is provided", () => {
    const ring = { cx: 230, cy: 200, radius: 128, rotationDeg: 92 };
    const { container } = render(
    <svg><MapBackground view={view} lightMode={false} ring={ring} /></svg>,
    );
    expect(container.querySelector('[data-layer="ring-background-ticks"]'))
    .toHaveAttribute("transform", "rotate(92 230 200)");
  });
});
