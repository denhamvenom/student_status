import { describe, expect, it } from 'vitest'
import { dotColumns } from './HeroStack'

describe('dotColumns', () => {
  it.each([
    { name: 'all dots fit in one row', count: 4, width: 200, columns: 4 },
    { name: 'exactly 24px each still fits', count: 5, width: 120, columns: 5 },
    { name: 'nine dots in 188px wrap into balanced rows of 5 and 4', count: 9, width: 188, columns: 5 },
    { name: 'a single card wide enough', count: 1, width: 300, columns: 1 },
    { name: 'a width under one dot never gives zero columns', count: 3, width: 10, columns: 1 },
  ])('$name', ({ count, width, columns }) => {
    expect(dotColumns(count, width)).toBe(columns)
  })
})
