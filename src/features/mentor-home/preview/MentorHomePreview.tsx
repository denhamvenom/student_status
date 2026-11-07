import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTheme } from 'next-themes'
import type { MentorMeeting } from '../contract'
import { mentorHomeFixtures, pinnedFixture } from '../fixtures'
import { MentorHomeBlocks, MentorHomeView, PinnedBannerView, type MentorHomeHandlers } from '../MentorHomeView'

type State = keyof typeof mentorHomeFixtures | 'loading' | 'errors'
const states: State[] = ['busy', 'signups', 'empty', 'invitesOnly', 'loading', 'errors']
const noRetry = () => console.info('Mentor Home preview: Try again re-subscribes mySubteamClockedIn')
const wait = () => new Promise(resolve => window.setTimeout(resolve, 400))

/**
 * Development-only Mentor Home with synthetic data (no backend), registered in src/main.tsx:
 * `/__mentor-home-preview?state=busy&theme=light&role=mentor`. `state=busy` shows every block: the pinned banner, Next event,
 * Who's here now (one subteam with students, one empty), Needs your answer (an invitation and a trip missing a drive answer),
 * Coming up with Travel / Your subteam tags and the events-you-could-help-with tile. `state=empty` hides the optional blocks.
 * `role=travelLead` shows the same blocks under My schedule, above a stand-in for the staff home. Answer opens the wizard.
 */
export default function MentorHomePreview() {
  const [params] = useSearchParams()
  const requested = params.get('state')
  const state: State = states.includes(requested as State) ? requested as State : 'busy'
  const theme = params.get('theme') === 'dark' ? 'dark' : 'light'
  const travelLead = params.get('role') === 'travelLead'
  const { setTheme } = useTheme()
  useEffect(() => { setTheme(theme) }, [setTheme, theme])
  const [pinned, setPinned] = useState(true)
  const fixture = state === 'loading' || state === 'errors' ? mentorHomeFixtures.busy : mentorHomeFixtures[state]
  const data = state === 'loading' ? undefined : state === 'errors' ? new Error('Preview failure') : fixture.data
  const here = { data: state === 'loading' ? undefined : state === 'errors' ? new Error('Preview failure') : fixture.here, retry: noRetry }
  // The wizard's saves log what the server would get; a title with "CAD" fails so the error state can be seen.
  const save = (what: string) => async (meeting: MentorMeeting, ...rest: unknown[]) => {
    await wait()
    if (meeting.title.includes('CAD')) throw new Error('This event isn’t open to you. It is for other subteams only.')
    console.info(`Mentor Home preview: ${what}`, meeting.title, ...rest)
  }
  const handlers: MentorHomeHandlers = {
    signUp: save('signUp'), respond: save('respond'), updateAnswers: save('updateAnswers'), withdraw: save('withdraw'), skip: save('skipMeeting'),
    leaveSeries: async meeting => { await save('leaveSeries')(meeting); return 3 },
    retry: () => console.info('Mentor Home preview: Try again re-subscribes mentorHome'),
  }
  const link = (next: State, nextTheme = theme, nextRole = travelLead ? 'travelLead' : 'mentor') => `?state=${next}&theme=${nextTheme}&role=${nextRole}`
  const banner = pinned && state === 'busy' ? <PinnedBannerView message={pinnedFixture} onDismiss={() => setPinned(false)} /> : null
  const chip = 'inline-flex min-h-11 items-center rounded-full border border-vs-border px-3 text-vs-text! aria-[current=page]:bg-vs-inset-raised'
  return <main className="app-content" style={{ padding: 14 }}>
    {travelLead
      ? <>
        <section aria-labelledby="preview-my-schedule" className="mb-6 flex min-w-0 flex-col gap-3 font-sans text-vs-text md:max-w-[720px]">
          <h2 id="preview-my-schedule" className="m-0!">My schedule</h2>
          <MentorHomeBlocks now={fixture.now} data={data} handlers={handlers} here={here} />
        </section>
        <section className="card"><h2>Team</h2><p className="muted">Preview stand-in: the Travel Lead’s staff home (pinned messages, roster) continues here.</p></section>
      </>
      : <MentorHomeView name={fixture.name} now={fixture.now} data={data} handlers={handlers} here={here} banner={banner} />}
    <nav aria-label="Preview states" className="mt-10 flex flex-wrap gap-2 border-t border-dashed border-vs-border pt-4 text-[12px]">
      {states.map(name => <Link key={name} to={link(name)} aria-current={name === state ? 'page' : undefined} className={chip}>{name}</Link>)}
      <Link to={link(state, theme === 'dark' ? 'light' : 'dark')} className={chip}>{theme === 'dark' ? 'Light' : 'Dark'}</Link>
      <Link to={link(state, theme, travelLead ? 'mentor' : 'travelLead')} className={chip}>{travelLead ? 'View as Mentor' : 'View as Travel Lead'}</Link>
    </nav>
  </main>
}
