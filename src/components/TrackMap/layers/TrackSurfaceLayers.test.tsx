import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  FLAG_COLORS,
  TRACK_SURFACE_CORNER_ANGLE_DEG,
  TRACK_SURFACE_CORNER_WINDOW_PX,
  TRACK_SURFACE_ASPHALT_WIDTH,
  TRACK_SURFACE_KERB_EDGE_OFFSET,
  TRACK_SURFACE_KERB_PATCH_LENGTH,
  TRACK_SURFACE_KERB_DASH_LENGTH,
  TRACK_SURFACE_KERB_OPACITY,
  TRACK_SURFACE_KERB_WIDTH,
} from "@/constants";
import { TOKEN_HEX } from "@/designTokens";
import { buildTrackGeometry } from "../trackGeometry";
import {
  TrackConditionRibbon,
  TrackSurface,
} from "./TrackSurfaceLayers";

describe("TrackSurface", () => {
  it("renders alternating kerbs and asphalt in paint order without a green outline", () => {
    const geom = buildTrackGeometry({
      points: Array.from({ length: 4 }, (_, side) =>
        Array.from({ length: 101 }, (_, i) => {
          const value = i / 100;
          if (side === 0) return { x: value * 100, y: 0 };
          if (side === 1) return { x: 100, y: value * 100 };
          if (side === 2) return { x: 100 - value * 100, y: 100 };
          return { x: 0, y: 100 - value * 100 };
        }),
      ).flat(),
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 },
    });
    const { container } = render(
      <svg>
        <TrackSurface geom={geom} gradientId="asphalt" lightMode={false} />
      </svg>,
    );
    const layers = Array.from(container.querySelectorAll("[data-track-layer]"));

    const redKerbs = layers.filter((layer) => layer.getAttribute("data-track-layer") === "kerbs-red");
    const whiteKerbs = layers.filter((layer) => layer.getAttribute("data-track-layer") === "kerbs-white");
    expect(redKerbs.length).toBeGreaterThan(0);
    expect(redKerbs).toHaveLength(whiteKerbs.length);
    expect(redKerbs[0]).toHaveAttribute("stroke", TOKEN_HEX.red);
    expect(redKerbs[0]).toHaveAttribute("stroke-width", String(TRACK_SURFACE_KERB_WIDTH));
    expect(redKerbs[0]).toHaveAttribute("opacity", String(TRACK_SURFACE_KERB_OPACITY));
    expect(TRACK_SURFACE_KERB_WIDTH).toBeLessThan(TRACK_SURFACE_ASPHALT_WIDTH);
    expect(TRACK_SURFACE_KERB_EDGE_OFFSET).toBeGreaterThan(TRACK_SURFACE_ASPHALT_WIDTH / 2);
    expect(TRACK_SURFACE_KERB_PATCH_LENGTH).toBeGreaterThan(0);
    expect(redKerbs[0]).toHaveAttribute("stroke-linecap", "butt");
    expect(redKerbs[0]).toHaveAttribute(
      "stroke-dasharray",
      `${TRACK_SURFACE_KERB_DASH_LENGTH} ${TRACK_SURFACE_KERB_DASH_LENGTH}`,
    );
    expect(whiteKerbs[0]).toHaveAttribute(
      "stroke-dashoffset",
      String(TRACK_SURFACE_KERB_DASH_LENGTH),
    );
    expect(whiteKerbs[0]).toHaveAttribute("stroke-linecap", "butt");
    expect(layers.find((layer) => layer.getAttribute("data-track-layer") === "asphalt")).toHaveAttribute(
      "stroke",
      "url(#asphalt)",
    );
    expect(redKerbs.every((layer) => layer.getAttribute("d") !== geom.pathData)).toBe(true);
    expect(new Set(redKerbs.map((layer) => layer.getAttribute("data-track-kerb-position")))).toEqual(
      new Set(["entry", "apex", "exit"]),
    );
    expect(redKerbs.some((layer) => layer.getAttribute("data-track-kerb-side") === "inside")).toBe(
      true,
    );
    expect(redKerbs.some((layer) => layer.getAttribute("data-track-kerb-side") === "outside")).toBe(
      true,
    );
    expect(TRACK_SURFACE_CORNER_ANGLE_DEG).toBeGreaterThan(0);
    expect(TRACK_SURFACE_CORNER_WINDOW_PX).toBeGreaterThan(0);
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
