import { describe, expect, it } from 'vitest'
import { eventDraftIssue, type EventDraft } from './new-event-validation'
const draft: EventDraft = { name: 'Team event', start: '2027-07-01T09:00', end: '2027-07-01T17:00', destination: 'Venue', mode: 'open', capacity: '', fee: '0', travel: 'Team vehicles', overnight: false, rooming: false, roomDeadline: '' }
describe('event wizard validation', () => {
  it('stops the first step at the missing field and rejects reversed dates', () => {
    expect(eventDraftIssue({ ...draft, name: '', start: '', end: '' }, 0)?.field).toBe('event-name')
    expect(eventDraftIssue({ ...draft, start: '' }, 0)?.field).toBe('event-start')
    expect(eventDraftIssue({ ...draft, end: '2027-06-30T17:00' }, 0)?.field).toBe('event-end')
  })
  it('validates each step independently and all fields before creation', () => {
    expect(eventDraftIssue({ ...draft, travel: '' }, 0)).toBeNull()
    expect(eventDraftIssue({ ...draft, travel: '' })?.step).toBe(4)
    expect(eventDraftIssue({ ...draft, capacity: '1.5' }, 1)?.field).toBe('event-capacity')
    expect(eventDraftIssue({ ...draft, fee: '-1' }, 2)?.field).toBe('event-fee')
    expect(eventDraftIssue(draft)).toBeNull()
  })
})
