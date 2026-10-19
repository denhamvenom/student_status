import { describe, expect, it } from 'vitest'
import { canonicalSubteam, subteamDisplay, subteamOptions } from './subteams'

describe('subteam compatibility', () => {
  it('keeps the five approved choices and an unassigned display', () => {
    expect(subteamOptions).toEqual(['Build', 'Electrical', 'Machining', 'Programming', 'Business/Media'])
    expect(subteamDisplay('')).toBe('Unassigned')
  })

  it('groups earlier stored values without writing new values', () => {
    expect(canonicalSubteam('Mechanical')).toBe('Build')
    expect(canonicalSubteam('Business')).toBe('Business/Media')
    expect(canonicalSubteam('Outreach')).toBe('Business/Media')
    expect(canonicalSubteam('Business and Media')).toBe('Business/Media')
    expect(canonicalSubteam('Business/Outreach')).toBe('Business/Outreach')
    expect(canonicalSubteam('Programming')).toBe('Programming')
  })
})
