import { describe, expect, it } from 'vitest'
import { canTurnOnInSettings, thisDeviceState } from './deviceStatus'

const ready = { checked: true, supported: true, permission: 'default' as const, endpoint: null }

describe('thisDeviceState', () => {
  it.each([
    ['iPhone in Safari, before anything loads', { publicKey: undefined, device: { ...ready, checked: false, supported: false, permission: 'unsupported' as const }, needsHomeScreen: true }, 'iosHomeScreen'],
    ['still loading', { publicKey: undefined, device: ready, needsHomeScreen: false }, 'checking'],
    ['team key not configured', { publicKey: null, device: ready, needsHomeScreen: false }, 'notReady'],
    ['browser without push', { publicKey: 'k', device: { ...ready, supported: false, permission: 'unsupported' as const }, needsHomeScreen: false }, 'unsupported'],
    ['permission blocked', { publicKey: 'k', device: { ...ready, permission: 'denied' as const }, needsHomeScreen: false }, 'blocked'],
    ['never asked', { publicKey: 'k', device: ready, needsHomeScreen: false }, 'off'],
    ['allowed but no subscription', { publicKey: 'k', device: { ...ready, permission: 'granted' as const }, needsHomeScreen: false }, 'off'],
    ['on', { publicKey: 'k', device: { ...ready, permission: 'granted' as const, endpoint: 'https://push.example/1' }, needsHomeScreen: false }, 'on'],
  ])('%s', (_name, input, expected) => expect(thisDeviceState(input)).toBe(expected))
})

describe('canTurnOnInSettings', () => {
  // The Inbox hint links to Settings only when Settings can actually help.
  it.each([
    ['off', true], ['blocked', true], ['iosHomeScreen', true],
    ['on', false], ['checking', false], ['notReady', false], ['unsupported', false],
  ] as const)('%s → %s', (state, expected) => expect(canTurnOnInSettings(state)).toBe(expected))
})
