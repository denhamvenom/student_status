import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router'
import { ArrowLeftRight, Calendar, CalendarCheck, DollarSign, Ellipsis, House, LogOut, Moon, Settings, UserRound, Users, type LucideIcon } from 'lucide-react'
import { RoleSwitchButton, RoleSwitchContext } from '@/RoleChoice'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { observeStickyHeader } from '@/lib/sticky-header'
import { initials, studentBarPaths, studentNavItems, studentNavPath, studentShellCopy as copy } from './student-nav'
import styles from './StudentShell.module.css'
import './student-pages.css'

const icons: Record<string, LucideIcon> = { '/': House, '/events': Calendar, '/finances': DollarSign, '/attendance': CalendarCheck, '/profile': UserRound, '/parents': Users, '/settings': Settings }
const logo = '/assets/logos/logo-mark-white-text.png' // Same file as the design's logos/logo-mark-gold.png: gold mark, transparent.

export type StudentShellProps = {
  children: ReactNode
  userName?: string | null
  familyContext?: ReactNode
  dark: boolean
  onToggleTheme: () => void
  onSignOut: () => void
  themeError?: string
  signOutError?: string
}

/** Student navigation in the Student Home design: dark sidebar from 1024px, purple header and bottom bar below. */
export function StudentShell({ children, userName, familyContext, dark, onToggleTheme, onSignOut, themeError, signOutError }: StudentShellProps) {
  const shellRef = useRef<HTMLDivElement>(null), headerRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => { if (shellRef.current && headerRef.current) return observeStickyHeader(headerRef.current, shellRef.current) }, [])
  const { pathname } = useLocation()
  const [more, setMore] = useState(false)
  const openRoleChoice = useContext(RoleSwitchContext)
  const [previousPath, setPreviousPath] = useState(pathname)
  if (previousPath !== pathname) { setPreviousPath(pathname); setMore(false) }
  const active = studentNavPath(pathname)
  const moreItems = studentNavItems.filter(item => !studentBarPaths.includes(item.path))
  const moreActive = moreItems.some(item => item.path === active)
  const letters = initials(userName)
  const avatar = <span className={styles.avatar} aria-hidden="true">{letters || <UserRound size={18}/>}</span>
  const errors = [themeError, signOutError].filter(Boolean)
  const themeSwitch = (className: string) => <button type="button" role="switch" aria-checked={dark} className={className} onClick={onToggleTheme}><Moon aria-hidden="true"/><span>{copy.darkMode}</span><span className={styles.track} aria-hidden="true"><span className={styles.knob}/></span></button>
  const icon = (path: string) => { const Icon = icons[path] ?? UserRound; return <Icon aria-hidden="true" strokeWidth={path === active ? 2.2 : 2}/> }

  return <div ref={shellRef} className={styles.shell}>
    <aside className={styles.sidebar}>
      <div className={styles.sidebarInner}>
        <div className={styles.sidebarBrand}><Link to="/" className={styles.brand}><img src={logo} alt="" className={styles.sidebarLogo}/><span className={styles.sidebarWords}>{copy.product}</span></Link></div>
        <nav className={styles.sidebarNav} aria-label={copy.main}>
          {studentNavItems.map(item => <Link key={item.path} to={item.path} className={styles.sideLink} aria-current={item.path === active ? 'page' : undefined}>{icon(item.path)}<span>{item.label}</span></Link>)}
        </nav>
        <section className={styles.account} aria-label={copy.account}>
          <div className={styles.accountRow}>{avatar}<div className={styles.accountText}><p className={styles.accountName}>{userName}</p><p className={styles.accountTeam}>{copy.team}</p></div></div>
          {themeSwitch(styles.sideControl)}
          <RoleSwitchButton className={styles.sideControl}/>
          <button type="button" className={styles.sideControl} onClick={onSignOut}><LogOut aria-hidden="true"/><span>{copy.signOut}</span></button>
          {errors.map(error => <p key={error} role="alert" className={styles.sideError}>{error}</p>)}
        </section>
      </div>
    </aside>

    <header ref={headerRef} className={styles.header}>
      <Link to="/" className={`${styles.brand} ${styles.headerBrand}`}><img src={logo} alt="" className={styles.headerLogo}/><span className={styles.headerWords}>{copy.product}</span></Link>
      <Link to="/profile" className={styles.headerAvatar} aria-label={copy.profile} aria-current={active === '/profile' ? 'page' : undefined}>{avatar}</Link>
    </header>

    <div className={styles.column}>
      {import.meta.env.DEV && <p className={styles.development} role="status">{copy.development}</p>}
      {errors.map(error => <p key={error} role="alert" className={styles.phoneError}>{error}</p>)}
      <div className={styles.familyContext}>{familyContext}</div>
      <main className={`${styles.main} app-content`}>{children}</main>
    </div>

    <Sheet open={more} onOpenChange={setMore}>
      <nav className={styles.bar} aria-label={copy.mobile}>
        {studentBarPaths.map(path => { const item = studentNavItems.find(entry => entry.path === path); return item && <Link key={path} to={path} className={styles.barItem} aria-current={path === active ? 'page' : undefined}>{icon(path)}<span>{item.label}</span></Link> })}
        <SheetTrigger className={styles.barItem} data-active={moreActive || undefined}><Ellipsis aria-hidden="true"/><span>{copy.more}</span></SheetTrigger>
      </nav>
      <SheetContent side="bottom" className={styles.sheet}>
        <SheetHeader className={styles.sheetHeader}><SheetTitle className={styles.sheetTitle}>{copy.more}</SheetTitle></SheetHeader>
        <nav className={styles.sheetNav} aria-label={copy.moreNavigation}>
          {moreItems.map(item => <Link key={item.path} to={item.path} className={styles.sheetLink} aria-current={item.path === active ? 'page' : undefined} onClick={() => setMore(false)}>{icon(item.path)}<span>{item.label}</span></Link>)}
        </nav>
        <div className={styles.sheetActions}>
          {themeSwitch(styles.sheetControl)}
          {openRoleChoice && <button type="button" className={styles.sheetControl} onClick={() => { setMore(false); openRoleChoice() }}><ArrowLeftRight aria-hidden="true"/><span>{copy.switchRole}</span></button>}
          <button type="button" className={styles.sheetControl} onClick={() => { setMore(false); onSignOut() }}><LogOut aria-hidden="true"/><span>{copy.signOut}</span></button>
          {themeError && <p role="alert" className={styles.sheetError}>{themeError}</p>}
        </div>
      </SheetContent>
    </Sheet>
  </div>
}
