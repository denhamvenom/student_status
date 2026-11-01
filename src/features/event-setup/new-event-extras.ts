import { chicagoDisplayTime, chicagoInputTime, parseChicagoInput } from '@/lib/chicago-time'
import { eventSetupCopy, questionKindLabels } from '../../copy/event-setup-copy'
import { MAX_SHIFTS, shiftLimits, shiftTime, shiftTimesIssue } from './shift-plan'

// Drafts for the New event wizard's optional steps. They live in the browser until Create event sends them with the event.
// Limits match convex/lib/eventSignupExtras (cleanShift, cleanQuestion) and eventOperations.saveRequirement.
export const MAX_QUESTIONS = 25
export const MAX_REQUIREMENTS = 100
const RESERVED_KEYS = ['pay', 'perm', 'first', 'room']

export type QuestionKind = 'singleChoice' | 'multiChoice' | 'shortText' | 'longText' | 'yesNo' | 'number'
export type DraftShift = { shiftId: string; label: string; startsAt: number; endsAt: number; capacity: number | null }
export type DraftQuestion = { id: string; kind: QuestionKind; prompt: string; options: string[]; required: boolean }
export type DraftRequirement = { id: string; label: string; instructions: string; url: string; dueAt: string }
export type ExtrasIssue = { step: 6 | 7 | 8; field: string; message: string; item?: number }

let draftSerial = 0
/** A draft id no other draft in this page session has used, so it stays unique when a step unmounts and remounts. */
export const newDraftId = (prefix: string) => `${prefix}${draftSerial++}`

export const isChoice = (kind: QuestionKind) => kind === 'singleChoice' || kind === 'multiChoice'
export const blankQuestion = (id: string): DraftQuestion => ({ id, kind: 'singleChoice', prompt: '', options: ['', ''], required: true })

export const sortedShifts = (shifts: readonly DraftShift[]) => [...shifts].sort((a, b) => a.startsAt - b.startsAt || a.endsAt - b.endsAt)

/** The shifts as createEvent expects them. */
export const shiftArgs = (shifts: readonly DraftShift[]) => sortedShifts(shifts).map(s => ({ ...(s.label.trim() ? { label: s.label.trim() } : {}), startsAt: s.startsAt, endsAt: s.endsAt, ...(s.capacity !== null ? { capacity: s.capacity } : {}) }))

/** A draft question's problem in Coach-facing words, or null when it can be saved. */
export function questionIssue(q: DraftQuestion): string | null {
  const copy = eventSetupCopy.newEventSteps
  const prompt = q.prompt.trim()
  if (!prompt || prompt.length > 300) return copy.questionPrompt
  if (!isChoice(q.kind)) return null
  const options = q.options.map(o => o.trim())
  if (options.length < 2 || options.length > 20 || options.some(o => !o || o.length > 100)) return copy.questionOptions
  if (new Set(options.map(o => o.toLowerCase())).size !== options.length) return copy.questionDuplicate
  return null
}

/** The input to focus for a question's problem: the first blank, too-long or duplicate choice option, otherwise the question text. */
export function questionIssueField(q: DraftQuestion): string {
  const base = `new-event-question-${q.id}`
  if (!q.prompt.trim() || q.prompt.trim().length > 300 || !isChoice(q.kind)) return base
  const options = q.options.map(o => o.trim())
  const seen = new Set<string>()
  const at = options.findIndex(o => { const key = o.toLowerCase(), dup = !!o && seen.has(key); seen.add(key); return !o || o.length > 100 || dup })
  return at >= 0 ? `${base}-option-${at}` : base
}

export const questionArgs = (questions: readonly DraftQuestion[]) => questions.map(q => ({ kind: q.kind, prompt: q.prompt.trim(), ...(isChoice(q.kind) ? { options: q.options.map(o => o.trim()) } : {}), required: q.required }))

/** A draft requirement's problem in Coach-facing words, or null when it can be saved. */
export function requirementIssue(r: DraftRequirement): string | null {
  const copy = eventSetupCopy.newEventSteps
  const label = r.label.trim()
  if (!label || label.length > 100) return copy.requirementLabel
  if (r.instructions.length > 1000) return copy.requirementInstructionsTooLong
  if (r.url.trim() && (!/^https:\/\//i.test(r.url.trim()) || r.url.trim().length > 500)) return copy.requirementUrl
  if (r.dueAt && !Number.isFinite(parseChicagoInput(r.dueAt))) return copy.requirementDue
  return null
}

/** Requirements as createEvent expects them. The short name each needs is made from the display name and kept unique. */
export function requirementArgs(requirements: readonly DraftRequirement[]) {
  const used = new Set<string>()
  return requirements.map((r, index) => {
    const slug = r.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24)
    let key = slug && !RESERVED_KEYS.includes(slug) ? slug : `requirement-${index + 1}`
    for (let n = 2; used.has(key); n++) key = `${key.slice(0, 28)}-${n}`
    used.add(key)
    return { key, label: r.label.trim(), ...(r.instructions.trim() ? { instructions: r.instructions.trim() } : {}), ...(r.url.trim() ? { url: r.url.trim() } : {}), ...(r.dueAt ? { dueAt: parseChicagoInput(r.dueAt) } : {}) }
  })
}

const slotOutside = (s: DraftShift, event: { startsAt: number; endsAt: number }) =>
  Number.isFinite(event.startsAt) && Number.isFinite(event.endsAt) && shiftTimesIssue(chicagoInputTime(s.startsAt), chicagoInputTime(s.endsAt), event) !== null

/** What Skip for now removes from one step (6 Time slots, 7 Questions, 8 Requirements): only the drafts that could not be saved. Complete ones stay. */
export function withoutInvalid<T extends { shifts: readonly DraftShift[]; questions: readonly DraftQuestion[]; requirements: readonly DraftRequirement[] }>(draft: T & { event: { startsAt: number; endsAt: number } }, step: 6 | 7 | 8) {
  const shifts = step === 6 ? draft.shifts.filter(s => !slotOutside(s, draft.event)) : draft.shifts
  const questions = step === 7 ? draft.questions.filter(q => !questionIssue(q)) : draft.questions
  const requirements = step === 8 ? draft.requirements.filter(r => !requirementIssue(r)) : draft.requirements
  return { shifts, questions, requirements, removed: draft.shifts.length - shifts.length + draft.questions.length - questions.length + draft.requirements.length - requirements.length }
}

/** The first problem in the optional steps, for one step (6 Time slots, 7 Questions, 8 Requirements) or all when `step` is omitted. */
export function extrasIssue(draft: { shiftsOn: boolean; shifts: readonly DraftShift[]; questions: readonly DraftQuestion[]; requirements: readonly DraftRequirement[]; event: { startsAt: number; endsAt: number } }, step?: number): ExtrasIssue | null {
  const copy = eventSetupCopy.newEventSteps
  if (draft.shiftsOn && (step === undefined || step === 6)) {
    if (draft.shifts.length > MAX_SHIFTS) return { step: 6, field: 'new-event-slots', message: copy.tooManySlots }
    if (draft.shifts.some(s => slotOutside(s, draft.event))) return { step: 6, field: 'new-event-slots', message: copy.slotOutside }
  }
  if (step === undefined || step === 7) {
    if (draft.questions.length > MAX_QUESTIONS) return { step: 7, field: 'new-event-questions', message: copy.tooManyQuestions }
    const at = draft.questions.findIndex(q => questionIssue(q))
    if (at >= 0) return { step: 7, field: questionIssueField(draft.questions[at]), message: questionIssue(draft.questions[at]) ?? '', item: at + 1 }
  }
  if (step === undefined || step === 8) {
    if (draft.requirements.length > MAX_REQUIREMENTS) return { step: 8, field: 'new-event-requirements', message: copy.tooManyRequirements }
    const at = draft.requirements.findIndex(r => requirementIssue(r))
    if (at >= 0) return { step: 8, field: `new-event-requirement-${draft.requirements[at].id}`, message: requirementIssue(draft.requirements[at]) ?? '', item: at + 1 }
  }
  return null
}

/** The Review step's shifts line. Like the backend, the fewest a student must pick is capped at the number of time slots drafted. */
export function shiftReviewText(min: string, max: string, slotCount: number) {
  const limits = shiftLimits(min, max)
  if (!slotCount) return eventSetupCopy.newEvent.reviewNoSlots
  return eventSetupCopy.newEvent.reviewOn(Math.min(limits.min ?? 1, slotCount), limits.max)
}

/** What the Review step lists as still open for the event page. */
export function addLater(draft: { shiftsOn: boolean; shifts: readonly unknown[]; questions: readonly unknown[]; requirements: readonly unknown[] }) {
  const copy = eventSetupCopy.newEventSteps
  return [...(draft.shiftsOn && !draft.shifts.length ? [copy.laterSlots] : []), ...(!draft.questions.length ? [copy.laterQuestions] : []), ...(!draft.requirements.length ? [copy.laterRequirements] : [])]
}

/** The first problem in each optional step, for the Review step to list with a way back to each. */
export function extrasIssues(draft: Parameters<typeof extrasIssue>[0]): ExtrasIssue[] {
  return ([6, 7, 8] as const).flatMap(step => extrasIssue(draft, step) ?? [])
}

/** The Review step's compact lines for what was entered in the optional steps (one string per item, in the order they will be saved). */
export function reviewDetails(draft: { shifts: readonly DraftShift[]; questions: readonly DraftQuestion[]; requirements: readonly DraftRequirement[] }) {
  const copy = eventSetupCopy.newEventSteps
  const slots = sortedShifts(draft.shifts).map(s => `${s.label ? `${s.label} · ` : ''}${shiftTime(s.startsAt, s.endsAt)} · ${s.capacity === null ? copy.noLimit : copy.places(s.capacity)}`)
  const questions = draft.questions.map(q => {
    const options = isChoice(q.kind) ? q.options.map(o => o.trim()).filter(Boolean) : []
    return [q.prompt.trim() || '(no question text)', questionKindLabels[q.kind], q.required ? copy.required : copy.optional, ...(options.length ? [options.join(', ')] : [])].join(' · ')
  })
  const requirements = draft.requirements.map(r => {
    const due = r.dueAt ? parseChicagoInput(r.dueAt) : NaN
    return `${r.label.trim() || '(no name)'} · ${Number.isFinite(due) ? copy.dueOn(chicagoDisplayTime(due)) : copy.noDue}`
  })
  return { slots, questions, requirements }
}
