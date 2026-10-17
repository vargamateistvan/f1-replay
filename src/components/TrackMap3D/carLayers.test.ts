import { describe, expect, it, vi } from "vitest";
import type { Driver } from "@/api/types";
import { COMPOUND_COLORS } from "@/constants";
import { buildIndex } from "@/timeline/interpolate";
import type { CircuitGeoref } from "@/utils/georef";
import {
  animatedCarPaint,
  buildCarFeatures,
  buildCarLayers,
  CAR_DOT_LAYER,
  carIconExtent,
  carScaleFor,
  carStyle,
  clearCarIcons,
  drawCarIcon,
  ensureCarIcons,
  pulseFrame,
  sirenFrame,
  type CarFeatureInput,
} from "./carLayers";

const unitGeo: CircuitGeoref = {
  originLng: 0,
  originLat: 0,
  scale: 1,
  rotation: 0,
  flipY: false,
  tx: 0,
  ty: 0,
  rmsM: 0,
  maxM: 0,
};

const driver = (n: number, acronym: string) =>
  ({ driver_number: n, name_acronym: acronym, team_colour: "3671C6" }) as Driver;

function input(partial: Partial<CarFeatureInput> = {}): CarFeatureInput {
  return {
    indexes: new Map(),
    driverByNumber: new Map([
      [1, driver(1, "VER")],
      [16, driver(16, "LEC")],
    ]),
    focusDriver: null,
    safetyCarSirenOn: false,
    showAcronym: true,
    showNumberInside: false,
    lightMode: false,
    ...partial,
  };
}

describe("carScaleFor", () => {
  it("matches the 2D map's pixels per SVG unit (fit zoom included)", () => {
    expect(carScaleFor(600, 400)).toBeCloseTo(1.15);
    expect(carScaleFor(530, 624)).toBeCloseTo((530 / 600) * 1.15);
    expect(carScaleFor(0, 400)).toBe(1);
  });
});

describe("carStyle", () => {
  it("uses the 2D dot sizes, team colour and acronym label", () => {
    expect(carStyle(1, input())).toMatchObject({
      radius: 4.5,
      color: "#3671C6",
      stroke: "#ffffff",
      strokeWidth: 1.2,
      opacity: 1,
      label: "VER",
      labelColor: "#3671C6",
      labelSize: 8,
      showLabel: true,
      markerSize: 0,
    });
  });

  it("enlarges the focused car, dims the rest and hides their labels", () => {
    const state = input({ focusDriver: 16 });
    expect(carStyle(16, state)).toMatchObject({
      radius: 6.5,
      haloRadius: 9,
      labelSize: 9,
      strokeWidth: 1.6,
      opacity: 1,
      order: 2,
    });
    expect(carStyle(1, state)).toMatchObject({ opacity: 0.3, showLabel: false });
  });

  it("draws the number inside a bigger dot when that setting is on", () => {
    const state = input({ showNumberInside: true, focusDriver: 1 });
    expect(carStyle(1, state)).toMatchObject({ radius: 8, marker: "1", markerSize: 5.8 });
    expect(carStyle(16, state)).toMatchObject({ radius: 6.6, markerSize: 4.4 });
  });

  it("styles the safety car like 2D, with a siren ring when it's running", () => {
    const sc = carStyle(241, input());
    expect(sc).toMatchObject({
      marker: "SC",
      label: "SAFETY CAR",
      color: "#f5a623",
      markerTextColor: "#ffffff",
      safetyRingRadius: 4.9 + 3.4,
      siren: false,
    });
    const siren = carStyle(241, input({ safetyCarSirenOn: true, lightMode: true }));
    expect(siren).toMatchObject({ siren: true, safetyRingRadius: 0, markerTextColor: "#101010" });
  });

  it("adds battle rings, pulses and compound badges", () => {
    const state = input({
      battlingDrivers: new Set([1, 16]),
      pulseDrivers: new Set([16]),
      activeCompounds: new Map([[1, { compound: "SOFT", age: 3 }]]),
    });
    expect(carStyle(1, state)).toMatchObject({
      battleRadius: 8,
      compoundColor: COMPOUND_COLORS.SOFT,
    });
    // A pulsing car shows the pulse instead of its battle ring.
    expect(carStyle(16, state)).toMatchObject({ pulsing: true, battleRadius: 0, compoundColor: "" });
  });

  it("respects the acronym setting", () => {
    expect(carStyle(1, input({ showAcronym: false })).showLabel).toBe(false);
  });
});

describe("buildCarFeatures", () => {
  it("interpolates positions and drops retired and off-track cars", () => {
    const track = (x: number) =>
      buildIndex([
        { t: 0, x, y: 0 },
        { t: 1000, x: x + 100, y: 0 },
      ]);
    const { features } = buildCarFeatures(
      unitGeo,
      500,
      input({
        indexes: new Map([
          [1, track(1000)],
          [16, track(2000)],
          [55, buildIndex([{ t: 0, x: 0, y: 0 }])],
        ]),
        retiredDrivers: new Set([16]),
      }),
    );
    expect(features.map((f) => f.properties.num)).toEqual([1]);
    expect(features[0]!.geometry.coordinates[0]).toBeCloseTo(1050 / 111_319.49, 6);
  });
});

describe("car icons", () => {
  it("shares an image between cars that look alike and splits on any visual change", () => {
    const a = carStyle(1, input());
    const b = carStyle(16, input());
    expect(a.icon).toBe(b.icon);
    expect(carStyle(16, input({ focusDriver: 16 })).icon).not.toBe(b.icon);
    // Dimming is an icon-opacity, not a separate image.
    expect(carStyle(1, input({ focusDriver: 16 })).icon).toBe(a.icon);
  });

  it("sizes the image to the outermost ring", () => {
    expect(carIconExtent(carStyle(1, input()))).toBeCloseTo(4.5 + 1.2 + 1);
    expect(
      carIconExtent(carStyle(1, input({ battlingDrivers: new Set([1]) }))),
    ).toBeCloseTo(8 + 1 + 1);
  });

  it("paints in the 2D order with dashed battle rings and the number inside", () => {
    const calls: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get: (_t, key) =>
          typeof key === "string" && /^[a-z]/.test(key)
            ? (...args: unknown[]) => {
                if (key === "setLineDash") calls.push(`dash:${JSON.stringify(args[0])}`);
                if (key === "arc") calls.push(`arc:${args[2] as number}`);
                if (key === "fillText") calls.push(`text:${args[0] as string}`);
              }
            : undefined,
        set: () => true,
      },
    ) as CanvasRenderingContext2D;

    const style = carStyle(
      16,
      input({
        focusDriver: 16,
        showNumberInside: true,
        battlingDrivers: new Set([16]),
        activeCompounds: new Map([[16, { compound: "HARD", age: 1 }]]),
      }),
    );
    drawCarIcon(ctx, style, 2, false);
    expect(calls).toEqual([
      "dash:[6,4]",
      "arc:26", // battle ring r 13
      "dash:[]",
      "arc:21", // focus halo r 8 + 2.5
      "arc:16", // dot
      "dash:[]",
      "arc:16", // dot stroke
      "text:16",
      "arc:5", // compound badge r 2.5
    ]);
  });

  it("adds each image once and clears them on demand", () => {
    // Drawing needs a real 2D context; only the bookkeeping is under test.
    const ctx = new Proxy(
      {},
      {
        get: (_t, key) =>
          key === "getImageData" ? () => ({}) as ImageData : () => undefined,
        set: () => true,
      },
    ) as CanvasRenderingContext2D;
    const spy = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    const images = new Map<string, unknown>();
    const host = {
      hasImage: (id: string) => images.has(id),
      addImage: vi.fn<(id: string, img: ImageData, opts: { pixelRatio: number }) => void>(
        (id, img) => void images.set(id, img),
      ),
      removeImage: vi.fn((id: string) => images.delete(id)),
    };
    const cache = new Set<string>();
    const cars = buildCarFeatures(
      unitGeo,
      0,
      input({
        indexes: new Map([
          [1, buildIndex([{ t: 0, x: 10, y: 0 }])],
          [16, buildIndex([{ t: 0, x: 20, y: 0 }])],
        ]),
      }),
    );
    ensureCarIcons(host, cars, 1, false, cache, 2);
    ensureCarIcons(host, cars, 1, false, cache, 2);
    expect(host.addImage).toHaveBeenCalledTimes(1);
    expect(host.addImage.mock.calls[0]![2]).toEqual({ pixelRatio: 2 });

    clearCarIcons(host, cache);
    expect(images.size).toBe(0);
    expect(cache.size).toBe(0);
    spy.mockRestore();
  });
});

describe("buildCarLayers", () => {
  it("draws cars as occlusion-proof icons under team-coloured Inter labels", () => {
    const layers = buildCarLayers(2);
    const ids = layers.map((l) => l.id);
    expect(ids).toEqual([
      "map3d-car-pulse",
      "map3d-car-siren",
      CAR_DOT_LAYER,
      "map3d-car-labels",
    ]);

    const dot = layers[2] as { type: string; layout: Record<string, unknown>; paint: Record<string, unknown> };
    expect(dot.type).toBe("symbol");
    expect(dot.layout["icon-image"]).toEqual(["get", "icon"]);
    expect(dot.paint["icon-occlusion-opacity"]).toEqual(["get", "opacity"]);

    const labels = layers[3] as { layout: Record<string, unknown>; paint: Record<string, unknown> };
    expect(labels.layout["text-font"]).toEqual(["Inter Black"]);
    expect(labels.layout["text-size"]).toEqual(["*", ["get", "labelSize"], 2]);
    expect(labels.paint["text-color"]).toEqual(["get", "labelColor"]);
  });
});

describe("ring animations", () => {
  it("pulses from r 6 to 14 while fading, like the 2D <animate>", () => {
    expect(pulseFrame(0)).toEqual({ radius: 6, opacity: 0.9 });
    expect(pulseFrame(400).radius).toBeCloseTo(10);
    expect(pulseFrame(799).opacity).toBeLessThan(0.01);
  });

  it("swells the siren ring and back over 950 ms", () => {
    expect(sirenFrame(0).grow).toBeCloseTo(2.4);
    expect(sirenFrame(475).grow).toBeCloseTo(5.8);
    expect(sirenFrame(475).opacity).toBeCloseTo(0.25);
  });

  it("emits paint updates for both animated layers", () => {
    const updates = animatedCarPaint(1.5, 400);
    expect(updates.map(([layer, key]) => `${layer}:${key}`)).toEqual([
      "map3d-car-pulse:circle-radius",
      "map3d-car-pulse:circle-stroke-opacity",
      "map3d-car-siren:circle-radius",
      "map3d-car-siren:circle-stroke-opacity",
    ]);
    expect(updates[0]![2]).toBeCloseTo(15);
  });
});
