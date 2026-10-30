import { Check } from 'lucide-react'
import { cn } from 'cn'
import { eyebrow, focusRing } from '@/components/dashboard/styles'
import type { Id } from '../../../convex/_generated/dataModel'
import { signupCopy } from './copy'
import { shiftDay, shiftTimes } from './format'
import { shiftBlock, shiftRuleText, toggleShift, type ShiftBounds } from './logic'
import type { ShiftOption } from './types'

const copy = signupCopy.shifts
type ShiftId = Id<'eventShifts'>

/** A shift the Student already holds counts their own place as taken; it frees up if they unpick it. */
function spotsText(shift: ShiftOption, held: boolean) {
  if (shift.spotsLeft === null) return copy.openSpots
  const left = shift.spotsLeft + (held ? 1 : 0)
  return left === 0 ? copy.full : copy.spotsLeft(left)
}

/** Tappable shift cards grouped by day. Full and overlapping shifts can't be tapped; the limit is explained. */
export function ShiftPicker({ shifts, bounds, selected, held, onChange, errorId, labelledBy }: {
  shifts: ShiftOption[]
  bounds: ShiftBounds
  selected: ShiftId[]
  /** Shifts the Student already holds (their own place is counted in spotsLeft). */
  held: ShiftId[]
  onChange: (next: ShiftId[]) => void
  /** The wizard shows "Pick 1 more shift." beside Continue, where it is seen; this links the choices to it. */
  errorId?: string
  /** The wizard's step heading already says "Pick your shifts": it names the group instead of a second legend. */
  labelledBy?: string
}) {
  const rule = shiftRuleText(bounds)
  const atLimit = bounds.max !== null && bounds.max > 1 && selected.length >= bounds.max
  const days = [...new Set(shifts.map(s => shiftDay(s.startsAt)))]
  return <fieldset className="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" aria-labelledby={labelledBy} aria-describedby={errorId}>
    {!labelledBy && <legend className="mb-1 p-0 text-[17px] font-bold text-vs-heading">{copy.title}</legend>}
    {rule && <p className="m-0 text-[14px] font-semibold text-vs-text-2">{rule}</p>}
    {days.map(day => <div key={day} className="flex flex-col gap-2">
      {days.length > 1 && <p className={cn(eyebrow, 'm-0')}>{day}</p>}
      {shifts.filter(s => shiftDay(s.startsAt) === day).map(shift => {
        const on = selected.includes(shift.shiftId)
        const block = shiftBlock(shift, selected, shifts, bounds, held)
        return <button key={shift.shiftId} type="button" aria-pressed={on} disabled={!!block}
          onClick={() => onChange(toggleShift(shift.shiftId, selected, shifts, bounds, held))}
          className={cn('flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-inset border-2 px-3.5 py-2.5 text-left font-sans! transition-colors disabled:cursor-not-allowed disabled:opacity-55', focusRing,
            on ? 'border-vs-accent-text bg-vs-inset-raised' : 'border-vs-border bg-vs-card')}>
          <span aria-hidden="true" className={cn('flex size-6 shrink-0 items-center justify-center rounded-full border-2', on ? 'border-vs-accent-text bg-vs-accent-text text-vs-card' : 'border-vs-border')}>
            {on && <Check size={16} strokeWidth={3} />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-[15px] font-bold text-vs-text">{shiftTimes(shift)}</span>
            {shift.label && <span className="text-[14px] text-vs-text-2">{shift.label}</span>}
            {days.length === 1 && <span className="text-[13px] text-vs-muted">{day}</span>}
          </span>
          <span className={cn('shrink-0 text-right text-[13px] font-semibold', block === 'full' ? 'text-vs-urgent' : 'text-vs-muted')}>
            {on ? copy.picked : block === 'overlap' ? copy.overlaps : spotsText(shift, held.includes(shift.shiftId))}
          </span>
        </button>
      })}
    </div>)}
    {atLimit && <p role="status" className="m-0 text-[14px] text-vs-text-2">{copy.atLimit(bounds.max ?? 0)}</p>}
  </fieldset>
}
