import { parseChicagoInput } from './chicago-time'

export type EventDraft = { name: string; start: string; end: string; destination: string; calendarChoice?: string; mode: string; capacity: string; fee: string; travel: string; overnight: boolean; rooming: boolean; roomDeadline: string }
export type EventDraftIssue = { step: number; field: string; message: string }
export function eventDraftIssue(draft: EventDraft, step?: number): EventDraftIssue | null {
  const issue = (at: number, field: string, message: string) => ({ step: at, field, message })
  if (step === undefined || step === 0) {
    if (!draft.name.trim()) return issue(0, 'event-name', 'Enter an event name.')
    if (!Number.isFinite(parseChicagoInput(draft.start))) return issue(0, 'event-start', 'Enter a valid Central Time start.')
    if (!Number.isFinite(parseChicagoInput(draft.end))) return issue(0, 'event-end', 'Enter a valid Central Time end.')
    if (parseChicagoInput(draft.end) < parseChicagoInput(draft.start)) return issue(0, 'event-end', 'The end must be at or after the start.')
    if (!draft.destination.trim() && (!draft.calendarChoice || draft.calendarChoice === 'create')) return issue(0, 'event-destination', 'Enter the destination.')
  }
  if ((step === undefined || step === 1) && draft.mode === 'open' && draft.capacity && (!Number.isSafeInteger(Number(draft.capacity)) || Number(draft.capacity) < 1)) return issue(1, 'event-capacity', 'Enter a whole-number participant limit of at least 1, or leave it blank.')
  if ((step === undefined || step === 2) && (!draft.fee.trim() || !Number.isSafeInteger(Math.round(Number(draft.fee) * 100)) || Number(draft.fee) < 0)) return issue(2, 'event-fee', 'Enter a valid event fee, or 0 for no fee.')
  if (step === undefined || step === 4) {
    if (!draft.travel.trim()) return issue(4, 'event-travel', 'Describe the travel arrangement.')
    if (draft.overnight && draft.rooming && draft.roomDeadline && !Number.isFinite(parseChicagoInput(draft.roomDeadline))) return issue(4, 'event-room-deadline', 'Enter a valid Central Time room selection deadline or leave it blank.')
  }
  return null
}
