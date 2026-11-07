import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  RING_BACKGROUND_OFFSETS,
  RING_BACKGROUND_TICK_COUNT,
  TRACK_BACKGROUND_GRID_SIZE,
} from "@/constants";
import { TOKEN_HEX, TOKEN_HEX_LIGHT } from "@/designTokens";
import { MapBackground } from "./MapBackground";

const view = { x: -30, y: 10, w: 600, h: 400 };

describe("MapBackground", () => {
  it("renders a theme-aware glow and grid across the current camera view", () => {
    const { container, rerender } = render(<svg><MapBackground view={view} lightMode={false} /></svg>);
    const background = container.querySelector('[data-testid="map-background"]')!;
    expect(background).toHaveAttribute("pointer-events", "none");
    expect(background.querySelector("pattern")).toHaveAttribute("width", String(TRACK_BACKGROUND_GRID_SIZE));
    expect(background.querySelector("pattern path")).toHaveAttribute("stroke", TOKEN_HEX.fg);
    expect(background.querySelector("rect")).toHaveAttribute("x", "-30");
    expect(background.querySelector("rect")).toHaveAttribute("width", "600");
    rerender(<svg><MapBackground view={view} lightMode /></svg>);
    expect(background.querySelector("pattern path")).toHaveAttribute("stroke", TOKEN_HEX_LIGHT.fg);
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
    const firstId = backgrounds[0]!.querySelector("radialGradient")!.id;
    const secondId = backgrounds[1]!.querySelector("radialGradient")!.id;
    expect(firstId).not.toBe(secondId);
    expect(backgrounds[0]!.querySelector("rect")).toHaveAttribute("fill", `url(#${firstId})`);
  });
});
