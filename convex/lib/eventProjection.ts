import { v, type Infer } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import schema from "../schema";

/**
 * The event fields Student and Parent screens read (Events list, event page, Home agenda, signup wizard, rooming
 * link, dashboard). Staff internals stay out: Calendar sync state/ids/etags/errors, Media Support, enrollment job
 * ids, whole-team counts, capacity and transport sizing, shift limits and requirement switches (those reach
 * families through their own queries such as participation.signupAvailability). The all-day Calendar dates are
 * display dates for an all-day event's schedule, not sync state, so they stay.
 */
const eventFields = schema.tables.events.validator.fields;

export const familyEventValidator = v.object({
  _id: v.id("events"),
  name: v.string(),
  type: eventFields.type,
  startsAt: v.number(),
  endsAt: v.number(),
  calendarAllDayStartDate: v.optional(v.string()),
  calendarAllDayEndDate: v.optional(v.string()),
  destination: v.string(),
  travel: v.string(),
  onsite: v.optional(v.boolean()),
  locationType: v.union(v.literal("inPerson"), v.literal("virtual")),
  overnight: v.boolean(),
  roomingEnabled: v.boolean(),
  feeCents: v.number(),
  signupMode: eventFields.signupMode,
  assignmentScope: eventFields.assignmentScope,
  audienceKind: eventFields.audienceKind,
  audienceSubteams: v.optional(v.array(v.string())),
  mandatory: v.optional(v.boolean()),
  cancelled: v.boolean(),
  archived: v.boolean(),
  enrollmentState: v.union(v.literal("running"), v.literal("failed"), v.literal("complete"), v.literal("cancelled")),
  seriesId: v.optional(v.id("eventSeries")),
  seriesDetached: v.optional(v.boolean()),
});

export type FamilyEvent = Infer<typeof familyEventValidator>;

export function familyEvent(event: Doc<"events">): FamilyEvent {
  return {
    _id: event._id, name: event.name, type: event.type, startsAt: event.startsAt, endsAt: event.endsAt,
    ...(event.calendarAllDayStartDate !== undefined && event.calendarAllDayEndDate !== undefined ? { calendarAllDayStartDate: event.calendarAllDayStartDate, calendarAllDayEndDate: event.calendarAllDayEndDate } : {}),
    destination: event.destination, travel: event.travel, ...(event.onsite ? { onsite: true } : {}), locationType: event.locationType ?? "inPerson",
    overnight: event.overnight, roomingEnabled: event.roomingEnabled, feeCents: event.feeCents,
    signupMode: event.signupMode,
    ...(event.assignmentScope !== undefined ? { assignmentScope: event.assignmentScope } : {}),
    ...(event.audienceKind !== undefined ? { audienceKind: event.audienceKind } : {}),
    ...(event.audienceSubteams !== undefined ? { audienceSubteams: event.audienceSubteams } : {}),
    ...(event.mandatory !== undefined ? { mandatory: event.mandatory } : {}),
    cancelled: event.cancelled ?? false, archived: event.archived, enrollmentState: event.enrollmentState ?? "complete",
    ...(event.seriesId !== undefined ? { seriesId: event.seriesId } : {}),
    ...(event.seriesDetached !== undefined ? { seriesDetached: event.seriesDetached } : {}),
  };
}

/** Shape of access.mentorEvent (plain Mentors without Travel Lead). */
const mentorEventValidator = v.object({
  _id: v.id("events"), name: v.string(), type: eventFields.type, startsAt: v.number(), endsAt: v.number(), destination: v.string(),
  onsite: v.optional(v.boolean()), locationType: v.union(v.literal("inPerson"), v.literal("virtual")), cancelled: v.boolean(),
  mediaSupportRequested: v.boolean(), enrollmentState: v.union(v.literal("running"), v.literal("failed"), v.literal("complete"), v.literal("cancelled")),
});

/** Coach and Travel Lead get the stored event; Mentors and families get their projections. */
const viewerEventValidator = v.union(schema.doc("events"), familyEventValidator, mentorEventValidator);
const participationStatusValidator = v.union(v.literal("pending"), v.literal("confirmed"), v.literal("waitlist"), v.literal("withdrawn"), v.null());

export const listEventsReturns = v.array(v.object({ event: viewerEventValidator, participation: participationStatusValidator }));

export const eventDetailReturns = v.object({
  event: viewerEventValidator,
  participation: participationStatusValidator,
  requirements: v.array(schema.doc("requirements")),
  // studentReadiness's computed read model (unchanged); null without a selected student.
  readiness: v.any(),
  // Staff only: where a series meeting sits (null for a single event); absent for everyone else.
  series: v.optional(v.union(v.null(), v.object({
    seriesId: v.id("eventSeries"), name: v.string(), status: schema.tables.eventSeries.validator.fields.status,
    generatedThrough: v.union(v.number(), v.null()), generatedThroughDate: v.union(v.string(), v.null()), plannedMeetingCount: v.union(v.number(), v.null()),
    moreMeetingsScheduled: v.boolean(), windowDays: v.number(),
  }))),
});
