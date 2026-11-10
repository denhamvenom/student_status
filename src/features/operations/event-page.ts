// Event page wording: badges, the family Details box and the Team Calendar chip. Pure (no Convex or React) so the
// rules are tested directly (event-page.test.ts).
import { resolveAudience, type AudienceEventFields } from '../../../convex/lib/eventAudienceRules'
import { audienceCopy } from '../event-setup/audience/audience-copy'
import { eventBadges } from '../event-setup/event-audience-wiring'
import { uiCopy } from '@/lib/ui-copy'

type BadgeEvent = Parameters<typeof eventBadges>[0]

/**
 * Badges under an event title. Events saved before audiences existed used to say "Open Registration" or
 * "Whole Team"; they now read like new events: Everyone (or Travel Team) plus Required / Optional.
 */
export function displayBadges(event: BadgeEvent): string[] {
  const badges = eventBadges(event)
  if (!event.signupMode || event.audienceKind !== undefined || !badges.length) return badges
  return [legacyAudienceLabel(event as AudienceEventFields) ?? badges[0], ...badges.slice(1)]
}

/** "Everyone" or "Travel Team" for a legacy event; null when the legacy label (a list of students) still fits. */
function legacyAudienceLabel(event: AudienceEventFields): string | null {
  if (event.signupMode !== 'assigned' || event.assignmentScope === 'wholeTeam') return audienceCopy.audience.kinds.everyone.label
  if (event.assignmentScope === 'travelTeam') return uiCopy.audiences.travelTeam
  return null
}

/** Who-it's-for label for a saved event, with legacy names mapped the same way as the badges. */
export function audienceDisplayLabel(event: AudienceEventFields, fallback: string): string {
  return event.audienceKind === undefined ? legacyAudienceLabel(event) ?? fallback : fallback
}

/** Parents see signups view-only, so their line says who signs up and where they can see it. */
export const parentSignupMeaning = {
  required: 'Required — your student is signed up automatically',
  optional: 'Optional — your student signs up in Venom Status. You can see the signup here but cannot change it.',
}

/** Required / Optional with what it means for this reader, or null for a mentors-only or audience-less event. */
export function requiredMeaning(row: object, reader: 'student' | 'parent'): string | null {
  // Reads a loosely typed event row (eventDetail returns a union that includes the Mentor projection).
  const event = row as Partial<AudienceEventFields>
  if (!event.signupMode) return null
  const audience = resolveAudience(event as AudienceEventFields)
  if (audience.kind === 'mentorsOnly') return null
  const copy = reader === 'parent' ? parentSignupMeaning : uiCopy.event.signupMeaning[reader]
  return audience.mandatory ? copy.required : copy.optional
}

/** "Free" for a $0 event, otherwise the dollar amount. */
export function costLabel(feeCents: number | undefined): string {
  const cents = feeCents ?? 0
  return cents > 0 ? (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) : uiCopy.event.free
}

export const calendarChipCopy = {
  on: 'On Team Calendar',
  off: 'Not on Team Calendar',
  adding: 'Adding to Team Calendar…',
  notSent: 'Not added to Team Calendar',
  attention: 'Needs attention',
  failed: 'The last change did not reach Team Calendar.',
  conflict: 'The entry was changed in Team Calendar. Try again keeps the Team Calendar version.',
  unavailable: 'Team Calendar updates are turned off in this copy of Venom Status, so this event was not sent. Nothing is wrong with the event.',
  retry: 'Try again',
  retrying: 'Trying again…',
} as const

/** Id of the event page's Team Calendar section (EventCalendarOperations); Home's Team Calendar alert links to it as a hash. */
export const TEAM_CALENDAR_ANCHOR = 'team-calendar'

export type CalendarChip = { label: string; tone: 'ready' | 'neutral' | 'attention'; reason: string | null; canRetry: boolean }

/** One chip for the Team Calendar section instead of sync-state sentences. */
export function calendarChip(status: { state: string; calendarEventId?: string | null; error?: string | null }): CalendarChip {
  switch (status.state) {
    case 'synced': return { label: calendarChipCopy.on, tone: 'ready', reason: null, canRetry: false }
    case 'pending': return status.calendarEventId
      ? { label: calendarChipCopy.on, tone: 'ready', reason: null, canRetry: false }
      : { label: calendarChipCopy.adding, tone: 'neutral', reason: null, canRetry: false }
    case 'failed': return { label: calendarChipCopy.attention, tone: 'attention', reason: shortReason(status.error) ?? calendarChipCopy.failed, canRetry: true }
    case 'conflict': return { label: calendarChipCopy.attention, tone: 'attention', reason: calendarChipCopy.conflict, canRetry: true }
    // A Coach or Travel Lead asked for this entry, but Calendar updates are off here: say it was not sent, not that it was never wanted.
    case 'disabled': return { label: calendarChipCopy.notSent, tone: 'neutral', reason: calendarChipCopy.unavailable, canRetry: false }
    default: return { label: calendarChipCopy.off, tone: 'neutral', reason: null, canRetry: false }
  }
}

/** The first sentence of a stored error, so the chip's reason stays one short line. */
function shortReason(error: string | null | undefined): string | null {
  const text = error?.trim()
  if (!text) return null
  const first = text.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? text
  return first.length > 120 ? `${first.slice(0, 117).trimEnd()}…` : first
}
