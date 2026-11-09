import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  FLAG_COLORS,
  TRACK_SURFACE_ASPHALT_WIDTH,
  TRACK_SURFACE_KERB_DASH_LENGTH,
  TRACK_SURFACE_KERB_OPACITY,
  TRACK_SURFACE_KERB_WIDTH,
} from "@/constants";
import { TOKEN_HEX } from "@/designTokens";
import {
  TrackConditionRibbon,
  TrackSurface,
} from "./TrackSurfaceLayers";

describe("TrackSurface", () => {
  it("renders alternating kerbs and asphalt in paint order without a green outline", () => {
    const { container } = render(
      <svg>
        <TrackSurface pathData="M 0 0 L 10 10" gradientId="asphalt" lightMode={false} />
      </svg>,
    );
    const layers = Array.from(container.querySelectorAll("[data-track-layer]"));

    expect(layers.map((layer) => layer.getAttribute("data-track-layer"))).toEqual([
      "kerbs-red",
      "kerbs-white",
      "asphalt",
      "asphalt-highlight",
    ]);
    expect(layers[0]).toHaveAttribute("stroke", TOKEN_HEX.red);
    expect(layers[0]).toHaveAttribute("stroke-width", String(TRACK_SURFACE_KERB_WIDTH));
    expect(layers[0]).toHaveAttribute("opacity", String(TRACK_SURFACE_KERB_OPACITY));
    expect(TRACK_SURFACE_KERB_WIDTH).toBeGreaterThan(TRACK_SURFACE_ASPHALT_WIDTH);
    expect(layers[0]).toHaveAttribute("stroke-linecap", "butt");
    expect(layers[0]).toHaveAttribute(
      "stroke-dasharray",
      `${TRACK_SURFACE_KERB_DASH_LENGTH} ${TRACK_SURFACE_KERB_DASH_LENGTH}`,
    );
    expect(layers[1]).toHaveAttribute(
      "stroke-dashoffset",
      String(TRACK_SURFACE_KERB_DASH_LENGTH),
    );
    expect(layers[1]).toHaveAttribute("stroke-linecap", "butt");
    expect(layers[2]).toHaveAttribute("stroke", "url(#asphalt)");
  });

  it("only draws sector ribbons for active flags", () => {
    const { container, rerender } = render(
      <svg>
        <TrackConditionRibbon
          pathData="M 0 0 L 10 10"
          timingSectorFlags={{ 1: "CLEAR", 2: "GREEN", 3: "CLEAR" }}
          circuitLayout={null}
        />
      </svg>,
    );
    expect(container.querySelector("[data-track-layer^='flag-ribbon-']")).toBeNull();

    rerender(
      <svg>
        <TrackConditionRibbon
          pathData="M 0 0 L 10 10"
          timingSectorFlags={{ 1: "YELLOW", 2: "GREEN", 3: "CLEAR" }}
          circuitLayout={null}
        />
      </svg>,
    );
    expect(container.querySelector("[data-track-layer='flag-ribbon-1']")).toHaveAttribute(
      "stroke",
      FLAG_COLORS.YELLOW,
    );
  });
});
