import { useId, useState } from 'react'
import { cn } from 'cn'
import { DashboardTile, TileTitle } from '@/components/dashboard/DashboardTile'
import { DetailsSheet } from '@/components/dashboard/DetailsSheet'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { dashboardButtonVariants, inset, warningText } from '@/components/dashboard/styles'
import type { OpenSignup } from '../contract'
import { homeCopy } from '../copy'
import { isWithinSoon, openSignupsSummary, signupDateLine } from '../logic'
import type { StudentHomeHandlers } from '../types'
import { SignupSheet } from './SignupSheet'

const copy = homeCopy.signups
const INLINE_ROWS = 2

function SignupRow({ signup, now, onSignUp }: { signup: OpenSignup; now: number; onSignUp: () => void }) {
  const soon = isWithinSoon(signup.signupClosesAt, now)
  return <li className={cn(inset, 'flex min-h-[60px] items-center gap-3 py-2 pr-2.5 pl-3')}>
    <div className="min-w-0 flex-1">
      <p className="truncate text-[14px] font-medium text-vs-text-2 lg:text-[13px]">{signup.name}</p>
      <p className={cn('mt-0.5 text-[12px] lg:text-[11px]', soon ? cn('font-semibold', warningText) : 'text-vs-muted')}>
        {signupDateLine(signup, now)}
      </p>
    </div>
    {/* Desktop draws calm rows with a softer button; phones keep the primary button. */}
    <button type="button" aria-label={copy.signUpFor(signup.name)} onClick={onSignUp} className={cn(
      dashboardButtonVariants({ tone: 'primary', size: 'sm' }),
      !soon && 'lg:border-vs-border lg:bg-vs-inset-raised lg:bg-none lg:text-vs-accent-text! lg:shadow-none',
    )}>{copy.signUp}</button>
  </li>
}

/** Events the Student can still sign up for. Urgent when any signup closes within seven days. */
export function OpenSignupsTile({ signups, now, handlers }: { signups: OpenSignup[]; now: number; handlers: StudentHomeHandlers }) {
  const titleId = useId()
  const { rows, closingSoon, tone } = openSignupsSummary(signups, now)
  const [listOpen, setListOpen] = useState(false)
  const [selected, setSelected] = useState<OpenSignup | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const choose = (signup: OpenSignup) => { setListOpen(false); setSelected(signup); setSheetOpen(true) }

  return <DashboardTile tone={tone} aria-labelledby={titleId}>
    <div className="flex items-center justify-between gap-3">
      <TileTitle id={titleId}>{copy.title}</TileTitle>
      {rows.length > 0 && (closingSoon > 0
        ? <StatusBadge tone="urgentResponsive">{copy.closingSoon(closingSoon)}</StatusBadge>
        : <StatusBadge tone="calm">{copy.open(rows.length)}</StatusBadge>)}
    </div>
    {rows.length === 0
      ? <p className="mt-1.5 text-[13px] text-vs-muted lg:text-[12px]">{copy.empty}</p>
      : <ul className="mt-2.5 flex flex-col gap-[7px] lg:mt-3 lg:gap-2">{rows.slice(0, INLINE_ROWS).map(signup => <SignupRow key={signup.eventId} signup={signup} now={now} onSignUp={() => choose(signup)} />)}</ul>}
    {/* Desktop keeps the right column short (Participation above the fold at 1280×800): a compact link whose 44px target overlaps the padding. */}
    {rows.length > INLINE_ROWS && <button type="button" onClick={() => setListOpen(true)} className={cn(dashboardButtonVariants({ tone: 'ghost', size: 'sm' }), "mt-1.5 -mb-1.5 self-center lg:relative lg:mt-3 lg:mb-0 lg:min-h-0 lg:rounded-sm lg:px-1 lg:hover:bg-transparent lg:hover:underline lg:after:absolute lg:after:inset-x-[-8px] lg:after:top-1/2 lg:after:h-11 lg:after:-translate-y-1/2 lg:after:content-['']")}>{copy.showMore}</button>}

    <DetailsSheet open={listOpen} onOpenChange={setListOpen} title={copy.allTitle}>
      <ul className="flex flex-col gap-2">{rows.map(signup => <SignupRow key={signup.eventId} signup={signup} now={now} onSignUp={() => choose(signup)} />)}</ul>
    </DetailsSheet>
    <SignupSheet signup={selected} open={sheetOpen} onOpenChange={setSheetOpen} handlers={handlers} />
  </DashboardTile>
}
