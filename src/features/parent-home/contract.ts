import type { Id } from '../../../convex/_generated/dataModel'
import type { FunctionReturnType } from 'convex/server'
import type { api } from '../../../convex/_generated/api'
import type { HomeAttendance, PinnedAnnouncement, WhatsLeftItem } from '../student-home/contract'

/** studentHome.parentSummary: one active student linked to the signed-in parent. */
export type ParentHomeSummary = {
  studentId: Id<'students'>
  whatsLeft: WhatsLeftItem[]
  nextEvent: {
    eventId: Id<'events'>
    name: string
    startsAt: number
    location: string | null
    status: 'pending' | 'confirmed' | 'waitlist'
  } | null
}

/** dashboardReports.homeAttendance, scoped to one linked student. */
export type ParentHomeAttendance = HomeAttendance

/** announcements.pinnedForParentHome. */
export type ParentPinnedAnnouncement = PinnedAnnouncement

/** dashboardReports.familyFinance: total fees are chargedCents; available funds are personalAvailableCents + fundraisingAvailableCents. */
export type ParentHomeFinance = FunctionReturnType<typeof api.dashboardReports.familyFinance>
