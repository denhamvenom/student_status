import { Component, useEffect, useState, type ReactNode } from 'react'
import { useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'

type Attendance = FunctionReturnType<typeof api.familyAttendance.forStudent>
type Session = Attendance['timed']['sessions'][number]

const chicagoDate = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })
const minutes = (milliseconds: number) => `${(milliseconds / 60_000).toFixed(1)} min`

class AttendanceErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError() {
    return { error: 'This attendance view could not be loaded. Please try again.' }
  }
  render() {
    if (this.state.error) return <Card role="alert"><CardHeader><CardTitle>Attendance unavailable</CardTitle><CardDescription>{this.state.error}</CardDescription></CardHeader><CardContent><Button variant="outline" onClick={() => this.setState({ error: null })}>Try again</Button></CardContent></Card>
    return this.props.children
  }
}

function SessionCard({ session }: { session: Session }) {
  const provisional = session.state === 'open'
  const cancelled = session.state === 'cancelled'
  const result = cancelled ? 'Cancelled — does not qualify' : provisional ? session.qualifies ? 'Currently meets the one-hour requirement' : 'One-hour requirement not yet met' : session.qualifies ? 'Meets the one-hour requirement' : 'Does not meet the one-hour requirement'
  return <Card className="min-w-0" aria-label={`${session.title} attendance`}>
    <CardHeader className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
        <CardTitle className="min-w-0 [overflow-wrap:anywhere]">{session.title}</CardTitle>
        <Badge variant="outline">{cancelled ? 'Cancelled' : provisional ? 'Open · provisional' : 'Closed'}</Badge>
      </div>
      <CardDescription>{chicagoDate.format(session.scheduledStart)} – {chicagoDate.format(session.scheduledEnd)} · America/Chicago</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      <p className="font-medium" role="status">{result}</p>
      {session.needsReview && <p className="text-sm text-muted-foreground">The session schedule needs review.</p>}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
        <div className="min-w-0"><dt className="text-muted-foreground">Total time</dt><dd className="font-medium">{minutes(session.totalMs)}</dd></div>
        <div className="min-w-0"><dt className="text-muted-foreground">Scheduled time</dt><dd className="font-medium">{minutes(session.scheduledMs)}</dd></div>
        <div className="min-w-0"><dt className="text-muted-foreground">Early time</dt><dd className="font-medium">{minutes(session.earlyMs)}</dd></div>
        <div className="min-w-0"><dt className="text-muted-foreground">Extended time</dt><dd className="font-medium">{minutes(session.extendedMs)}</dd></div>
      </dl>
      <p className="text-sm">Longest uninterrupted time during the schedule: <strong>{minutes(session.longestScheduledMs)}</strong>.</p>
      <p className="text-sm text-muted-foreground">{provisional ? 'This open session updates while clocking continues. ' : ''}Totals include any reviewed corrections. Original clock records remain preserved.</p>
    </CardContent>
  </Card>
}

function AttendanceContent({ studentId }: { studentId: Id<'students'> | null }) {
  const [asOf, setAsOf] = useState(() => Date.now())
  useEffect(() => { const timer = window.setInterval(() => setAsOf(Date.now()), 30_000); return () => window.clearInterval(timer) }, [])
  const data = useQuery(api.familyAttendance.forStudent, studentId ? { studentId, asOf } : 'skip')
  if (!studentId) return <Card><CardContent><p>Select a linked student to view attendance.</p></CardContent></Card>
  if (data === undefined) return <Card role="status"><CardContent><p>Loading attendance…</p></CardContent></Card>
  const legacy = data.legacy
  return <div className="space-y-5">
    <div className="page-head"><div><h1>Attendance</h1><p>Viewing {data.studentName}. Times use America/Chicago.</p></div></div>
    <Card>
      <CardHeader><CardTitle>{data.timed.label}</CardTitle><CardDescription>Clock session results use one uninterrupted scheduled hour. Early and extended time are shown separately.</CardDescription></CardHeader>
      <CardContent>
        {data.timed.sessions.length === 0 ? <p>No clock activity is recorded for this student in the current season.</p> : <div className="grid min-w-0 gap-4 lg:grid-cols-2">{data.timed.sessions.map(session => <SessionCard key={session.sessionId} session={session} />)}</div>}
      </CardContent>
    </Card>
    <Card>
      <CardHeader><CardTitle>{legacy.label}</CardTitle><CardDescription>These older meeting checkmarks are separate from verified clock sessions. They do not add clocked minutes or establish the one-hour result.</CardDescription></CardHeader>
      <CardContent>
        {legacy.tuesdayHeld === 0 && legacy.thursdayAttended === 0 && legacy.outreachAttended === 0 ? <p>No legacy attendance totals to display for this student in the current season.</p> : <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Tuesday</dt><dd className="font-medium">{legacy.tuesdayAttended} of {legacy.tuesdayHeld} held{legacy.tuesdayPercent === null ? '' : ` · ${legacy.tuesdayPercent}%`}</dd></div>
          <div><dt className="text-muted-foreground">Thursday attended</dt><dd className="font-medium">{legacy.thursdayAttended}</dd></div>
          <div><dt className="text-muted-foreground">Outreach attended</dt><dd className="font-medium">{legacy.outreachAttended}</dd></div>
        </dl>}
      </CardContent>
    </Card>
  </div>
}

export function FamilyAttendance({ studentId }: { studentId: Id<'students'> | null }) {
  return <AttendanceErrorBoundary key={studentId ?? 'none'}><AttendanceContent studentId={studentId} /></AttendanceErrorBoundary>
}
