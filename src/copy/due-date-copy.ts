// Due dates on fees and charges. A chosen date lasts through the end of that day in America/Chicago.
import { chicagoInputTime, parseChicagoInput } from '../lib/chicago-time'

const shortDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' })
const fullDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium' })

/** The YYYY-MM-DD value a date input shows for a saved due date, or '' when there is none. */
export function dueDateInput(dueAt: number | null | undefined) {
  return dueAt === null || dueAt === undefined ? '' : chicagoInputTime(dueAt).slice(0, 10)
}

/** '' → null (no due date); a valid date → the last millisecond of that Chicago day; anything else → NaN. */
export function dueAtFromInput(date: string) {
  if (date === '') return null
  const lastMinute = parseChicagoInput(`${date}T23:59`)
  return Number.isNaN(lastMinute) ? Number.NaN : lastMinute + 59_999
}

export const dueDateCopy = {
  label: 'Due date (optional)',
  hint: 'Families see it next to unpaid items. Leave it blank for no due date.',
  invalid: 'Enter the due date as a full date, or leave it blank.',
  none: 'No due date',
  inherits: 'Without its own due date, this charge uses the fee’s due date when the fee has one.',
  heading: 'Due date',
  save: 'Save due date',
  saving: 'Saving…',
  clear: 'Clear',
  saved: 'Due date saved.',
  cleared: 'Due date cleared.',
  failed: 'The due date could not be saved. Try again.',
  savedWithoutDueDate: 'The fee change was saved, but its due date was not. Select the button again to retry the due date.',
  short: (dueAt: number) => `Due ${shortDate.format(dueAt)}`,
  full: (dueAt: number) => fullDate.format(dueAt),
} as const
