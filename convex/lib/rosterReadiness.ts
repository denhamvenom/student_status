import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { financeRow } from "./financeRow";
import { studentReadiness } from "./readModels";
import { enrollmentPending } from "./eventEnrollmentState";
import { firstStatus } from "../firstRegistration";
import { coverageFor, permissionAccepted } from "./permissionCoverage";

/** The Team roster row for one student (moved unchanged from coachRoster.ts so the Readiness spreadsheet shows the same numbers as the app). */
export function missingInformation(student: Doc<"students">) {
  const missing: string[] = [];
  const confirmed = student.consentProfileV2CompletedAt !== undefined && student.consentProfileV2ConfirmedBy !== undefined && student.consentProfileV2 !== undefined;
  const profile = confirmed ? student.consentProfileV2 : null;
  if (student.profileCompletedAt === undefined) missing.push("Profile setup");
  if (!student.shirtSize?.trim()) missing.push("Shirt size");
  if (!student.roomCategory) missing.push("Room category");
  if (!(profile?.guardian.name ?? student.guardianName)?.trim() || !(profile?.guardian.phone ?? student.guardianPhone)?.trim()) missing.push("Guardian contact");
  if (!(profile?.emergency.name ?? student.emergencyName)?.trim() || !(profile?.emergency.phone ?? student.emergencyPhone)?.trim()) missing.push("Emergency contact");
  if (!confirmed) missing.push("Health information");
  return missing;
}

async function accountStatus(ctx: QueryCtx, student: Doc<"students">) {
  if (!student.userId) return { linkage: "unlinked" as const, access: "unknown" as const };
  const account = await ctx.db.get(student.userId);
  if (!account || account.role !== "student") return { linkage: "unavailable" as const, access: "unknown" as const };
  return { linkage: "linked" as const, access: account.active ? "active" as const : "inactive" as const };
}

export type Upcoming = { events: Doc<"events">[]; truncated: boolean; signingOpen: boolean };
export async function upcomingEvents(ctx: QueryCtx, season: Doc<"seasons">, asOf: number): Promise<Upcoming> {
  const seasonId = season._id;
  const page = await ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", seasonId).gte("startsAt", asOf)).take(11);
  return { // Canceled and archived events are never a student's next event and never feed a reminder.
  events: page.slice(0, 10).filter(event => !event.archived && !event.cancelled), truncated: page.length > 10, signingOpen: season.permissionSigningPaused === false };
}

type ParticipantLookup = (eventId: Doc<"events">["_id"]) => Promise<Doc<"participants"> | null>;
/** One participant read per event per student, shared by the next-event and permission lookups. */
function participantLookup(ctx: QueryCtx, student: Doc<"students">): ParticipantLookup {
  const cache = new Map<string, Promise<Doc<"participants"> | null>>();
  return eventId => {
    let found = cache.get(eventId);
    if (!found) { found = ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", student._id)).unique(); cache.set(eventId, found); }
    return found;
  };
}

async function nextEvent(ctx: QueryCtx, student: Doc<"students">, upcoming: Upcoming, financeState: string, participantFor: ParticipantLookup) {
  if (!student.active) return { nextEvent: null, readinessCoverage: "notApplicable" as const, knownFirstStatus: undefined };
  for (const event of upcoming.events) {
    const participant = await participantFor(event._id);
    if (enrollmentPending(event) && event.assignmentScope === "wholeTeam") return { nextEvent: { eventId: event._id, name: event.name, startsAt: event.startsAt, participation: participant?.status ?? null, state: "unknown" as const, open: ["Whole Team signups are not finished yet"] }, readinessCoverage: "unknown" as const, knownFirstStatus: undefined };
    if (!participant || participant.status === "withdrawn") continue;
    if (participant.status !== "confirmed") return { nextEvent: { eventId: event._id, name: event.name, startsAt: event.startsAt, participation: participant.status, state: "open" as const, open: ["Signup not confirmed yet"] }, readinessCoverage: "complete" as const, knownFirstStatus: undefined };
    const readiness = await studentReadiness(ctx, event, student);
    const state = financeState !== "ready" || readiness.open.includes("Event financial records require review") || readiness.open.includes("Event requirements require review") ? "unknown" as const : readiness.state === "ready" ? "ready" as const : "open" as const;
    return { nextEvent: { eventId: event._id, name: event.name, startsAt: event.startsAt, participation: participant.status, state, open: readiness.open }, readinessCoverage: "complete" as const, knownFirstStatus: readiness.firstRegistrationState ?? undefined };
  }
  return { nextEvent: null, readinessCoverage: upcoming.truncated ? "unknown" as const : "complete" as const, knownFirstStatus: undefined };
}

async function permissionStatus(ctx: QueryCtx, student: Doc<"students">, upcoming: Upcoming, participantFor: ParticipantLookup) {
  if (!upcoming.signingOpen) return { state: "closed" as const, eventName: null };
  if (!student.active) return { state: "noForm" as const, eventName: null };
  for (const event of upcoming.events) {
    if (event.cancelled || !event.permissionRequired) continue;
    const participant = await participantFor(event._id);
    if (participant?.status !== "confirmed" && participant?.status !== "pending") continue;
    if (await permissionAccepted(ctx, student._id, event._id)) return { state: "signed" as const, eventName: event.name };
    const coverage = await coverageFor(ctx, student._id, event._id);
    return { state: coverage?.state === "pending" ? "review" as const : "notSigned" as const, eventName: event.name };
  }
  return { state: "noForm" as const, eventName: null };
}

export async function rosterRow(ctx: QueryCtx, student: Doc<"students">, upcoming: Upcoming) {
  const firstStatusPromise = upcoming.events.some(event => !event.archived && event.type === "Competition") ? null : firstStatus(ctx, student._id);
  const participantFor = participantLookup(ctx, student);
  const [finance, account, permission] = await Promise.all([financeRow(ctx, student._id), accountStatus(ctx, student), permissionStatus(ctx, student, upcoming, participantFor)]);
  const { knownFirstStatus, ...event } = await nextEvent(ctx, student, upcoming, finance.state, participantFor);
  const firstRegistrationState = knownFirstStatus ?? await (firstStatusPromise ?? firstStatus(ctx, student._id));
  return { studentId: student._id, name: student.legalName || student.preferredName, subteam: student.subteam, travelTeam: student.travelTeam, active: student.active, profileRevision: student.profileRevision ?? 0, fundraiserConnected: !!student.fundraiserUrl, firstRegistrationState, account, balance: { state: finance.state, dueCents: finance.dueCents, personalAvailableCents: finance.personalAvailableCents, fundraisingAvailableCents: finance.fundraisingAvailableCents, updatedAt: finance.updatedAt }, ...event, missingSummary: missingInformation(student), permission };
}
