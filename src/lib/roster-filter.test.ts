import { describe, expect, it } from 'vitest'
import { inRosterGroup, rosterGroupOptions } from './roster-filter'
import { subteamOptions } from './subteams'

describe('roster group filter', () => {
  it('offers every primary subteam, then CAD, Leadership and No subteam', () => {
    expect(rosterGroupOptions).toEqual([...subteamOptions, 'CAD', 'Leadership', 'No subteam'])
  })
  it.each([
    ['blank filter keeps everyone', { subteam: 'Build' }, '', true],
    ['legacy primary name', { subteam: 'Mechanical' }, 'Build', true],
    ['second subteam CAD', { subteam: 'Build', secondarySubteam: 'CAD' }, 'CAD', true],
    ['no second subteam', { subteam: 'Build', secondarySubteam: null }, 'CAD', false],
    ['Leadership member', { subteam: 'Programming', leadership: true }, 'Leadership', true],
    ['not Leadership', { subteam: 'Programming', leadership: false }, 'Leadership', false],
    ['primary subteam nobody else filters for', { subteam: 'Machining' }, 'Machining', true],
    ['legacy Business name', { subteam: 'Outreach' }, 'Business/Media', true],
    ['no subteam chosen', { subteam: '' }, 'No subteam', true],
    ['blank-looking subteam', { subteam: '  ' }, 'No subteam', true],
    ['has a subteam', { subteam: 'Electrical', secondarySubteam: 'CAD' }, 'No subteam', false],
    ['no subteam is not in Build', { subteam: '' }, 'Build', false],
  ])('%s', (_label, student, group, expected) => {
    expect(inRosterGroup(student, group)).toBe(expected)
  })
})
