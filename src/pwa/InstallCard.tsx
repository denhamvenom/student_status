import { useState, type ReactNode } from 'react'
import { CircleCheck, Download, House, Share, SquarePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notificationsCopy } from '@/copy/notifications-copy'
import { chooseInstallView, isIOS, manualInstallKind, type InstallOutcome } from './install'
import { useInstallPrompt } from './useInstallPrompt'

const copy = notificationsCopy.install
const dismissedKey = 'venom.iosInstallWalkthrough.dismissed'
const readDismissed = () => { try { return window.localStorage.getItem(dismissedKey) === '1' } catch { return false } }
const card = 'rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)] p-4 text-[var(--text-body)]'

/** Runs the browser install prompt and reports how it ended ('unavailable' when this browser has no prompt right now). */
function useInstallAction(onResult?: (outcome: InstallOutcome) => void) {
  const { install } = useInstallPrompt()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try { onResult?.(await install()) } catch { onResult?.('unavailable') } finally { setBusy(false) }
  }
  return { busy, run }
}

/** Install button for browsers with an install prompt (desktop and Android Chromium). Renders nothing otherwise. */
export function InstallAppButton({ className, onResult }: { className?: string; onResult?: (outcome: InstallOutcome) => void }) {
  const { canInstall, installed } = useInstallPrompt()
  const { busy, run } = useInstallAction(onResult)
  if ((!canInstall && !busy) || installed) return null
  return <Button type="button" className={className} disabled={busy} onClick={() => void run()}><Download aria-hidden="true"/>{busy ? copy.installing : copy.button}</Button>
}

function Step({ number, illustration, children }: { number: number; illustration: ReactNode; children: ReactNode }) {
  return <li className="flex items-center gap-4">
    <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-xl bg-[var(--surface-metal)] text-[#007aff]">{illustration}</span>
    <span className="text-base font-bold"><span className="sr-only">{copy.ios.step(number)}</span>{children}</span>
  </li>
}

const iosIllustrations: ReactNode[] = [<Share size={32}/>, <SquarePlus size={32}/>, <span className="text-lg font-bold">Add</span>, <House size={32}/>]

/** Add to Home Screen steps for iPhone and iPad, which have no install prompt. With `dismissible`, hiding it is remembered on this device. */
export function IosInstallWalkthrough({ onDismiss, dismissible = true }: { onDismiss?: () => void; dismissible?: boolean }) {
  const { installed } = useInstallPrompt()
  const [dismissed, setDismissed] = useState(readDismissed)
  if (installed || (dismissible && dismissed) || !isIOS()) return null
  const dismiss = () => { try { window.localStorage.setItem(dismissedKey, '1') } catch { /* private mode: dismiss for this visit only */ } setDismissed(true); onDismiss?.() }
  return <section className={card} aria-labelledby="ios-install-title">
    <div className="flex items-start justify-between gap-2">
      <div><h2 id="ios-install-title" className="m-0 text-xl">{copy.ios.title}</h2><p className="m-0 mt-1 text-sm text-[var(--text-muted)]">{copy.ios.description}</p></div>
      {dismissible && <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={copy.ios.dismiss} onClick={dismiss}><X aria-hidden="true"/></Button>}
    </div>
    <ol className="m-0 mt-4 flex list-none flex-col gap-3 p-0">
      {copy.ios.steps.map((step, index) => <Step key={step} number={index + 1} illustration={iosIllustrations[index]}>{step}</Step>)}
    </ol>
  </section>
}

/** Picks the right install help for this device and keeps a message on screen after the install prompt closes. Nothing when installed. */
export function InstallCard() {
  const { canInstall, installed } = useInstallPrompt()
  const [outcome, setOutcome] = useState<InstallOutcome | null>(null)
  const view = chooseInstallView({ device: navigator, installed, canInstall, outcome })
  if (view === 'none') return null
  // Settings is where people come back to find these steps, so they cannot be hidden here.
  if (view === 'ios') return <IosInstallWalkthrough dismissible={false}/>
  if (view === 'accepted') return <section className={card} aria-labelledby="install-app-title">
    <h2 id="install-app-title" className="m-0 text-xl">{copy.title}</h2>
    <p role="status" className="m-0 mt-2 flex items-center gap-2 font-bold"><CircleCheck size={22} aria-hidden="true" className="shrink-0 text-[var(--accent-text)]"/>{copy.accepted}</p>
  </section>
  return <section className={card} aria-labelledby="install-app-title">
    <h2 id="install-app-title" className="m-0 text-xl">{view === 'manual' ? copy.manualTitle : copy.title}</h2>
    <p className="m-0 mt-1 mb-3 text-sm text-[var(--text-muted)]">{copy.description}</p>
    {view === 'manual'
      ? <div role="status" className="flex flex-col gap-1"><p className="m-0">{copy.manual[manualInstallKind()]}</p><p className="muted m-0 text-sm">{copy.alreadyInstalled}</p></div>
      : <>
        <InstallButton onResult={setOutcome}/>
        {view === 'dismissed' && <p role="status" className="muted m-0 mt-2 text-sm">{copy.dismissed}</p>}
      </>}
  </section>
}

/** The card's button stays visible after a dismissed prompt; tapping it with no prompt left switches the card to the manual steps. */
function InstallButton({ onResult }: { onResult: (outcome: InstallOutcome) => void }) {
  const { busy, run } = useInstallAction(onResult)
  return <Button type="button" className="min-h-11" disabled={busy} onClick={() => void run()}><Download aria-hidden="true"/>{busy ? copy.installing : copy.button}</Button>
}
