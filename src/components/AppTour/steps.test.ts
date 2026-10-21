import { describe, expect, it } from "vitest";
import { buildTourSteps, type TourContext } from "./steps";
import { TOUR_TARGET, tourSelector } from "./targets";

const desktop: TourContext = { isCompact: false, isRace: true, has3d: true };
const phone: TourContext = { ...desktop, isCompact: true };

const ids = (ctx: TourContext) => buildTourSteps(ctx).map((s) => s.id);
const content = (ctx: TourContext, id: string) =>
  String(buildTourSteps(ctx).find((s) => s.id === id)?.content);

describe("buildTourSteps", () => {
  it("walks the desktop layout from the picker to help", () => {
    expect(ids(desktop)).toEqual([
      "welcome",
      "session-picker",
      "view-tabs",
      "data-panel",
      "track-map",
      "map-views",
      "playback",
      "analysis-links",
      "help",
    ]);
  });

  it("uses the phone layout's own targets", () => {
    expect(ids(phone)).toEqual([
      "welcome",
      "session-picker",
      "mobile-tracker-tabs",
      "playback",
      "mobile-nav",
      "mobile-more",
    ]);
  });

  it("only targets tagged elements (or the centred welcome)", () => {
    const known = new Set(Object.values(TOUR_TARGET).map(tourSelector));
    for (const step of [...buildTourSteps(desktop), ...buildTourSteps(phone)]) {
      if (step.id === "welcome") {
        expect(step.placement).toBe("center");
      } else if (typeof step.target === "function") {
        expect(step.id).toBe("map-views");
      } else {
        expect(known).toContain(step.target);
      }
    }
  });

  it("points the view step at the toolbar on screen, not a hidden copy", () => {
    document.body.innerHTML = `
      <div data-tour="map-views" id="hidden"></div>
      <div data-tour="map-views" id="shown"></div>`;
    const shown = document.getElementById("shown")!;
    shown.getClientRects = () => [new DOMRect(0, 0, 40, 20)] as unknown as DOMRectList;
    const step = buildTourSteps(desktop).find((s) => s.id === "map-views")!;
    expect((step.target as () => HTMLElement | null)()).toBe(shown);
    document.body.innerHTML = "";
  });

  it("gives every step a unique id", () => {
    for (const ctx of [desktop, phone]) {
      expect(new Set(ids(ctx)).size).toBe(ids(ctx).length);
    }
  });

  it("mentions race-only scrubber markers in races only", () => {
    expect(content(desktop, "playback")).toMatch(/chequered flag/);
    expect(content({ ...desktop, isRace: false }, "playback")).not.toMatch(
      /chequered flag/,
    );
  });

  it("lists keyboard shortcuts on desktop only", () => {
    expect(content(desktop, "playback")).toMatch(/Space/);
    expect(content(phone, "playback")).not.toMatch(/Space/);
  });

  it("mentions the 3D map only where it can be shown", () => {
    expect(content(desktop, "map-views")).toMatch(/3D map/);
    expect(content(desktop, "map-views")).toMatch(/ring/);
    const no3d = content({ ...desktop, has3d: false }, "map-views");
    expect(no3d).not.toMatch(/3D/);
    expect(no3d).toMatch(/ring view/);
    expect(content(phone, "mobile-tracker-tabs")).toMatch(/2D, 3D and ring/);
    expect(
      content({ ...phone, has3d: false }, "mobile-tracker-tabs"),
    ).not.toMatch(/3D/);
  });
});
