import type { Id } from '../../../convex/_generated/dataModel'
import { parentItemHref } from '../parent-home/logic'
import type { WhatsLeftItem, WhatsLeftKind, WhatsLeftOwner } from './contract'
import { formatShortDate } from './format'

/*
 * Who has to act on a What's left item, and what the Student or Parent can do about it from the tap sheet. Pure (no
 * Convex or React). The same rules serve Student Home's What's left rows and the red "Open" requirement rows on an
 * event page, so a requirement never reads as a dead end: it either links to where it gets done or says who is on it.
 */

export type TaskViewer = 'student' | 'parent'

export type TaskGuide = {
  title: string
  eventName: string | null
  /** Who has to act: the reader, someone else the reader can nudge, or a Coach. */
  actor: 'reader' | 'other' | 'coach'
  /** "Waiting for your parent", "Waiting for Coach approval", "Your turn". */
  headline: string
  explain: string
  action: { label: string; to: string } | null
  /** A short message to copy; null when nudging would not help (a Coach is on it, or the reader acts). */
  remind: string | null
}

export const taskCopy = {
  yourTurn: 'Your turn',
  waitingForParent: 'Waiting for your parent',
  waitingForStudent: (name: string) => `Waiting for ${name}`,
  waitingForCoach: 'Waiting for Coach approval',
  remindParent: 'Copy reminder for your parent',
  remindStudent: (name: string) => `Copy reminder for ${name}`,
  copied: 'Copied. Paste it into a text message.',
  copyFailed: 'Copying did not work. Select the message above and copy it.',
  messageLabel: 'Message to send',
  close: 'Close',
  // What a tap opens
  openHint: 'Tap for what to do',
  notSure: 'Not sure what to do?',
  coachWorking: 'Nothing to do while a Coach looks at it.',
} as const

const parentActions: Partial<Record<WhatsLeftKind, string>> = {
  healthProfile: 'Fill in Health information',
  firstRegistration: 'Start FIRST registration',
  permissionForm: 'Sign permission form',
  requiredPayment: 'Review balance due',
}

const studentActions: Partial<Record<WhatsLeftKind, string>> = {
  inviteParent: 'Invite a parent',
  studentSetup: 'Finish your setup',
  firstRegistration: 'Start FIRST registration',
  roomChoice: 'Choose your room',
}

const titles: Record<WhatsLeftKind, string> = {
  inviteParent: 'Invite a parent',
  studentSetup: 'Finish your setup',
  healthProfile: 'Health information',
  firstRegistration: 'FIRST registration and Consent & Release',
  firstVerification: 'FIRST registration',
  requiredPayment: 'Balance due',
  permissionForm: 'Permission form',
  permissionReview: 'Permission form',
  roomChoice: 'Choose your room',
  requirement: 'Event requirement',
  signupApproval: 'Your signup',
  staffReview: 'Event records',
}

/** What each kind needs, said once for whoever is waiting on it. */
const explanations: Record<WhatsLeftKind, string> = {
  inviteParent: 'A parent or guardian needs to be linked to your account. Send them an invitation.',
  studentSetup: 'Answer the short setup questions so a Coach has what they need.',
  healthProfile: 'A parent or guardian fills in Health information for you.',
  firstRegistration: 'A parent or guardian creates the FIRST account and signs the Consent & Release form.',
  firstVerification: 'FIRST registration is reported. A Coach checks it on the FIRST site.',
  requiredPayment: 'The fee for this event is not paid yet. A parent or guardian reviews it in Money.',
  permissionForm: 'A parent or guardian signs the permission form for this event.',
  permissionReview: 'The permission form is signed. A Coach reviews it.',
  roomChoice: 'Pick roommates or ask to be assigned a room.',
  requirement: 'A Coach added this for the event.',
  signupApproval: 'A Coach or Travel Lead approves your signup, then it is confirmed.',
  staffReview: 'Records for this event are being updated or need a Coach to look at them.',
}

const reminderLabel = (item: Pick<WhatsLeftItem, 'kind' | 'label'>, studentName?: string) =>
  item.kind === 'healthProfile' ? `Health information in ${studentName ? `${studentName}'s` : 'my'} profile` : item.kind === 'requirement' ? item.label ?? titles.requirement : titles[item.kind]

/** The short text someone copies and pastes into a text message. Nothing is sent from the app. */
export function reminderMessage(item: Pick<WhatsLeftItem, 'kind' | 'label' | 'eventName' | 'dueAt' | 'dateKind'>, to?: string, studentName?: string) {
  const due = item.dueAt === null ? '' : item.dateKind === 'eventStart' ? ` The event is ${formatShortDate(item.dueAt)}.` : ` It is due ${formatShortDate(item.dueAt)}.`
  const forEvent = item.eventName ? ` for ${item.eventName}` : ''
  return `Hi${to ? ` ${to}` : ''}! Can you finish ${reminderLabel(item, studentName)}${forEvent} in Venom Status?${due} Thank you!`
}

/** The event requirement "FIRST registration" is the season-wide FIRST step; it follows that step's owner. */
const isEventFirst = (item: WhatsLeftItem) => item.kind === 'requirement' && item.label === 'FIRST registration'

/** Items the server calls an event requirement but that behave like another kind. */
export function effectiveKind(item: WhatsLeftItem): WhatsLeftKind {
  return isEventFirst(item) ? 'firstRegistration' : item.kind
}

/** Who owns the item. The event "FIRST registration" requirement has no owner of its own, so it takes the season FIRST step's owner. */
export function effectiveOwner(item: WhatsLeftItem, all: readonly WhatsLeftItem[] = []): WhatsLeftOwner {
  if (!isEventFirst(item)) return item.owner
  const season = all.find(other => other.kind === 'firstRegistration' || other.kind === 'firstVerification')
  return season ? season.owner : 'parent'
}

export type TaskContext = { viewer: TaskViewer; /** Every item, so the event FIRST requirement can find its owner. */ all?: readonly WhatsLeftItem[]; studentName?: string; studentId?: string }

function coachHeadline(kind: WhatsLeftKind) {
  if (kind === 'permissionReview') return 'Waiting for a Coach to review the form'
  if (kind === 'firstVerification') return 'Waiting for a Coach to check FIRST registration'
  if (kind === 'staffReview') return 'Waiting for a Coach to update records'
  return taskCopy.waitingForCoach
}

/** What the sheet for one What's left item shows. */
export function guideForItem(item: WhatsLeftItem, context: TaskContext): TaskGuide {
  const kind = effectiveKind(item)
  const owner = effectiveOwner(item, context.all)
  const { viewer } = context
  const studentName = context.studentName ?? 'your student'
  const title = item.kind === 'requirement' && !isEventFirst(item) ? item.label ?? titles.requirement : titles[kind]
  const base = { title, eventName: item.eventName }
  const explain = item.kind === 'requirement' && !isEventFirst(item) ? 'A Coach added this requirement for the event. Ask a Coach what to do if you are not sure.' : explanations[kind]

  if (owner === 'coach') return { ...base, actor: 'coach', headline: coachHeadline(kind), explain: `${explain} ${taskCopy.coachWorking}`, action: null, remind: null }

  const readerActs = owner === viewer
  if (readerActs) {
    const to = viewer === 'parent' ? parentItemHref({ ...item, kind }, context.studentId) : item.href ?? (kind === 'firstRegistration' ? '/setup' : null)
    const label = (viewer === 'parent' ? parentActions : studentActions)[kind]
    // A custom requirement has no page of its own; the event page lists it, so the sheet stays an explanation.
    return { ...base, actor: 'reader', headline: taskCopy.yourTurn, explain, action: to && label ? { label, to } : null, remind: null }
  }

  if (viewer === 'student') {
    // Money shows a Student what is owed even though a parent reviews the payment.
    const action = kind === 'requiredPayment' ? { label: 'See Money', to: '/finances' } : null
    return { ...base, actor: 'other', headline: taskCopy.waitingForParent, explain, action, remind: reminderMessage({ ...item, kind }, undefined, context.studentName) }
  }
  // A Parent waiting on the Student: Parents see the Student's choices but never make them.
  const childExplain = kind === 'roomChoice' ? `${studentName} picks roommates or asks to be assigned a room in Venom Status. You will see the group here once it is chosen.` : `${studentName} does this in Venom Status. You can see it here but cannot do it for them.`
  return { ...base, actor: 'other', headline: taskCopy.waitingForStudent(studentName), explain: childExplain, action: null, remind: reminderMessage({ ...item, kind }, studentName, studentName) }
}

// Event page requirement rows -----------------------------------------------------------------------------------

/**
 * The red "Open" rows on an event page are plain labels from the readiness check (convex/lib/readModels.ts). The
 * built-in ones are fixed strings; anything else is a Coach's own requirement text.
 */
export function openRowKind(label: string): WhatsLeftKind {
  if (label === 'Required payment') return 'requiredPayment'
  if (label === 'Permission accepted') return 'permissionForm'
  if (label === 'FIRST registration and Consent & Release' || label === 'FIRST registration') return 'firstRegistration'
  if (label === 'Room selection') return 'roomChoice'
  if (/^(Season fee maintenance|Financial records|Event financial records|Event requirements require|This event is canceled|Whole Team enrollment)/.test(label)) return 'staffReview'
  return 'requirement'
}

const sameFamily: Partial<Record<WhatsLeftKind, readonly WhatsLeftKind[]>> = {
  requiredPayment: ['requiredPayment'],
  permissionForm: ['permissionForm', 'permissionReview'],
  firstRegistration: ['firstRegistration', 'firstVerification'],
  roomChoice: ['roomChoice'],
  staffReview: ['staffReview'],
}

/**
 * The What's left item behind an event page row, so the row shows the same owner and link as Home. Without a match
 * (still loading, or Home does not list it) the row gets the usual owner for its kind.
 */
export function itemForOpenRow(label: string, event: { id: Id<'events'> | string; name: string }, items: readonly WhatsLeftItem[]): WhatsLeftItem {
  const kind = openRowKind(label)
  const family = sameFamily[kind]
  const candidates = items.filter(item => family ? family.includes(effectiveKind(item)) && (family.includes(item.kind) || isEventFirst(item)) : item.kind === 'requirement' && item.label === label)
  const match = candidates.find(item => item.eventId === event.id) ?? candidates.find(item => item.eventId === null)
  if (match) return match
  const owner: WhatsLeftOwner = kind === 'roomChoice' || kind === 'requirement' ? 'student' : kind === 'staffReview' ? 'coach' : 'parent'
  return { key: `row:${label}`, kind, owner, eventId: event.id as Id<'events'>, eventName: event.name, label: kind === 'requirement' ? label : null, dueAt: null, href: kind === 'roomChoice' ? `/events/${event.id}/rooming` : null }
}
