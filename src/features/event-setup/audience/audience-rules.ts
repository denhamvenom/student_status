// Pure rules behind the audience and mentor invite pickers, shared by the components and tests.
import { canonicalSubteam, subteamDisplay, subteamOptions } from '@/lib/subteams'
import { audienceCopy } from './audience-copy'
import type { AudienceKind, AudienceValue, LocationType, InPersonSection, MentorInviteValue, MentorOption, PickerIssue, StudentOption, Where } from './types'

export const audienceKinds: readonly AudienceKind[] = ['everyone', 'subteams', 'students', 'mentors']

/** Primary subteams plus the groups events are also aimed at. */
export const audienceSubteamOptions: readonly string[] = [...subteamOptions, 'CAD', 'Leadership']

export const defaultAudience = (): AudienceValue => ({ kind: 'everyone', subteams: [], studentIds: [], required: false })
export const defaultMentorInvite = (): MentorInviteValue => ({ mentorIds: [], includeSubteamMentors: false })

export function toggleItem<T>(list: readonly T[], item: T): T[] {
  return list.includes(item) ? list.filter(x => x !== item) : [...list, item]
}

/** Mentors-only events have no students to sign up, so the Required question does not apply. */
export const requiredApplies = (kind: AudienceKind) => kind !== 'mentors'

/** Only the Coach (canAutoAssign) may sign a whole group up automatically. */
export const requiredLocked = (kind: AudienceKind, canAutoAssign: boolean) => !canAutoAssign && (kind === 'everyone' || kind === 'subteams')

/** Switch who the event is for, turning Required off where it no longer applies or is not allowed. */
export function changeAudienceKind(value: AudienceValue, kind: AudienceKind, canAutoAssign: boolean): AudienceValue {
  const required = value.required && requiredApplies(kind) && !requiredLocked(kind, canAutoAssign)
  return { ...value, kind, required }
}

export function audienceIssue(value: AudienceValue, canAutoAssign: boolean): PickerIssue | null {
  const copy = audienceCopy.audience
  if (value.kind === 'subteams' && !value.subteams.length) return { field: 'subteams', message: copy.needSubteam }
  if (value.kind === 'students' && !value.studentIds.length) return { field: 'students', message: copy.needStudent }
  if (value.required && requiredLocked(value.kind, canAutoAssign)) return { field: 'required', message: copy.coachOnly }
  return null
}

/** Case-insensitive match on name or subteam; blank search keeps everyone. */
export function filterStudents(students: readonly StudentOption[], search: string): StudentOption[] {
  const needle = search.trim().toLowerCase()
  if (!needle) return [...students]
  return students.filter(s => s.name.toLowerCase().includes(needle) || subteamDisplay(s.subteam).toLowerCase().includes(needle))
}

const subteamKey = (value: string) => canonicalSubteam(value).toLowerCase()

/** Everyone who will be invited: picked mentors plus, for a Subteams event, mentors of those subteams. */
export function invitedMentorIds(invite: MentorInviteValue, mentors: readonly MentorOption[], audience: AudienceValue): string[] {
  const known = new Set(mentors.map(m => m.id))
  const ids = new Set(invite.mentorIds.filter(id => known.has(id)))
  if (audience.kind === 'subteams' && invite.includeSubteamMentors) {
    const chosen = new Set(audience.subteams.map(subteamKey))
    for (const mentor of mentors) if (mentor.subteams.some(s => chosen.has(subteamKey(s)))) ids.add(mentor.id)
  }
  return [...ids]
}

/** Chosen subteams no mentor belongs to, when "Also invite mentors of the chosen subteams" is on. */
export function subteamsWithoutMentors(invite: MentorInviteValue, mentors: readonly MentorOption[], audience: AudienceValue): string[] {
  if (audience.kind !== 'subteams' || !invite.includeSubteamMentors) return []
  const covered = new Set(mentors.flatMap(mentor => mentor.subteams.map(subteamKey)))
  return audience.subteams.filter(subteam => !covered.has(subteamKey(subteam))).map(subteamDisplay)
}

/** The picker's count line, naming subteams that have no mentors yet instead of only "No mentors will be invited". */
export function mentorCountText(invite: MentorInviteValue, mentors: readonly MentorOption[], audience: AudienceValue): string {
  const copy = audienceCopy.mentors
  const count = invitedMentorIds(invite, mentors, audience).length
  const missing = subteamsWithoutMentors(invite, mentors, audience)
  if (!missing.length) return copy.count(count)
  const gap = copy.noSubteamMentors(listNames(missing))
  return count ? `${copy.count(count)} ${gap}` : gap
}

const listNames = (names: readonly string[]) => names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

export function mentorInviteIssue(invite: MentorInviteValue, mentors: readonly MentorOption[], audience: AudienceValue): PickerIssue | null {
  if (audience.kind === 'mentors' && !invitedMentorIds(invite, mentors, audience).length) return { field: 'mentors', message: audienceCopy.mentors.needMentor }
  return null
}

export const inPersonSections: readonly InPersonSection[] = ['transport', 'rooming', 'overnight', 'travel']

export const isVirtual = (value: LocationType) => value === 'virtual'

/** Transport, rooming, overnight and travel only apply to in-person events. */
export const sectionApplies = (location: LocationType, section: InPersonSection) => !isVirtual(location) || !inPersonSections.includes(section)

/** Virtual (Discord) events never need a permission form. */
export const needsPermissionForm = (location: LocationType, requested: boolean) => requested && !isVirtual(location)

/** The Where answer for a saved location type and the at-our-shop flag. */
export const whereOf = (locationType: LocationType, onsite: boolean): Where => locationType === 'virtual' ? 'virtual' : onsite ? 'shop' : 'elsewhere'

/** The location type and at-our-shop flag that a Where answer stands for. */
export const whereFields = (where: Where): { locationType: LocationType; onsite: boolean } => ({ locationType: where === 'virtual' ? 'virtual' : 'inPerson', onsite: where === 'shop' })
