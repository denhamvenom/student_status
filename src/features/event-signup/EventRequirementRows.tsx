import { useState } from 'react'
import { useQuery } from 'convex/react'
import { ChevronRight } from 'lucide-react'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { cn } from 'cn'
import { focusRing } from '@/components/dashboard/styles'
import type { WhatsLeftItem } from '../student-home/contract'
import { chicagoDateKey } from '../student-home/format'
import { guideForItem, itemForOpenRow, taskCopy, type TaskViewer } from '../student-home/tasks'
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

function Row({ label, item, props, all }: { label: string; item: WhatsLeftItem; props: Props; all: WhatsLeftItem[] }) {
  const [sheet, setSheet] = useState(false)
  const guide = guideForItem(item, { viewer: props.reader, all, studentName: props.studentName, studentId: props.studentId ?? undefined })
  return <>
    <button type="button" onClick={() => setSheet(true)} aria-haspopup="dialog" className={cn('split-line min-h-11 w-full cursor-pointer items-center border-0 bg-transparent p-0 text-left font-sans text-inherit', focusRing)}>
      <span>{label}</span>
      <span className="flex items-center gap-1"><span className="badge badge-open">{props.openLabel}</span><ChevronRight size={16} aria-hidden="true" className="text-vs-muted" /></span>
    </button>
    <TaskSheet guide={guide} open={sheet} onOpenChange={setSheet} remindLabel={props.reader === 'parent' ? taskCopy.remindStudent(props.studentName ?? 'your student') : taskCopy.remindParent} />
  </>
}

/** The red "Open" rows in an event's Requirements box: each one opens a sheet that does the task or says who must act. */
export function EventRequirementRows(props: Props) {
  const all = useWork(props.reader, props.studentId)
  return <div className="simple-list">{props.open.map(label => <Row key={label} label={label} item={itemForOpenRow(label, { id: props.eventId, name: props.eventName }, all)} props={props} all={all} />)}</div>
}
