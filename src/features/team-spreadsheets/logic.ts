import { parseDriveFolderId } from '../../../convex/lib/driveLinks'

const day = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' })

/** An event's start date in team time, "Dec 2, 2026"; blank when the event is gone (start unknown). */
export const eventDateLabel = (startsAt: number) => (startsAt > 0 ? day.format(startsAt) : '')

/** The newest update time among an event's files, or null when none has been written yet. */
export const latestUpdate = (files: readonly { updatedAt: number | null }[]) => files.reduce<number | null>((latest, file) => (file.updatedAt !== null && (latest === null || file.updatedAt > latest) ? file.updatedAt : latest), null)

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
