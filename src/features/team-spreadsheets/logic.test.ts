import { describe, expect, it } from 'vitest'
import { duplicateFolders, folderInputProblem, runInProgress, updatedLabel } from './logic'

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
  it('accepts a blank Archive link but requires the other four', () => {
    const link = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKl'
    expect([folderInputProblem('archive', ''), folderInputProblem('general', ''), folderInputProblem('money', 'nope'), folderInputProblem('health', link), folderInputProblem('events', '')]).toEqual([false, true, true, false, true])
  })
  it('flags a folder pasted twice', () => {
    const link = 'https://drive.google.com/drive/folders/1AbCdEfGhIjKl'
    expect(duplicateFolders({ general: link, money: `${link}?usp=sharing`, health: 'https://drive.google.com/drive/folders/9ZyXwVuTsRqP', events: 'https://drive.google.com/drive/folders/5QrStUvWxYz', archive: '' })).toEqual(['money'])
    expect(duplicateFolders({ general: link, money: 'https://drive.google.com/drive/folders/9ZyXwVuTsRqP', health: 'https://drive.google.com/drive/folders/8HgFeDcBa', events: `${link}?usp=sharing`, archive: '' })).toEqual(['events'])
  })
})
