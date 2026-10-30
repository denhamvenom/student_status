import { describe, expect, it } from 'vitest'
import type { WhatsLeftItem } from '../student-home/contract'
import { errorStepKey, sameAnswers, stepKey, stillToDo, wizardSteps } from './wizard'

const base = { edit: false, closed: false, waitlisted: false, shiftsOffered: false, questionIds: [] as string[] }
const keys = (input: Partial<typeof base>) => wizardSteps({ ...base, ...input }).map(stepKey)

describe('signup wizard steps', () => {
  it.each([
    ['a plain event: details only, its button signs up', {}, ['details']],
    ['shifts only', { shiftsOffered: true }, ['details', 'shifts', 'review']],
    ['questions only, one per screen', { questionIds: ['a', 'b'] }, ['details', 'question:a', 'question:b', 'review']],
    ['more than three questions, all on one screen', { questionIds: ['a', 'b', 'c', 'd'] }, ['details', 'questions', 'review']],
    ['shifts and questions', { shiftsOffered: true, questionIds: ['a'] }, ['details', 'shifts', 'question:a', 'review']],
    ['the waitlist: no shifts until a spot opens', { waitlisted: true, shiftsOffered: true, questionIds: ['a'] }, ['details', 'question:a', 'review']],
    ['the waitlist with only shifts', { waitlisted: true, shiftsOffered: true }, ['details']],
    ['a closed signup: details and Close', { closed: true, shiftsOffered: true, questionIds: ['a'] }, ['details']],
    ['editing from the event page: no details, saves at review', { edit: true, shiftsOffered: true, questionIds: ['a', 'b', 'c'] }, ['shifts', 'question:a', 'question:b', 'question:c', 'review']],
    ['editing answers while waitlisted', { edit: true, waitlisted: true, shiftsOffered: true, questionIds: ['a'] }, ['question:a', 'review']],
  ])('%s', (_name, input, expected) => {
    expect(keys(input)).toEqual(expected)
  })
})

describe('server errors open the step they belong to', () => {
  const questions = [{ questionId: 'a', prompt: 'T-shirt size' }, { questionId: 'b', prompt: 'x'.repeat(100) }]
  const both = wizardSteps({ ...base, shiftsOffered: true, questionIds: ['a', 'b'] })
  const many = wizardSteps({ ...base, questionIds: ['a', 'b', 'c', 'd'] })

  it.each([
    ['a quoted question', both, 'Please answer "T-shirt size". It\'s required for this event.', null, 'question:a'],
    ['a long question the server shortened', both, `Check your answer to "${'x'.repeat(77)}...". Enter a number.`, null, 'question:b'],
    ['a question on the shared screen', many, 'Please answer "T-shirt size". It\'s required for this event.', null, 'questions'],
    ['a full shift', both, 'The "Setup" shift is full. Choose another shift.', null, 'shifts'],
    ['a changed question', both, 'One of these questions was changed or removed. Reload to see the event\'s current questions.', null, 'question:a'],
    ['a general failure while saving answers', both, "Your answers didn't save. Try again.", 'answers', 'question:a'],
    ['signup closing (stays where the Student pressed Sign up)', both, 'Signup for this event has closed. Ask a Coach or Travel Lead if you still need to go.', null, null],
  ] as const)('%s', (_name, steps, message, part, expected) => {
    expect(errorStepKey(steps, message, questions, part)).toBe(expected)
  })
})

describe('after signup', () => {
  const item = (key: string, kind: WhatsLeftItem['kind'], owner: WhatsLeftItem['owner'], eventId: string | null): WhatsLeftItem =>
    ({ key, kind, owner, eventId: eventId as WhatsLeftItem['eventId'], eventName: null, label: null, dueAt: null, href: null })

  const keysOf = (todo: ReturnType<typeof stillToDo>) => ({ event: todo.event.map(x => x.key), team: todo.team.map(x => x.key) })

  it.each([
    ["this event's items apart from the team-wide ones that block going; no staff waits or other events", [
      item('permission', 'permissionForm', 'parent', 'e1'),
      item('fee', 'requiredPayment', 'parent', 'e1'),
      item('approval', 'signupApproval', 'coach', 'e1'),
      item('other', 'roomChoice', 'student', 'e2'),
      item('first', 'firstRegistration', 'parent', null),
      item('setup', 'studentSetup', 'student', null),
      item('verify', 'firstVerification', 'coach', null),
    ], { event: ['permission', 'fee'], team: ['first'] }],
    ['only team to-dos left: nothing for this event (matches the event page saying Ready)', [
      item('health', 'healthProfile', 'student', null),
      item('invite', 'inviteParent', 'student', null),
      item('first', 'firstRegistration', 'parent', null),
    ], { event: [], team: ['health', 'invite', 'first'] }],
  ] as const)('%s', (_name, items, expected) => {
    expect(keysOf(stillToDo(items, 'e1'))).toEqual(expected)
  })

  it('skips saving answers that did not change, in any order', () => {
    expect(sameAnswers([{ questionId: 'b', value: 4 }, { questionId: 'a', value: 'M' }], [{ questionId: 'a', value: 'M' }, { questionId: 'b', value: 4 }])).toBe(true)
    expect(sameAnswers([{ questionId: 'a', value: 'L' }], [{ questionId: 'a', value: 'M' }])).toBe(false)
  })
})
