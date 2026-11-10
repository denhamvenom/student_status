import { PARENT_STEP as S, setupWizardCopy as copy } from '../../lib/setup-wizard-copy'
import type { SetupNext } from './logic'

/*
 * Pure rules for the Parent setup wizard: which step it opens on, what a step needs before Continue, and what the
 * "saved" screen says. Kept out of SetupWizard.tsx so they can be tested without rendering.
 */

type Guardian = { name: string; relationship: string; phone: string; email: string }
type Emergency = { name: string; relationship: string; phone: string }
export type SetupContacts = { guardian: Guardian; emergency: Emergency }

const filled = (value: string | null | undefined) => !!value && value.trim().length > 0

export type StartInput = {
  edit: boolean
  /** A step named in the link (?step=health or ?step=first), or null. */
  requested: number | null
  student: { preferredName: string; grade: string | null; dateOfBirth: string | null; shirtSize: string | null; roomCategory: string | null; contactsComplete: boolean; medicalComplete: boolean }
  contacts: SetupContacts | null
  /** setupWizard.summary nextItem for this student: the same word Home's "Next:" line is built from. */
  nextItem: SetupNext | null
}

/**
 * The first step that still needs the Parent. Home's "Next: Review and finish" opens Review and "Next: FIRST
 * registration" opens that step, so the card and the wizard always agree.
 */
export function parentStartStep({ edit, requested, student, contacts, nextItem }: StartInput): number {
  if (requested !== null) return requested
  if (edit) return S.names
  if (!filled(student.preferredName)) return S.names
  if (!student.grade || !student.dateOfBirth) return S.grade
  if (!student.shirtSize || !student.roomCategory) return S.shirtRoom
  if (!student.contactsComplete) return missingContacts(contacts, 'guardian') ? S.guardian : S.emergency
  if (!student.medicalComplete) return S.allergies
  return nextItem === null || nextItem === 'first' ? S.first : S.review
}

const missingContacts = (contacts: SetupContacts | null, part: 'guardian' | 'emergency') => {
  const value = contacts?.[part]
  return !value || Object.values(value).some(field => !filled(field))
}

/** "Steps 1–6 done. Use Back to review them." above the step the wizard opens on; empty on the first step. */
export function stepsDoneLine(openedAt: number) {
  if (openedAt <= 0) return ''
  return `${openedAt === 1 ? 'Step 1 done.' : `Steps 1–${openedAt} done.`} ${copy.reviewEarlier}`
}

export type StepValues = { preferred: string; grade: string; dob: string; shirt: string; category: string; contacts: SetupContacts }

/** What a step needs filled in before Continue, said as one sentence, or null when it can move on. */
export function stepIssue(step: number, values: StepValues): string | null {
  const missing: string[] = []
  const need = (ok: boolean, label: string) => { if (!ok) missing.push(label) }
  const { guardian, emergency } = values.contacts
  if (step === S.names) need(filled(values.preferred), 'preferred name')
  else if (step === S.grade) { need(filled(values.grade), 'grade'); need(filled(values.dob), 'date of birth') }
  else if (step === S.shirtRoom) { need(filled(values.shirt), 'shirt size'); need(filled(values.category), 'room type') }
  else if (step === S.guardian) { need(filled(guardian.name), 'full name'); need(filled(guardian.relationship), 'relationship'); need(filled(guardian.phone), 'phone'); need(filled(guardian.email), 'email') }
  else if (step === S.emergency) { need(filled(emergency.name), 'full name'); need(filled(emergency.relationship), 'relationship'); need(filled(emergency.phone), 'phone') }
  return missing.length ? copy.fillIn(missing) : null
}

export type FirstState = 'verified' | 'awaitingVerification' | 'needsCompletion' | null

/** The saved screen: what is saved and what is still left, so "saved" never hides an open FIRST step. */
export function completionSummary(first: FirstState) {
  if (first === 'verified') return { eyebrow: copy.doneEyebrow.complete, text: `${copy.parentSaved} ${copy.nothingLeft}` }
  if (first === 'awaitingVerification') return { eyebrow: copy.doneEyebrow.saved, text: `${copy.parentSaved} ${copy.stillLeft(copy.firstAwaiting)}` }
  if (first === 'needsCompletion') return { eyebrow: copy.doneEyebrow.left, text: `${copy.parentSaved} ${copy.stillLeft(copy.firstNeeds)}` }
  return { eyebrow: copy.doneEyebrow.saved, text: `${copy.parentSaved} ${copy.firstRegistrationStatus(copy.firstChecking)}` }
}
