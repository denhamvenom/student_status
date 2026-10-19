export const subteamOptions = ['Build', 'Electrical', 'Machining', 'Programming', 'Business/Media'] as const

/** Display legacy values under their approved current names until a reviewed migration runs. */
export function canonicalSubteam(value: string): string {
  const trimmed = value.trim()
  if (trimmed === 'Mechanical') return 'Build'
  if (trimmed === 'Business' || trimmed === 'Outreach' || trimmed === 'Business and Media') return 'Business/Media'
  return trimmed
}

export function subteamDisplay(value: string): string {
  return canonicalSubteam(value) || 'Unassigned'
}
