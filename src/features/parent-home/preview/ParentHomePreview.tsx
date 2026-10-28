import { useEffect, useLayoutEffect, useMemo } from 'react'
import { Link, UNSAFE_LocationContext as LocationContext, useLocation, useNavigationType, useSearchParams } from 'react-router'
import { useTheme } from 'next-themes'
import { StudentShell } from '@/components/student-shell/StudentShell'
import { PublicFooter } from '@/PublicFooter'
import { parentHomeFixtures } from '../fixtures'
import { ParentHomeView, type ParentHomeViewProps } from '../ParentHomeView'

type State = keyof typeof parentHomeFixtures | 'errors'
const states: State[] = ['urgent', 'allDone', 'noFees', 'errors']

export default function ParentHomePreview() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('state')
  const state: State = states.includes(requested as State) ? requested as State : 'urgent'
  const theme = params.get('theme') === 'light' ? 'light' : 'dark'
  const { setTheme } = useTheme()
  const location = useLocation()
  const navigationType = useNavigationType()
  const shellLocation = useMemo(() => ({ location: { ...location, pathname: '/' }, navigationType }), [location, navigationType])
  useLayoutEffect(() => { document.documentElement.dataset.design = 'student'; return () => { delete document.documentElement.dataset.design } }, [])
  useEffect(() => { setTheme(theme) }, [setTheme, theme])
  const fixture = state === 'errors' ? parentHomeFixtures.urgent : parentHomeFixtures[state]
  const failure = new Error('Preview failure')
  const props: ParentHomeViewProps = { studentName: 'Dev Student', now: fixture.now, summary: state === 'errors' ? failure : fixture.summary, announcements: state === 'errors' ? failure : fixture.announcements, finance: state === 'errors' ? failure : fixture.finance, retry: source => console.info(`Parent Home preview: Try again re-subscribes ${source}`) }
  const link = (next: State, nextTheme = theme) => `/__parent-home-preview?state=${next}&theme=${nextTheme}`
  return <div className="app-frame"><LocationContext.Provider value={shellLocation}><StudentShell userName="Dev Parent" dark={theme === 'dark'} onToggleTheme={() => setParams({ state, theme: theme === 'dark' ? 'light' : 'dark' })} onSignOut={() => undefined} familyContext={<div className="student-switch" role="group" aria-label="Choose student"><button className="selected" aria-pressed="true">Dev Student</button></div>}><ParentHomeView {...props} /><nav aria-label="Preview states" className="mt-10 flex flex-wrap gap-2 border-t border-dashed border-vs-border pt-4 text-[12px]">{states.map(name => <Link key={name} to={link(name)} aria-current={name === state ? 'page' : undefined} className="inline-flex min-h-11 items-center rounded-full border border-vs-border px-3 text-vs-text! aria-[current=page]:bg-vs-inset-raised">{name}</Link>)}<Link to={link(state, theme === 'dark' ? 'light' : 'dark')} className="inline-flex min-h-11 items-center rounded-full border border-vs-border px-3 text-vs-text!">{theme === 'dark' ? 'Light' : 'Dark'}</Link></nav></StudentShell></LocationContext.Provider><PublicFooter /></div>
}
