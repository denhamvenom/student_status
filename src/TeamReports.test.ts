import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamReports } from './TeamReports'

const mocks = vi.hoisted(() => ({ useQuery: vi.fn(), usePaginatedQuery: vi.fn(), subteam: '', attendanceState: 'ready', stateCall: 0 }))
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useState: (initial: unknown) => {
    mocks.stateCall += 1
    return actual.useState(mocks.stateCall === 3 && mocks.subteam ? mocks.subteam : initial)
  } }
})
vi.mock('convex/react', () => ({ useQuery: mocks.useQuery, usePaginatedQuery: mocks.usePaginatedQuery }))

const row = {
  studentId: 'fictional-student', name: 'Fictional Member', subteam: 'Mechanical', travelTeam: false,
  finance: { chargedCents: 0, paidCents: 0, dueCents: 0, raisedCents: 0, travelAccountCents: 0 },
  attendance: null as null | { offTuesday: number; offThursday: number; offOutreach: number; buildWeekday: number; buildSaturday: number; buildSunday: number; buildOutreach: number }, eventsCount: 0, selectedEvent: null,
}
function render(status:'Exhausted'|'CanLoadMore',results:typeof row[]=[row]) {
  mocks.stateCall = 0
  mocks.usePaginatedQuery.mockReturnValue({results,status,loadMore:vi.fn()})
  return renderToStaticMarkup(createElement(TeamReports,{role:'coach'}))
}
beforeEach(() => {
  mocks.subteam = ''
  mocks.attendanceState = 'ready'
  mocks.useQuery.mockReset()
  mocks.useQuery
    .mockReturnValueOnce({items:[{eventId:'fictional-event',name:'Fictional Event',startsAt:1810000000000}],coverage:'complete'})
    .mockReturnValueOnce({seasonId:'fictional-season',attendance:{state:mocks.attendanceState,kickoff:mocks.attendanceState==='ready'?1:null},eventsCoverage:'complete'})
})
describe('team report scope without a selected event', () => {
  it('shows empty event columns and an exhaustive student count', () => {
    const html=render('Exhausted')
    expect(html).toContain('Choose an event to see who is ready and what is still to do.')
    expect(html).toContain('Showing all 1 student.')
    expect(html).toMatch(/data-label="Still to do">—<\/td>/)
    expect(html).toMatch(/data-label="Readiness">—<\/td>/)
    expect(html).not.toContain('Load more students')
  })
  it('keeps partial results scoped and offers more rows', () => {
    const html=render('CanLoadMore')
    expect(html).toContain('Showing 1 student so far. Press Load more to see more. Filters and the CSV file use only the students shown.')
    expect(html).not.toContain('Showing all 1 student.')
    expect(html).toContain('Load more students')
  })
  it('counts visible rows when loaded students are filtered', () => {
    mocks.subteam = 'Build'
    const html = render('CanLoadMore', [row, { ...row, studentId: 'other-student', name: 'Other Member', subteam: 'Electrical' }])
    expect(html).toContain('Showing 1 of 2 loaded students for these filters. Press Load more to see more. Filters and the CSV file use only the students shown.')
    expect(html).toContain('Fictional Member')
    expect(html).not.toContain('Other Member</button>')
  })
  it('labels attendance before kickoff as not counted yet, then shows a recorded zero', () => {
    mocks.useQuery.mockReset().mockReturnValueOnce({ items: [], coverage: 'complete' }).mockReturnValueOnce({ seasonId: 'fictional-season', attendance: { state: 'unknownKickoff', kickoff: null }, eventsCoverage: 'complete' })
    const before = render('Exhausted')
    expect(before).toContain('data-label="Tuesday meetings">Not counted yet</td>')
    mocks.useQuery.mockReset().mockReturnValueOnce({ items: [], coverage: 'complete' }).mockReturnValueOnce({ seasonId: 'fictional-season', attendance: { state: 'ready', kickoff: 1 }, eventsCoverage: 'complete' })
    const after = render('Exhausted', [{ ...row, attendance: { offTuesday: 0, offThursday: 0, offOutreach: 0, buildWeekday: 0, buildSaturday: 0, buildSunday: 0, buildOutreach: 0 } }])
    expect(after).toContain('data-label="Tuesday meetings">0</td>')
  })
})
