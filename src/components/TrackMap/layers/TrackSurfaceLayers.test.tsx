import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  TRACK_SURFACE_KERB_DASH_LENGTH,
  TRACK_SURFACE_KERB_OPACITY,
  TRACK_SURFACE_KERB_WIDTH,
} from "@/constants";
import { TOKEN_HEX } from "@/designTokens";
import { TrackSurface } from "./TrackSurfaceLayers";

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
    expect(layers[0]).toHaveAttribute(
      "stroke-dasharray",
      `${TRACK_SURFACE_KERB_DASH_LENGTH} ${TRACK_SURFACE_KERB_DASH_LENGTH}`,
    );
    expect(layers[1]).toHaveAttribute(
      "stroke-dashoffset",
      String(TRACK_SURFACE_KERB_DASH_LENGTH),
    );
    expect(layers[2]).toHaveAttribute("stroke", "url(#asphalt)");
  });
});
