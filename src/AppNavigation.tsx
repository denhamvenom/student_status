import { Link } from 'react-router'
import { useTheme } from 'next-themes'
import { useMutation } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { Moon, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../convex/_generated/api'
import { Button } from './components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from './components/ui/sheet'
import { phoneLabel, uiCopy } from './lib/ui-copy'

type Props = { role: string; path: string; items: [string, string][]; primary: string[]; season: string; userName?: string; more: boolean; toggleMore: () => void; closeMore: () => void }

export function AppHeader({ role, path, items, season, userName }: Props) {
  const { resolvedTheme, setTheme } = useTheme()
  const saveTheme = useMutation(api.app.setTheme)
  const { signOut } = useAuthActions()
  const reference = uiCopy.reference.navigation.desktop
  const groupSource = role === 'coach' ? reference.coachGroups : role === 'travelLead' ? reference.travelLeadGroups : []
  const groups = (groupSource as [string, string[]][]).map(([label, names]) => ({ label, items: items.filter(([name]) => names.includes(name) || label === 'Events' && name === uiCopy.navigation.withdrawals) })).filter(group => group.items.length)
  const current = (to: string) => path === to || to === '/events' && path.startsWith('/events/')
  const activeGroup = groups.find(group => group.items.some(([, to]) => current(to))) ?? groups[0]
  const changeTheme = async () => {
    const theme = resolvedTheme === 'dark' ? 'light' : 'dark'
    try { await saveTheme({ theme }); setTheme(theme) } catch { toast.error(uiCopy.theme.failed) }
  }
  return <header className="site-header">
    <div className="header-inner">
      <Link className="brand" to="/"><img src="/assets/logos/logo-mark-white-text.png" alt=""/><span className="brand-copy"><span className="brand-wordmark">{uiCopy.brand.name}</span><span>{uiCopy.brand.product} · {season}</span></span></Link>
      <div className="header-right"><span className="account-label">{userName}</span><Button variant="outline" className="header-theme" aria-label={resolvedTheme === 'dark' ? uiCopy.theme.light : uiCopy.theme.dark} onClick={() => void changeTheme()}>{resolvedTheme === 'dark' ? <Sun aria-hidden="true"/> : <Moon aria-hidden="true"/>}</Button><Button className="header-signout" variant="outline" onClick={() => void signOut().catch(() => toast.error(uiCopy.errors.signIn))}>Sign out</Button></div>
    </div>
    <nav className="desktop-nav" aria-label="Main navigation"><div className="nav-inner">{groups.length ? groups.map(group => <Link key={group.label} to={group.items[0][1]} className={group === activeGroup ? 'active' : ''}>{group.label}</Link>) : items.map(([label, to]) => <Link key={to} to={to} className={current(to) ? 'active' : ''} aria-current={current(to) ? 'page' : undefined}>{label}</Link>)}</div></nav>
    {activeGroup && <nav className="desktop-subnav" aria-label={activeGroup.label}><div className="nav-inner">{activeGroup.items.map(([label, to]) => <Link key={to} to={to} className={current(to) ? 'active' : ''} aria-current={current(to) ? 'page' : undefined}>{label}</Link>)}</div></nav>}
  </header>
}

export function AppMobileNavigation({ role, path, items, primary, more, toggleMore, closeMore }: Props) {
  const links = primary.flatMap(to => items.filter(item => item[1] === to))
  const icon = (to: string) => to === '/' ? (role === 'coach' || role === 'travelLead' ? 'team' : 'home') : to === '/finances' ? 'money' : to === '/readiness' ? 'readiness' : to === '/events' ? 'events' : to === '/forms' ? 'forms' : to === '/profile' || to === '/myprofile' ? 'profile' : to === '/drivers' ? 'drivers' : 'settings'
  return <Sheet open={more} onOpenChange={open => { if (!open) closeMore(); else if (!more) toggleMore() }}>
    <nav className="mobile-nav" aria-label="Mobile navigation">{links.map(([label, to], index) => <Link key={to} to={to} className={path === to ? 'active' : ''} aria-current={path === to ? 'page' : undefined}><img className="icon" src={`/assets/icons/${icon(to)}.svg`} alt=""/><span>{phoneLabel(role, index, label)}</span></Link>)}<SheetTrigger render={<button aria-label="More navigation"><img className="icon" src="/assets/icons/more.svg" alt=""/><span>{uiCopy.navigation.more}</span></button>}/></nav>
    <SheetContent side="bottom" className="navigation-sheet"><SheetHeader><SheetTitle>{uiCopy.navigation.more}</SheetTitle></SheetHeader><nav aria-label="More navigation">{items.filter(([, to]) => !primary.includes(to)).map(([label, to]) => <Link key={to} to={to} onClick={closeMore}>{label}</Link>)}</nav></SheetContent>
  </Sheet>
}
