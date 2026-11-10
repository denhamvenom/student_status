// What each Team roster student still needs, worked out once so the chips, their counts, the filter,
// the Copy reminder text and Export list all agree. Pure functions; no server calls.

export type RequirementKey = 'attention' | 'first' | 'permission' | 'balance' | 'missing'
export type RosterQuick = 'all' | RequirementKey

export type RequirementRow = {
  studentId: string
  name: string
  active: boolean
  firstRegistrationState: 'needsCompletion' | 'awaitingVerification' | 'verified'
  balance: { state: string; dueCents: number | null }
  nextEvent: { name: string; state: 'ready' | 'open' | 'unknown'; open: string[] } | null
  missingSummary: string[]
  permission: { state: 'closed' | 'noForm' | 'signed' | 'review' | 'notSigned'; eventName: string | null }
}

/** The selected students who are still shown under the current filters; hidden ones are not counted, copied or exported. */
export function visibleSelection<T extends { studentId: string }>(shown: readonly T[], selectedIds: ReadonlySet<string>): T[] {
  return shown.filter(item => selectedIds.has(item.studentId))
}

/** "Profile setup" is the sign-in step, not profile information, so it is never listed or counted. */
export function missingProfileItems(row: Pick<RequirementRow, 'missingSummary'>): string[] {
  return row.missingSummary.filter(item => item !== 'Profile setup').map(item => (item === 'Room category' ? 'Room type' : item))
}

export const balanceDueCents = (row: Pick<RequirementRow, 'balance'>) => (row.balance.state === 'ready' && row.balance.dueCents !== null && row.balance.dueCents > 0 ? row.balance.dueCents : 0)

/**
 * Needs attention: an active student who has an open item for their next event (signup not confirmed, a payment,
 * FIRST registration, room choice or another requirement), or whose permission form is not signed yet while
 * permission signing is open. Events that could not be fully checked, and balances on their own, do not count:
 * Balance due and Missing profile information have their own chips.
 */
export function needsAttention(row: RequirementRow): boolean {
  if (!row.active) return false
  return row.nextEvent?.state === 'open' || row.permission.state === 'notSigned'
}

const tests: Record<RequirementKey, (row: RequirementRow) => boolean> = {
  attention: needsAttention,
  first: row => row.active && row.firstRegistrationState === 'needsCompletion',
  permission: row => row.active && row.permission.state === 'notSigned',
  balance: row => row.active && balanceDueCents(row) > 0,
  missing: row => row.active && missingProfileItems(row).length > 0,
}

export function matchesRequirement(row: RequirementRow, key: RosterQuick): boolean {
  return key === 'all' || tests[key](row)
}

export type RequirementCounts = Record<RequirementKey, number>
export function countRequirements(rows: readonly RequirementRow[]): RequirementCounts {
  const counts: RequirementCounts = { attention: 0, first: 0, permission: 0, balance: 0, missing: 0 }
  for (const row of rows) for (const key of Object.keys(counts) as RequirementKey[]) if (tests[key](row)) counts[key] += 1
  return counts
}

export type RequirementChip = { key: RosterQuick; label: string }
/** The chip row, in reading order. The permission chip is there only while permission signing is open. */
export function requirementChips(counts: RequirementCounts, total: number, signingOpen: boolean): RequirementChip[] {
  return [
    { key: 'all', label: `All · ${total}` },
    { key: 'attention', label: `Needs attention · ${counts.attention}` },
    { key: 'first', label: `FIRST registration · ${counts.first} missing` },
    ...(signingOpen ? [{ key: 'permission' as const, label: `Permission form · ${counts.permission} not signed` }] : []),
    { key: 'balance', label: `Balance due · ${counts.balance}` },
    { key: 'missing', label: `Missing profile information · ${counts.missing}` },
  ]
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`
const join = (names: string[]) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names.at(-1)}`)

export type ReminderFormat = 'group' | 'perStudent'
export type Reminder = { text: string; included: number; left: number }

/**
 * Text a Coach pastes into their own email or message; the app sends nothing. Only selected students who really
 * have the item are included (`left` counts the others). "group" is one message with names only, so no
 * money or profile details reach other families; "perStudent" is one line per student for sending to each family.
 */
export function reminderText(rows: readonly RequirementRow[], key: RequirementKey, format: ReminderFormat): Reminder {
  const chosen = rows.filter(row => tests[key](row))
  const left = rows.length - chosen.length
  if (!chosen.length) return { text: '', included: 0, left }
  const names = chosen.map(row => row.name)
  let text: string
  if (format === 'group') {
    if (key === 'first') text = `Reminder: please finish FIRST registration, including Consent & Release, for ${join(names)}.`
    else if (key === 'balance') text = `Reminder: there is a balance due on the account of ${join(names)}. Open Money in Venom Status to see the amount.`
    else if (key === 'missing') text = `Reminder: please finish the profile information in Venom Status for ${join(names)}.`
    else {
      const byEvent = new Map<string, string[]>()
      for (const row of chosen) {
        const event = (key === 'permission' ? row.permission.eventName : row.nextEvent?.name) ?? 'the next event'
        byEvent.set(event, [...(byEvent.get(event) ?? []), row.name])
      }
      text = [...byEvent].map(([event, list]) => key === 'permission'
        ? `Reminder: please sign the permission form for ${event} for ${join(list)}.`
        : `Reminder: ${event} still has items left in Venom Status for ${join(list)}.`).join('\n')
    }
  } else {
    text = chosen.map(row => {
      if (key === 'first') return `${row.name}: please finish FIRST registration, including Consent & Release.`
      if (key === 'balance') return `${row.name}: balance due ${dollars(balanceDueCents(row))}.`
      if (key === 'missing') return `${row.name}: please add ${missingProfileItems(row).join(', ')}.`
      if (key === 'permission') return `${row.name}: please sign the permission form for ${row.permission.eventName ?? 'the next event'}.`
      const items = [...(row.nextEvent?.state === 'open' ? row.nextEvent.open : []), ...(row.permission.state === 'notSigned' ? ['Permission form'] : [])]
      return `${row.name}${row.nextEvent ? ` (${row.nextEvent.name})` : ''}: ${items.join('; ')}.`
    }).join('\n')
  }
  return { text, included: chosen.length, left }
}

export type RosterExportRow = RequirementRow & { subteam: string; grade: string | null; travelTeam: boolean }
function cell(value: string | number) {
  const text = Array.from(String(value), character => (character.charCodeAt(0) < 32 ? ' ' : character)).join('')
  return `"${(/^[\s\uFEFF]*[=+\-@]/u.test(text) ? `'${text}` : text).replaceAll('"', '""')}"`
}
const permissionLabel = (row: RequirementRow) =>
  row.permission.state === 'closed' ? 'Not collecting yet'
    : row.permission.state === 'noForm' ? 'No form needed'
      : row.permission.state === 'signed' ? 'Signed'
        : row.permission.state === 'review' ? 'Signed, needs review' : 'Not signed'

/** The students currently selected, with what they still need. Names and statuses only; no health or contact details. */
export function rosterExportCsv(rows: readonly RosterExportRow[]): string {
  const header = ['Student', 'Grade', 'Subteam', 'Travel Team', 'FIRST registration', 'Permission form', 'Balance due ($)', 'Next event', 'Event items left', 'Missing profile information']
  const first = { needsCompletion: 'Missing', awaitingVerification: 'Waiting for Coach', verified: 'Verified' } as const
  const lines = rows.map(row => [
    row.name, row.grade ?? 'Not provided', row.subteam || 'No subteam', row.travelTeam ? 'Yes' : 'No',
    first[row.firstRegistrationState], permissionLabel(row),
    row.balance.state === 'ready' && row.balance.dueCents !== null ? (row.balance.dueCents / 100).toFixed(2) : 'Unavailable',
    row.nextEvent?.name ?? 'None', row.nextEvent?.open.join('; ') ?? '', missingProfileItems(row).join('; '),
  ])
  return '' + [header, ...lines].map(line => line.map(cell).join(',')).join('\r\n') + '\r\n'
}
