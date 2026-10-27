import type { Id } from '../../../convex/_generated/dataModel'
import type { HomeAttendance, PinnedAnnouncement, SignupAvailability, StudentHomeSummary } from './contract'

/** A query result as useQueries reports it: undefined while loading, an Error when it failed. */
export type Loadable<T> = T | undefined | Error

/** The part of dashboardReports.familyFinance the Balance due tile shows. */
export type HomeFinance =
  | { state: 'ready'; dueCents: number; availableCents: number }
  | { state: 'updating' }
  | { state: 'failed' }

/** Data sources that can be retried independently. */
export type HomeTileSource = 'summary' | 'attendance' | 'announcements' | 'finance'

/** participation.signUp result. */
export type SignUpResult = 'pending' | 'confirmed' | 'waitlist'

export type StudentHomeHandlers = {
  signUp: (eventId: Id<'events'>) => Promise<SignUpResult>
  /** A hook: called inside the signup sheet while it is open. */
  useAvailability: (eventId: Id<'events'>) => Loadable<SignupAvailability>
  /** Re-subscribe to one data source after "Try again". */
  retry: (source: HomeTileSource) => void
}

export type StudentHomeViewProps = {
  summary: Loadable<StudentHomeSummary>
  attendance: Loadable<HomeAttendance>
  announcements: Loadable<PinnedAnnouncement[]>
  finance: Loadable<HomeFinance>
  /** Browser clock (useNow); every soon/past decision uses it. */
  now: number
  handlers: StudentHomeHandlers
}
