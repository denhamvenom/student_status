// Inbox tidy-up rules, pure so they are tested directly: fix doubled weekdays, fold repeats of one notice into one row,
// and move notices about events that already ended under Older.

export type InboxRow = {
  _id: string
  title: string
  body: string
  url: string
  category: string
  createdAt: number
  readAt: number | null
  /** When the event the notice links to ends; null when it links elsewhere. */
  eventEndsAt: number | null
}

export type InboxEntry<T extends InboxRow = InboxRow> = {
  /** The newest notice of the fold; its text is shown. */
  item: T
  /** Every notice folded into this row (newest first), so opening it marks all of them read. */
  ids: string[]
  /** How many notices were folded together; 1 when it stands alone. */
  count: number
  unread: boolean
}

export type InboxGroups<T extends InboxRow = InboxRow> = { recent: InboxEntry<T>[]; older: InboxEntry<T>[] }

const day = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day|sday|nesday|rsday|urday)?'
const doubledWeekday = new RegExp('(^|[^A-Za-z])(' + day + '), +' + day + ', +', 'g')

/** "Tue, Tue, Dec 8" → "Tue, Dec 8" (a meeting named after its weekday followed by the date). */
export const tidyDates = (text: string) => text.replace(doubledWeekday, '$1$2, ')

/** Newest first; notices with the same link and title are one row (a meeting announced again is not a second message). */
export function groupInbox<T extends InboxRow>(items: readonly T[], now: number): InboxGroups<T> {
  const folds = new Map<string, InboxEntry<T>>()
  for (const item of [...items].sort((a, b) => b.createdAt - a.createdAt)) {
    const key = `${item.url}\u0000${tidyDates(item.title)}`
    const found = folds.get(key)
    if (found) {
      found.ids.push(item._id)
      found.count += 1
      found.unread ||= item.readAt === null
    } else folds.set(key, { item, ids: [item._id], count: 1, unread: item.readAt === null })
  }
  const entries = [...folds.values()]
  // Any notice about an event that is over is stale (new-meeting, "Tomorrow:" reminders, invitations, cancellations).
  const isOlder = (entry: InboxEntry<T>) => entry.item.eventEndsAt !== null && entry.item.eventEndsAt < now
  return { recent: entries.filter(entry => !isOlder(entry)), older: entries.filter(isOlder) }
}
