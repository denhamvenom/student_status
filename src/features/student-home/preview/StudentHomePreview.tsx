import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useTheme } from 'next-themes'
import type { Id } from '../../../../convex/_generated/dataModel'
import type { SignupAvailability } from '../contract'
import { studentHomeFixtures, type StudentHomeFixture } from '../fixtures'
import { StudentHomeView } from '../StudentHomeView'
import type { Loadable, SignUpResult, StudentHomeHandlers, StudentHomeViewProps } from '../types'

/*
 * Development-only preview of Student Home with synthetic fixtures (main.tsx loads this only when
 * import.meta.env.DEV). /__student-home-preview?state=busyWeek&theme=dark
 * States: the fixtures plus "loading" and "errors". No backend, no sign-in, nothing is saved.
 * The frame below is a stand-in for the Student shell, which is built separately.
 */

const extraStates = ['loading', 'errors'] as const
type PreviewState = keyof typeof studentHomeFixtures | typeof extraStates[number]
const stateNames = [...Object.keys(studentHomeFixtures), ...extraStates] as PreviewState[]
const isState = (value: string | null): value is PreviewState => stateNames.some(name => name === value)

const signUpResult: Record<SignupAvailability['outcome'], SignUpResult> = { signedUp: 'confirmed', waitlisted: 'waitlist', waitingForApproval: 'pending', closed: 'pending' }

function previewHandlers(fixture: StudentHomeFixture): StudentHomeHandlers {
  return {
    signUp: eventId => new Promise((resolve, reject) => window.setTimeout(() => {
      if (fixture.failingSignups?.includes(eventId)) reject(new Error('This event is full right now. Ask a Coach or Travel Lead if you still need to go.'))
      else resolve(signUpResult[fixture.availability[eventId]?.outcome ?? 'signedUp'])
    }, 700)),
    useAvailability: function usePreviewAvailability(eventId: Id<'events'>): Loadable<SignupAvailability> {
      const [loaded, setLoaded] = useState<string | null>(null)
      useEffect(() => { const timer = window.setTimeout(() => setLoaded(eventId), 400); return () => window.clearTimeout(timer) }, [eventId])
      if (loaded !== eventId) return undefined
      return fixture.availability[eventId] ?? new Error('No preview availability for this event.')
    },
    retry: () => undefined,
  }
}

export default function StudentHomePreview() {
  const [params] = useSearchParams()
  const requested = params.get('state')
  const state: PreviewState = isState(requested) ? requested : 'busyWeek'
  const theme = params.get('theme') === 'light' ? 'light' : 'dark'
  const { setTheme } = useTheme()

  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.design = 'student'
    return () => { delete root.dataset.design }
  }, [])
  // next-themes owns the html class; this also saves the choice for this browser (development only).
  useEffect(() => { setTheme(theme) }, [setTheme, theme])

  const fixture = state === 'loading' || state === 'errors' ? studentHomeFixtures.busyWeek : studentHomeFixtures[state]
  const handlers = useMemo(() => previewHandlers(fixture), [fixture])
  const failure = new Error('Preview failure')
  const props: StudentHomeViewProps = state === 'loading'
    ? { summary: undefined, attendance: undefined, announcements: undefined, finance: undefined, now: fixture.now, handlers }
    : state === 'errors'
      ? { summary: failure, attendance: failure, announcements: failure, finance: { state: 'failed' }, now: fixture.now, handlers }
      : { summary: fixture.summary, attendance: fixture.attendance, announcements: fixture.announcements, finance: fixture.finance, now: fixture.now, handlers }

  return <div className="relative min-h-screen bg-vs-page text-vs-text">
    {/* Shell stand-ins with the artboards' sizes: 56px phone header, 220px desktop sidebar. */}
    <div aria-hidden="true" className="sticky top-0 z-10 flex h-14 items-center bg-vs-header px-4 lg:hidden"><span className="font-heading text-[15px] tracking-[0.15em] text-vs-gold uppercase">Venom Status</span></div>
    <div aria-hidden="true" className="absolute inset-y-0 left-0 hidden w-[220px] bg-vs-sidebar lg:block"><span className="block px-[30px] pt-[22px] font-heading text-[13px] tracking-[0.14em] text-vs-gold uppercase">Venom<br />Status</span></div>
    <main className="px-[14px] pt-3 pb-10 lg:pt-6 lg:pr-7 lg:pb-8 lg:pl-[248px]">
      <StudentHomeView {...props} />
      <nav aria-label="Preview states" className="mt-10 flex flex-wrap gap-2 border-t border-vs-border pt-4 text-[12px]">
        {stateNames.map(name => <Link key={name} to={`?state=${name}&theme=${theme}`} aria-current={name === state ? 'page' : undefined} className="rounded-full border border-vs-border px-3 py-2 text-vs-text! aria-[current=page]:bg-vs-inset-raised">{name}</Link>)}
        <Link to={`?state=${state}&theme=${theme === 'dark' ? 'light' : 'dark'}`} className="rounded-full border border-vs-border px-3 py-2 text-vs-text!">{theme === 'dark' ? 'Light' : 'Dark'}</Link>
      </nav>
    </main>
  </div>
}
