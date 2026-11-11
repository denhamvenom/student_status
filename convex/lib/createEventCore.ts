import { ConvexError } from "convex/values";
import type { WithoutSystemFields } from "convex/server";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { scheduleEventArchive } from "../eventArchive";
import { audit } from "./access";
import { addCharge } from "./money";
import { teamTransportEnabled } from "./transportation";
import { notifyEventCreated, notifyStaffInvited, queueMentorMeetingOpenDigest } from "./notificationTriggers";
import { toStoredEventFields, validateAudienceInput, type AssignmentScope, type AudienceKind, type SignupMode } from "./eventAudienceRules";
import { isSubteamMandatory } from "./subteamEnrollment";
import { isMentorCapable, mentorMatchesSubteams } from "./mentorMeetings";
import type { cleanQuestion, cleanShift } from "./eventSignupExtras";

export const MAX_MENTOR_INVITES = 200;
export const MAX_AUDIENCE_STUDENTS = 200;

export type NewEventFields = Omit<WithoutSystemFields<Doc<"events">>, "seasonId" | "archived" | "transportEnabled">;
export type MentorInvite = { mentorUserId: Id<"appUsers">; source: "individual" | "subteam" };

export type CreateEventCoreInput = {
  eventFields: NewEventFields;
  requirements: { key: string; label: string; instructions?: string; url?: string; dueAt?: number; kind?: "info" | "checkoff" }[];
  shifts: ReturnType<typeof cleanShift>[];
  questions: ReturnType<typeof cleanQuestion>[];
  calendarChoice?: { kind: "create" } | { kind: "link"; eventId: string };
  /** Students put on the event now (Whole Team and subteam events enroll them through a job). */
  assigned: Id<"students">[];
  /** Listed students for a specific-students audience (written as eventAudienceStudents rows). */
  audienceStudentIds?: Id<"students">[];
  mentorInvites?: MentorInvite[];
};
/**
 * `suppressNotifications` skips the create/invite notices. `silentEnrollment` runs the Whole Team / subteam enrollment job
 * through eventSeries.runEnrollment, which is the same job without the per-batch assignment notice (series occurrences).
 */
export type CreateEventCoreOptions = { suppressNotifications?: boolean; silentEnrollment?: boolean };

type AudienceArgs = {
  audienceKind?: AudienceKind; audienceSubteams?: string[]; mandatory?: boolean; audienceStudentIds?: Id<"students">[];
  mentorInviteUserIds?: Id<"appUsers">[]; inviteSubteamMentors?: boolean; locationType?: "inPerson" | "virtual";
};
type LegacyArgs = {
  signupMode: SignupMode; assignmentScope?: AssignmentScope; assignedStudentIds?: Id<"students">[]; permissionRequired: boolean;
  overnight: boolean; roomingEnabled: boolean; roomDeadline?: number; travel: string; onsite?: boolean;
};

/**
 * Invitable Mentors among the ids, in order and de-duplicated: active, non-archived Mentors and Parents with a current Mentor
 * or Travel Lead staff-access grant (lib/mentorMeetings isMentorCapable: such Parents are Mentors first). Any other id is refused.
 */
export async function requireInvitableMentors(ctx: MutationCtx, ids: Id<"appUsers">[]): Promise<Id<"appUsers">[]> {
  const unique = [...new Set(ids)];
  if (unique.length > MAX_MENTOR_INVITES) throw new ConvexError("Invite up to 200 Mentors at a time.");
  for (const id of unique) {
    if (!isMentorCapable(await ctx.db.get(id))) throw new ConvexError("Choose Mentors from the list. One of them is no longer available.");
  }
  return unique;
}

/** Accounts read per list (Mentor accounts, Parents with Mentor access, Parents with Travel Lead access) when inviting by subteam. */
export const MAX_SUBTEAM_MENTOR_LIST = 500;
export const TOO_MANY_SUBTEAM_MENTORS_MESSAGE = "There are too many Mentors to invite by subteam. Invite them individually.";

/**
 * Mentors whose subteams overlap the given groups (legacy names canonicalized; bounded): Mentor accounts and Parents with a
 * current Mentor or Travel Lead staff-access grant (isMentorCapable). Each list is checked on its own: when any one holds more
 * than MAX_SUBTEAM_MENTOR_LIST accounts the invite is refused with a clear message, never silently cut short.
 */
export async function mentorsForSubteams(ctx: MutationCtx, groups: readonly string[]): Promise<Id<"appUsers">[]> {
  const lists = [
    await ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", "mentor")).take(MAX_SUBTEAM_MENTOR_LIST + 1),
    await ctx.db.query("appUsers").withIndex("by_parentStaffAccess", q => q.eq("parentStaffAccess", "mentor")).take(MAX_SUBTEAM_MENTOR_LIST + 1),
    await ctx.db.query("appUsers").withIndex("by_parentStaffAccess", q => q.eq("parentStaffAccess", "travelLead")).take(MAX_SUBTEAM_MENTOR_LIST + 1),
  ];
  if (lists.some(list => list.length > MAX_SUBTEAM_MENTOR_LIST)) throw new ConvexError(TOO_MANY_SUBTEAM_MENTORS_MESSAGE);
  return lists.flat().filter(mentor => isMentorCapable(mentor) && mentorMatchesSubteams(mentor, groups)).map(mentor => mentor._id);
}

/**
 * Turns the audience arguments into the event arguments the existing createEvent rules already understand.
 * Without `audienceKind` the event is legacy and its arguments pass through unchanged (except virtual cleanup and mentor invites).
 */
export async function prepareEventAudience<A extends AudienceArgs & LegacyArgs>(ctx: MutationCtx, user: Doc<"appUsers">, season: Doc<"seasons">, raw: A): Promise<{ args: A; audienceStudentIds: Id<"students">[]; mentorInvites: MentorInvite[] }> {
  const individual = await requireInvitableMentors(ctx, raw.mentorInviteUserIds ?? []);
  let args: A = raw;
  let audienceStudentIds: Id<"students">[] = [];
  let subteamMentors: Id<"appUsers">[] = [];
  if (raw.audienceKind === undefined) {
    if (raw.mandatory !== undefined || raw.audienceSubteams?.length || raw.audienceStudentIds?.length || raw.inviteSubteamMentors) throw new ConvexError("Choose who the event is for before setting subteams, students or required.");
  } else {
    const kind = raw.audienceKind, mandatory = raw.mandatory ?? false, subteams = raw.audienceSubteams ?? [];
    if (raw.assignmentScope || raw.assignedStudentIds?.length) throw new ConvexError("Choose who the event is for with the audience. Don't also choose a scope or students.");
    if (kind !== "subteams" && subteams.length) throw new ConvexError("Subteams can be chosen only when the audience is subteams.");
    if (kind !== "students" && raw.audienceStudentIds?.length) throw new ConvexError("Students can be chosen only when the audience is specific students.");
    if (raw.inviteSubteamMentors && kind !== "subteams") throw new ConvexError("Mentors can be invited by subteam only when the audience is subteams.");
    audienceStudentIds = [...new Set(raw.audienceStudentIds ?? [])];
    if (audienceStudentIds.length > MAX_AUDIENCE_STUDENTS) throw new ConvexError("Choose up to 200 students for an event.");
    if (raw.inviteSubteamMentors) subteamMentors = (await mentorsForSubteams(ctx, subteams)).filter(id => !individual.includes(id));
    const errors = validateAudienceInput({ kind, subteams, mandatory, studentCount: audienceStudentIds.length, mentorInviteCount: individual.length + subteamMentors.length, actorIsCoach: user.role === "coach" });
    if (errors.length) throw new ConvexError(errors[0]);
    if (kind === "subteams" && mandatory && (raw as { capacity?: number }).capacity !== undefined) throw new ConvexError("Required subteam events include every matching student. Leave capacity blank.");
    for (const studentId of audienceStudentIds) {
      const student = await ctx.db.get(studentId);
      if (!student || !student.active || student.seasonId !== season._id) throw new ConvexError("A chosen student is no longer on the current roster. Reload and choose again.");
    }
    const stored = toStoredEventFields({ kind, subteams, mandatory, optionalSignupMode: raw.signupMode === "approval" ? "approval" : "open" });
    args = { ...raw, signupMode: stored.signupMode, assignmentScope: stored.assignmentScope, audienceKind: kind, audienceSubteams: stored.audienceSubteams, mandatory: stored.mandatory, assignedStudentIds: kind === "students" && mandatory ? audienceStudentIds : undefined };
  }
  if (raw.locationType === "virtual") {
    if (raw.onsite) throw new ConvexError("An on-site event can't be virtual. Choose one or the other.");
    // Virtual events have no travel: no permission form, transport, rooms or overnight.
    args = { ...args, permissionRequired: false, overnight: false, roomingEnabled: false, roomDeadline: undefined, travel: "None" };
  }
  return { args, audienceStudentIds, mentorInvites: [...individual.map(mentorUserId => ({ mentorUserId, source: "individual" as const })), ...subteamMentors.map(mentorUserId => ({ mentorUserId, source: "subteam" as const }))] };
}

/**
 * Inserts the event with its requirements, shifts, questions, participants, fees, Calendar claim, enrollment job, audience rows
 * and mentor invites. Callers validate first. `suppressNotifications` lets a series generator create many occurrences quietly.
 */
export async function createEventCore(ctx: MutationCtx, user: Doc<"appUsers">, season: Doc<"seasons">, input: CreateEventCoreInput, options: CreateEventCoreOptions = {}): Promise<Id<"events">> {
  const { eventFields, calendarChoice, assigned } = input;
  const name = eventFields.name.trim();
  const wholeTeam = eventFields.assignmentScope === "wholeTeam";
  const subteamJob = isSubteamMandatory({ ...eventFields, seasonId: season._id, archived: false } as Doc<"events">);
  const id = await ctx.db.insert("events", { ...eventFields, transportEnabled: teamTransportEnabled(eventFields), name, seasonId: season._id, archived: false, ...(calendarChoice ? { calendarChoice: calendarChoice.kind, calendarEventId: calendarChoice.kind === "link" ? calendarChoice.eventId : undefined, calendarSyncState: "pending" as const, calendarRevision: 1, calendarActorId: user._id } : {}), ...(wholeTeam ? { wholeTeamParticipantCount: 0, enrollmentState: "running" as const } : {}), ...(subteamJob ? { enrollmentState: "running" as const } : {}) });
  if (calendarChoice?.kind === "link") {
    const claim = await ctx.db.query("eventCalendarClaims").withIndex("by_calendarEventId", q => q.eq("calendarEventId", calendarChoice.eventId)).unique();
    if (claim) throw new ConvexError("This Calendar entry is already connected to another event. Choose a different entry.");
    await ctx.db.insert("eventCalendarClaims", { calendarEventId: calendarChoice.eventId, eventId: id });
  }
  const keys = new Set<string>();
  for (const requirement of input.requirements) {
    if (!requirement.key.trim() || keys.has(requirement.key) || ["pay", "perm", "first", "room"].includes(requirement.key)) throw new ConvexError("Each requirement needs its own short name, and pay, perm, first and room are reserved. Change the short name.");
    keys.add(requirement.key);
    await ctx.db.insert("requirements", { ...requirement, eventId: id });
  }
  for (const shift of input.shifts) {
    const shiftId = await ctx.db.insert("eventShifts", { eventId: id, ...shift });
    await audit(ctx, user, "eventShifts", shiftId, "create", null, shift);
  }
  for (const [order, question] of input.questions.entries()) {
    const questionId = await ctx.db.insert("eventQuestions", { eventId: id, order, ...question });
    await audit(ctx, user, "eventQuestions", questionId, "create", null, question);
  }
  const enrollsByJob = wholeTeam || subteamJob;
  for (const studentId of enrollsByJob ? [] : assigned) {
    const now = Date.now();
    await ctx.db.insert("participants", { eventId: id, studentId, status: "confirmed", createdAt: now, updatedAt: now });
    if (eventFields.feeCents > 0) await addCharge(ctx, user, studentId, name, eventFields.feeCents, eventFields.startsAt, `eventFee:${id}:${studentId}`, id);
  }
  if (enrollsByJob) {
    const now = Date.now();
    const jobId = await ctx.db.insert("eventEnrollmentJobs", { requiredFinancialProjectionVersion: 4, eventId: id, actorId: user._id, state: "running", cursor: null, processed: 0, startedAt: now, updatedAt: now });
    for (const studentId of assigned) await ctx.db.insert("eventEnrollmentMembers", { jobId, studentId });
    await ctx.db.patch(id, { enrollmentJobId: jobId });
    if (options.silentEnrollment) await ctx.scheduler.runAfter(0, internal.eventSeries.runEnrollment, { jobId });
    else await ctx.scheduler.runAfter(0, internal.eventEnrollment.run, { jobId });
  }
  for (const studentId of input.audienceStudentIds ?? []) await ctx.db.insert("eventAudienceStudents", { eventId: id, studentId });
  const invites = input.mentorInvites ?? [];
  const createdAt = Date.now();
  for (const invite of invites) await ctx.db.insert("eventMentorInvites", { eventId: id, mentorUserId: invite.mentorUserId, source: invite.source, status: "invited", invitedBy: user._id, createdAt });
  if (calendarChoice) await ctx.scheduler.runAfter(0, internal.eventCalendar.push, { eventId: id, revision: 1 });
  await scheduleEventArchive(ctx, id);
  await audit(ctx, user, "events", id, "create", null, eventFields);
  if (!options.suppressNotifications) {
    await notifyEventCreated(ctx, { eventId: id, assignedStudentIds: assigned });
    // M4: "new event you can join" for every Mentor who could sign up (any event type; the trigger applies selfSignupEligible).
    await queueMentorMeetingOpenDigest(ctx, { eventId: id });
    if (invites.length) await notifyStaffInvited(ctx, { eventId: id, staffUserIds: invites.map(invite => invite.mentorUserId) });
  }
  return id;
}
