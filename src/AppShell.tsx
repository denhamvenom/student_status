import { phoneLabel, uiCopy } from './lib/ui-copy'
import { menu, navigationCopy } from './lib/navigation-copy'
import { useState, type ReactNode } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useMutation } from 'convex/react'
import { Link, useLocation } from 'react-router'
import { useTheme } from 'next-themes'
import { Calendar, SquareCheck, Ellipsis, Moon, Users, DollarSign, FileText, Home, UserRound, Settings, Car } from 'lucide-react'
import { api } from '../convex/_generated/api'
import { Button } from './components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './components/ui/sheet'
import { readinessCopy as copy } from './features/design-review/readinessCopy'
import styles from './features/design-review/ReadinessReview.module.css'
type ShellViewer = { user: { name: string; email: string } | null; season: { name: string } | null }
export { menu }
export const primaryPaths:Record<string,string[]>={student:['/','/events','/finances','/profile'],parent:['/','/events','/forms','/finances'],coach:['/','/events','/readiness','/finances'],travelLead:['/readiness','/events','/','/drivers'],mentor:['/','/myprofile','/settings']}

export function AppShell({ children, viewer, familyContext, role = "coach" }: { children: ReactNode; viewer: ShellViewer; familyContext?: ReactNode; role?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const saveTheme = useMutation(api.app.setTheme)
  const { signOut } = useAuthActions()
  const [more, setMore] = useState(false)
  const { pathname } = useLocation()
  const activePath = pathname.startsWith('/events/') ? '/events' : pathname
  const [chosenGroup, setChosenGroup] = useState<string | null>(null)
  const [previousPath, setPreviousPath] = useState(pathname)
  if (previousPath !== pathname) { setPreviousPath(pathname); setChosenGroup(null); setMore(false) }
  const [themeError, setThemeError] = useState('')
  const [signOutError, setSignOutError] = useState('')
  const exit = async () => { setSignOutError(''); try { await signOut() } catch { setSignOutError(copy.signOutFailed) } }
  const changeTheme = async () => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark'
    setTheme(next); setThemeError('')
    try { await saveTheme({ theme: next }) } catch { setTheme(theme ?? 'system'); setThemeError(copy.themeFailed) }
  }
  const nav = navigationCopy.groups
  const groups: Record<string, [string, string][]> = {
    [nav.team]: [[nav.team, '/'], [nav.joinRequests, '/enroll'], [nav.users, '/adults']],
    [nav.events]: [[nav.events, '/events'], [nav.eventReadiness, '/readiness'], [nav.drivers, '/drivers'], [nav.permissionForms, '/permissions'], [nav.withdrawals, '/withdrawals']],
    [nav.money]: [[nav.money, '/finances'], [nav.fundraising, '/fundraising']],
    [nav.reports]: [[nav.reports, '/reports']],
    [nav.admin]: [[nav.attendance, '/attendance'], [nav.season, '/season'], [nav.settings, '/settings']],
  }
  if (role === 'travelLead') { groups[nav.admin] = groups[nav.admin].filter(([, path]) => path !== '/settings'); groups[uiCopy.navigation.account] = [[navigationCopy.labels.myProfile, '/myprofile'], [nav.settings, '/settings']] }
  const allowed = menu[role] ?? menu.mentor
  const staff = role === 'coach' || role === 'travelLead'
  const allowedPaths = new Set(allowed.map(([, path]) => path))
  const filteredGroups = Object.fromEntries(Object.entries(groups).map(([label, links]) => [label, links.filter(([, path]) => allowedPaths.has(path))]).filter(([, links]) => links.length)) as Record<string, [string, string][]>
  const groupedPaths = new Set(Object.values(filteredGroups).flat().map(([, path]) => path))
  const extra = allowed.filter(([, path]) => !groupedPaths.has(path))
  if (extra.length) filteredGroups[role==='travelLead'?uiCopy.navigation.account:nav.admin] = [...(filteredGroups[role==='travelLead'?uiCopy.navigation.account:nav.admin] ?? []), ...extra]
  const group = chosenGroup && filteredGroups[chosenGroup] ? chosenGroup : Object.keys(filteredGroups).find(label => filteredGroups[label].some(([, path]) => path === activePath)) ?? Object.keys(filteredGroups)[0]
  const primary = primaryPaths[role] ?? primaryPaths.mentor
  const additionalLinks = allowed.filter(([, path]) => !primary.includes(path))
  const roleLabel = role === 'travelLead' ? navigationCopy.travelLeadRole : role[0].toUpperCase() + role.slice(1)
  const icon = (path: string) => path === '/events' ? <Calendar size={21}/> : path === '/finances' ? <DollarSign size={21}/> : path === '/readiness' ? <SquareCheck size={21}/> : path === '/' ? (staff ? <Users size={21}/> : <Home size={21}/>) : path === '/profile' || path === '/myprofile' ? <UserRound size={21}/> : path === '/settings' ? <Settings size={21}/> : path === '/drivers' ? <Car size={21}/> : <FileText size={21}/>
  return <div className={styles.review}>
    <header className={styles.header}>
      <div className={styles.headerInner}><Link to="/" aria-label={copy.brand} className={styles.brand}><img src="/assets/logos/logo-mark-white-text.png" alt="" /><span className={styles.brandCopy}><span className={styles.wordmark}>{copy.brand}</span><span className={styles.product}>{copy.product} · {viewer.season?.name ?? copy.seasonFallback}</span></span></Link><div className={styles.headerActions}><span className={styles.viewerName}><strong>{viewer.user?.name}</strong><small>{roleLabel} · {viewer.user?.email}</small></span><Button type="button" variant="outline" role="switch" aria-checked={resolvedTheme === 'dark'} className={styles.headerButton} onClick={() => void changeTheme()} aria-label={copy.themeLabel(resolvedTheme === 'dark')}><Moon size={18} aria-hidden="true"/><span className={styles.themeTrack}><span className={styles.themeKnob}/></span></Button><Button type="button" variant="outline" className={`${styles.headerButton} ${styles.signOut}`} onClick={() => void exit()}>{nav.signOut}</Button></div></div>
      {themeError && <p role="alert" className={styles.themeError}>{themeError}</p>}
      {signOutError && <p role="alert" className={styles.themeError}>{signOutError}</p>}
      {staff ? <><nav className={styles.groupNav} aria-label={navigationCopy.main}><div className={styles.navInner}>{Object.keys(filteredGroups).map(label => <button key={label} type="button" aria-expanded={group === label} className={group === label ? styles.activeGroup : ''} onClick={() => setChosenGroup(label)}>{label}</button>)}</div></nav>
      <nav className={styles.subNav} aria-label={`${group} ${navigationCopy.subSuffix}`}><div className={styles.navInner}>{filteredGroups[group]?.map(([label, path]) => <Link key={path} to={path} aria-current={path === activePath ? 'page' : undefined}>{label}</Link>)}</div></nav></> : <nav className={styles.groupNav} aria-label={navigationCopy.main}><div className={styles.navInner}>{allowed.map(([label, path]) => <Link key={path} to={path} aria-current={path === activePath ? 'page' : undefined}>{label}</Link>)}</div></nav>}

      {familyContext && <div className={styles.familyContext}>{familyContext}</div>}
    </header>
    {import.meta.env.DEV && <div className={styles.development} role="status">{copy.development}</div>}
    <main className={`${styles.main} app-content`}>{children}</main>
    <Sheet open={more} onOpenChange={setMore}>
      <nav className={styles.mobileNav} style={{gridTemplateColumns:`repeat(${primary.length+1},minmax(0,1fr))`}} aria-label={navigationCopy.mobile}>{primary.map((path, index) => { const item = allowed.find(([, to]) => to === path); return item && <Link key={path} to={path} aria-current={path === activePath ? 'page' : undefined}><span aria-hidden="true">{icon(path)}</span>{phoneLabel(role,index,item[0])}</Link> })}<SheetTrigger><Ellipsis size={21} aria-hidden="true"/>{nav.more}</SheetTrigger></nav>
      <SheetContent side="bottom" className={styles.moreSheet}><SheetHeader><SheetTitle>{nav.more}</SheetTitle></SheetHeader><nav aria-label={navigationCopy.more}>{additionalLinks.map(([label, path]) => <Link key={path} to={path} onClick={() => setMore(false)}>{label}</Link>)}<button type="button" onClick={() => void exit()}>{nav.signOut}</button></nav></SheetContent>
    </Sheet>
  </div>
}
