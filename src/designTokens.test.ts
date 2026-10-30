import { describe, expect, it } from "vitest";
import { COMPOUND_COLORS, FLAG_COLORS } from "./constants";
import { NEUTRAL_COLORS, TOKEN_HEX, TONE_COLORS } from "./designTokens";

const CHANNELS = /^\d{1,3} \d{1,3} \d{1,3}$/;

describe("design tokens", () => {
  it("defines every themed colour for both modes as R G B channels", () => {
    const values = [
      ...Object.values(NEUTRAL_COLORS),
      ...Object.values(TONE_COLORS).flatMap((tone) => Object.values(tone)),
    ];
    for (const value of values) {
      expect(value.dark).toMatch(CHANNELS);
      expect(value.light).toMatch(CHANNELS);
    }
  });

  it("derives hex values from the dark theme", () => {
    expect(TOKEN_HEX.purple).toBe("#9b59f5");
    expect(TOKEN_HEX.f1red).toBe("#e8002d");
    expect(TOKEN_HEX.faint).toBe("#636369");
  });

  it("keeps flag and compound colours on the token palette", () => {
    expect(FLAG_COLORS.YELLOW).toBe(TOKEN_HEX.yellow);
    expect(FLAG_COLORS.SAFETY_CAR).toBe(TOKEN_HEX.orange);
    expect(COMPOUND_COLORS.SOFT).toBe(TOKEN_HEX.f1red);
    expect(COMPOUND_COLORS.WET).toBe(TOKEN_HEX.blue);
  });
});
