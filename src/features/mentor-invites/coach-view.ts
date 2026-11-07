// Coach / Travel Lead view of an event's Mentors (mentorInvites.forEventSummary): grouping, how each Mentor joined, their
// answers and the totals line. Pure, so the wording is tested directly; the server decides who may read it.
import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import { eventMentorsCopy as copy } from './copy'

export type EventMentorSummary = FunctionReturnType<typeof api.mentorInvites.forEventSummary>
export type EventMentor = EventMentorSummary['mentors'][number]

/** Going first, then waiting for an answer, then can't go; each keeps the server's name order. */
export function groupMentors(mentors: readonly EventMentor[]): { going: EventMentor[]; waiting: EventMentor[]; declined: EventMentor[] } {
  return {
    going: mentors.filter(mentor => mentor.status === 'accepted'),
    waiting: mentors.filter(mentor => mentor.status === 'invited'),
    declined: mentors.filter(mentor => mentor.status === 'declined'),
  }
}

/** How the Mentor joined: "Invited" / "Invited with subteam" / "Signed up themselves", plus their series choice if any. */
export function joinedLabels(mentor: Pick<EventMentor, 'source' | 'seriesScope' | 'seriesCount'>): string[] {
  const labels: string[] = [mentor.source === 'self' ? copy.joined.self : mentor.source === 'subteam' ? copy.joined.subteam : copy.joined.invited]
  if (mentor.seriesScope === 'all') labels.push(copy.joined.seriesAll)
  else if (mentor.seriesScope === 'next') labels.push(copy.joined.seriesNext(mentor.seriesCount ?? 1))
  else if (mentor.seriesScope === 'one') labels.push(copy.joined.seriesOne)
  return labels
}

/** A going Mentor's answers to the questions this event asks: "Can drive", "Needs hotel room", or that they haven't answered. */
export function answerLabels(mentor: Pick<EventMentor, 'status' | 'canDriveStudents' | 'needsHotelRoom'>, questions: EventMentorSummary['questions']): { text: string; tone: 'yes' | 'missing' }[] {
  if (mentor.status !== 'accepted') return []
  const out: { text: string; tone: 'yes' | 'missing' }[] = []
  if (questions.askDrive && mentor.canDriveStudents === true) out.push({ text: copy.answers.canDrive, tone: 'yes' })
  if (questions.askDrive && mentor.canDriveStudents === null) out.push({ text: copy.answers.driveUnanswered, tone: 'missing' })
  if (questions.askHotel && mentor.needsHotelRoom === true) out.push({ text: copy.answers.needsHotel, tone: 'yes' })
  if (questions.askHotel && mentor.needsHotelRoom === null) out.push({ text: copy.answers.hotelUnanswered, tone: 'missing' })
  return out
}

/** "3 Mentors can drive · 2 hotel rooms needed" for the questions this event asks; null when it asks none. */
export function totalsLine(summary: Pick<EventMentorSummary, 'questions' | 'counts'>): string | null {
  const parts: string[] = []
  if (summary.questions.askDrive) parts.push(copy.drivers(summary.counts.drivers))
  if (summary.questions.askHotel) parts.push(copy.hotelRooms(summary.counts.hotelRooms))
  return parts.length ? parts.join(' · ') : null
}

/**
 * The Mentors section's header line (owner decision, Nov 7 2026): "3 going · 1 waiting · 2 can drive · 1 hotel room". Waiting
 * appears only when someone hasn't answered; drive and hotel totals only when the event asks those questions.
 */
export function headerLine(summary: Pick<EventMentorSummary, 'questions' | 'counts'>): string {
  const parts = [copy.header.going(summary.counts.accepted)]
  if (summary.counts.invited) parts.push(copy.header.waiting(summary.counts.invited))
  if (summary.questions.askDrive) parts.push(copy.header.canDrive(summary.counts.drivers))
  if (summary.questions.askHotel) parts.push(copy.header.hotelRooms(summary.counts.hotelRooms))
  return parts.join(' · ')
}

/** The Mentors section starts open when at least one Mentor is going or waiting for an answer. */
export function mentorsOpenByDefault(summary: Pick<EventMentorSummary, 'counts'>): boolean {
  return summary.counts.accepted + summary.counts.invited > 0
}
