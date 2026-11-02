import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { Laptop, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { notificationsCopy } from '@/copy/notifications-copy'
import { userFacingError } from '@/lib/error-message'
import { InstallCard } from '@/pwa'
import { thisDeviceState, type ThisDeviceState } from './deviceStatus'
import { EnableNotifications, needsHomeScreen } from './EnableNotifications'
import { NotificationPreferences } from './NotificationPreferences'
import { unsubscribe } from './pushClient'
import { refreshPushDevice, usePushDevice } from './usePushDevice'

const copy = notificationsCopy.devices
/** Empty list wording: what to do on this device, or plainly why it can't be added. */
const noDevicesText = (state: ThisDeviceState) => state === 'on' || state === 'off' || state === 'checking' ? copy.none.off : copy.none[state]
const addedOn = (at: number) => new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

/** Every device this account gets notifications on, with remove. Removing this device also turns it off here. */
function NotificationDevices() {
  const device = usePushDevice()
  const publicKey = useQuery(api.push.getVapidPublicKey)
  const devices = useQuery(api.push.listMySubscriptions, device.checked ? { currentEndpoint: device.endpoint ?? undefined } : 'skip')
  const remove = useMutation(api.push.deleteSubscriptionById)
  const [removing, setRemoving] = useState<Id<'pushSubscriptions'> | null>(null)
  const [error, setError] = useState('')
  if (!devices) return null
  const removeDevice = async (id: Id<'pushSubscriptions'>, isThisDevice: boolean) => {
    setRemoving(id); setError('')
    try {
      if (isThisDevice) await unsubscribe()
      await remove({ subscriptionId: id })
      toast.success(copy.removed)
    } catch (cause) { setError(userFacingError(cause, copy.removeFailed)) }
    finally { if (isThisDevice) await refreshPushDevice(); setRemoving(null) }
  }
  return <div className="flex flex-col gap-2">
    <h3 className="m-0">{copy.title}</h3>
    <p className="muted m-0 text-sm">{copy.description}</p>
    {devices.length ? <ul className="m-0 flex list-none flex-col p-0">{devices.map(row => {
      const phone = /iPhone|iPad|Android/.test(row.deviceLabel)
      const Icon = phone ? Smartphone : Laptop
      return <li key={row._id} className="flex min-h-14 items-center gap-3 border-b border-[var(--border-default)] py-2 last:border-b-0">
        <Icon size={22} aria-hidden="true" className="shrink-0 text-[var(--text-muted)]"/>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="font-bold">{row.deviceLabel}{row.isThisDevice && <span className="badge badge-ready ml-2">{copy.thisDevice}</span>}</span>
          <span className="muted text-sm">{copy.added(addedOn(row.createdAt))}</span>
        </span>
        <Button type="button" variant="outline" aria-label={copy.removeLabel(row.deviceLabel)} disabled={removing !== null} onClick={() => void removeDevice(row._id, row.isThisDevice)}>{copy.remove}</Button>
      </li>
    })}</ul> : <p className="muted m-0">{noDevicesText(thisDeviceState({ publicKey, device, needsHomeScreen: needsHomeScreen() }))}</p>}
    {error && <p role="alert" className="open-text m-0">{error}</p>}
  </div>
}

/** Settings → Notifications & app: install help, turn on notifications, what to send, and this account's devices. */
export function NotificationSettings() {
  return <section className="card flex flex-col gap-5" aria-labelledby="notifications-settings-title">
    <div>
      <h2 id="notifications-settings-title" className="m-0">{notificationsCopy.section.title}</h2>
      <p className="muted m-0 mt-1">{notificationsCopy.section.description}</p>
    </div>
    {/* On iPhone and iPad outside the Home Screen app, EnableNotifications shows the install steps itself. */}
    {!needsHomeScreen() && <InstallCard/>}
    <EnableNotifications/>
    <NotificationPreferences/>
    <NotificationDevices/>
  </section>
}
