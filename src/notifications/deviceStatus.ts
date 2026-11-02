import type { PushPermission } from './usePushDevice'

/** Where this device stands with notifications. Each state maps to one action or one plain reason, never a dead end. */
export type ThisDeviceState = 'checking' | 'iosHomeScreen' | 'notReady' | 'unsupported' | 'blocked' | 'off' | 'on'

type Input = {
  /** VAPID key: undefined while loading, null when the team has no key configured. */
  publicKey: string | null | undefined
  device: { checked: boolean; supported: boolean; permission: PushPermission; endpoint: string | null }
  /** iPhone or iPad outside the Home Screen app. */
  needsHomeScreen: boolean
}

export function thisDeviceState({ publicKey, device, needsHomeScreen }: Input): ThisDeviceState {
  if (needsHomeScreen && !device.supported) return 'iosHomeScreen'
  if (publicKey === undefined || !device.checked) return 'checking'
  if (publicKey === null) return 'notReady'
  if (!device.supported) return 'unsupported'
  if (device.permission === 'denied') return 'blocked'
  return device.permission === 'granted' && device.endpoint ? 'on' : 'off'
}

/** States where the Settings page has a way to turn notifications on, so the Inbox may point people there. */
export const canTurnOnInSettings = (state: ThisDeviceState) => state === 'off' || state === 'blocked' || state === 'iosHomeScreen'
