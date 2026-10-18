import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamReports } from './TeamReports'

const mocks = vi.hoisted(() => ({ useQuery: vi.fn(), usePaginatedQuery: vi.fn() }))
vi.mock('convex/react', () => ({ useQuery: mocks.useQuery, usePaginatedQuery: mocks.usePaginatedQuery }))

const row = {
  studentId: 'fictional-student', name: 'Fictional Member', subteam: 'Mechanical', travelTeam: false,
  finance: { chargedCents: 0, paidCents: 0, dueCents: 0, raisedCents: 0, travelAccountCents: 0 },
  attendance: null, eventsCount: 0, selectedEvent: null,
}
function render(status:'Exhausted'|'CanLoadMore',results:typeof row[]=[row]) {
  mocks.usePaginatedQuery.mockReturnValue({results,status,loadMore:vi.fn()})
  return renderToStaticMarkup(createElement(TeamReports,{role:'coach'}))
}
beforeEach(() => {
  mocks.useQuery.mockReset()
  mocks.useQuery
    .mockReturnValueOnce({items:[{eventId:'fictional-event',name:'Fictional Event',startsAt:1810000000000}],coverage:'complete'})
    .mockReturnValueOnce({seasonId:'fictional-season',attendance:{state:'ready',kickoff:1},eventsCoverage:'complete'})
})
describe('team report scope without a selected event', () => {
  it('shows empty event columns and an exhaustive student count', () => {
    const html=render('Exhausted')
    expect(html).toContain('Choose an event to see readiness and outstanding requirements.')
    expect(html).toContain('Showing all 1 students.')
    expect(html).toMatch(/data-label="Outstanding">—<\/td>/)
    expect(html).toMatch(/data-label="Readiness">—<\/td>/)
    expect(html).not.toContain('Load more students')
  })
  it('keeps partial results scoped and offers more rows', () => {
    const html=render('CanLoadMore')
    expect(html).toContain('Showing 1 of 1 students shown so far.')
    expect(html).not.toContain('Showing all 1 students.')
    expect(html).toContain('Load more students')
  })
})
