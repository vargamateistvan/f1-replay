// Speed → HSL color: 0 km/h = blue (240°), 150 = green (120°), 300+ = red (0°).
// Matches the F1 broadcast "speed trace" convention.
export function speedToColor(speed: number): string {
  const hue = Math.round(240 - Math.min(speed / 300, 1) * 240);
  return `hsl(${hue},100%,55%)`;
}

const WIND_DIRECTIONS = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
];

export function windDir(deg: number): string {
  return WIND_DIRECTIONS[Math.round(deg / 22.5) % 16] ?? "-";
}

export function normalizeDeg(deg: number): number {
  let value = deg;
  while (value < -180) value += 360;
  while (value > 180) value -= 360;
  return value;
}

export function formatTrackClock(
  ms: number,
  timezone: "local" | "utc",
  localTimeZone?: string,
): string {
  const date = new Date(ms);
  return date.toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    ...(timezone === "utc"
      ? { timeZone: "UTC" }
      : localTimeZone
        ? { timeZone: localTimeZone }
        : {}),
  });
}

export function parseGmtOffsetToMinutes(
  offset: string | null | undefined,
): number {
  if (!offset) return 0;
  const text = offset.trim();
  const m = /^([+-])?(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  const hours = Number(m[2]);
  const mins = Number(m[3]);
  return sign * (hours * 60 + mins);
}

export function formatTrackTimeZoneId(offsetMinutes: number): string {
  if (offsetMinutes === 0) return "Etc/UTC";
  const abs = Math.abs(offsetMinutes);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  if (mm === 0) {
    // IANA Etc/GMT sign is inverted by convention: UTC+9 => Etc/GMT-9.
    return `Etc/GMT${offsetMinutes > 0 ? "-" : "+"}${hh}`;
  }
  const sign = offsetMinutes < 0 ? "-" : "+";
  const hourPart = String(hh).padStart(2, "0");
  const minPart = String(mm).padStart(2, "0");
  return `UTC${sign}${hourPart}:${minPart}`;
}

export function formatClockAtOffset(ms: number, offsetMinutes: number): string {
  const shifted = new Date(ms + offsetMinutes * 60_000);
  return shifted.toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "UTC",
  });
}

/** SVG map canvas colour (also used to knock out markers against the map). */
export function mapBackgroundColor(lightMode: boolean): string {
  return lightMode ? "#f7f9fe" : "#15151e";
}

/** Translucent backdrop for the HTML overlays drawn over the map. */
export function overlayBackgroundColor(lightMode: boolean): string {
  return lightMode ? "rgba(247,249,254,0.9)" : "rgba(21,21,30,0.82)";
}
