import type { GenericId } from 'convex/values'
import type { Id } from '../../../convex/_generated/dataModel'

/*
 * Data shapes the Student Home tiles render. The backend queries return exactly these shapes
 * (their Convex return validators must match), so the screens and the queries can be built
 * in parallel. Times are epoch milliseconds. The browser decides what is "soon" or "past"
 * with its own clock, because Convex queries cannot read the time.
 */

/** Who has to act on a What's left item. */
export type WhatsLeftOwner = 'student' | 'parent' | 'coach'

/** The screen supplies the wording for each kind; only custom event requirements carry their own label. */
export type WhatsLeftKind =
  | 'inviteParent' // no active parent link: "Invite a parent", urgent
  | 'studentSetup' // the Student has not finished setup
  | 'healthProfile' // a parent or legal guardian has not finished the health and contact profile
  | 'firstRegistration' // FIRST registration and Consent & Release still to do (parent for minors, the Student when 18+)
  | 'firstVerification' // FIRST registration reported; waiting for Coach verification
  | 'requiredPayment' // an event fee is unpaid; the parent reviews the payment due
  | 'permissionForm' // the permission form waits for the parent
  | 'permissionReview' // the permission form was submitted; waiting for Coach review
  | 'roomChoice' // a confirmed overnight event still needs a room choice
  | 'requirement' // a custom event requirement (label is the Coach's requirement text)
  | 'signupApproval' // the Student signed up for an approval event; waiting for Coach or Travel Lead approval
  | 'staffReview' // records are updating or need Coach review before this event is ready

export type WhatsLeftItem = {
  key: string
  kind: WhatsLeftKind
  owner: WhatsLeftOwner
  eventId: Id<'events'> | null
  eventName: string | null
  label: string | null
  dueAt: number | null
  /** In-app path for items the Student can act on; null when someone else acts. */
  href: string | null
}

/** Events the Student can still sign up for (not assigned, no current signup, not canceled). */
export type OpenSignup = {
  eventId: Id<'events'>
  name: string
  type: 'Competition' | 'Outreach' | 'Team' | 'Fundraiser'
  startsAt: number
  endsAt: number
  signupClosesAt: number | null
  feeCents: number
  signupMode: 'open' | 'approval'
}

/** Confirmed overnight events with room choice that are not archived. */
export type RoomChoice = {
  eventId: Id<'events'>
  eventName: string
  startsAt: number
  endsAt: number
  roomDeadline: number | null
  /** notChosen: no group and no assignment request; inGroup: in a group that is not final yet. */
  status: 'notChosen' | 'inGroup' | 'assignmentRequested' | 'final'
  groupName: string | null
  /** Other members' short names ("Jordan W."); never legal names. */
  memberNames: string[]
  /** Pending invitations sent to this Student. */
  invitations: { inviteId: Id<'roomInvites'>; fromName: string; initials: string }[]
}

export type UpcomingCompetition = { eventId: Id<'events'>; name: string; startsAt: number; endsAt: number }

/** studentHome.summary: the signed-in Student's own Home data. */
export type StudentHomeSummary = {
  studentId: Id<'students'>
  /** First name for "Hey, {name}". */
  greetingName: string
  /** Name shown in the sidebar account footer. */
  displayName: string
  /** Two letters for the avatar. */
  initials: string
  season: { name: string; startsAt: number; kickoffAt: number | null }
  parentLinked: boolean
  /** The Student has a fundraiser page link (Money shows the fundraiser section only then). */
  fundraiserLinked: boolean
  whatsLeft: WhatsLeftItem[]
  openSignups: OpenSignup[]
  roomChoices: RoomChoice[]
  /** Current-season Competition events that are not archived or canceled, soonest first. */
  competitions: UpcomingCompetition[]
}

/** participation.signupAvailability: loaded when the Student opens the signup sheet. Counts only, never names. */
export type SignupAvailability = {
  eventId: Id<'events'>
  name: string
  startsAt: number
  endsAt: number
  feeCents: number
  /** 'assigned' only appears with outcome 'closed' (a Coach changed the event after Home loaded). */
  signupMode: 'open' | 'approval' | 'assigned'
  signupClosesAt: number | null
  capacity: number | null
  spotsLeft: number | null
  /** What pressing Sign up would do right now, using the same rules as participation.signUp. */
  outcome: 'signedUp' | 'waitlisted' | 'waitingForApproval' | 'closed'
  /** The event has signup questions (eventQuestions.forSignup); the sheet collects answers before Sign up. */
  hasQuestions: boolean
  /** The event uses shifts (eventShifts.forEvent); Sign up needs shiftIds unless it lands on the waitlist. */
  shiftsEnabled: boolean
}

/** dashboardReports.homeAttendance: the Participation rings. */
export type HomeAttendance = {
  /** updating: attendance is being recalculated; unavailable: no current season data. */
  state: 'ready' | 'updating' | 'unavailable'
  /** Every held meeting since the season started (August), excluding Outreach. Resets with a new season. */
  meetings: { attended: number; held: number }
  /** Outreach events attended of Outreach events held, whole season. */
  outreach: { attended: number; held: number }
  /** Clocked time at Build meetings from kickoff on. */
  buildHours: { state: 'beforeKickoff' | 'kickoffUnknown' | 'ready'; minutes: number; targetHours: number | null }
  kickoffAt: number | null
}

/** announcements.pinnedForHome: up to five pinned messages from a Coach or Travel Lead, newest pin first. */
export type PinnedAnnouncement = {
  /** Same as Id<'teamAnnouncements'> once that table exists. */
  id: GenericId<'teamAnnouncements'>
  title: string | null
  body: string
  authorName: string
  authorRole: 'coach' | 'travelLead'
  pinnedAt: number
  /** The browser hides the message after this time. */
  showUntil: number | null
}
