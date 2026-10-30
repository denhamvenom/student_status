import { statusLabel } from '@/lib/ui-copy'
import { eventSetupCopy } from '../../copy/event-setup-copy'

export type AnswerValue = string | string[] | number | boolean
export type ResponseQuestion = { questionId: string; prompt: string; archived: boolean }
export type ResponseRow = { studentId: string; name: string; status: string; answers: { questionId: string; value: AnswerValue }[] }

/** One answer as people read it: checkbox choices joined with "; ", Yes/No for yes-no questions. */
export function answerText(value: AnswerValue | undefined) {
  if (value === undefined) return ''
  if (Array.isArray(value)) return value.join('; ')
  if (typeof value === 'boolean') return value ? eventSetupCopy.responses.yes : eventSetupCopy.responses.no
  return String(value)
}

/**
 * Quotes every cell so commas, quotes and line breaks stay inside it, and prefixes a single quote to text a
 * spreadsheet would run as a formula (starting with = + - @, a tab or a carriage return, even after spaces).
 */
export function csvCell(value: string) {
  // \s also matches a byte order mark.
  const safe = /^\s*[=+\-@]|^[\t\r]/u.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}

export const BOM = String.fromCharCode(0xfeff)

export const questionHeading = (question: ResponseQuestion) => question.archived ? eventSetupCopy.responses.removedQuestion(question.prompt) : question.prompt

/** Signup answers per student, plus each student's shifts when the event uses shifts. Opens in Excel with a UTF-8 BOM. */
export function signupResponsesCsv(questions: ResponseQuestion[], rows: ResponseRow[], shiftsByStudent: Map<string, string[]> | null) {
  const copy = eventSetupCopy.responses
  const lines = [
    [copy.student, copy.status, ...(shiftsByStudent ? [copy.csvShifts] : []), ...questions.map(questionHeading)],
    ...rows.map(row => [
      row.name,
      statusLabel(row.status),
      ...(shiftsByStudent ? [(shiftsByStudent.get(row.studentId) ?? []).join('; ')] : []),
      ...questions.map(q => answerText(row.answers.find(a => a.questionId === q.questionId)?.value)),
    ]),
  ]
  return BOM + lines.map(line => line.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

export function downloadCsv(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** A safe file name from the event name, for example "spring-fundraiser-responses.csv". */
export function responsesFilename(eventName: string) {
  const slug = eventName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return `${slug || 'event'}-responses.csv`
}
