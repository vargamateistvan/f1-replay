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
import { TOKEN_HEX, TOKEN_HEX_LIGHT } from "@/designTokens";
import { mapBackgroundColor } from "../trackMapFormat";
import { buildTrackGeometry } from "../trackGeometry";
import {
  TrackConditionRibbon,
  TrackSurface,
  SectorBoundaryMarkers,
} from "./TrackSurfaceLayers";

describe("SectorBoundaryMarkers", () => {
  it("keeps labels upright and readable in both themes without intercepting map gestures", () => {
    const geom = buildTrackGeometry({
      points: [
        { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 },
        { x: 100, y: 100 }, { x: 50, y: 100 }, { x: 0, y: 100 },
      ],
      bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 },
    });
    const draw = (lightMode: boolean) => (
      <svg><SectorBoundaryMarkers geom={geom} rotationDeg={45} lightMode={lightMode} /></svg>
    );
    const { container, rerender } = render(draw(false));
    const markers = Array.from(container.querySelectorAll("[data-sector-marker]"));
    expect(markers.map((marker) => marker.textContent)).toEqual(["S1", "S2"]);
    for (const marker of markers) {
      expect(marker).toHaveAttribute("pointer-events", "none");
      expect(marker.querySelector("rect")).toBeNull();
      const line = marker.querySelector("[data-sector-gate-line]")!;
      expect(line).not.toHaveAttribute("stroke-dasharray");
      const length = Math.hypot(
        Number(line.getAttribute("x2")) - Number(line.getAttribute("x1")),
        Number(line.getAttribute("y2")) - Number(line.getAttribute("y1")),
      );
      expect(length).toBeGreaterThan(TRACK_SURFACE_ASPHALT_WIDTH);
      expect(marker.querySelector("text")).toHaveAttribute("transform", expect.stringMatching(/^rotate\(-45/));
      expect(marker.querySelector("text")).toHaveAttribute("stroke", mapBackgroundColor(false));
      expect(marker.querySelector("text")).toHaveAttribute("fill", TOKEN_HEX.fg);
    }
    rerender(draw(true));
    expect(container.querySelector("[data-sector-marker] text")).toHaveAttribute("stroke", mapBackgroundColor(true));
    expect(container.querySelector("[data-sector-marker] text")).toHaveAttribute("fill", TOKEN_HEX_LIGHT.fg);
  });
});

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
        <TrackSurface geom={geom} gradientId="asphalt" lightMode={false} showKerbs />
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
      new Set(["apex", "joined"]),
    );
    // Each corner's outside entry/exit pair joins, but opposite edges and
    // the long straights between corners remain separate.
    expect(redKerbs).toHaveLength(8);
    expect(redKerbs.filter((layer) => layer.getAttribute("data-track-kerb-position") === "joined")).toHaveLength(4);
    expect(redKerbs.some((layer) => layer.getAttribute("data-track-kerb-side") === "inside")).toBe(
      true,
    );
    expect(redKerbs.some((layer) => layer.getAttribute("data-track-kerb-side") === "outside")).toBe(
      true,
    );
    expect(TRACK_SURFACE_CORNER_ANGLE_DEG).toBeGreaterThan(0);
    expect(TRACK_SURFACE_CORNER_WINDOW_PX).toBeGreaterThan(0);

    const disabled = render(
      <svg>
        <TrackSurface geom={geom} gradientId="asphalt" lightMode={false} showKerbs={false} />
      </svg>,
    );
    expect(disabled.container.querySelector("[data-track-layer='kerbs-red']")).toBeNull();
  });

  it("joins nearby kerbs across the outline seam without changing the coverage", () => {
    const points = Array.from({ length: 400 }, (_, i) => {
      const side = Math.floor(i / 100);
      const value = i % 100;
      if (side === 0) return { x: value, y: 0 };
      if (side === 1) return { x: 100, y: value };
      if (side === 2) return { x: 100 - value, y: 100 };
      return { x: 0, y: 100 - value };
    });
    const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
    const draw = (start: number) => (
      <svg>
        <TrackSurface
          geom={buildTrackGeometry({ points: [...points.slice(start), ...points.slice(0, start)], bounds })}
          gradientId="asphalt"
          lightMode={false}
          showKerbs
        />
      </svg>
    );
    const { container, rerender } = render(draw(0));
    const endpoints = () => Array.from(
      container.querySelectorAll("[data-track-layer='kerbs-red']"),
      (path) => {
        const samples = path.getAttribute("d")!.split(" ");
        return [samples[0], samples.at(-1)].join(" ");
      },
    ).sort();
    const atCorner = endpoints();
    expect(atCorner).toHaveLength(8);
    rerender(draw(50));
    expect(endpoints()).toEqual(atCorner);
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
