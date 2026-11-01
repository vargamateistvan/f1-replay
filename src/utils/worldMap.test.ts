import { describe, expect, it } from "vitest";
import {
  cameraViewBox,
  clampCamera,
  clusterMarkers,
  fitCamera,
  haversineKm,
  legArcPath,
  lerpCamera,
  mapToScreen,
  maxCameraWidth,
  projectLngLat,
  screenToMap,
  travelDistanceKm,
  worldBounds,
  zoomCameraAt,
} from "./worldMap";

const BOUNDS = worldBounds(75, -56);

describe("projectLngLat / worldBounds", () => {
  it("maps longitude east and latitude south from the top-left corner", () => {
    expect(projectLngLat({ lng: -180, lat: 90 })).toEqual({ x: 0, y: 0 });
    expect(projectLngLat({ lng: 0, lat: 0 })).toEqual({ x: 180, y: 90 });
    expect(projectLngLat({ lng: 144.97, lat: -37.85 }).y).toBeCloseTo(127.85);
  });

  it("crops the frame to the latitude band", () => {
    expect(BOUNDS).toEqual({ x: 0, y: 15, w: 360, h: 131 });
  });
});

describe("camera", () => {
  it("derives the view box from centre, width and aspect", () => {
    expect(cameraViewBox({ cx: 100, cy: 50, w: 40 }, 2)).toEqual({
      x: 80,
      y: 40,
      w: 40,
      h: 20,
    });
  });

  it("limits zoom between the minimum width and the whole map", () => {
    expect(clampCamera({ cx: 180, cy: 80, w: 1 }, 2, BOUNDS, 6).w).toBe(6);
    expect(clampCamera({ cx: 180, cy: 80, w: 9999 }, 2, BOUNDS, 6).w).toBe(
      maxCameraWidth(BOUNDS, 2),
    );
  });

  it("keeps the view inside the map, centring an axis it overflows", () => {
    const edge = clampCamera({ cx: 5, cy: 20, w: 40 }, 2, BOUNDS, 6);
    expect(edge.cx).toBe(20);
    expect(edge.cy).toBe(25);
    // Tall viewport: the whole map is narrower than the view vertically.
    const tall = clampCamera({ cx: 10, cy: 10, w: 360 }, 1, BOUNDS, 6);
    expect(tall.cx).toBe(180);
    expect(tall.cy).toBe(BOUNDS.y + BOUNDS.h / 2);
  });

  it("fits points with a screen-pixel margin on every side", () => {
    const points = [
      { x: 100, y: 50 },
      { x: 140, y: 70 },
    ];
    const widthPx = 800;
    const aspect = 2;
    const cam = fitCamera(points, aspect, BOUNDS, { padPx: 40, widthPx, minW: 6 });
    const view = cameraViewBox(cam, aspect);
    for (const p of points) {
      const s = mapToScreen(p, view, widthPx, widthPx / aspect);
      expect(s.x).toBeGreaterThanOrEqual(40 - 1e-9);
      expect(s.x).toBeLessThanOrEqual(widthPx - 40 + 1e-9);
      expect(s.y).toBeGreaterThanOrEqual(40 - 1e-9);
      expect(s.y).toBeLessThanOrEqual(widthPx / aspect - 40 + 1e-9);
    }
    // Tight on the limiting (here vertical) axis.
    expect(mapToScreen(points[0], view, widthPx, widthPx / aspect).y).toBeCloseTo(40);
  });

  it("fits a single point at the minimum zoom, and nothing to the whole map", () => {
    const one = fitCamera([{ x: 180, y: 60 }], 2, BOUNDS, { padPx: 40, widthPx: 800, minW: 6 });
    expect(one).toEqual({ cx: 180, cy: 60, w: 6 });
    const none = fitCamera([], 2, BOUNDS, { padPx: 40, widthPx: 800, minW: 6 });
    expect(none.w).toBe(maxCameraWidth(BOUNDS, 2));
  });

  it("zooms around an anchor that stays put on screen", () => {
    const cam = { cx: 100, cy: 60, w: 80 };
    const anchor = { x: 120, y: 70 };
    const zoomed = zoomCameraAt(cam, 0.5, anchor);
    expect(zoomed).toEqual({ cx: 110, cy: 65, w: 40 });
    const before = mapToScreen(anchor, cameraViewBox(cam, 2), 800, 400);
    const after = mapToScreen(anchor, cameraViewBox(zoomed, 2), 800, 400);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("interpolates position linearly and width geometrically", () => {
    const a = { cx: 0, cy: 0, w: 10 };
    const b = { cx: 100, cy: 50, w: 1000 };
    expect(lerpCamera(a, b, 0)).toEqual(a);
    expect(lerpCamera(a, b, 1)).toEqual(b);
    const mid = lerpCamera(a, b, 0.5);
    expect(mid.cx).toBe(50);
    expect(mid.w).toBeCloseTo(100);
  });

  it("converts between map and screen coordinates", () => {
    const view = { x: 100, y: 20, w: 50, h: 25 };
    const p = { x: 110, y: 30 };
    const s = mapToScreen(p, view, 500, 250);
    expect(s).toEqual({ x: 100, y: 100 });
    expect(screenToMap(s, view, 500, 250)).toEqual(p);
  });
});

describe("clusterMarkers", () => {
  it("merges markers within the radius and keeps distant ones apart", () => {
    const clusters = clusterMarkers(
      [
        { id: "a", x: 0, y: 0 },
        { id: "b", x: 10, y: 0 },
        { id: "c", x: 100, y: 100 },
      ],
      20,
    );
    expect(clusters).toEqual([
      { ids: ["a", "b"], x: 5, y: 0 },
      { ids: ["c"], x: 100, y: 100 },
    ]);
  });

  it("keeps every marker separate when the radius is zero", () => {
    expect(
      clusterMarkers(
        [
          { id: 1, x: 0, y: 0 },
          { id: 2, x: 1, y: 0 },
        ],
        0,
      ),
    ).toHaveLength(2);
  });
});

describe("distances", () => {
  it("measures great-circle distance", () => {
    const london = { lng: -0.1276, lat: 51.5072 };
    const paris = { lng: 2.3522, lat: 48.8566 };
    expect(haversineKm(london, paris)).toBeCloseTo(344, -1);
    expect(haversineKm(london, london)).toBe(0);
  });

  it("sums consecutive legs", () => {
    const a = { lng: 0, lat: 0 };
    const b = { lng: 1, lat: 0 };
    const c = { lng: 2, lat: 0 };
    expect(travelDistanceKm([a, b, c])).toBeCloseTo(2 * haversineKm(a, b));
    expect(travelDistanceKm([a])).toBe(0);
  });
});

describe("legArcPath", () => {
  it("bows the leg north (towards smaller y) whichever way it runs", () => {
    const control = (d: string) => Number(d.split("Q")[1].split(" ")[1]);
    expect(control(legArcPath({ x: 0, y: 50 }, { x: 100, y: 50 }, 0.2))).toBe(30);
    expect(control(legArcPath({ x: 100, y: 50 }, { x: 0, y: 50 }, 0.2))).toBe(30);
  });

  it("is empty for a zero-length leg", () => {
    expect(legArcPath({ x: 1, y: 1 }, { x: 1, y: 1 }, 0.2)).toBe("");
  });
});
