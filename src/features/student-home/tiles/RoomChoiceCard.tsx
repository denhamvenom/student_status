import { useId } from 'react'
import { Link } from 'react-router'
import { ArrowRight, House } from 'lucide-react'
import { cn } from 'cn'
import { Avatar } from '@/components/dashboard/Avatar'
import { DashboardTile } from '@/components/dashboard/DashboardTile'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { dashboardButtonVariants, eyebrow, inset } from '@/components/dashboard/styles'
import type { RoomChoice } from '../contract'
import { homeCopy } from '../copy'
import { formatDateRange, formatMonthDay, formatWeekday } from '../format'
import { roomDeadlineView } from '../logic'

const copy = homeCopy.room

function groupText(room: RoomChoice) {
  if (room.status === 'notChosen') return copy.notChosen
  if (room.status === 'assignmentRequested') return copy.assignmentRequested
  if (room.status === 'final') return copy.final
  return copy.inGroup(room.groupName ?? copy.groupFallback, room.memberNames)
}

/** Hero card for one open room choice; urgent within seven days of the deadline. */
export function RoomChoiceCard({ room, now }: { room: RoomChoice; now: number }) {
  const titleId = useId()
  const view = roomDeadlineView(room, now)
  const urgent = view?.urgent ?? false
  const deadline = room.roomDeadline
  // Urgent: the weekday it closes ("CLOSES FRI"); calm: the date ("Closes Feb 19").
  const pill = view === null ? null : view.closes.kind === 'today' ? copy.closesToday : copy.closesOn(view.closes.kind === 'weekday' ? formatWeekday(view.closes.at) : formatMonthDay(view.closes.at))
  return <DashboardTile surface="hero" tone={urgent ? 'hero' : 'quiet'} aria-labelledby={titleId} className={cn(urgent && 'border-2 border-vs-gold lg:border lg:border-[color-mix(in_srgb,var(--vs-gold)_32%,transparent)]')}>
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        {view !== null && deadline !== null && <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <StatusBadge tone={urgent ? 'urgentStrong' : 'calm'} className={cn(urgent && 'tracking-[0.03em] uppercase')}>{pill}</StatusBadge>
          <span className="text-[12px] text-vs-muted lg:text-[11px] lg:tracking-[0.02em]">{urgent ? copy.dateLine(formatMonthDay(deadline), copy.daysLeft(view.daysLeft)) : copy.daysLeft(view.daysLeft)}</span>
        </div>}
        <h2 id={titleId} className="mt-2.5! mb-0! font-heading! text-[28px]! leading-[1.05]! font-normal! tracking-normal! text-vs-heading lg:mt-2! lg:text-[30px]! lg:tracking-[0.01em]!">{copy.title}</h2>
        <p className="mt-1 text-[13px] text-vs-muted">{copy.eventLine(room.eventName, formatDateRange(room.startsAt, room.endsAt))}</p>
      </div>
      <span aria-hidden="true" className="hidden size-[54px] shrink-0 items-center justify-center rounded-[14px] border border-vs-border bg-vs-inset-raised text-vs-purple lg:inline-flex dark:border-[color-mix(in_srgb,var(--vs-gold)_25%,transparent)] dark:bg-[color-mix(in_srgb,var(--vs-gold)_10%,transparent)] dark:text-vs-gold"><House size={28} strokeWidth={2} /></span>
    </div>

    {/* Group and invitations side by side from 1280px (as drawn); stacked below that, where the hero is narrow. */}
    <div className={cn(inset, 'mt-3.5 px-3.5 py-[11px] lg:mt-[18px] lg:self-start lg:rounded-xl lg:px-[18px] lg:py-4 xl:grid xl:grid-cols-2')}>
      <div className="min-w-0 xl:pr-5">
        <p className={eyebrow}>{copy.yourGroup}</p>
        <p className="mt-1 text-[15px] text-vs-text-2 lg:mt-2 lg:text-[17px] lg:font-medium">{groupText(room)}</p>
        {room.status === 'notChosen' && <p className="mt-1 hidden max-w-[34ch] text-[12px] leading-normal text-vs-muted lg:block">{copy.notChosenHint}</p>}
      </div>
      <div className={cn('mt-3 min-w-0 border-t border-vs-border-subtle pt-3 lg:mt-4 lg:pt-4 xl:mt-0 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-5', room.invitations.length === 0 && 'hidden lg:block')}>
        <p className={eyebrow}>{copy.invitations}</p>
        {room.invitations.length > 0
          ? <ul className="mt-2 flex flex-col gap-2">{room.invitations.map(invite => <li key={invite.inviteId} className="flex items-center gap-2.5 rounded-inset border border-vs-border bg-vs-inset-raised px-3 py-2.5">
              <Avatar initials={invite.initials} />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-vs-text-2">{copy.invitedYou(invite.fromName)}</p>
                <p className="text-[11px] font-semibold text-vs-purple dark:text-vs-gold">{copy.waitingForReply}</p>
              </div>
            </li>)}</ul>
          : <p className="mt-2 text-[13px] text-vs-muted">{copy.noInvitations}</p>}
      </div>
    </div>

    <div className="mt-auto flex flex-col gap-3 pt-3.5 lg:flex-row lg:items-center lg:justify-between lg:pt-5">
      {deadline !== null && <p className="hidden text-[12px] text-vs-muted lg:block">{copy.deadline(formatMonthDay(deadline))}</p>}
      <Link to={`/events/${room.eventId}/rooming`} className={cn(dashboardButtonVariants({ tone: 'primary', size: 'lg' }), 'w-full rounded-xl lg:ml-auto lg:w-auto lg:rounded-[10px]')}>
        {copy.choose}<ArrowRight size={16} aria-hidden="true" />
      </Link>
    </div>
  </DashboardTile>
}
