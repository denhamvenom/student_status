// Events list order: soonest first in date sections (This week / Coming up / Later), canceled events hidden unless asked
// for, and a repeating series shown as one row ("Every Tuesday · next: …") that expands to its meetings. Pure so the
// rules are tested directly.
export type ListedEvent = { _id: string; startsAt: number; endsAt: number; cancelled?: boolean; seriesId?: string; seriesDetached?: boolean }
export type ListedRow = { event: ListedEvent }
export type ListItem<R extends ListedRow> =
  | { kind: 'single'; key: string; row: R }
  /** `rows` are the meetings shown; `total` counts every meeting, and `hiddenCanceled` those hidden by Show canceled off. */
  | { kind: 'series'; key: string; next: R; rows: R[]; total: number; hiddenCanceled: number }
  /** Every meeting of the series is canceled (only listed with Show canceled on): one card instead of one per meeting. */
  | { kind: 'canceledSeries'; key: string; anchor: R; rows: R[] }

export const eventListCopy = {
  showCanceled: (count: number) => `Show canceled (${count})`,
  hideCanceled: 'Hide canceled',
  every: (days: string) => `Every ${days}`,
  next: 'next',
  allMeetings: (total: number, hiddenCanceled = 0) => hiddenCanceled > 0 ? `Show all ${total} meetings (${hiddenCanceled} canceled hidden)` : `Show all ${total} meetings`,
  meetings: (count: number) => `Show ${count} ${count === 1 ? 'meeting' : 'meetings'}`,
  viewNext: 'View next meeting',
  canceled: 'Canceled',
  allCanceled: 'All meetings canceled',
  filterLabel: 'Filter events by type',
  all: 'All',
  /** Chip labels for the staff type filter, in chip order. */
  typeFilters: [['Competition', 'Competitions'], ['Team', 'Meetings'], ['Outreach', 'Outreach'], ['Fundraiser', 'Fundraisers']] as const,
  empty: 'No events to show.',
  buckets: { thisWeek: 'This week', comingUp: 'Coming up', later: 'Later', past: 'Earlier' },
} as const

export const canceledCount = (rows: readonly ListedRow[]) => rows.filter(row => row.event.cancelled).length

export function eventListItems<R extends ListedRow>(rows: readonly R[], options: { showCanceled: boolean; now: number }): ListItem<R>[] {
  const sorted = [...rows].sort((a, b) => a.event.startsAt - b.event.startsAt)
  const bySeries = new Map<string, R[]>()
  for (const row of sorted) if (row.event.seriesId) bySeries.set(row.event.seriesId, [...(bySeries.get(row.event.seriesId) ?? []), row])
  const visible = (row: R) => options.showCanceled || !row.event.cancelled
  const items: { at: number; item: ListItem<R> }[] = []
  const single = (row: R) => items.push({ at: row.event.startsAt, item: { kind: 'single', key: row.event._id, row } })
  for (const row of sorted) {
    const all = row.event.seriesId ? bySeries.get(row.event.seriesId)! : null
    if (!all || all.length < 2) { if (visible(row)) single(row); continue }
    if (all[0] !== row) continue
    const group = all.filter(visible)
    if (!group.length) continue
    const key = `series:${row.event.seriesId}`
    if (group.every(item => item.event.cancelled)) {
      const anchor = group.find(item => item.event.endsAt >= options.now) ?? group[0]
      items.push({ at: anchor.event.startsAt, item: { kind: 'canceledSeries', key, anchor, rows: group } })
      continue
    }
    // A series card is labelled by its next meeting, so it needs one that is still ahead and not canceled. When there is
    // none (every shown meeting over, or only canceled ones ahead), its meetings are listed as their own cards rather
    // than calling a canceled or past meeting "next".
    const next = group.find(item => !item.event.cancelled && item.event.endsAt >= options.now)
    if (!next) { group.forEach(single); continue }
    items.push({ at: next.event.startsAt, item: { kind: 'series', key, next, rows: group, total: all.length, hiddenCanceled: all.length - group.length } })
  }
  return items.sort((a, b) => a.at - b.at).map(entry => entry.item)
}

/** The row whose date places an item in the list: the event, a series' next meeting, or a canceled series' first. */
export const itemAnchor = <R extends ListedRow>(item: ListItem<R>): R => item.kind === 'single' ? item.row : item.kind === 'series' ? item.next : item.anchor

export type DateBucket = keyof typeof eventListCopy.buckets
export const dateBucketOrder: readonly DateBucket[] = ['thisWeek', 'comingUp', 'later', 'past']

const dayFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: 'numeric', day: 'numeric' })
/** Days since 1970-01-01 of the Central Time calendar date, so week math ignores DST and time of day. */
function chicagoDay(epoch: number) {
  const parts = Object.fromEntries(dayFormat.formatToParts(epoch).map(part => [part.type, part.value]))
  return Math.round(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86_400_000)
}

/**
 * Which list section an event falls in, by Central Time calendar days. "This week" runs through Sunday of the current
 * Monday–Sunday week (and includes anything under way now); "Coming up" covers the four weeks after that; "Later" is
 * beyond. An event already over is "past".
 */
export function eventDateBucket(event: { startsAt: number; endsAt: number }, now: number): DateBucket {
  if (event.endsAt < now) return 'past'
  const today = chicagoDay(now)
  const mondayIndex = (new Date(today * 86_400_000).getUTCDay() + 6) % 7
  const endOfWeek = today + 6 - mondayIndex
  const day = chicagoDay(event.startsAt)
  if (day <= endOfWeek) return 'thisWeek'
  if (day <= endOfWeek + 28) return 'comingUp'
  return 'later'
}

/** List items split into date sections in section order, skipping empty ones. Past items show most recent first. */
export function eventListSections<R extends ListedRow>(items: readonly ListItem<R>[], now: number): { bucket: DateBucket; items: ListItem<R>[] }[] {
  const buckets = new Map<DateBucket, ListItem<R>[]>()
  for (const item of items) {
    const bucket = eventDateBucket(itemAnchor(item).event, now)
    buckets.set(bucket, [...(buckets.get(bucket) ?? []), item])
  }
  return dateBucketOrder.flatMap(bucket => {
    const list = buckets.get(bucket)
    return list ? [{ bucket, items: bucket === 'past' ? [...list].reverse() : list }] : []
  })
}

/** Staff filter chips: All, then the known types in chip order, then any other listed type by its section title. */
export function typeFilterOptions(types: readonly string[], sectionTitle: (type: string) => string): { value: string | null; label: string }[] {
  const known = eventListCopy.typeFilters.filter(([type]) => types.includes(type)).map(([value, label]) => ({ value, label }))
  const other = types.filter(type => !eventListCopy.typeFilters.some(([known]) => known === type)).map(value => ({ value, label: sectionTitle(value) }))
  return [{ value: null, label: eventListCopy.all }, ...known, ...other]
}

const weekdayFormat = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'long' })
const weekOrder = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/**
 * "Every Tuesday" or "Every Tuesday and Thursday" from the meetings' Central Time days. A meeting moved "this meeting only"
 * (seriesDetached) no longer follows the series rule, so it doesn't add its day unless every listed meeting was moved.
 */
export function seriesPattern(rows: readonly ListedRow[]): string {
  const onRule = rows.filter(row => !row.event.seriesDetached)
  const days = [...new Set((onRule.length ? onRule : rows).map(row => weekdayFormat.format(row.event.startsAt)))].sort((a, b) => weekOrder.indexOf(a) - weekOrder.indexOf(b))
  const list = days.length <= 1 ? days.join('') : `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}`
  return eventListCopy.every(list)
}
