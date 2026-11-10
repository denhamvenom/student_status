import { describe, expect, it } from 'vitest'
import type { Id } from '../convex/_generated/dataModel'
import { blankDraft, bulkNoteReason, bulkOverpayments, draftRows, editContextChanged, parsePaymentCsv, referenceAfterMethodChange } from './PaymentAdministration'
import { moneyJobStateLabel, moneyReturnedCopy, paymentAdministrationCopy } from './lib/payment-admin-copy'
import { overpaymentCents, overpaymentQuestion, parseMoneyInput } from './lib/charge-money'

describe('amount entry', () => {
  it.each([
    ['25', 2500], ['$25', 2500], ['25.5', 2550], ['25.50', 2550], ['$2,450', 245000], ['2,450.75', 245075],
    ['$1,234,567.89', 123456789], [' $ 40 ', 4000], ['.75', 75], ['25.', 2500],
  ])('reads %j as %i cents', (text, cents) => {
    expect(parseMoneyInput(text)).toEqual({ ok: true, cents })
  })
  it.each([
    ['25,50', 'Did you mean $25.50?'], ['2,5', 'Did you mean $2.50?'], ['1,2345', 'groups of three'], ['25.505', 'two digits'],
    ['1.234,56', 'period before the cents'], ['1.2.3', 'one period'], ['-5', 'minus'], ['abc', 'like 25'], ['0', 'greater than $0.00'], ['', 'Enter an amount'],
  ])('refuses %j and says what to do', (text, message) => {
    const result = parseMoneyInput(text)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain(message)
  })
  it('allows $0.00 only where undoing a payment is allowed', () => {
    expect(parseMoneyInput('0', { allowZero: true })).toEqual({ ok: true, cents: 0 })
  })
  it('asks before a payment leaves the student $1,000 or more over the Balance due', () => {
    expect(overpaymentCents(110_000, 10_000)).toBe(100_000)
    expect(overpaymentCents(109_999, 10_000)).toBeNull()
    expect(overpaymentCents(100_000, null)).toBe(100_000)
  })
  it.each([
    ['record', 'This is $1,200.00 more than Ada Synthetic’s Balance due. Record it anyway?'],
    ['save', 'This is $1,200.00 more than Ada Synthetic’s Balance due. Save it anyway?'],
  ] as const)('names the student and the amount over, and asks with the same verb as the button (%s)', (action, question) => {
    expect(overpaymentQuestion(120_000, 'Ada Synthetic', action)).toBe(question)
  })
})

describe('an open Edit payment form', () => {
  const opened: Parameters<typeof editContextChanged>[0] = { studentId: 's1' as Id<'students'>, amountCents: 20_000, method: 'check', reference: '1001', expectedSourceRevision: 3, expectedEditId: 'e0' as Id<'paymentEdits'>, lockedMessage: null }
  it.each([
    ['nothing changed', {}, false],
    ['someone else changed the amount', { amountCents: 15_000, expectedSourceRevision: 4 }, true],
    ['someone else changed the method', { method: 'cash' as const, reference: null, expectedEditId: 'e1' as Id<'paymentEdits'> }, true],
    ['someone else changed the number only', { reference: '1002' }, true],
    ['the payment moved to another student', { studentId: 's2' as Id<'students'> }, true],
    ['someone else started an edit', { lockedMessage: 'The last edit to this payment is still saving.' }, true],
  ])('%s', (_label, live, stale) => {
    expect(editContextChanged(opened, { ...opened, ...live })).toBe(stale)
  })
})

const students = [{ studentId: 's1' as Id<'students'>, name: 'Ada Synthetic' }, { studentId: 's2' as Id<'students'>, name: 'Sam Twin' }, { studentId: 's3' as Id<'students'>, name: 'Sam Twin' }]
describe('spreadsheet of payments', () => {
  const header = 'student,amount,method,reference,date\r\n'
  it('matches students by name or email, reads $ and commas, and lets cash skip the number', () => {
    const rows = parsePaymentCsv(header + 'ada synthetic,"$1,250.50",check,"Check, ""123""",2026-10-13\r\n STUDENT@Example.Invalid ,10,cash,,2026-10-13', students)
    expect(rows[0]).toMatchObject({ studentId: 's1', amountCents: 125050, reference: 'Check, "123"', occurredAt: Date.parse('2026-10-13T05:00:00Z'), label: 'Line 2' })
    expect(rows[1]).toMatchObject({ studentEmail: 'student@example.invalid', method: 'cash', reference: '', label: 'Line 3' })
  })
  it.each([
    ['ada synthetic,"25,50",cash,,2026-10-13', 'Line 2: Did you mean $25.50?'],
    ['ada synthetic,10,check,,2026-10-13', 'Line 2: enter the check or receipt number'],
    ['Sam Twin,10,cash,,2026-10-13', 'more than one student'],
    ['Nobody,10,cash,,2026-10-13', 'no active student is named'],
    ['ada synthetic,10,cash,"x"tail,2026-10-13', 'stray quote'],
    ['ada synthetic,10,cash,,13/10/2026', 'Line 2: enter the date as YYYY-MM-DD'],
  ])('refuses %j', (line, message) => {
    expect(() => parsePaymentCsv(header + line, students)).toThrow(message)
  })
  it('reads the check or receipt number column by its plain name', () => {
    const [row] = parsePaymentCsv('student,amount,method,Check or receipt number,date\nada synthetic,10,check,123,2026-10-13', students)
    expect(row).toMatchObject({ studentId: 's1', reference: '123' })
  })
  it('gives every row its own id when read, so identical rows are separate payments', () => {
    const [a, b] = parsePaymentCsv(header + 'ada synthetic,10,cash,,2026-10-13\nada synthetic,10,cash,,2026-10-13', students)
    expect(a.rowReference).toBeTruthy(); expect(a.rowReference).not.toBe(b.rowReference)
  })
  it('still accepts the earlier studentEmail and rowReference columns', () => {
    const [row] = parsePaymentCsv('studentEmail,amount,method,reference,date,rowReference\nsynthetic@example.invalid,10.01,check,123,2026-10-13,A1')
    expect(row).toMatchObject({ studentEmail: 'synthetic@example.invalid', amountCents: 1001, rowReference: 'A1' })
  })
})

describe('typed payments', () => {
  it('numbers every problem by the payment shown on screen', () => {
    const { rows, problems } = draftRows([
      { id: 'a', studentId: 's1', amount: '25,50', method: 'cash', reference: '', date: '2026-10-13' },
      { id: 'b', studentId: '', amount: '10', method: 'check', reference: '', date: '2026-10-13' },
    ])
    expect(rows).toHaveLength(0)
    expect(problems).toEqual(['Payment 1: Did you mean $25.50? Use a period before the cents.', 'Payment 2: choose a student.', 'Payment 2: Enter the check number.'])
  })
  it('keeps each payment’s own save id when an earlier payment is removed, so it is never taken for one already saved', () => {
    const first = { ...blankDraft(), studentId: 's1', amount: '25', method: 'cash' as const }
    const second = { ...blankDraft(first), studentId: 's1', amount: '25', method: 'cash' as const }
    const before = draftRows([first, second]).rows
    const after = draftRows([second]).rows
    expect(before[0].rowReference).not.toBe(before[1].rowReference)
    expect(after[0].rowReference).toBe(before[1].rowReference)
    expect(after[0].label).toBe('Payment 1')
  })
  it('asks one question naming every student a list would overpay', () => {
    expect(paymentAdministrationCopy.bulkOverpayment([{ name: 'Maya', amount: '$1,200.00' }, { name: 'Leo', amount: '$1,050.00' }])).toBe('These payments are more than the Balance due for 2 students (Maya $1,200.00, Leo $1,050.00). Record all anyway?')
  })
  it('adds up several payments for one student before asking about an overpayment', () => {
    const row = { studentId: 's1' as Id<'students'>, studentName: 'Ada Synthetic', amountCents: 60_000, balanceDueCents: 10_000 }
    expect(bulkOverpayments([row])).toEqual([])
    expect(bulkOverpayments([row, row])).toEqual([{ name: 'Ada Synthetic', extraCents: 110_000 }])
  })
})

describe('note for a list of payments', () => {
  it.each([
    ['', { ok: true, reason: 'Payments recorded together' }],
    ['  ', { ok: true, reason: 'Payments recorded together' }],
    ['Cash', { ok: false, message: 'Make the note at least 8 characters, or leave it empty.' }],
    [' Paid at the October meeting ', { ok: true, reason: 'Paid at the October meeting' }],
  ])('%j is saved as typed, replaced only when empty, and too-short notes are refused', (note, expected) => {
    expect(bulkNoteReason(note)).toEqual(expected)
  })
})

describe('money job state labels', () => {
  it('gives stopped payment edits their own label and leaves other job types alone', () => {
    expect(moneyJobStateLabel('paymentCorrection', 'failed')).toBe('Stopped')
    expect(moneyReturnedCopy.paymentCorrectionNext).toBe('Choose Try again or Cancel on the payment.')
    for (const kind of ['payout', 'transfer', 'teamTransfer', 'chargeCorrection', 'withdrawal']) expect(moneyJobStateLabel(kind, 'failed')).toBe('Needs Coach review')
    expect(moneyJobStateLabel('paymentCorrection', 'complete')).toBe('Done')
    expect(moneyJobStateLabel('paymentCorrection', 'running')).toBe('Still saving')
  })
})

describe('Edit payment method change', () => {
  it.each([
    ['cash', '1001', ''], ['check', '1001', '1001'], ['other', 'R-9', 'R-9'],
  ] as const)('changing the method to %s leaves the check or receipt number as %j', (method, before, after) => {
    expect(referenceAfterMethodChange(method, before)).toBe(after)
  })
})
