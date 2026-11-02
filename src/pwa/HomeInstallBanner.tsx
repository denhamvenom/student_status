import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { Link } from 'react-router'
import { useQuery } from 'convex/react'
import { Bell, CircleCheck, Download, EllipsisVertical, House, Plus, Share, SquarePlus, X } from 'lucide-react'
import { api } from '../../convex/_generated/api'
import { DashboardTile } from '@/components/dashboard/DashboardTile'
import { dashboardButtonVariants, focusRing } from '@/components/dashboard/styles'
import { notificationsCopy } from '@/copy/notifications-copy'
import { thisDeviceState } from '@/notifications/deviceStatus'
import { usePushDevice } from '@/notifications/usePushDevice'
import { isIOS, isStandalone, type InstallOutcome } from './install'
import { chooseHomeBanner, installTapAction, isIOSSafari, isMobileDevice, opensStepsAfterPrompt, type HomeBannerInput } from './installBanner'
import { useInstallPrompt } from './useInstallPrompt'

const copy = notificationsCopy.homeBanner
const installHiddenKey = 'venom.homeInstallBanner.dismissedAt'
const notificationsHiddenKey = 'venom.homeNotificationsCard.dismissed'

const readStorage = (key: string) => { try { return window.localStorage.getItem(key) } catch { return null } }
// Private mode can refuse storage; the banner then hides for this visit only.
const writeStorage = (key: string, value: string) => { try { window.localStorage.setItem(key, value) } catch { /* this visit only */ } }
const readInstallHiddenAt = () => { const value = Number(readStorage(installHiddenKey)); return Number.isFinite(value) && value > 0 ? value : null }

const deviceEnv = () => ({ userAgent: navigator.userAgent, platform: navigator.platform, maxTouchPoints: navigator.maxTouchPoints, matchMedia: (query: string) => window.matchMedia(query) })
const isHomeRole = (role: string) => role === 'student' || role === 'parent'

// Matches the Home views' width on tablets so the banner lines up with the tiles below it.
const tile = 'mb-3 gap-3 md:mx-auto md:w-full md:max-w-[720px] lg:mx-0 lg:max-w-none'
const iconBadge = 'grid size-10 shrink-0 place-items-center rounded-full bg-vs-inset-raised text-vs-accent-text'
const primaryButton = dashboardButtonVariants({ tone: 'primary', size: 'lg', className: 'w-full sm:w-auto sm:self-start' })
// Collapsing the steps is a quiet text link so it is not mistaken for Close; the 44px target reaches into the tile padding.
const quietLink = `-mt-1 -mb-2 min-h-11 self-start cursor-pointer border-0! bg-transparent! p-0! text-[14px]! font-semibold! text-vs-accent-text! underline! underline-offset-2 ${focusRing}`

function CloseButton({ onClick }: { onClick: () => void }) {
  return <button type="button" aria-label={copy.close} onClick={onClick} className={`-mt-2 -mr-2 grid size-11 shrink-0 cursor-pointer place-items-center rounded-full border-0! bg-transparent! p-0! text-vs-heading! hover:bg-vs-inset! ${focusRing}`}><X size={22} strokeWidth={2.5} aria-hidden="true"/></button>
}

/** Current time, refreshed whenever this tab comes back into view, so a Home tab left open shows the banner again once the 14 days pass. */
function useNowWhenShown() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const refresh = () => { if (document.visibilityState !== 'hidden') setNow(Date.now()) }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    return () => { document.removeEventListener('visibilitychange', refresh); window.removeEventListener('focus', refresh) }
  }, [])
  return now
}

const iosStepIcons: ReactNode[] = [<Share size={16}/>, <SquarePlus size={16}/>, <Plus size={16}/>, <House size={16}/>]
const menuStepIcons: ReactNode[] = [<EllipsisVertical size={16}/>, <Download size={16}/>]

/** Compact steps: one column, a small icon beside each line, so the open card stays short on a phone. */
function Steps({ steps, icons, ref }: { steps: readonly string[]; icons: ReactNode[]; ref: RefObject<HTMLDivElement | null> }) {
  return <div ref={ref} tabIndex={-1} role="group" aria-label={copy.stepsLabel} className="rounded-md outline-offset-2">
    <ol className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px] leading-snug text-vs-text">
      {steps.map((step, index) => <li key={step} className="flex items-start gap-2">
        <span aria-hidden="true" className="mt-px grid size-5 shrink-0 place-items-center text-vs-accent-text">{icons[index]}</span>
        <span><span className="sr-only">{copy.step(index + 1)}</span>{step}</span>
      </li>)}
    </ol>
  </div>
}

/**
 * Top of Student and Parent Home on phones and tablets: helps put the app on the home screen, then (inside the installed app)
 * points once to turning on notifications. Nothing on desktop, for staff, or after it is hidden.
 */
export function HomeInstallBanner({ role }: { role: string }) {
  const env = deviceEnv()
  if (!isHomeRole(role) || !isMobileDevice(env)) return null
  return isStandalone() ? <NotificationsCard role={role}/> : <InstallBanner role={role} ios={isIOS(env)} safari={isIOSSafari(env)}/>
}

const base = { isMobile: true, ios: false, safari: false, hasPrompt: false, installed: false, installOutcome: null, dismissedAt: null, notificationsDismissed: false, pushState: 'checking' } satisfies Partial<HomeBannerInput>

function InstallBanner({ role, ios, safari }: { role: string; ios: boolean; safari: boolean }) {
  const { canInstall, installed, install } = useInstallPrompt()
  const now = useNowWhenShown()
  const [hiddenAt, setHiddenAt] = useState(readInstallHiddenAt)
  // Close hides the banner at once. The 14-day check alone cannot: `now` is from when the tab was last shown, so a hide time
  // stamped after it reads as "in the future" and the banner would stay until reload.
  const [closed, setClosed] = useState(false)
  const [outcome, setOutcome] = useState<InstallOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(false)
  const stepsRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const moveFocus = useRef(false)
  // Opening moves focus to the steps (the button that opened them goes away); hiding brings it back to the button.
  useEffect(() => {
    if (!moveFocus.current) return
    moveFocus.current = false
    const target = open ? stepsRef.current : buttonRef.current
    target?.focus()
  }, [open])
  // `installed` here is only the appinstalled event; this tab is not the installed app.
  const view = chooseHomeBanner({ ...base, role, standalone: false, ios, safari, hasPrompt: canInstall, installed, installOutcome: outcome, dismissedAt: hiddenAt, now })
  if (closed || view === 'none' || view === 'turnOnNotifications') return null

  const hide = () => { const at = Date.now(); writeStorage(installHiddenKey, String(at)); setHiddenAt(at); setOpen(false); setClosed(true) }
  const setSteps = (value: boolean) => { moveFocus.current = true; setOpen(value) }
  const runPrompt = async () => {
    setBusy(true)
    let result: InstallOutcome = 'unavailable'
    // install() resolves 'unavailable' on error or after its timeout, so the button never stays on Installing….
    try { result = await install() } catch { /* the prompt failed: same as no prompt */ } finally { setBusy(false) }
    setOutcome(result)
    // A closed, failed, timed-out or missing prompt still leaves the browser menu steps on screen.
    if (opensStepsAfterPrompt(result)) setSteps(true)
  }
  const tap = installTapAction(view)
  // Only a captured prompt is ever shown; without one the tap opens the steps.
  const onTap = () => { if (tap === 'prompt' && canInstall) void runPrompt(); else setSteps(true) }
  // With a prompt the button keeps working while the steps are open; otherwise the steps replace it.
  const showButton = tap === 'prompt' || (tap === 'showSteps' && !open)
  const steps = view === 'installIos' ? copy.iosSteps : copy.menuSteps

  return <DashboardTile surface="compact" tone="quiet" aria-label={copy.label} className={tile}>
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className={iconBadge}>{view === 'installed' ? <CircleCheck size={22}/> : <Download size={20}/>}</span>
      {view === 'installed'
        ? <p role="status" className="m-0 min-w-0 flex-1 self-center text-[15px] leading-snug font-bold text-vs-heading">{copy.installed}</p>
        : <div className="min-w-0 flex-1 self-center"><p className="m-0 text-[15px] leading-snug font-bold text-vs-heading">{copy.title}</p><p className="m-0 mt-0.5 text-[14px] leading-snug text-vs-muted">{copy.why}</p></div>}
      <CloseButton onClick={hide}/>
    </div>
    {showButton && <button ref={buttonRef} type="button" className={primaryButton} disabled={busy} onClick={onTap}>
      {view !== 'installIos' && <Download size={18} aria-hidden="true"/>}
      {busy ? copy.installing : view === 'installIos' ? copy.showMe : copy.install}
    </button>}
    {open && tap !== 'none' && <>
      <Steps ref={stepsRef} steps={steps} icons={view === 'installIos' ? iosStepIcons : menuStepIcons}/>
      <button type="button" className={quietLink} onClick={() => setSteps(false)}>{copy.hideSteps}</button>
    </>}
    {view === 'openInSafari' && <p className="m-0 text-[14px]">{copy.openInSafari}</p>}
  </DashboardTile>
}

function NotificationsCard({ role }: { role: string }) {
  const publicKey = useQuery(api.push.getVapidPublicKey)
  const device = usePushDevice()
  const [now] = useState(Date.now)
  const [hidden, setHidden] = useState(() => readStorage(notificationsHiddenKey) === '1')
  const pushState = thisDeviceState({ publicKey, device, needsHomeScreen: false })
  // Once notifications are on for this device the card is done for good, even if they are turned off later.
  useEffect(() => { if (pushState === 'on') writeStorage(notificationsHiddenKey, '1') }, [pushState])
  if (chooseHomeBanner({ ...base, role, standalone: true, notificationsDismissed: hidden, pushState, now }) !== 'turnOnNotifications') return null
  const hide = () => { writeStorage(notificationsHiddenKey, '1'); setHidden(true) } // notificationsDismissed hides it at once
  // Settings asks for permission only when the button there is tapped. Going there does not hide this card: only Close,
  // or notifications actually turning on, does.
  return <DashboardTile surface="compact" tone="quiet" aria-label={copy.notifications.label} className={tile}>
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className={iconBadge}><Bell size={20}/></span>
      <div className="min-w-0 flex-1 self-center"><p className="m-0 text-[15px] leading-snug font-bold text-vs-heading">{copy.notifications.title}</p><p className="m-0 mt-0.5 text-[14px] text-vs-muted">{copy.notifications.description}</p></div>
      <CloseButton onClick={hide}/>
    </div>
    <Link to="/settings" className={primaryButton}><Bell size={18} aria-hidden="true"/>{copy.notifications.action}</Link>
  </DashboardTile>
}
