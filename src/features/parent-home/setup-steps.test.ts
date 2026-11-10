import { describe, expect, it } from 'vitest'
import { PARENT_STEP as S } from '../../lib/setup-wizard-copy'
import { completionSummary, parentStartStep, stepIssue, stepsDoneLine, type SetupContacts, type StartInput, type StepValues } from './setup-steps'

const guardian = { name: 'Pat Doe', relationship: 'Mother', phone: '555-0100', email: 'pat@example.invalid' }
const emergency = { name: 'Sam Roe', relationship: 'Aunt', phone: '555-0101' }
const contacts: SetupContacts = { guardian, emergency }
const blank: SetupContacts = { guardian: { name: '', relationship: '', phone: '', email: '' }, emergency: { name: '', relationship: '', phone: '' } }
const student: StartInput['student'] = { preferredName: 'Alex', grade: '10', dateOfBirth: '2010-05-01', shirtSize: 'M', roomCategory: 'Boys', contactsComplete: true, medicalComplete: true }
const start = (overrides: Partial<StartInput>) => parentStartStep({ edit: false, requested: null, student, contacts, nextItem: 'finishSetup', ...overrides })

describe('where Parent setup opens', () => {
  it.each([
    ['everything but Review done opens on Review, matching "Next: Review and finish"', {}, S.review],
    ['FIRST registration still open opens on FIRST, matching "Next: FIRST registration"', { nextItem: 'first' as const }, S.first],
    ['no summary yet falls back to FIRST registration', { nextItem: null }, S.first],
    ['no preferred name opens on Names', { student: { ...student, preferredName: ' ' } }, S.names],
    ['no birthday opens on Grade and birthday', { student: { ...student, dateOfBirth: null } }, S.grade],
    ['no room type opens on Shirt and room type', { student: { ...student, roomCategory: null } }, S.shirtRoom],
    ['missing guardian opens on Parent or guardian', { student: { ...student, contactsComplete: false }, contacts: blank }, S.guardian],
    ['guardian done, emergency missing opens on Other emergency contact', { student: { ...student, contactsComplete: false }, contacts: { guardian, emergency: blank.emergency } }, S.emergency],
    ['no health answers opens on Allergies', { student: { ...student, medicalComplete: false } }, S.allergies],
    ['a link to ?step=health goes where it says', { requested: S.allergies }, S.allergies],
    ['editing starts at the top', { edit: true }, S.names],
  ] as const)('%s', (_name, overrides, expected) => {
    expect(start(overrides as Partial<StartInput>)).toBe(expected)
  })
})

describe('the earlier-steps line', () => {
  it.each([[0, ''], [1, 'Step 1 done. Use Back to review them.'], [S.review, 'Steps 1–10 done. Use Back to review them.']])('after %i steps: %s', (opened, line) => {
    expect(stepsDoneLine(opened)).toBe(line)
  })
})

describe('required fields stop Save and continue', () => {
  const values: StepValues = { preferred: 'Alex', grade: '10', dob: '2010-05-01', shirt: 'M', category: 'Boys', contacts }
  it.each([
    [S.names, { preferred: '  ' }, 'Fill in preferred name to continue.'],
    [S.grade, { grade: '', dob: '' }, 'Fill in grade and date of birth to continue.'],
    [S.shirtRoom, { shirt: '' }, 'Fill in shirt size to continue.'],
    [S.guardian, { contacts: blank }, 'Fill in full name, relationship, phone and email to continue.'],
    [S.emergency, { contacts: blank }, 'Fill in full name, relationship and phone to continue.'],
  ] as const)('step %i with nothing typed is refused', (step, overrides, message) => {
    expect(stepIssue(step, { ...values, ...overrides })).toBe(message)
  })
  it('lets a filled step and the steps with nothing to type move on', () => {
    for (const step of [S.names, S.grade, S.shirtRoom, S.guardian, S.emergency, S.allergies, S.first, S.review]) expect(stepIssue(step, values)).toBeNull()
  })
})

describe('the saved screen says what is still left', () => {
  it.each([
    ['verified', 'SETUP COMPLETE', 'Nothing is left.'],
    ['awaitingVerification', 'SETUP SAVED', 'Still left: FIRST registration (Waiting for Coach approval).'],
    ['needsCompletion', 'SAVED, ONE STEP LEFT', 'Still left: FIRST registration (Needs completion).'],
    [null, 'SETUP SAVED', 'FIRST registration: Checking status.'],
  ] as const)('FIRST %s', (first, eyebrow, ending) => {
    const summary = completionSummary(first)
    expect(summary.eyebrow).toBe(eyebrow)
    expect(summary.text.endsWith(ending)).toBe(true)
  })
})
