import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Bell, BellOff, Send } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { notificationsCopy } from '@/copy/notifications-copy'
import { userFacingError } from '@/lib/error-message'
import { InstallCard, isIOS, isStandalone } from '@/pwa'
import { thisDeviceState } from './deviceStatus'
import { TroubleshootNotifications } from './TroubleshootNotifications'
import { deviceLabel, getCurrentSubscription, subscribe, unsubscribe } from './pushClient'
import { refreshPushDevice, usePushDevice } from './usePushDevice'

const copy = notificationsCopy.enable

/** iPhone and iPad get notifications only in the Home Screen app. */
export const needsHomeScreen = () => isIOS() && !isStandalone()

function BlockedSteps() {
  const steps = isIOS() ? copy.blockedSteps.ios : /Android/.test(navigator.userAgent) ? copy.blockedSteps.android : copy.blockedSteps.desktop
  return <div role="status" className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-metal)] p-4">
    <p className="m-0 font-bold">{copy.blockedTitle}</p>
    <p className="m-0 mt-1">{copy.blocked}</p>
    <ol className="m-0 mt-3 flex flex-col gap-1 pl-5">{steps.map(step => <li key={step}>{step}</li>)}</ol>
  </div>
}

/** Turns notifications on or off for this device. Permission is requested only from the button, never on load. */
export function EnableNotifications() {
  const publicKey = useQuery(api.push.getVapidPublicKey)
  const save = useMutation(api.push.saveSubscription)
  const remove = useMutation(api.push.deleteSubscription)
  const sendTest = useMutation(api.notifications.sendTestToMe)
  const device = usePushDevice()
  const [busy, setBusy] = useState<'on' | 'off' | 'test' | null>(null)
  const [error, setError] = useState('')
  const synced = useRef(false)

  // Keeps the server copy current (new keys, or another account used this device before).
  useEffect(() => {
    if (synced.current || !publicKey || !device.checked || device.permission !== 'granted' || !device.endpoint) return
    synced.current = true
    void getCurrentSubscription().then(keys => keys && save({ ...keys, deviceLabel: deviceLabel() })).catch(() => {})
  }, [publicKey, device.checked, device.permission, device.endpoint, save])

  const state = thisDeviceState({ publicKey, device, needsHomeScreen: needsHomeScreen() })
  if (state === 'iosHomeScreen') return <div className="flex flex-col gap-3"><p className="m-0">{copy.iosHomeScreen}</p><InstallCard/></div>
  if (state === 'checking' || !publicKey) return <p className="muted m-0" role="status">{state === 'notReady' ? copy.notReady : copy.checking}</p>
  if (state === 'unsupported') return <p className="m-0">{copy.unsupported}</p>
  if (state === 'blocked') return <BlockedSteps/>

  const turnOn = async () => {
    setBusy('on'); setError('')
    try {
      // First call in the click handler, so the browser counts it as the person's own action.
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        const keys = await subscribe(publicKey)
        if (!keys) throw new Error(copy.turnOnFailed)
        await save({ ...keys, deviceLabel: deviceLabel() })
        toast.success(copy.turnedOn)
      }
    } catch (cause) { setError(userFacingError(cause, copy.turnOnFailed)) }
    finally { await refreshPushDevice(); setBusy(null) }
  }
  const turnOff = async () => {
    setBusy('off'); setError('')
    try {
      const endpoint = await unsubscribe() ?? device.endpoint
      if (endpoint) await remove({ endpoint })
      toast.success(copy.turnedOff)
    } catch (cause) { setError(userFacingError(cause, copy.turnOffFailed)) }
    finally { await refreshPushDevice(); setBusy(null) }
  }
  const test = async () => {
    setBusy('test'); setError('')
    try { await sendTest({}); toast.success(copy.testSent) } catch (cause) { setError(userFacingError(cause, copy.testFailed)) } finally { setBusy(null) }
  }

  const on = state === 'on'
  return <div className="flex flex-col gap-3">
    {on ? <>
      <p className="m-0 flex items-center gap-2 font-bold"><Bell size={20} aria-hidden="true"/>{copy.onFor(deviceLabel())}</p>
      <div className="action-row flex flex-wrap gap-2">
        <Button type="button" size="lg" disabled={busy !== null} onClick={() => void test()}><Send aria-hidden="true"/>{copy.sendTest}</Button>
        <Button type="button" size="lg" variant="outline" disabled={busy !== null} onClick={() => void turnOff()}><BellOff aria-hidden="true"/>{copy.turnOff}</Button>
      </div>
      <TroubleshootNotifications/>
    </> : <>
      <Button type="button" className="min-h-14 w-full text-base sm:w-auto" disabled={busy !== null} onClick={() => void turnOn()}><Bell aria-hidden="true"/>{busy === 'on' ? copy.turningOn : copy.turnOn}</Button>
      <p className="muted m-0 text-sm">{copy.turnOnHelp}</p>
    </>}
    {error && <p role="alert" className="open-text m-0">{error}</p>}
  </div>
}
