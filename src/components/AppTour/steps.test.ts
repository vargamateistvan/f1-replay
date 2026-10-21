import { describe, expect, it } from "vitest";
import { buildTourSteps, type TourContext } from "./steps";
import { TOUR_TARGET, tourSelector } from "./targets";

const desktop: TourContext = { isCompact: false, isRace: true, hasMapModes: true };
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
      } else {
        expect(known).toContain(step.target);
      }
    }
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

  it("mentions the other map views only when the toolbar offers them", () => {
    expect(content(desktop, "track-map")).toMatch(/ring view/);
    expect(content({ ...desktop, hasMapModes: false }, "track-map")).not.toMatch(
      /ring view/,
    );
  });
});
