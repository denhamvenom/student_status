import { useState, type ReactNode } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isIOS } from './install'
import { useInstallPrompt } from './useInstallPrompt'

const dismissedKey = 'venom.iosInstallWalkthrough.dismissed'
const readDismissed = () => { try { return window.localStorage.getItem(dismissedKey) === '1' } catch { return false } }
const card = 'rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] p-4 text-[var(--text-body)]'

/** Install button for browsers with an install prompt (desktop and Android Chromium). Renders nothing otherwise. */
export function InstallAppButton({ className }: { className?: string }) {
  const { canInstall, installed, install } = useInstallPrompt()
  if (!canInstall || installed) return null
  return <Button type="button" className={className} onClick={() => void install()}><Download aria-hidden="true"/>Install app</Button>
}

function Step({ number, illustration, children }: { number: number; illustration: ReactNode; children: ReactNode }) {
  return <li className="flex items-center gap-3">
    <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-xl bg-[var(--surface-metal)] text-[#007aff]">{illustration}</span>
    <span className="text-sm"><span className="sr-only">Step {number}: </span>{children}</span>
  </li>
}

/** Add to Home Screen steps for iPhone and iPad, which have no install prompt. Dismissal is remembered on this device. */
export function IosInstallWalkthrough({ onDismiss }: { onDismiss?: () => void }) {
  const { installed } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(readDismissed)
  if (installed || dismissed || !isIOS()) return null
  const dismiss = () => { try { window.localStorage.setItem(dismissedKey, '1') } catch { /* private mode: dismiss for this visit only */ } setDismissed(true); onDismiss?.() }
  return <section className={card} aria-labelledby="ios-install-title">
    <div className="flex items-start justify-between gap-2">
      <div><h2 id="ios-install-title" className="m-0 text-xl">Add Venom Status to your Home Screen</h2><p className="m-0 mt-1 text-sm text-[var(--text-muted)]">Open it like an app, full screen, with notifications.</p></div>
      <Button type="button" variant="ghost" size="icon" aria-label="Dismiss" onClick={dismiss}><X aria-hidden="true"/></Button>
    </div>
    <ol className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
      <Step number={1} illustration={<Share size={24}/>}>Tap the <strong>Share</strong> button in Safari's toolbar.</Step>
      <Step number={2} illustration={<SquarePlus size={24}/>}>Scroll down and tap <strong>Add to Home Screen</strong>.</Step>
      <Step number={3} illustration={<span className="text-[15px] font-bold">Add</span>}>Tap <strong>Add</strong> in the top corner.</Step>
    </ol>
  </section>
}

/** Picks the right install help for this device; renders nothing when installed or when the browser offers no install path. */
export function InstallCard() {
  const { canInstall, installed } = useInstallPrompt()
  if (installed) return null
  if (isIOS()) return <IosInstallWalkthrough/>
  if (!canInstall) return null
  return <section className={card} aria-labelledby="install-app-title">
    <h2 id="install-app-title" className="m-0 text-xl">Install Venom Status</h2>
    <p className="m-0 mt-1 mb-3 text-sm text-[var(--text-muted)]">Open it from your home screen or taskbar in its own window.</p>
    <InstallAppButton/>
  </section>
}
