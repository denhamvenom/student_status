import { describe, expect, it } from 'vitest'
import { canonicalGrade, displayedGrade, gradeForSave, sameGrade } from './grades'

describe('grade choices', () => {
  it.each([
    ['9', 'Freshman'], ['9th grade', 'Freshman'], ['grade ninth', 'Freshman'], ['freshman', 'Freshman'],
    ['10th', 'Sophomore'], ['grade 10', 'Sophomore'], ['tenth grade', 'Sophomore'],
    ['11', 'Junior'], ['grade11', 'Junior'], ['eleventh', 'Junior'],
    ['12th grade', 'Senior'], ['grade twelfth', 'Senior'], ['SENIOR', 'Senior'],
  ])('recognizes %s as %s', (input, grade) => {
    expect(canonicalGrade(input)).toBe(grade)
    expect(displayedGrade(input)).toBe(grade)
    expect(gradeForSave(input)).toBe(grade)
  })

  it('keeps an unknown earlier value unchanged, but rejects new free text', () => {
    expect(displayedGrade('Transfer year')).toBe('Transfer year')
    expect(gradeForSave('Transfer year', ['Transfer year'])).toBe('Transfer year')
    expect(() => gradeForSave('Transfer year')).toThrow('Choose Freshman')
    expect(() => gradeForSave('9/10', ['Transfer year'])).toThrow('Choose Freshman')
    expect(canonicalGrade('2027')).toBeNull()
  })

  it('treats an alias as the same grade for existing parent confirmation', () => {
    expect(sameGrade('9th grade', 'Freshman')).toBe(true)
    expect(sameGrade('9/10', 'Freshman')).toBe(false)
  })
})
