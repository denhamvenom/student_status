import type { WhatsLeftItem } from '../student-home/contract'
import type { ParentHomeSummary } from './contract'

export function groupWork(items: WhatsLeftItem[]) {
  return {
    parent: items.filter(item => item.owner === 'parent'),
    student: items.filter(item => item.owner === 'student'),
    coach: items.filter(item => item.owner === 'coach'),
  }
}

export const parentAllSet = (items: WhatsLeftItem[]) => groupWork(items).parent.length === 0

export function upcomingEvent(summary: ParentHomeSummary, now: number) {
  return summary.nextEvent && summary.nextEvent.startsAt >= now ? summary.nextEvent : null
}

export function paidPercent(chargedCents: number, paidCents: number) {
  if (chargedCents <= 0) return 0
  return Math.round(Math.min(1, Math.max(0, paidCents / chargedCents)) * 100)
}

export function parentItemHref(item: WhatsLeftItem) {
  if (item.kind === 'healthProfile' || item.kind === 'firstRegistration') return '/setup?edit=1'
  if (item.kind === 'permissionForm') return '/forms'
  if (item.kind === 'requiredPayment') return '/finances'
  return item.href
}
