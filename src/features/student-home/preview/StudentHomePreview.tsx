import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Link, UNSAFE_LocationContext as LocationContext, useLocation, useNavigationType, useSearchParams } from 'react-router'
import { useTheme } from 'next-themes'
import { PublicFooter } from '@/PublicFooter'
import { StudentShell } from '@/components/student-shell/StudentShell'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { SignupAvailability } from '../contract'
import { studentHomeFixtures, type StudentHomeFixture } from '../fixtures'
import { StudentHomeView } from '../StudentHomeView'
import type { Loadable, SignUpResult, StudentHomeHandlers, StudentHomeViewProps } from '../types'
import type { SignupWizardSource } from '../../event-signup/types'
import { onsitePlace } from '@/lib/event-place'

/*
 * Development-only preview of Student Home with synthetic fixtures (main.tsx loads this only when
 * import.meta.env.DEV). /__student-home-preview?state=busyWeek&theme=dark
 * States: the fixtures plus "loading" and "errors". No backend, no sign-in, nothing is saved.
 * The page renders inside the real Student shell and public footer, like a signed-in Student sees it.
 * The shell is told it is on "/" so Home is highlighted as it is for a Student; its links lead into
 * the real app (which then asks to sign in), so links back to the preview use the full path.
 */

const previewPath = '/__student-home-preview'

const extraStates = ['loading', 'errors'] as const
type PreviewState = keyof typeof studentHomeFixtures | typeof extraStates[number]
const stateNames = [...Object.keys(studentHomeFixtures), ...extraStates] as PreviewState[]
const isState = (value: string | null): value is PreviewState => stateNames.some(name => name === value)

const signUpResult: Record<SignupAvailability['outcome'], SignUpResult> = { signedUp: 'confirmed', waitlisted: 'waitlist', waitingForApproval: 'pending', closed: 'pending' }

function previewHandlers(fixture: StudentHomeFixture, onJoined: (eventId: Id<'events'>) => void): StudentHomeHandlers {
  return { signup: previewSignup(fixture, onJoined), retry: source => console.info(`Student Home preview: Try again re-subscribes ${source}`) }
}

// Nothing is saved; edits from the event page are not part of the Home preview.
const saved = () => Promise.resolve(null)

/** Like the live summary, a landed signup drops the event from Open signups (while the wizard is still open). */
function previewSignup(fixture: StudentHomeFixture, onJoined: (eventId: Id<'events'>) => void): SignupWizardSource {
  return {
    signUp: eventId => new Promise((resolve, reject) => window.setTimeout(() => {
      if (fixture.failingSignups?.includes(eventId)) reject(new Error('This event is full right now. Ask a Coach or Travel Lead if you still need to go.'))
      else { onJoined(eventId); resolve(signUpResult[fixture.availability[eventId]?.outcome ?? 'signedUp']) }
    }, 700)),
    useAvailability: function usePreviewAvailability(eventId: Id<'events'>): Loadable<SignupAvailability> {
      const [loaded, setLoaded] = useState<string | null>(null)
      useEffect(() => { const timer = window.setTimeout(() => setLoaded(eventId), 400); return () => window.clearTimeout(timer) }, [eventId])
      if (loaded !== eventId) return undefined
      return fixture.availability[eventId] ?? new Error('No preview availability for this event.')
    },
    // The fixtures have no questions or shifts; the real form is checked against the backend.
    useSignupExtras: () => ({ questions: null, shifts: null }),
    useEventFacts: () => ({ place: onsitePlace, ride: null }),
    useWhatsLeft: () => fixture.summary.whatsLeft,
    saveShifts: saved,
    saveAnswers: saved,
  }
}

export default function StudentHomePreview() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('state')
  const state: PreviewState = isState(requested) ? requested : 'busyWeek'
  const theme = params.get('theme') === 'light' ? 'light' : 'dark'
  const { setTheme } = useTheme()
  const location = useLocation()
  const navigationType = useNavigationType()
  const shellLocation = useMemo(() => ({ location: { ...location, pathname: '/' }, navigationType }), [location, navigationType])

  // The Student palette, as AppShell sets it for a signed-in Student.
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.design = 'student'
    return () => { delete root.dataset.design }
  }, [])
  // next-themes owns the html class; this also saves the choice for this browser (development only).
  useEffect(() => { setTheme(theme) }, [setTheme, theme])

  const fixture = state === 'loading' || state === 'errors' ? studentHomeFixtures.busyWeek : studentHomeFixtures[state]
  const [joined, setJoined] = useState<{ fixture: StudentHomeFixture; ids: Id<'events'>[] }>({ fixture, ids: [] })
  if (joined.fixture !== fixture) setJoined({ fixture, ids: [] })
  const handlers = useMemo(() => previewHandlers(fixture, eventId => setJoined(previous => ({ ...previous, ids: [...previous.ids, eventId] }))), [fixture])
  const summary = useMemo(() => ({ ...fixture.summary, openSignups: fixture.summary.openSignups.filter(signup => !joined.ids.includes(signup.eventId)) }), [fixture, joined.ids])
  const failure = new Error('Preview failure')
  const props: StudentHomeViewProps = state === 'loading'
    ? { summary: undefined, attendance: undefined, announcements: undefined, finance: undefined, now: fixture.now, handlers }
    : state === 'errors'
      ? { summary: failure, attendance: failure, announcements: failure, finance: { state: 'failed' }, now: fixture.now, handlers }
      : { summary, attendance: fixture.attendance, announcements: fixture.announcements, finance: fixture.finance, now: fixture.now, handlers }
  const link = (next: PreviewState, nextTheme = theme) => `${previewPath}?state=${next}&theme=${nextTheme}`

  // Same frame as main.tsx: the shell, then the public footer.
  return <div className="app-frame">
    <LocationContext.Provider value={shellLocation}><StudentShell userName={fixture.summary.displayName} dark={theme === 'dark'} onToggleTheme={() => setParams({ state, theme: theme === 'dark' ? 'light' : 'dark' })} onSignOut={() => undefined}>
      <StudentHomeView {...props} />
      <nav aria-label="Preview states" className="mt-10 flex flex-wrap gap-2 border-t border-dashed border-vs-border pt-4 text-[12px]">
        {stateNames.map(name => <Link key={name} to={link(name)} aria-current={name === state ? 'page' : undefined} className="inline-flex min-h-11 items-center rounded-full border border-vs-border px-3 text-vs-text! aria-[current=page]:bg-vs-inset-raised">{name}</Link>)}
        <Link to={link(state, theme === 'dark' ? 'light' : 'dark')} className="inline-flex min-h-11 items-center rounded-full border border-vs-border px-3 text-vs-text!">{theme === 'dark' ? 'Light' : 'Dark'}</Link>
      </nav>
    </StudentShell></LocationContext.Provider>
    <PublicFooter />
  </div>
}
