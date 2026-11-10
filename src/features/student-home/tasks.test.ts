import { describe, expect, it } from 'vitest'
import type { Id } from '../../../convex/_generated/dataModel'
import type { WhatsLeftItem } from './contract'
import { guideForItem, itemForOpenRow, openRowKind, reminderMessage } from './tasks'

const item = (kind: WhatsLeftItem['kind'], owner: WhatsLeftItem['owner'], extra: Partial<WhatsLeftItem> = {}): WhatsLeftItem => ({ key: `${kind}:${owner}`, kind, owner, eventId: 'e1' as Id<'events'>, eventName: 'Regional', label: null, dueAt: null, href: null, ...extra })

describe('who must act on a What\'s left item', () => {
  it.each([
    { name: 'a parent-owned permission form waits for the parent and can be nudged', item: item('permissionForm', 'parent'), headline: 'Waiting for your parent', remind: true, action: null },
    { name: 'a fee waits for the parent but Money is linked', item: item('requiredPayment', 'parent'), headline: 'Waiting for your parent', remind: true, action: '/finances' },
    { name: 'Coach review has nothing to nudge', item: item('permissionReview', 'coach'), headline: 'Waiting for a Coach to review the form', remind: false, action: null },
    { name: 'signup approval waits for a Coach', item: item('signupApproval', 'coach'), headline: 'Waiting for Coach approval', remind: false, action: null },
    { name: 'room choice is the Student\'s own task', item: item('roomChoice', 'student', { href: '/events/e1/rooming' }), headline: 'Your turn', remind: false, action: '/events/e1/rooming' },
  ])('$name', ({ item: row, headline, remind, action }) => {
    const guide = guideForItem(row, { viewer: 'student' })
    expect(guide.headline).toBe(headline)
    expect(guide.remind !== null).toBe(remind)
    expect(guide.action?.to ?? null).toBe(action)
  })

  it('the event FIRST requirement follows the season FIRST step, parent by default', () => {
    const eventFirst = item('requirement', 'student', { label: 'FIRST registration' })
    expect(guideForItem(eventFirst, { viewer: 'student' }).headline).toBe('Waiting for your parent')
    const adult = item('firstRegistration', 'student', { eventId: null, href: '/setup' })
    expect(guideForItem(eventFirst, { viewer: 'student', all: [adult] })).toMatchObject({ headline: 'Your turn', action: { to: '/setup' } })
    expect(guideForItem(eventFirst, { viewer: 'student', all: [item('firstVerification', 'coach', { eventId: null })] }).actor).toBe('coach')
  })

  it('a Parent never gets a button for the Student\'s room choice, and sees view-only wording', () => {
    const guide = guideForItem(item('roomChoice', 'student'), { viewer: 'parent', studentName: 'Alex' })
    expect(guide.action).toBeNull()
    expect(guide.headline).toBe('Waiting for Alex')
    expect(guide.explain).toContain('Alex picks')
  })

  it('reminders carry no health detail and name the event and date', () => {
    expect(reminderMessage(item('healthProfile', 'parent'), undefined, 'Dev Student')).toBe("Hi! Can you finish Health information in Dev Student's profile for Regional in Venom Status? Thank you!")
    expect(reminderMessage(item('healthProfile', 'parent'))).toContain('Health information in my profile')
    expect(reminderMessage(item('permissionForm', 'parent', { dueAt: Date.UTC(2026, 10, 12, 18) }))).toBe('Hi! Can you finish Permission form for Regional in Venom Status? It is due Thu, Nov 12. Thank you!')
  })
})

describe('event page requirement rows', () => {
  it.each([
    ['Required payment', 'requiredPayment'], ['Permission form', 'permissionForm'], ['FIRST registration and Consent & Release', 'firstRegistration'],
    ['FIRST registration', 'firstRegistration'], ['Room selection', 'roomChoice'], ['Financial records require review or are updating', 'staffReview'], ['Bring a lunch', 'requirement'],
  ])('%s is a %s', (label, kind) => expect(openRowKind(label)).toBe(kind))

  it('uses the Home item for the same event, else the usual owner', () => {
    const event = { id: 'e1', name: 'Regional' }
    const review = item('permissionReview', 'coach')
    expect(itemForOpenRow('Permission form', event, [review])).toBe(review)
    expect(itemForOpenRow('Permission form', event, [item('permissionForm', 'parent', { eventId: 'other' as Id<'events'> })])).toMatchObject({ owner: 'parent', kind: 'permissionForm', eventId: 'e1' })
    expect(itemForOpenRow('Room selection', event, [])).toMatchObject({ owner: 'student', href: '/events/e1/rooming' })
  })

  it("a Shifts row is the Student's Pick your shifts task, linking to the event's signup", () => {
    const event = { id: 'e1', name: 'Pancake breakfast' }
    const fallback = itemForOpenRow('Shifts', event, [])
    expect(fallback).toMatchObject({ key: 'shifts:e1', owner: 'student', href: '/events/e1#my-signup' })
    expect(guideForItem(fallback, { viewer: 'student' })).toMatchObject({ title: 'Pick your shifts', headline: 'Your turn', action: { label: 'Pick your shifts', to: '/events/e1#my-signup' } })
    expect(guideForItem(fallback, { viewer: 'parent', studentName: 'Alex' })).toMatchObject({ headline: 'Waiting for Alex', action: null })
    const home = item('requirement', 'student', { key: 'shifts:e1', label: 'Pick your shifts', href: '/events/e1#my-signup' })
    expect(itemForOpenRow('Shifts', event, [home])).toBe(home)
  })
})
