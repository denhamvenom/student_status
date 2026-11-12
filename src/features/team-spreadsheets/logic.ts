import { parseDriveFolderId } from '../../../convex/lib/driveLinks'

const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' })

/** An event's start date in team time, "Dec 2, 2026"; blank when the event is gone (start unknown). */
export const eventDateLabel = (startsAt: number) => (startsAt > 0 ? day.format(startsAt) : '')

/** What a file's time line says: when it was last changed, or (when a later check found it unchanged) when it was last confirmed current. */
export function fileTime(file: { updatedAt: number | null; checkedAt: number | null }): { kind: 'updated' | 'upToDate' | 'never'; at: number | null } {
  if (file.updatedAt === null) return { kind: 'never', at: null }
  return file.checkedAt !== null && file.checkedAt > file.updatedAt ? { kind: 'upToDate', at: file.checkedAt } : { kind: 'updated', at: file.updatedAt }
}

/** The newest update time among an event's files, or null when none has been written yet. */
export const latestUpdate = (files: readonly { updatedAt: number | null }[]) => files.reduce<number | null>((latest, file) => (file.updatedAt !== null && (latest === null || file.updatedAt > latest) ? file.updatedAt : latest), null)

/** The newest time line among an event's files (a confirmed-current check counts), shown through fileTime. */
export const latestFileTime = (files: readonly { updatedAt: number | null; checkedAt: number | null }[]) => files.map(fileTime).reduce<{ kind: 'updated' | 'upToDate' | 'never'; at: number | null }>((best, item) => (item.at !== null && (best.at === null || item.at > best.at) ? item : best), { kind: 'never', at: null })

const stamp = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** "Nov 12, 5:00 AM" in team time. */
export const updatedLabel = (at: number) => stamp.format(at).replace(/\u202f/g, ' ')

export type RunStatus = { state: 'running' | 'done' | 'partial' | 'stopped'; total: number; finished: number; leaseExpiresAt: number } | null

/** A run counts as in progress only while its lease has not run out; an abandoned run never blocks the button. */
export const runInProgress = (run: RunStatus, now: number) => !!run && run.state === 'running' && run.leaseExpiresAt > now

export type FolderKey = 'general' | 'money' | 'health' | 'events'
export const folderSteps: FolderKey[] = ['general', 'money', 'health', 'events']
export type FolderInputs = Record<FolderKey, string>

/** A step's link is acceptable only when it holds a Drive folder link. (Past seasons go into an Archive folder made inside each folder.) */
export function folderInputProblem(value: string): boolean {
  return parseDriveFolderId(value) === null
}

/** Folders that share one folder ID, so the wizard can warn before the check. */
export function duplicateFolders(inputs: FolderInputs): FolderKey[] {
  const seen = new Map<string, FolderKey>()
  const duplicates: FolderKey[] = []
  for (const key of folderSteps) {
    const id = parseDriveFolderId(inputs[key])
    if (!id) continue
    if (seen.has(id)) duplicates.push(key)
    else seen.set(id, key)
  }
  return duplicates
}

/** When every file that has a problem has the same one, it is shown once at the top and each file only says "Not updated". */
export function commonProblem(files: readonly { problem: string | null }[]): string | null {
  const problems = files.map(file => file.problem).filter((problem): problem is string => !!problem)
  return problems.length > 1 && problems.every(problem => problem === problems[0]) ? problems[0] : null
}
