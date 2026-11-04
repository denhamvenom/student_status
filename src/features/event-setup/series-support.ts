// Repeating meetings (event series): maps New event and event page choices onto convex/eventSeries.ts.
// The mapping functions are pure so they can be tested; the hooks only bind them to the mutations.
import { useCallback } from 'react'
import { useAction, useMutation } from 'convex/react'
import type { FunctionArgs } from 'convex/server'
import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import { chicagoInputTime } from '@/lib/chicago-time'
import type { RepeatValue, SeriesScope } from './audience/types'

type CreateEventArgs = FunctionArgs<typeof api.admin.createEvent>
type CreateSeriesArgs = FunctionArgs<typeof api.eventSeries.create>
export type AdoptSeriesArgs = FunctionArgs<typeof api.eventSeries.adoptGoogleSeries>

export const seriesCopy = {
  travelTeam: 'Travel Team events can’t repeat. Choose who it’s for instead, or turn off repeating.',
  extras: 'Repeating meetings can’t have time slots, signup questions or extra steps yet. Remove them, or turn off repeating.',
  calendarLink: 'A repeating meeting gets its own Team Calendar series. Choose “Create a separate Calendar entry”, or turn off repeating.',
  otherDay: 'Future meetings can only change their time here, not their day. Change this meeting only, or keep the same day.',
  mediaFuture: 'Media Support can be changed one meeting at a time. Choose “This meeting only”.',
  notSeries: 'This meeting is no longer part of a series. Reload to see the latest.',
} as const

/** Why the New event draft can't be saved as a repeating series, or null when it can. */
export function seriesBlocker(draft: { travelTeam: boolean; hasExtras: boolean; linksCalendar: boolean }): string | null {
  if (draft.travelTeam) return seriesCopy.travelTeam
  if (draft.hasExtras) return seriesCopy.extras
  if (draft.linksCalendar) return seriesCopy.calendarLink
  return null
}

const withoutUndefined = <T extends Record<string, unknown>>(value: T): T => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T

/**
 * eventSeries.create arguments from the New event's createEvent arguments, its repeat rule and the Central Time start
 * input ("YYYY-MM-DDTHH:MM"). Meetings keep the first meeting's time of day and length.
 */
export function seriesCreateArgs(event: CreateEventArgs, repeat: RepeatValue, startInput: string): CreateSeriesArgs {
  if (!event.audienceKind) throw new Error(seriesCopy.travelTeam)
  if (event.calendarChoice?.kind === 'link') throw new Error(seriesCopy.calendarLink)
  return withoutUndefined({
    name: event.name, type: event.type, destination: event.destination, travel: event.travel, overnight: event.overnight, roomingEnabled: event.roomingEnabled,
    feeCents: event.feeCents, signupMode: event.signupMode === 'approval' ? 'approval' as const : 'open' as const, capacity: event.capacity, allowWithdrawal: event.allowWithdrawal,
    permissionRequired: event.permissionRequired, firstRequired: event.firstRequired, mediaSupportRequested: event.mediaSupportRequested, isOutreach: event.isOutreach, onsite: event.onsite,
    audienceKind: event.audienceKind, audienceSubteams: event.audienceSubteams, mandatory: event.mandatory, audienceStudentIds: event.audienceStudentIds,
    mentorInviteUserIds: event.mentorInviteUserIds, inviteSubteamMentors: event.inviteSubteamMentors, locationType: event.locationType,
    rule: withoutUndefined({
      startDate: startInput.slice(0, 10), weekdays: [...repeat.weekdays], intervalWeeks: repeat.intervalWeeks, localStartTime: startInput.slice(11, 16),
      durationMinutes: Math.round((event.endsAt - event.startsAt) / 60_000),
      untilDate: repeat.ends === 'onDate' ? repeat.endDate : undefined, count: repeat.ends === 'afterCount' ? repeat.count : undefined,
    }),
    addToCalendar: event.calendarChoice?.kind === 'create',
  })
}

export type OccurrenceValues = { name?: string; destination?: string; startsAt?: number; endsAt?: number; mediaSupportRequested?: boolean }
export type OccurrenceChange = { kind: 'edit'; values: OccurrenceValues } | { kind: 'cancel' }
export type SeriesEvent = { _id: string; seriesId?: string; seriesOccurrenceKey?: string; startsAt: number; endsAt: number }

/** editFuture's changes: a new time of day and length, never a different day. */
export function futureEditArgs(event: Pick<SeriesEvent, 'startsAt' | 'endsAt'>, values: OccurrenceValues) {
  if (values.mediaSupportRequested !== undefined) throw new Error(seriesCopy.mediaFuture)
  const startsAt = values.startsAt ?? event.startsAt, endsAt = values.endsAt ?? event.endsAt
  const timed = values.startsAt !== undefined || values.endsAt !== undefined
  if (values.startsAt !== undefined && chicagoInputTime(startsAt).slice(0, 10) !== chicagoInputTime(event.startsAt).slice(0, 10)) throw new Error(seriesCopy.otherDay)
  return withoutUndefined({
    name: values.name, destination: values.destination,
    localStartTime: values.startsAt !== undefined ? chicagoInputTime(startsAt).slice(11, 16) : undefined,
    durationMinutes: timed ? Math.round((endsAt - startsAt) / 60_000) : undefined,
  })
}

/** Creates the series and resolves to its first meeting (null when the first meeting is still being generated). */
export type CreateSeries = (event: CreateEventArgs, repeat: RepeatValue, startInput: string) => Promise<Id<'events'> | null>
export function useCreateSeries(): CreateSeries {
  const create = useMutation(api.eventSeries.create)
  return useCallback(async (event, repeat, startInput) => (await create(seriesCreateArgs(event, repeat, startInput))).firstEventId, [create])
}

/** Edits or cancels one meeting, or this and all future meetings, of the series the event belongs to. */
export type ChangeOccurrence = (args: { event: SeriesEvent; expectedRevision?: number; scope: SeriesScope; change: OccurrenceChange }) => Promise<unknown>
export function useChangeOccurrence(): ChangeOccurrence {
  const editOne = useMutation(api.eventSeries.editOccurrence)
  const cancelOne = useMutation(api.eventSeries.cancelOccurrence)
  const editFuture = useMutation(api.eventSeries.editFuture)
  const cancelFuture = useMutation(api.eventSeries.cancelFuture)
  return useCallback(async ({ event, expectedRevision, scope, change }) => {
    const eventId = event._id as Id<'events'>
    if (scope === 'this') return change.kind === 'cancel' ? await cancelOne({ eventId, expectedRevision }) : await editOne({ eventId, expectedRevision, ...change.values })
    if (!event.seriesId || !event.seriesOccurrenceKey) throw new Error(seriesCopy.notSeries)
    const from = { seriesId: event.seriesId as Id<'eventSeries'>, fromKey: event.seriesOccurrenceKey }
    return change.kind === 'cancel' ? await cancelFuture(from) : await editFuture({ ...from, ...futureEditArgs(event, change.values) })
  }, [editOne, cancelOne, editFuture, cancelFuture])
}

/** Coach only: Team Calendar repeating series not yet managed here, and the action that brings one in. */
export function useAdoptGoogleSeries() {
  const candidates = useAction(api.eventSeries.googleSeriesCandidates)
  const adopt = useAction(api.eventSeries.adoptGoogleSeries)
  return { candidates, adopt }
}
