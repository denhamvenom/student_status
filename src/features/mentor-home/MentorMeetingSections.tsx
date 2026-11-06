import { useEffect } from 'react'
import { cn } from 'cn'
import { inset } from '@/components/dashboard/styles'
import { mentorHomeCopy } from '@/copy/mentor-home-copy'
import { useNow } from '../student-home/useNow'
import { useMentorHomeData } from './MentorHome'
import { createdList, isSkipped, joinable, upcoming } from './logic'
import { MentorMeetingRow } from './MentorMeetingRow'

const copy = mentorHomeCopy
const FULL = Number.POSITIVE_INFINITY

/** Your schedule (/invited): the FULL lists Home only previews (skipped series meetings, events to join, meetings created). Anchors #join and #created are the Home "See all" targets. */
export function MentorMeetingSections() {
  const now = useNow()
  const { data, handlers } = useMentorHomeData(now)
  const ready = data !== undefined && !(data instanceof Error)
  useEffect(() => {
    if (!ready) return
    const id = window.location.hash.slice(1)
    if (id) document.getElementById(id)?.scrollIntoView()
  }, [ready])
  if (data === undefined) return <div className="card"><p role="status">{copy.states.loading(copy.join.title)}</p></div>
  if (data instanceof Error) return <div className="card"><p role="alert">{copy.states.homeFailed}</p><button type="button" className="button button-outline" onClick={handlers.retry}>{copy.states.tryAgain}</button></div>
  const open = joinable(data.signUpAvailable, now, FULL).shown
  const created = createdList(data.created, now, FULL).shown
  const skipped = upcoming(data.signUpAvailable.filter(isSkipped), now)
  const section = (id: string, title: string, rows: typeof open, action: 'join' | 'created' | 'skipped', none: string) => <section id={id} aria-labelledby={`${id}-title`} className="card">
    <h2 id={`${id}-title`}>{title}</h2>
    {rows.length ? <ul aria-label={title} className={cn(inset, 'm-0 flex list-none flex-col px-1.5 py-0.5')}>{rows.map(row => <MentorMeetingRow key={row.eventId} meeting={row} action={action} handlers={handlers} />)}</ul> : <p>{none}</p>}
  </section>
  return <>
    {data.truncated && <p className="muted">{copy.states.listTruncated}</p>}
    {skipped.length > 0 && section('skipped', copy.series.skippedHeading, skipped, 'skipped', '')}
    {section('join', copy.join.title, open, 'join', copy.join.none)}
    {section('created', copy.created.title, created, 'created', copy.created.none)}
  </>
}
