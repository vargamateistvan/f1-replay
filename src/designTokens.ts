// Design tokens: the single source for every UI colour that changes between
// dark and light mode. `tailwind.config.ts` emits each entry as a CSS variable
// (`--color-<name>` on :root, overridden under `html.light`) and exposes it as a
// Tailwind colour, so components write `bg-surface`, `text-fg/70`,
// `border-purple-line`… and never a raw hex class.
//
// Values are "R G B" channels so Tailwind's `/opacity` modifier works.
// Must stay free of imports: the Tailwind config loads this file in Node.

export interface ThemeColor {
  dark: string;
  light: string;
}

/** Neutral surfaces and text, darkest surface first. */
export const NEUTRAL_COLORS = {
  /** Default text and icon colour (white in dark mode). */
  fg: { dark: "255 255 255", light: "18 18 26" },
  /** Page background. */
  track: { dark: "21 21 30", light: "240 240 245" },
  /** Recessed wells behind maps and charts. */
  sunken: { dark: "16 16 26", light: "236 238 245" },
  /** Cards, panels, dialogs. */
  surface: { dark: "31 31 39", light: "248 248 252" },
  /** Raised controls, selected rows, default borders. */
  panel: { dark: "42 42 53", light: "228 228 236" },
  /** Stronger borders, dividers and inactive bars. */
  line: { dark: "63 63 75", light: "180 182 200" },
  /** Secondary text. */
  muted: { dark: "163 163 163", light: "106 106 120" },
  /** Tertiary text: column headers, footnotes. */
  faint: { dark: "99 99 105", light: "120 122 138" },
} satisfies Record<string, ThemeColor>;

/**
 * Semantic hues. Each tone has four slots:
 * - `DEFAULT`: solid fills (sector bars, badges) and F1 timing text;
 * - `fg`: readable text in that hue on the page or on its `tint`;
 * - `line`: border of a tinted chip;
 * - `tint`: background of a tinted chip or row highlight.
 */
export const TONE_COLORS = {
  /** Session best (F1 purple). */
  purple: {
    DEFAULT: { dark: "155 89 245", light: "143 76 240" },
    fg: { dark: "220 195 255", light: "100 40 168" },
    line: { dark: "99 64 122", light: "148 98 188" },
    tint: { dark: "42 27 63", light: "234 226 245" },
  },
  /** Personal best, gains, valid, green flag. */
  green: {
    DEFAULT: { dark: "57 181 74", light: "46 158 69" },
    fg: { dark: "63 211 90", light: "20 120 60" },
    line: { dark: "39 109 51", light: "62 158 90" },
    tint: { dark: "17 36 25", light: "204 236 213" },
  },
  /** Yellow flag, slower lap, losses. */
  yellow: {
    DEFAULT: { dark: "245 212 0", light: "224 180 0" },
    fg: { dark: "245 212 0", light: "130 110 0" },
    line: { dark: "126 116 34", light: "160 148 40" },
    tint: { dark: "42 36 15", light: "248 242 204" },
  },
  /** Safety car, pit stops, warnings. */
  orange: {
    DEFAULT: { dark: "245 166 35", light: "230 140 20" },
    fg: { dark: "245 166 35", light: "160 100 10" },
    line: { dark: "135 93 24", light: "168 120 40" },
    tint: { dark: "45 31 14", light: "250 238 208" },
  },
  /** Errors, retirements, braking, deleted laps. */
  red: {
    DEFAULT: { dark: "255 82 82", light: "214 40 60" },
    fg: { dark: "255 138 138", light: "180 30 50" },
    line: { dark: "122 45 56", light: "190 80 100" },
    tint: { dark: "42 18 23", light: "250 215 220" },
  },
  /** Information, references, rain, team radio. */
  blue: {
    DEFAULT: { dark: "77 166 255", light: "40 120 210" },
    fg: { dark: "155 201 255", light: "30 100 190" },
    line: { dark: "56 91 138", light: "100 144 204" },
    tint: { dark: "23 36 55", light: "207 224 246" },
  },
  /** Pit lane (toasts, pit feed). */
  teal: {
    DEFAULT: { dark: "20 184 166", light: "13 148 136" },
    fg: { dark: "94 234 212", light: "15 118 110" },
    line: { dark: "17 94 89", light: "94 180 170" },
    tint: { dark: "15 38 38", light: "208 240 236" },
  },
} satisfies Record<string, Record<"DEFAULT" | "fg" | "line" | "tint", ThemeColor>>;

/** Brand red. The fill is identical in both modes; `fg` is its text tint. */
export const BRAND_COLORS = {
  f1red: {
    DEFAULT: { dark: "232 0 45", light: "232 0 45" },
    hover: { dark: "200 0 39", light: "200 0 39" },
    fg: { dark: "255 92 119", light: "200 16 46" },
  },
  /** Podium medals (results grid). */
  podium: {
    gold: { dark: "252 211 77", light: "252 211 77" },
    silver: { dark: "192 192 192", light: "192 192 192" },
    bronze: { dark: "205 127 50", light: "205 127 50" },
  },
} satisfies Record<string, Record<string, ThemeColor>>;

/**
 * Small text sizes for dense timing UI (font-size only; set leading
 * separately). Tailwind's `text-sm` and larger cover everything from 14px up.
 */
export const FONT_SIZES = {
  /** Units, map overlay labels. */
  micro: "8px",
  /** Badges and chips. */
  tiny: "9px",
  /** Labels, column headers, buttons. */
  caption: "10px",
  /** Dense table and feed text. */
  small: "11px",
  /** Feed titles, toast headlines. */
  compact: "12px",
  /** Dialog body copy. */
  body: "13px",
  /** Large HUD readouts. */
  stat: "22px",
} as const;

/** Uppercase letter-spacing steps, on top of Tailwind's `wide` / `wider` / `widest`. */
export const LETTER_SPACING = {
  /** Panel titles, buttons, chips. */
  caps: "0.12em",
  /** Eyebrows and section kickers. */
  eyebrow: "0.16em",
  /** Brand wordmark, hero eyebrows. */
  spaced: "0.2em",
} as const;

/**
 * Named stacking layers above Tailwind's 0–50 scale (`z-<name>`), lowest
 * first. Layout inside a panel keeps using `z-10` / `z-20`.
 */
export const Z_LAYERS = {
  /** Banners floating over the track map. */
  overlay: 120,
  /** Full-screen dialogs and their backdrops. */
  modal: 200,
  /** Guided tour (react-joyride): above any dialog. */
  tour: 210,
  /** Pickers and menus, which can open from inside a dialog. */
  popover: 220,
  /** Pointer-following tooltips. */
  tooltip: 300,
} as const;

const toHex = (channels: string): string =>
  `#${channels
    .split(" ")
    .map((c) => Number(c).toString(16).padStart(2, "0"))
    .join("")}`;

/**
 * Dark-theme hex of the solid tones, for places that can't read CSS variables:
 * canvas, uPlot/Recharts series, Mapbox paint and SVG presentation attributes.
 * In class names use the Tailwind token (`bg-purple`) instead.
 */
export const TOKEN_HEX = {
  purple: toHex(TONE_COLORS.purple.DEFAULT.dark),
  green: toHex(TONE_COLORS.green.DEFAULT.dark),
  greenFg: toHex(TONE_COLORS.green.fg.dark),
  yellow: toHex(TONE_COLORS.yellow.DEFAULT.dark),
  orange: toHex(TONE_COLORS.orange.DEFAULT.dark),
  red: toHex(TONE_COLORS.red.DEFAULT.dark),
  redFg: toHex(TONE_COLORS.red.fg.dark),
  blue: toHex(TONE_COLORS.blue.DEFAULT.dark),
  teal: toHex(TONE_COLORS.teal.DEFAULT.dark),
  f1red: toHex(BRAND_COLORS.f1red.DEFAULT.dark),
  f1redFg: toHex(BRAND_COLORS.f1red.fg.dark),
  faint: toHex(NEUTRAL_COLORS.faint.dark),
} as const;
