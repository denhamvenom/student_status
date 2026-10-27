import { useId } from 'react'
import { Link } from 'react-router'
import { ArrowRight, ChevronRight, CircleDollarSign, ClipboardCheck, FileSignature, IdCard, UserPlus, type LucideIcon } from 'lucide-react'
import { cn } from 'cn'
import { DashboardTile } from '@/components/dashboard/DashboardTile'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { dashboardButtonVariants, eyebrow, inset } from '@/components/dashboard/styles'
import { homeCopy } from '../copy'
import { formatMoney, formatMonthDay, formatShortDate, formatWeekday } from '../format'
import type { HighlightAction, HighlightDue, HighlightKind } from '../logic'
import { FUNDRAISER_PATH } from './BalanceTile'

const copy = homeCopy.highlights

const icons: Record<HighlightKind, LucideIcon> = {
  inviteParent: UserPlus,
  firstRegistration: IdCard,
  requiredPayment: CircleDollarSign,
  permissionForm: FileSignature,
  requirement: ClipboardCheck,
}

type CardLink = { label: string; to: string }
type CardContent = { title: string; text: string | null; primary: CardLink | null; quiet: CardLink | null }

/**
 * What one to-do card says and where its button leads. Every text names its event, so the cards have no
 * separate event line under the title (it would repeat the event name).
 */
export function actionContent(action: HighlightAction, fundraiserLinked: boolean): CardContent {
  const { item } = action
  const event = item.eventName
  const eventText = event ?? copy.thisEvent
  const eventPath = item.eventId ? `/events/${item.eventId}` : null
  switch (action.kind) {
    case 'inviteParent':
      // Always the Parents page, whatever the summary sends (as in What's left).
      return { title: copy.inviteParent.title, text: copy.inviteParent.text, primary: { label: copy.inviteParent.action, to: '/parents' }, quiet: null }
    case 'firstRegistration':
      return item.owner === 'student'
        ? { title: copy.firstRegistration.title, text: copy.firstRegistration.studentText, primary: item.href ? { label: copy.firstRegistration.action, to: item.href } : null, quiet: null }
        : { title: copy.firstRegistration.title, text: copy.firstRegistration.parentText, primary: null, quiet: null }
    case 'requiredPayment':
      return { title: copy.payment.title, text: copy.payment.text(eventText), primary: fundraiserLinked ? { label: copy.payment.fundraise, to: FUNDRAISER_PATH } : { label: copy.payment.openMoney, to: '/finances' }, quiet: null }
    case 'permissionForm':
      return { title: copy.permissionForm.title, text: copy.permissionForm.text(eventText), primary: null, quiet: eventPath ? { label: copy.permissionForm.viewEvent, to: eventPath } : null }
    case 'requirement': {
      const to = item.href ?? eventPath
      return { title: item.label ?? copy.requirement.title, text: event ? copy.requirement.text(event) : null, primary: to ? { label: copy.requirement.action, to } : null, quiet: null }
    }
  }
}

/** The pill and the line beside it, as on the room choice card. */
function DueRow({ due, urgent }: { due: HighlightDue; urgent: boolean }) {
  const pill = due.state === 'overdue' ? copy.overdue
    : due.state === 'soon' ? (due.daysLeft <= 0 ? copy.dueToday : copy.dueOn(formatWeekday(due.at)))
    : copy.dueOn(formatMonthDay(due.at))
  const line = due.state === 'overdue' ? copy.wasDue(formatShortDate(due.at)) : copy.dateLine(formatMonthDay(due.at), copy.daysLeft(due.daysLeft))
  return <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
    <StatusBadge tone={urgent ? 'urgentStrong' : 'calm'} className={cn(urgent && 'tracking-[0.03em] uppercase')}>{pill}</StatusBadge>
    <span className="text-[12px] text-vs-muted lg:text-[11px] lg:tracking-[0.02em]">{line}</span>
  </div>
}

/**
 * One Highlights to-do card in the room choice card's visual language: pill row, Anton title, icon tile
 * (desktop), a short text in the inset panel, and the button. Urgent (gold border, red pill) when overdue,
 * due within seven days, or Invite a parent.
 */
export function ActionCard({ action, fundraiserLinked, balanceDueCents }: { action: HighlightAction; fundraiserLinked: boolean; balanceDueCents: number | null }) {
  const titleId = useId()
  const content = actionContent(action, fundraiserLinked)
  const Icon = icons[action.kind]
  const { urgent, due } = action
  const amount = action.kind === 'requiredPayment' && balanceDueCents !== null && balanceDueCents > 0 ? balanceDueCents : null
  return <DashboardTile surface="hero" tone={urgent ? 'hero' : 'quiet'} aria-labelledby={titleId} className={cn(urgent && 'border-2 border-vs-gold lg:border lg:border-[color-mix(in_srgb,var(--vs-gold)_32%,transparent)]')}>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {due && <DueRow due={due} urgent={urgent} />}
        <h2 id={titleId} className={cn('mb-0! font-heading! text-[28px]! leading-[1.05]! font-normal! tracking-normal! break-words text-vs-heading lg:text-[30px]! lg:tracking-[0.01em]!', due ? 'mt-2.5! lg:mt-2!' : 'mt-0!')}>{content.title}</h2>
      </div>
      <span aria-hidden="true" className="hidden size-[54px] shrink-0 items-center justify-center rounded-[14px] border border-vs-border bg-vs-inset-raised text-vs-purple lg:inline-flex dark:border-[color-mix(in_srgb,var(--vs-gold)_25%,transparent)] dark:bg-[color-mix(in_srgb,var(--vs-gold)_10%,transparent)] dark:text-vs-gold"><Icon size={28} strokeWidth={2} /></span>
    </div>

    {(content.text || amount !== null) && <div className={cn(inset, 'mt-3.5 px-3.5 py-[11px] lg:mt-[18px] lg:flex lg:min-h-[120px] lg:flex-1 lg:flex-col lg:justify-center lg:rounded-xl lg:px-[18px] lg:py-4')}>
      {content.text && <p className="text-[15px] leading-[1.45] text-vs-text-2 lg:max-w-[46ch] lg:text-[17px]">{content.text}</p>}
      {amount !== null && <div className={cn(content.text && 'mt-3 border-t border-vs-border-subtle pt-3 lg:mt-4 lg:pt-4')}>
        <p className={eyebrow}>{copy.payment.amount}</p>
        <p className="mt-1 font-heading text-[28px] leading-none text-vs-urgent lg:text-[30px]">{formatMoney(amount)}</p>
      </div>}
    </div>}

    {(content.primary || content.quiet) && <div className="mt-auto flex flex-col gap-3 pt-3.5 lg:flex-row lg:items-center lg:justify-end lg:pt-5">
      {content.quiet && <Link to={content.quiet.to} className={cn(dashboardButtonVariants({ tone: 'ghost', size: 'sm' }), '-ml-3.5 self-start lg:ml-0 lg:self-auto')}>
        {content.quiet.label}<ChevronRight size={16} aria-hidden="true" />
      </Link>}
      {content.primary && <Link to={content.primary.to} className={cn(dashboardButtonVariants({ tone: 'primary', size: 'lg' }), 'w-full rounded-xl lg:w-auto lg:rounded-[10px]')}>
        {content.primary.label}<ArrowRight size={16} aria-hidden="true" />
      </Link>}
    </div>}
  </DashboardTile>
}
