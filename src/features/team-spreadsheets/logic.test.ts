import { describe, expect, it } from 'vitest'
import { commonProblem, fileTime, latestFileTime, duplicateFolders, eventDateLabel, folderInputProblem, latestUpdate, runInProgress, updatedLabel } from './logic'

describe('team spreadsheets card logic', () => {
  it('shows the update time in team time as Mon D, h:mm a', () => {
    expect(updatedLabel(Date.parse('2026-11-12T11:00:00Z'))).toBe('Nov 12, 5:00 AM')
    expect(updatedLabel(Date.parse('2026-07-15T23:05:00Z'))).toBe('Jul 15, 6:05 PM')
  })
  it('never lets an abandoned run block the button', () => {
    const run = { state: 'running' as const, total: 2, finished: 1, leaseExpiresAt: 1000 }
    expect(runInProgress(run, 999)).toBe(true)
    expect(runInProgress(run, 1000)).toBe(false)
    expect(runInProgress({ ...run, state: 'done' }, 0)).toBe(false)
    expect(runInProgress(null, 0)).toBe(false)
  })
  it('requires a folder link at every folder step', () => {
    const link = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKl'
    expect([folderInputProblem(''), folderInputProblem('nope'), folderInputProblem(link)]).toEqual([true, true, false])
  })
  it('dates an event in team time and finds its newest update', () => {
    expect(eventDateLabel(Date.parse('2027-03-07T05:30:00Z'))).toBe('Mar 6, 2027')
    expect(eventDateLabel(0)).toBe('')
    expect(latestUpdate([{ updatedAt: 5 }, { updatedAt: null }, { updatedAt: 9 }])).toBe(9)
    expect(latestUpdate([{ updatedAt: null }])).toBeNull()
  })
  it('says a file is up to date when a later check found it unchanged', () => {
    expect(fileTime({ updatedAt: 5, checkedAt: 9 })).toEqual({ kind: 'upToDate', at: 9 })
    expect(fileTime({ updatedAt: 5, checkedAt: 5 })).toEqual({ kind: 'updated', at: 5 })
    expect(fileTime({ updatedAt: null, checkedAt: 9 })).toEqual({ kind: 'never', at: null })
    expect(latestFileTime([{ updatedAt: 5, checkedAt: 9 }, { updatedAt: 7, checkedAt: null }])).toEqual({ kind: 'upToDate', at: 9 })
  })
  it('flags a folder pasted twice', () => {
    const link = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKl'
    expect(duplicateFolders({ general: link, money: `${link}?usp=sharing`, health: 'https://drive.google.com/drive/folders/9ZyXwVuTsRqP', events: 'https://drive.google.com/drive/folders/5QrStUvWxYz' })).toEqual(['money'])
    expect(duplicateFolders({ general: link, money: 'https://drive.google.com/drive/folders/9ZyXwVuTsRqP', health: 'https://drive.google.com/drive/folders/8HgFeDcBa', events: `${link}?usp=sharing` })).toEqual(['events'])
  })
})

describe('commonProblem', () => {
  it('returns a reason only when every failed file shares it', () => {
    expect(commonProblem([{ problem: 'A' }, { problem: 'A' }])).toBe('A')
    expect(commonProblem([{ problem: 'A' }, { problem: 'B' }])).toBeNull()
    expect(commonProblem([{ problem: 'A' }, { problem: null }])).toBeNull()
    expect(commonProblem([{ problem: null }])).toBeNull()
  })
})
