import { describe, expect, it } from 'vitest'
import { rememberLoaded, shownLoaded, type LoadedFor } from './CoachStudentRecord'

type Kept = LoadedFor<string, { name: string }>
const a = { name: 'Student A' }, a2 = { name: 'Student A, refreshed' }, b = { name: 'Student B' }

describe('student record while its query reloads', () => {
  it.each<{ name: string; kept: Kept; key: string; latest: { name: string } | undefined; shown: { name: string } | undefined; remembered: Kept }>([
    { name: 'first load shows loading', kept: null, key: 'A', latest: undefined, shown: undefined, remembered: null },
    { name: 'the minute refresh keeps showing the same student', kept: { key: 'A', value: a }, key: 'A', latest: undefined, shown: a, remembered: { key: 'A', value: a } },
    { name: 'a refreshed answer replaces the kept one', kept: { key: 'A', value: a }, key: 'A', latest: a2, shown: a2, remembered: { key: 'A', value: a2 } },
    { name: "switching students never shows the previous student's record", kept: { key: 'A', value: a }, key: 'B', latest: undefined, shown: undefined, remembered: { key: 'A', value: a } },
    { name: "the new student's answer is remembered under the new student", kept: { key: 'A', value: a }, key: 'B', latest: b, shown: b, remembered: { key: 'B', value: b } },
  ])('$name', ({ kept, key, latest, shown, remembered }) => {
    expect(shownLoaded(kept, key, latest)).toBe(shown)
    expect(rememberLoaded(kept, key, latest)).toEqual(remembered)
  })

  it('keeps the same remembered object when nothing changed, so rendering does not loop', () => {
    const kept: Kept = { key: 'A', value: a }
    expect(rememberLoaded(kept, 'A', a)).toBe(kept)
    expect(rememberLoaded(kept, 'A', undefined)).toBe(kept)
  })
})
