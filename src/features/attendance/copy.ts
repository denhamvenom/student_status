import { homeCopy } from '../student-home/copy'

/* Attendance page strings for Students and Parents. Wording is recorded in docs/LANGUAGE.md. */

const home = homeCopy.participation
const plural = (count: number, one: string, many: string) => count === 1 ? one : many

export type Kind = 'required' | 'other' | 'outreach' | 'build'

export const attendanceCopy = {
  description: "Your team's meetings and events this season, by type.",
  requiredMeetings: 'Required meetings',
  otherMeetings: 'Other meetings',
  outreach: 'Outreach',
  buildHours: 'Build hours',
  percent: home.percent,
  attended: home.attended,
  hours: home.hours,
  ofTarget: home.ofTarget,
  sinceKickoff: home.sinceKickoff,
  startsAtKickoff: home.startsAtKickoff,
  noRequired: 'No required meetings yet',
  noneYet: 'None yet',
  ofMeetings: (held: number) => `of ${held} ${plural(held, 'meeting', 'meetings')}`,
  ofEvents: home.ofEvents,
  updating: 'Updating',
  updatingNote: 'Attendance is updating. Check back in a few minutes.',
  seeMeetings: 'See meetings',
  seeEvents: 'See events',
  seeBuildDays: 'See build days',
  sheetTitle: {
    required: 'Required meetings',
    other: 'Other meetings',
    outreach: 'Outreach',
    build: 'Build hours',
  } satisfies Record<Kind, string>,
  sheetDescription: {
    required: 'Every required meeting so far this season, newest first.',
    other: 'Optional meetings so far this season, newest first.',
    outreach: 'Outreach events so far this season, newest first.',
    build: 'Build meetings since kickoff, newest first.',
  } satisfies Record<Kind, string>,
  untitled: {
    required: 'Required meeting',
    other: 'Meeting',
    outreach: 'Outreach event',
    build: 'Build meeting',
  } satisfies Record<Kind, string>,
  statusAttended: 'Attended',
  statusMissed: 'Missed',
  minutes: (minutes: number) => `${minutes} ${plural(minutes, 'minute', 'minutes')}`,
  hoursMinutes: (hours: number, minutes: number) => `${hours} ${plural(hours, 'hour', 'hours')} ${minutes} ${plural(minutes, 'minute', 'minutes')}`,
  fromDays: (days: number) => `from ${days} ${plural(days, 'day', 'days')}`,
  loading: 'Loading…',
  empty: 'Nothing to show yet. Meetings show here after they end.',
  showMore: 'Show more sessions',
  loadingMore: 'Loading…',
  noStudent: 'No student is linked to this account yet.',
}
