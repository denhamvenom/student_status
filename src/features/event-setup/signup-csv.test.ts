import { describe, expect, it } from 'vitest'
import { BOM, csvCell, signupResponsesCsv } from './signup-csv'

describe('csvCell', () => {
  it.each([
    { value: 'Medium', cell: '"Medium"' },
    { value: 'Smith, Jo', cell: '"Smith, Jo"' },
    { value: 'She said "hi"', cell: '"She said ""hi"""' },
    { value: 'line one\nline two', cell: '"line one\nline two"' },
    { value: '=HYPERLINK("http://x")', cell: `"'=HYPERLINK(""http://x"")"` },
    { value: '+1', cell: `"'+1"` },
    { value: '-2', cell: `"'-2"` },
    { value: '@SUM(A1)', cell: `"'@SUM(A1)"` },
    { value: '  =1+1', cell: `"'  =1+1"` },
    { value: '\t=1', cell: `"'\t=1"` },
    { value: 'a=b', cell: '"a=b"' },
  ])('$value', ({ value, cell }) => {
    expect(csvCell(value)).toBe(cell)
  })
})

describe('signupResponsesCsv', () => {
  const questions = [
    { questionId: 'q1', prompt: 'Shirt size', archived: false },
    { questionId: 'q2', prompt: 'Foods', archived: false },
    { questionId: 'q3', prompt: 'Need a ride?', archived: false },
    { questionId: 'q4', prompt: 'Old question', archived: true },
  ]
  const rows = [
    { studentId: 's1', name: 'Avery Test', status: 'confirmed', answers: [{ questionId: 'q1', value: 'M' }, { questionId: 'q2', value: ['Pizza', 'Tacos'] }, { questionId: 'q3', value: false }, { questionId: 'q4', value: 3 }] },
    { studentId: 's2', name: 'Blake Sample', status: 'pending', answers: [{ questionId: 'q3', value: true }] },
  ]

  it('lists every student with readable answers, blank for unanswered, and flags removed questions', () => {
    const lines = signupResponsesCsv(questions, rows, null).slice(BOM.length).trimEnd().split('\r\n')
    expect(lines).toEqual([
      '"Student","Status","Shirt size","Foods","Need a ride?","Old question (removed)"',
      '"Avery Test","Confirmed","M","Pizza; Tacos","No","3"',
      '"Blake Sample","Pending approval","","","Yes",""',
    ])
  })

  it('adds a Shifts column when the event uses shifts', () => {
    const shifts = new Map([['s1', ['Setup (Sat, Nov 7 · 9:00 AM – 11:00 AM)', 'Sat, Nov 7 · 1:00 PM – 3:00 PM']]])
    const lines = signupResponsesCsv(questions.slice(0, 1), rows, shifts).slice(BOM.length).trimEnd().split('\r\n')
    expect(lines).toEqual([
      '"Student","Status","Shifts","Shirt size"',
      '"Avery Test","Confirmed","Setup (Sat, Nov 7 · 9:00 AM – 11:00 AM); Sat, Nov 7 · 1:00 PM – 3:00 PM","M"',
      '"Blake Sample","Pending approval","",""',
    ])
  })
})
