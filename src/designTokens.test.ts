import { describe, expect, it } from "vitest";
import { COMPOUND_COLORS, FLAG_COLORS } from "./constants";
import { NEUTRAL_COLORS, TOKEN_HEX, TOKEN_HEX_LIGHT, TONE_COLORS } from "./designTokens";

const CHANNELS = /^\d{1,3} \d{1,3} \d{1,3}$/;

function luminance(channels: string): number {
  const [r, g, b] = channels.split(" ").map(Number).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

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
    expect(TOKEN_HEX.fg).toBe("#ffffff");
    expect(TOKEN_HEX_LIGHT.fg).toBe("#12121a");
    expect(TOKEN_HEX.purple).toBe("#9b59f5");
    expect(TOKEN_HEX.f1red).toBe("#e8002d");
    expect(TOKEN_HEX.line).toBe("#3f3f4b");
    expect(TOKEN_HEX.faint).toBe("#919199");
  });

  it("keeps tertiary text and solid-tone foregrounds readable in both themes", () => {
    for (const mode of ["dark", "light"] as const) {
      for (const background of [
        NEUTRAL_COLORS.track[mode],
        NEUTRAL_COLORS.surface[mode],
        NEUTRAL_COLORS.panel[mode],
      ]) {
        expect(contrastRatio(NEUTRAL_COLORS.faint[mode], background)).toBeGreaterThanOrEqual(
          4.5,
        );
      }

      for (const tone of Object.values(TONE_COLORS)) {
        expect(contrastRatio(tone.on[mode], tone.DEFAULT[mode])).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("keeps flag and compound colours on the token palette", () => {
    expect(FLAG_COLORS.YELLOW).toBe(TOKEN_HEX.yellow);
    expect(FLAG_COLORS.SAFETY_CAR).toBe(TOKEN_HEX.orange);
    expect(COMPOUND_COLORS.SOFT).toBe(TOKEN_HEX.f1red);
    expect(COMPOUND_COLORS.WET).toBe(TOKEN_HEX.blue);
  });
});
