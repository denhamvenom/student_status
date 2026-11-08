// Due dates on fees and charges. A chosen date lasts through the end of that day in America/Chicago.
import { chicagoDateString, endOfChicagoDay } from '../../shared/chicago-time'

const shortDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' })
const fullDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium' })

/** The YYYY-MM-DD value a date input shows for a saved due date, or '' when there is none. */
export function dueDateInput(dueAt: number | null | undefined) {
  return dueAt === null || dueAt === undefined ? '' : chicagoDateString(dueAt)
}

/** '' → null (no due date); a valid date → the last millisecond of that Chicago day; anything else → NaN. */
export function dueAtFromInput(date: string) {
  if (date === '') return null
  return endOfChicagoDay(date)
}

export const dueDateCopy = {
  label: 'Due date (optional)',
  hint: 'Families see it next to unpaid items. Leave it blank for no due date.',
  invalid: 'Enter the due date as a full date, or leave it blank.',
  none: 'No due date',
  inherits: 'Without its own due date, this charge uses the fee’s due date when the fee has one.',
  /** Shown under an inherited date so Money and Home name the same date for the same reason. */
  fromFee: 'This is the fee’s due date. This charge has no due date of its own.',
  heading: 'Due date',
  setAction: 'Set due date',
  changeAction: 'Change due date',
  feeHeading: (fee: string) => `Due date for ${fee}`,
  feeHint: 'Charges for this fee without their own due date use it. Families see it on Money and Home.',
  save: 'Save due date',
  saving: 'Saving…',
  clear: 'Clear',
  close: 'Close',
  saved: 'Due date saved.',
  cleared: 'Due date cleared.',
  failed: 'The due date could not be saved. Try again.',
  savedWithoutDueDate: 'The fee change was saved, but its due date was not. Select the button again to retry the due date.',
  short: (dueAt: number) => `Due ${shortDate.format(dueAt)}`,
  full: (dueAt: number) => fullDate.format(dueAt),
} as const

/** Lead line on a family's Money page: what they owe and when, in plain words. */
export const owedCopy = {
  label: 'What you owe',
  nothing: 'You don’t owe anything right now.',
  owe: (amount: string) => `You owe ${amount}`,
  due: (dueAt: number) => `Due ${shortDate.format(dueAt)}`,
  partDue: (amount: string, dueAt: number) => `${amount} due ${shortDate.format(dueAt)}`,
  noDate: 'No due date',
} as const

/**
 * The parts of the lead line. dueAt is each unpaid charge's effective due date (its own, else its fee's),
 * the same date the charge cards, Details and Home show. With several dates it names the soonest and how much is due then.
 */
export function owedSummary(totalDueCents: number, unpaid: ReadonlyArray<{ dueCents: number; dueAt: number | null | undefined }>) {
  if (totalDueCents <= 0) return { owes: false as const }
  const dated = unpaid.filter((charge): charge is { dueCents: number; dueAt: number } => charge.dueCents > 0 && charge.dueAt !== null && charge.dueAt !== undefined)
  if (dated.length === 0) return { owes: true as const, totalDueCents, next: null }
  const soonest = Math.min(...dated.map(charge => charge.dueAt))
  const dueThenCents = dated.filter(charge => charge.dueAt === soonest).reduce((sum, charge) => sum + charge.dueCents, 0)
  return { owes: true as const, totalDueCents, next: { dueAt: soonest, dueCents: Math.min(dueThenCents, totalDueCents) } }
}
