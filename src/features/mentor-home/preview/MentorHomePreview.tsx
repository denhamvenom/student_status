import { useEffect } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTheme } from 'next-themes'
import { mentorHomeFixtures } from '../fixtures'
import type { MentorHomeHandlers } from '../MentorMeetingRow'
import { MentorHomeView } from '../MentorHomeView'

type State = keyof typeof mentorHomeFixtures | 'loading' | 'errors'
const states: State[] = ['busy', 'signups', 'empty', 'invitesOnly', 'loading', 'errors']
const noRetry = () => console.info('Mentor Home preview: Try again re-subscribes mySubteamClockedIn')
const wait = () => new Promise(resolve => window.setTimeout(resolve, 400))

/**
 * Development-only Mentor Home with synthetic data (no backend). Register it like the Parent Home preview in
 * src/main.tsx: `/__mentor-home-preview?state=busy&theme=light`. `state=busy` shows Events you can join grouped (series rows,
 * Competitions & trips then Meetings, the Your subteam tag) and Who's here now with one full and one empty subteam;
 * `state=signups` shows travel, overnight, series (every / next 4 / just one) and skipped meetings; `state=empty` shows the
 * empty states. Sign up, I'll be there and Change my answers open the wizard.
 */
export default function MentorHomePreview() {
  const [params] = useSearchParams()
  const requested = params.get('state')
  const state: State = states.includes(requested as State) ? requested as State : 'busy'
  const theme = params.get('theme') === 'dark' ? 'dark' : 'light'
  const { setTheme } = useTheme()
  useEffect(() => { setTheme(theme) }, [setTheme, theme])
  const fixture = state === 'loading' || state === 'errors' ? mentorHomeFixtures.busy : mentorHomeFixtures[state]
  const data = state === 'loading' ? undefined : state === 'errors' ? new Error('Preview failure') : fixture.data
  const here = { data: state === 'loading' ? undefined : state === 'errors' ? new Error('Preview failure') : fixture.here, retry: noRetry }
  // The wizard's saves log what the server would get; a title with "CAD" fails so the error state can be seen.
  const save = (what: string) => async (meeting: { title: string }, ...rest: unknown[]) => {
    await wait()
    if (meeting.title.includes('CAD')) throw new Error('This event isn’t open to you. It is for other subteams only.')
    console.info(`Mentor Home preview: ${what}`, meeting.title, ...rest)
  }
  const handlers: MentorHomeHandlers = {
    signUp: save('signUp'), respond: save('respond'), updateAnswers: save('updateAnswers'), withdraw: save('withdraw'), skip: save('skipMeeting'),
    leaveSeries: async meeting => { await save('leaveSeries')(meeting); return 3 },
    retry: () => console.info('Mentor Home preview: Try again re-subscribes mentorHome'),
  }
  const link = (next: State, nextTheme = theme) => `?state=${next}&theme=${nextTheme}`
  return <main className="app-content" style={{ padding: 14 }}>
    <MentorHomeView name={fixture.name} now={fixture.now} data={data} handlers={handlers} here={here} />
    <nav aria-label="Preview states" className="mt-10 flex flex-wrap gap-2 border-t border-dashed border-vs-border pt-4 text-[12px]">{states.map(name => <Link key={name} to={link(name)} aria-current={name === state ? 'page' : undefined} className="inline-flex min-h-11 items-center rounded-full border border-vs-border px-3 text-vs-text! aria-[current=page]:bg-vs-inset-raised">{name}</Link>)}<Link to={link(state, theme === 'dark' ? 'light' : 'dark')} className="inline-flex min-h-11 items-center rounded-full border border-vs-border px-3 text-vs-text!">{theme === 'dark' ? 'Light' : 'Dark'}</Link></nav>
  </main>
}
