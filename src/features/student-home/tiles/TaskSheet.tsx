import { createContext, useContext, useId, useState } from 'react'
import { Link } from 'react-router'
import { DetailsSheet } from '@/components/dashboard/DetailsSheet'
import { StatusBadge } from '@/components/dashboard/StatusBadge'
import { dashboardButtonVariants, inset } from '@/components/dashboard/styles'
import { AskCoachButton } from '../../../AskCoachButton'
import { taskCopy, type TaskGuide } from '../tasks'

/** The signed-in person's email, so Ask a Coach can say where the reply goes. Provided by Student Home and Parent Home; the sheet is also opened from event pages. */
export const TaskSheetEmailContext = createContext<string | undefined>(undefined)

/**
 * The small sheet behind a What's left row or an event page requirement row. It either links to where the task gets
 * done, or says who is on it; "Copy reminder" copies a short message and sends nothing.
 */
export function TaskSheet({ guide, open, onOpenChange, remindLabel }: { guide: TaskGuide; open: boolean; onOpenChange: (open: boolean) => void; remindLabel: string }) {
  const email = useContext(TaskSheetEmailContext)
  const messageId = useId()
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null)
  const copy = async () => {
    if (!guide.remind) return
    try { await navigator.clipboard.writeText(guide.remind); setCopied('yes') } catch { setCopied('failed') }
  }
  return <DetailsSheet open={open} onOpenChange={next => { if (!next) setCopied(null); onOpenChange(next) }} title={guide.title} description={guide.eventName ?? undefined}>
    <div className="flex flex-col gap-3">
      <StatusBadge tone={guide.actor === 'reader' ? 'warning' : 'calm'} className="self-start">{guide.headline}</StatusBadge>
      <p className="m-0 text-[14px] leading-normal text-vs-text-2">{guide.explain}</p>
      {guide.action && <Link to={guide.action.to} className={dashboardButtonVariants({ tone: 'primary', size: 'lg' })}>{guide.action.label}</Link>}
      {guide.remind && <>
        <span id={`${messageId}-label`} className="text-[12px] font-medium text-vs-muted">{taskCopy.messageLabel}</span>
        <p aria-labelledby={`${messageId}-label`} className={`${inset} m-0 px-3 py-2 text-[13px] text-vs-text`}>{guide.remind}</p>
        <button type="button" onClick={() => void copy()} className={dashboardButtonVariants({ tone: guide.action ? 'soft' : 'primary', size: 'lg' })}>{remindLabel}</button>
        <span role="status" className="text-[12px] text-vs-muted">{copied === 'yes' ? taskCopy.copied : copied === 'failed' ? taskCopy.copyFailed : ''}</span>
      </>}
      <div className="flex flex-wrap items-center gap-2"><span className="text-[12px] text-vs-muted">{taskCopy.notSure}</span><AskCoachButton email={email} /></div>
    </div>
  </DetailsSheet>
}
