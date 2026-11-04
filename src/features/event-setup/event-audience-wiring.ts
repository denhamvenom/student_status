// Turns the New event "Who's going" choices into createEvent arguments, and describes a saved event's audience
// in plain words for event pages. Pure: no Convex calls, so the rules are tested directly.
import type { Id } from '../../../convex/_generated/dataModel'
import { resolveAudience, type AudienceEventFields } from '../../../convex/lib/eventAudienceRules'
import { subteamDisplay } from '@/lib/subteams'
import { uiCopy } from '@/lib/ui-copy'
import { audienceCopy } from './audience/audience-copy'
import { invitedMentorIds } from './audience/audience-rules'
import type { AudienceValue, LocationType, MentorInviteValue, MentorOption } from './audience/types'

/** Travel Team stays the Coach's legacy one-tap choice; everything else goes through the audience picker. */
export type WhoChoice = { travelTeam: boolean; audience: AudienceValue; mentors: MentorInviteValue }

export const whoCopy = {
  travelTeam: uiCopy.audiences.travelTeam,
  travelTeamDetail: 'Active Travel Team students are added when the event is created.',
  chooseAudience: 'Choose who it’s for',
  chooseAudienceDetail: 'Everyone, subteams, specific students or mentors only.',
  required: 'Required — signed up automatically',
  optional: 'Optional — they choose to sign up',
  notApplicable: 'Does not apply (mentors only)',
  mentorsInvited: (count: number) => count === 1 ? '1 mentor invited' : `${count} mentors invited`,
  noMentors: 'No mentors invited',
  inPerson: audienceCopy.location.inPerson.label,
  virtual: audienceCopy.location.virtual.label,
} as const

/** Assigned when the group is signed up automatically (Travel Team, required, mentors only); otherwise open signup. */
export function whoSignupMode(who: WhoChoice): 'assigned' | 'open' {
  if (who.travelTeam) return 'assigned'
  return who.audience.kind === 'mentors' || who.audience.required ? 'assigned' : 'open'
}

/** A participant limit only makes sense when students choose to sign up. */
export const capacityApplies = (who: WhoChoice) => whoSignupMode(who) === 'open'

export type AudienceCreateArgs = {
  signupMode: 'assigned' | 'open'
  assignmentScope?: 'travelTeam'
  audienceKind?: 'everyone' | 'subteams' | 'students' | 'mentorsOnly'
  audienceSubteams?: string[]
  mandatory?: boolean
  audienceStudentIds?: Id<'students'>[]
  mentorInviteUserIds?: Id<'appUsers'>[]
  inviteSubteamMentors?: boolean
  locationType: LocationType
}

/**
 * createEvent's audience arguments. Travel Team keeps the legacy assigned + travelTeam shape (no audienceKind);
 * picked mentors are sent individually and "mentors of the chosen subteams" is left to the backend.
 */
export function audienceCreateArgs(who: WhoChoice, mentors: readonly MentorOption[], locationType: LocationType): AudienceCreateArgs {
  const known = new Set(mentors.map(mentor => mentor.id))
  const picked = [...new Set(who.mentors.mentorIds.filter(id => known.has(id)))] as Id<'appUsers'>[]
  const base = { locationType, ...(picked.length ? { mentorInviteUserIds: picked } : {}) }
  if (who.travelTeam) return { ...base, signupMode: 'assigned', assignmentScope: 'travelTeam' }
  const audience = who.audience
  return {
    ...base,
    // The backend derives the stored signup mode from the audience; open is the optional-signup default.
    signupMode: 'open',
    audienceKind: audience.kind === 'mentors' ? 'mentorsOnly' : audience.kind,
    mandatory: audience.kind !== 'mentors' && audience.required,
    ...(audience.kind === 'subteams' ? { audienceSubteams: [...audience.subteams] } : {}),
    ...(audience.kind === 'students' ? { audienceStudentIds: [...audience.studentIds] as Id<'students'>[] } : {}),
    ...(audience.kind === 'subteams' && who.mentors.includeSubteamMentors ? { inviteSubteamMentors: true } : {}),
  }
}

const subteamList = (subteams: readonly string[]) => subteams.map(subteamDisplay).join(', ')

/** One line for the New event review: who it is for and whether it is required. */
export function whoReviewText(who: WhoChoice): string {
  if (who.travelTeam) return `${whoCopy.travelTeam} · ${whoCopy.required}`
  const audience = who.audience
  const kinds = audienceCopy.audience.kinds
  if (audience.kind === 'mentors') return kinds.mentors.label
  const group = audience.kind === 'subteams' ? `${kinds.subteams.label}: ${subteamList(audience.subteams)}`
    : audience.kind === 'students' ? audienceCopy.audience.studentsChosen(audience.studentIds.length)
      : kinds.everyone.label
  return `${group} · ${audience.required ? whoCopy.required : whoCopy.optional}`
}

/** Mentors who will be invited, counted the same way as the picker. */
export const mentorReviewText = (who: WhoChoice, mentors: readonly MentorOption[]) => {
  const count = who.travelTeam ? who.mentors.mentorIds.filter(id => mentors.some(m => m.id === id)).length : invitedMentorIds(who.mentors, mentors, who.audience).length
  return count ? whoCopy.mentorsInvited(count) : whoCopy.noMentors
}

type SavedEvent = AudienceEventFields & { locationType?: string }

/** "Who it's for" on an event page. Events saved before audiences existed keep their old names. */
export function eventAudienceLabel(event: SavedEvent): string {
  const audience = resolveAudience(event)
  const kinds = audienceCopy.audience.kinds
  if (audience.legacy) return event.signupMode !== 'assigned' ? uiCopy.audiences.open : event.assignmentScope === 'wholeTeam' ? uiCopy.audiences.wholeTeam : event.assignmentScope === 'travelTeam' ? uiCopy.audiences.travelTeam : kinds.students.label
  if (audience.kind === 'mentorsOnly') return kinds.mentors.label
  if (audience.kind === 'subteams') return audience.subteams.length ? `${kinds.subteams.label}: ${subteamList(audience.subteams)}` : kinds.subteams.label
  return kinds[audience.kind].label
}

/** Whether the event signs its group up automatically. */
export function eventRequiredLabel(event: SavedEvent): string {
  const audience = resolveAudience(event)
  if (audience.kind === 'mentorsOnly') return whoCopy.notApplicable
  return audience.mandatory ? whoCopy.required : whoCopy.optional
}

export const isVirtualEvent = (event: { locationType?: string }) => event.locationType === 'virtual'

export const eventLocationTypeLabel = (event: { locationType?: string }) => isVirtualEvent(event) ? whoCopy.virtual : whoCopy.inPerson

export const badgeCopy = {
  required: 'Required',
  optional: 'Optional',
  virtual: audienceCopy.location.virtual.label,
} as const

/**
 * Short badges for an event card or page header: who it's for (Everyone, subteam names, Mentors only…), Required or
 * Optional, and Virtual (Discord). Reads loosely typed list rows; events without a signup mode show no audience badges.
 */
export function eventBadges(event: { signupMode?: string; assignmentScope?: string; audienceKind?: string; audienceSubteams?: string[]; mandatory?: boolean; locationType?: string }): string[] {
  const badges: string[] = []
  if (event.signupMode) {
    const saved = event as SavedEvent
    const audience = resolveAudience(saved)
    badges.push(audience.kind === 'subteams' && audience.subteams.length ? subteamList(audience.subteams) : eventAudienceLabel(saved))
    if (audience.kind !== 'mentorsOnly') badges.push(audience.mandatory ? badgeCopy.required : badgeCopy.optional)
  }
  if (isVirtualEvent(event)) badges.push(badgeCopy.virtual)
  return badges
}

export type SeriesProgress = { moreMeetingsScheduled?: boolean; windowDays?: number; generatedThroughDate?: string | null; plannedMeetingCount?: number | null }

/** Under a repeating meeting's title: how far ahead meetings exist and that more are added automatically. */
export function seriesProgressNote(series: SeriesProgress | null | undefined): string | null {
  if (!series) return null
  const weeks = series.windowDays ? Math.round(series.windowDays / 7) : null
  const planned = series.plannedMeetingCount ? ` ${series.plannedMeetingCount} meetings are planned in total.` : ''
  if (series.moreMeetingsScheduled) return `${weeks ? `More meetings are added automatically, ${weeks} weeks ahead.` : 'More meetings are added automatically.'}${planned}`
  return planned ? planned.trim() : null
}
