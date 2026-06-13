// OpenF1 team_colour comes without a leading '#' — normalise it here
export function teamColor(colour: string | null | undefined, fallback = '#888888'): string {
  if (!colour) return fallback
  return colour.startsWith('#') ? colour : `#${colour}`
}
