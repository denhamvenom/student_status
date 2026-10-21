import { getFunctionName } from 'convex/server'
import { createElement, type ChangeEvent, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamReports } from './TeamReports'

const mocks = vi.hoisted(() => ({
  useQuery: vi.fn(), usePaginatedQuery: vi.fn(), attendanceState: 'ready',
  stateCursor: 0, states: [] as unknown[],
  changeSubteam: null as null | ((event: ChangeEvent<HTMLSelectElement>) => void),
}))
// Preserve state between static renders so the real select handler chooses which
// state changes. Slot allocation follows hook calls, without selecting a hook by ordinal.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useState: (initial: unknown) => {
    const slot = mocks.stateCursor++
    if (!(slot in mocks.states)) mocks.states[slot] = typeof initial === 'function' ? initial() : initial
    return [mocks.states[slot], (value: unknown) => {
      mocks.states[slot] = typeof value === 'function' ? value(mocks.states[slot]) : value
    }]
  } }
})
vi.mock('./components/ui/native-select', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./components/ui/native-select')>()
  const react = await import('react')
  return { ...actual, NativeSelect: (props: ComponentProps<typeof actual.NativeSelect>) => {
    if (react.Children.toArray(props.children).some(child => react.isValidElement<{ value?: string }>(child) && child.props.value === 'Build')) {
      mocks.changeSubteam = props.onChange ?? null
    }
    return react.createElement(actual.NativeSelect, props)
  } }
})
vi.mock('convex/react', () => ({ useQuery: mocks.useQuery, usePaginatedQuery: mocks.usePaginatedQuery }))

const row = {
  studentId: 'fictional-student', name: 'Fictional Member', subteam: 'Mechanical', travelTeam: false,
  finance: { chargedCents: 0, paidCents: 0, dueCents: 0, raisedCents: 0, travelAccountCents: 0 },
  attendance: null as null | { offTuesday: number; offThursday: number; offOutreach: number; buildWeekday: number; buildSaturday: number; buildSunday: number; buildOutreach: number }, eventsCount: 0, selectedEvent: null,
}
function render(status:'Exhausted'|'CanLoadMore',results:typeof row[]=[row]) {
  mocks.stateCursor = 0
  mocks.usePaginatedQuery.mockReturnValue({results,status,loadMore:vi.fn()})
  return renderToStaticMarkup(createElement(TeamReports,{role:'coach'}))
}
beforeEach(() => {
  mocks.states = []
  mocks.changeSubteam = null
  mocks.attendanceState = 'ready'
  mocks.useQuery.mockReset().mockImplementation(reference => {
    const name = getFunctionName(reference)
    if (name === 'teamReports:events') return {items:[{eventId:'fictional-event',name:'Fictional Event',startsAt:1810000000000}],coverage:'complete'}
    if (name === 'teamReports:context') return {seasonId:'fictional-season',attendance:{state:mocks.attendanceState,kickoff:mocks.attendanceState==='ready'?1:null},eventsCoverage:'complete'}
    return undefined
  })
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
    const results = [row, { ...row, studentId: 'other-student', name: 'Other Member', subteam: 'Electrical' }]
    render('CanLoadMore', results)
    expect(mocks.changeSubteam).not.toBeNull()
    mocks.changeSubteam!({ target: { value: 'Build' } } as ChangeEvent<HTMLSelectElement>)
    const html = render('CanLoadMore', results)
    expect(html).toContain('Showing 1 of 2 loaded students for these filters. Press Load more to see more. Filters and the CSV file use only the students shown.')
    expect(html).toContain('Fictional Member')
    expect(html).not.toContain('Other Member</button>')
  })
  it('labels attendance before kickoff as not counted yet, then shows a recorded zero', () => {
    mocks.attendanceState = 'unknownKickoff'
    const before = render('Exhausted')
    expect(before).toContain('data-label="Tuesday meetings">Not counted yet</td>')
    mocks.attendanceState = 'ready'
    const after = render('Exhausted', [{ ...row, attendance: { offTuesday: 0, offThursday: 0, offOutreach: 0, buildWeekday: 0, buildSaturday: 0, buildSunday: 0, buildOutreach: 0 } }])
    expect(after).toContain('data-label="Tuesday meetings">0</td>')
  })
})
