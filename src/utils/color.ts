import { TELEMETRY_TEAM_COLOR_MIX } from '@/constants'

// OpenF1 team_colour comes without a leading '#' — normalise it here
export function teamColor(colour: string | null | undefined, fallback = '#888888'): string {
  if (!colour) return fallback
  return colour.startsWith('#') ? colour : `#${colour}`
}

/** Keep the first team's colour and give later matching slots a contrasting tint. */
export function telemetryComparisonColors(colors: readonly (string | null)[]): (string | null)[] {
  const counts = new Map<string, number>()
  return colors.map((color) => {
    if (color === null) return null
    const key = color.toLowerCase()
    const occurrence = counts.get(key) ?? 0
    counts.set(key, occurrence + 1)
    if (occurrence === 0) return color

    const match = /^#([0-9a-f]{6})$/i.exec(color)
    if (!match) return color
    const rgb = [0, 2, 4].map((offset) => parseInt(match[1]!.slice(offset, offset + 2), 16))
    const light = (rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722) > 180
    const target = light ? 0 : 255
    const mix = TELEMETRY_TEAM_COLOR_MIX[Math.min(occurrence - 1, TELEMETRY_TEAM_COLOR_MIX.length - 1)]!
    return `#${rgb.map((channel) => Math.round(channel + (target - channel) * mix).toString(16).padStart(2, '0')).join('')}`
  })
}
