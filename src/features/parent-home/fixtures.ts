import type { Id } from '../../../convex/_generated/dataModel'
import type { WhatsLeftItem } from '../student-home/contract'
import type { ParentHomeFinance, ParentHomeSummary, ParentPinnedAnnouncement } from './contract'

const studentId = 'preview-student' as Id<'students'>
const eventId = 'preview-event' as Id<'events'>
const now = Date.UTC(2026, 9, 29, 16)
const work = (key: string, kind: WhatsLeftItem['kind'], owner: WhatsLeftItem['owner'], eventName: string | null = null): WhatsLeftItem => ({ key, kind, owner, eventId: eventName ? eventId : null, eventName, label: null, dueAt: eventName ? now + 3 * 86400000 : null, href: owner === 'student' ? '/events' : null })
const urgentWork = [work('health', 'healthProfile', 'parent'), work('first', 'firstRegistration', 'parent'), work('form', 'permissionForm', 'parent', 'River City Regional'), work('fee', 'requiredPayment', 'parent', 'River City Regional'), work('student', 'roomChoice', 'student', 'River City Regional'), work('coach', 'firstVerification', 'coach')]
const summary = (whatsLeft: WhatsLeftItem[]): ParentHomeSummary => ({ studentId, whatsLeft, nextEvent: { eventId, name: 'River City Regional', startsAt: now + 3 * 86400000, location: 'Kansas City', status: 'confirmed' } })
const finance = (chargedCents: number, paidCents: number, dueCents: number): ParentHomeFinance => ({ state: 'ready', chargedCents, paidCents, dueCents, personalAvailableCents: dueCents > 0 ? 0 : 2500, fundraisingAvailableCents: dueCents > 0 ? 0 : 1200 } as ParentHomeFinance)
const announcements: ParentPinnedAnnouncement[] = [{ id: 'preview-pin' as ParentPinnedAnnouncement['id'], title: 'Regional travel reminder', body: 'Please check the event details before Friday.', authorName: 'Coach Rivera', authorRole: 'coach', pinnedAt: now, showUntil: null }]

export const parentHomeFixtures = {
  urgent: { now, summary: summary(urgentWork), finance: finance(18000, 6000, 12000), announcements },
  allDone: { now, summary: summary([work('student', 'roomChoice', 'student')]), finance: finance(18000, 18000, 0), announcements },
  noFees: { now, summary: summary([]), finance: finance(0, 0, 0), announcements: [] as ParentPinnedAnnouncement[] },
}
