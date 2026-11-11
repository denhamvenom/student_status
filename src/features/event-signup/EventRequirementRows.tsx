import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { ChevronRight } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { cn } from 'cn'
import { focusRing } from '@/components/dashboard/styles'
import type { WhatsLeftItem } from '../student-home/contract'
import { chicagoDateKey } from '../student-home/format'
import { guideForItem, itemForOpenRow, openRowKind, taskCopy, type TaskViewer } from '../student-home/tasks'
import { TaskSheet } from '../student-home/tiles/TaskSheet'
import { useNow } from '../student-home/useNow'

type Props = { reader: TaskViewer; eventId: Id<'events'>; eventName: string; studentId: Id<'students'> | null; studentName?: string; open: readonly string[]; openLabel: string }

/** Reads the same What's left items Home shows, so a row has the same owner and link as the Home item behind it. */
function useWork(reader: TaskViewer, studentId: Id<'students'> | null): WhatsLeftItem[] {
  const now = useNow()
  const asOfDay = chicagoDateKey(now)
  const student = useQuery(api.studentHome.summary, reader === 'student' ? { asOfDay } : 'skip')
  const parent = useQuery(api.studentHome.parentSummary, reader === 'parent' && studentId ? { studentId, asOfDay, asOf: now } : 'skip')
  return (reader === 'student' ? student : parent)?.whatsLeft ?? []
}

/** For a Parent: false while the Coach has not posted the FIRST invitation link (the same check setup and Home make). */
function useFirstLinkReady(reader: TaskViewer, studentId: Id<'students'> | null, needed: boolean): boolean | null {
  const getFirst = useMutation(api.firstRegistration.get)
  const [ready, setReady] = useState<boolean | null>(null)
  useEffect(() => {
    if (reader !== 'parent' || !studentId || !needed) return
    let current = true
    void getFirst({ studentId }).then(value => { if (current) setReady(!value.canAccessInvitation || !!value.invitationUrl) }).catch(() => { if (current) setReady(null) })
    return () => { current = false }
  }, [getFirst, reader, studentId, needed])
  return ready
}

function Row({ label, item, props, all, firstLinkReady }: { label: string; item: WhatsLeftItem; props: Props; all: WhatsLeftItem[]; firstLinkReady: boolean | null }) {
  const [sheet, setSheet] = useState(false)
  const guide = guideForItem(item, { viewer: props.reader, all, firstLinkReady, studentName: props.studentName, studentId: props.studentId ?? undefined })
  return <>
    <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" className={cn('split-line min-h-11 w-full cursor-pointer items-center border-0 bg-transparent p-0 text-left font-sans text-inherit', focusRing)}>
      {/* The row says who it waits on ("Waiting for your parent", "Waiting for a Coach to review the form"), not only that it is open. */}
      <span className="flex min-w-0 flex-col"><span>{openRowKind(label) === 'staffReview' ? label : guide.title}</span><span className="text-[13px] text-vs-muted">{guide.headline}</span></span>
      <span className="flex items-center gap-1"><span className="badge badge-open">{props.openLabel}</span><ChevronRight size={16} aria-hidden="true" className="text-vs-muted" /></span>
    </button>
    <TaskSheet guide={guide} open={sheet} onOpenChange={setSheet} remindLabel={props.reader === 'parent' ? taskCopy.remindStudent(props.studentName ?? 'your student') : taskCopy.remindParent} />
  </>
}

/** The red "Open" rows in an event's Requirements box: each one opens a sheet that does the task or says who must act. */
export function EventRequirementRows(props: Props) {
  const all = useWork(props.reader, props.studentId)
  const firstLinkReady = useFirstLinkReady(props.reader, props.studentId, props.open.some(label => openRowKind(label) === 'firstRegistration'))
  return <div className="simple-list">{props.open.map(label => <Row key={label} label={label} item={itemForOpenRow(label, { id: props.eventId, name: props.eventName }, all)} props={props} all={all} firstLinkReady={firstLinkReady} />)}</div>
}
