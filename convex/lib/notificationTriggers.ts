import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { MAX_DIGEST_USERS, queueDigestItem } from "./digest";
import { eventEligibleStudentIds, eventParticipantStudentIds } from "./eventAudience";
import { eventCreatorId, isMentorCapable, listMeetingMentors, MAX_MEETING_MENTORS, mentorMeetingCreatorId, selfSignupEligible } from "./mentorMeetings";
import { MEETING_ACTIVITY, queueMentorDigestItem, type MeetingActivity } from "./notificationDigestRules";
import { coachAndTravelLeadUserIds, notifyUsers, parentUserIdsForStudents, studentUserIds } from "./notify";
import { chicagoDate } from "./calendarDates";
import { formatChicagoDay, formatChicagoTime } from "./reminderSchedule";

/**
 * Instant notifications and staff digest items raised by app mutations. Each hook site calls exactly one helper here.
 *
 * Text follows the PII rule in lib/notify.ts: event names, dates and places only; never amounts, health, rooming details
 * or any student's name. Every send that can reach a Parent uses a per-event `dedupeKey`, so a Parent with several
 * students on the same event gets one notification for it.
 *
 * Recurring series: create the series with ONE `notifyEventSeriesCreated` call. Per-occurrence enrollment must NOT call
 * `notifyEventAssigned` for each occurrence (that would send one push per meeting).
 */

type Event = Doc<"events">;

const eventUrl = (eventId: Id<"events">) => `/events/${eventId}`;
const when = (ms: number) => `${formatChicagoDay(ms)} at ${formatChicagoTime(ms)}`;
const ended = (event: Event) => event.archived || event.endsAt < Date.now();

async function studentsAndParents(ctx: MutationCtx, studentIds: Id<"students">[]) {
  return { students: await studentUserIds(ctx, studentIds), parents: await parentUserIdsForStudents(ctx, studentIds) };
}

/** Removes ids already in `taken` and adds the rest to it, so overlapping audiences get one row. */
function claim(ids: Id<"appUsers">[], taken: Set<Id<"appUsers">>) {
  const fresh = ids.filter(id => !taken.has(id));
  for (const id of fresh) taken.add(id);
  return fresh;
}

/** The signed-in account making the change, or null (Calendar sync, scheduled work). */
async function actorAppUser(ctx: MutationCtx): Promise<Doc<"appUsers"> | null> {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) return null;
  return await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", authUserId)).unique();
}

// ---------- Schedule (urgent unless a Travel Lead made the change; "Back on" is never urgent) ----------

async function participantsAndParents(ctx: MutationCtx, event: Event) {
  const { students, parents } = await studentsAndParents(ctx, await eventParticipantStudentIds(ctx, event._id));
  return [...new Set([...students, ...parents])];
}

/**
 * M1: the meeting's Mentors hear about its schedule changes: invited, accepted and self-signed-up Mentors, and a Mentor
 * creator (even one who declined their own row). Never the account that made the change.
 */
async function meetingMentorIds(ctx: MutationCtx, eventId: Id<"events">): Promise<Id<"appUsers">[]> {
  const actor = await actorAppUser(ctx);
  return (await listMeetingMentors(ctx, eventId)).filter(mentor => (mentor.isCreator || mentor.status !== "declined") && mentor.userId !== actor?._id).map(mentor => mentor.userId);
}

/**
 * Urgent only when a Coach made the change or no one is signed in (Calendar sync observed it). A Travel Lead's change
 * (a Mentor, or a Parent with Travel Lead staff access) is a normal schedule notice.
 */
async function scheduleChangeIsUrgent(ctx: MutationCtx): Promise<boolean> {
  if (!await getAuthUserId(ctx)) return true;
  return (await actorAppUser(ctx))?.role === "coach";
}

/** Students on the event, their Parents and the meeting's Mentors (M1): the event was canceled. Once per event, however often it is toggled. */
export async function notifyEventCancelled(ctx: MutationCtx, args: { eventId: Id<"events">; urgent?: boolean }): Promise<void> {
  const event = await ctx.db.get(args.eventId);
  if (!event || ended(event)) return;
  const userIds = [...new Set([...await participantsAndParents(ctx, event), ...await meetingMentorIds(ctx, event._id)])];
  if (!userIds.length) return;
  await notifyUsers(ctx, { userIds, category: "schedule", urgent: args.urgent ?? true, url: eventUrl(event._id), dedupeKey: `cancelled:${event._id}`, title: `Canceled: ${event.name}`, body: `${event.name} on ${formatChicagoDay(event.startsAt)} is canceled. Open the event for details.` });
}

/** Same audience as a cancellation: a canceled event is back on. Never urgent; once per event. */
export async function notifyEventRestored(ctx: MutationCtx, args: { eventId: Id<"events"> }): Promise<void> {
  const event = await ctx.db.get(args.eventId);
  if (!event || event.cancelled || ended(event)) return;
  const userIds = [...new Set([...await participantsAndParents(ctx, event), ...await meetingMentorIds(ctx, event._id)])];
  if (!userIds.length) return;
  await notifyUsers(ctx, { userIds, category: "schedule", urgent: false, url: eventUrl(event._id), dedupeKey: `restored:${event._id}`, title: `Back on: ${event.name}`, body: `${event.name} is back on for ${when(event.startsAt)}. Open the event for details.` });
}

/**
 * Students on the event, their Parents and the meeting's Mentors (M1): time or place changed. When the change reset permission coverage, Parents of
 * students whose form must be signed again are sent to Forms instead of the event page.
 */
export async function notifyEventChanged(ctx: MutationCtx, args: { eventId: Id<"events">; coverageReset: boolean }): Promise<void> {
  const event = await ctx.db.get(args.eventId);
  if (!event || event.cancelled || ended(event)) return;
  const studentIds = await eventParticipantStudentIds(ctx, event._id);
  const mentors = await meetingMentorIds(ctx, event._id);
  if (!studentIds.length && !mentors.length) return;
  const place = event.destination.trim();
  const body = `Now ${when(event.startsAt)}${place ? ` at ${place}` : ""}. Open the event for details.`;
  const title = `Schedule changed: ${event.name}`;
  const dedupeKey = `changed:${event._id}:${event.calendarRevision ?? 0}:${event.startsAt}:${event.endsAt}`;
  const base = { category: "schedule" as const, urgent: true, title, dedupeKey };
  const taken = new Set<Id<"appUsers">>();
  if (args.coverageReset && event.permissionRequired) {
    const rows = await ctx.db.query("permissionCoverage").withIndex("by_seasonId_and_eventId", q => q.eq("seasonId", event.seasonId).eq("eventId", event._id)).take(1000);
    const onEvent = new Set(studentIds);
    const resign = rows.filter(row => onEvent.has(row.studentId) && row.state === "required" && row.signatureRequestedAt !== undefined).map(row => row.studentId);
    const parents = claim(await parentUserIdsForStudents(ctx, resign), taken);
    if (parents.length) await notifyUsers(ctx, { ...base, userIds: parents, url: "/forms", body: `Now ${when(event.startsAt)}${place ? ` at ${place}` : ""}. A permission form needs a new signature.` });
  }
  const { students, parents } = await studentsAndParents(ctx, studentIds);
  const rest = claim([...students, ...parents, ...mentors], taken);
  if (rest.length) await notifyUsers(ctx, { ...base, userIds: rest, url: eventUrl(event._id), body });
}

/**
 * The one call for every event edit path (Coach edit, Calendar push result, Calendar-observed change). Pass the event as it
 * was before the write; this reads the saved event and sends a cancellation or a change notice when one is due.
 * Every one of those paths resets permission coverage for any time or place change (eventCalendar.invalidatePermissionCoverage),
 * so a change notice always tells Parents with a reset form to sign again.
 */
export async function notifyEventScheduleChange(ctx: MutationCtx, before: Event): Promise<void> {
  const after = await ctx.db.get(before._id);
  if (!after) return;
  if (after.cancelled && !before.cancelled) return notifyEventCancelled(ctx, { eventId: after._id, urgent: await scheduleChangeIsUrgent(ctx) });
  if (after.cancelled) return;
  if (before.cancelled) return notifyEventRestored(ctx, { eventId: after._id });
  if (after.startsAt !== before.startsAt || after.endsAt !== before.endsAt || after.destination !== before.destination) await notifyEventChanged(ctx, { eventId: after._id, coverageReset: true });
}

// ---------- Forms ----------

const PERMISSION_TEXT = {
  correction: "A permission form needs a correction. Open Forms for details.",
  newSignature: "A permission form needs a new signature. Open Forms for details.",
} as const;

/** The student's Parents: a permission form needs a correction or a new signature. */
export async function notifyPermissionNeedsAttention(ctx: MutationCtx, args: { studentId: Id<"students">; reason: keyof typeof PERMISSION_TEXT; dedupeKey: string }): Promise<void> {
  const userIds = await parentUserIdsForStudents(ctx, [args.studentId]);
  if (!userIds.length) return;
  await notifyUsers(ctx, { userIds, category: "forms", url: "/forms", dedupeKey: `permission:${args.dedupeKey}`, title: "Permission form needs attention", body: PERMISSION_TEXT[args.reason] });
}

// ---------- Events ----------

/** The student and their Parents: a Coach or Travel Lead approved, declined or promoted a signup. */
export async function notifySignupDecision(ctx: MutationCtx, args: { eventId: Id<"events">; studentId: Id<"students">; decision: "approve" | "decline" | "promote" }): Promise<void> {
  const event = await ctx.db.get(args.eventId);
  if (!event) return;
  const { students, parents } = await studentsAndParents(ctx, [args.studentId]);
  const userIds = [...students, ...parents];
  if (!userIds.length) return;
  const text = {
    approve: { title: `Signup approved: ${event.name}`, body: `The signup for ${event.name} on ${formatChicagoDay(event.startsAt)} is confirmed.` },
    promote: { title: `Off the waitlist: ${event.name}`, body: `A place opened and the signup for ${event.name} on ${formatChicagoDay(event.startsAt)} is confirmed.` },
    decline: { title: `Signup not approved: ${event.name}`, body: `The signup for ${event.name} was not approved. Open the event for details.` },
  }[args.decision];
  await notifyUsers(ctx, { userIds, category: "events", url: eventUrl(event._id), dedupeKey: `signup:${event._id}:${args.studentId}:${args.decision}:${Date.now()}`, ...text });
}

/** The student and their Parents: a withdrawal request was approved (after money posting finishes) or denied. */
export async function notifyWithdrawalDecision(ctx: MutationCtx, args: { requestId: Id<"withdrawalRequests">; approved: boolean }): Promise<void> {
  const request = await ctx.db.get(args.requestId);
  const event = request ? await ctx.db.get(request.eventId) : null;
  if (!request || !event) return;
  const { students, parents } = await studentsAndParents(ctx, [request.studentId]);
  const userIds = [...students, ...parents];
  if (!userIds.length) return;
  await notifyUsers(ctx, {
    userIds, category: "events", url: eventUrl(event._id), dedupeKey: `withdrawal:${request._id}`,
    ...(args.approved
      ? { title: `Withdrawal approved: ${event.name}`, body: `The withdrawal from ${event.name} was approved. Open the event for details.` }
      : { title: `Withdrawal not approved: ${event.name}`, body: `The withdrawal request for ${event.name} was not approved. Open the event for details.` }),
  });
}

/**
 * Students (and their Parents) newly put on an event by a Coach: assigned at creation, a Whole Team enrollment batch, or
 * added later. Deduplicated per event, so repeated batches never notify anyone twice.
 */
export async function notifyEventAssigned(ctx: MutationCtx, args: { eventId: Id<"events">; studentIds: Id<"students">[] }): Promise<void> {
  const event = await ctx.db.get(args.eventId);
  if (!event || event.cancelled || ended(event) || !args.studentIds.length) return;
  // Only students now on the event: an enrollment batch skips students who withdrew earlier.
  const onEvent: Id<"students">[] = [];
  for (const studentId of new Set(args.studentIds)) {
    const row = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", studentId)).first();
    if (row && row.status !== "withdrawn") onEvent.push(studentId);
  }
  const { students, parents } = await studentsAndParents(ctx, onEvent);
  const base = { category: "events" as const, url: eventUrl(event._id), dedupeKey: `assigned:${event._id}` };
  const body = `${when(event.startsAt)}. Open the event for details.`;
  if (students.length) await notifyUsers(ctx, { ...base, userIds: students, title: `You're assigned to ${event.name}`, body });
  const parentIds = parents.filter(id => !students.includes(id));
  if (parentIds.length) await notifyUsers(ctx, { ...base, userIds: parentIds, title: `New event for your student: ${event.name}`, body });
}

/** Eligible students and their Parents: a new open or approval-signup event. */
export async function notifyEventOpenForSignup(ctx: MutationCtx, args: { eventId: Id<"events"> }): Promise<void> {
  const event = await ctx.db.get(args.eventId);
  if (!event || event.signupMode === "assigned" || event.cancelled || ended(event)) return;
  if (event.signupClosesAt !== undefined && event.signupClosesAt < Date.now()) return;
  const { students, parents } = await studentsAndParents(ctx, await eventEligibleStudentIds(ctx, event));
  const title = `New event: ${event.name}, ${formatChicagoDay(event.startsAt)}`;
  const by = event.signupClosesAt === undefined ? "" : ` by ${when(event.signupClosesAt)}`;
  const base = { category: "events" as const, url: eventUrl(event._id), dedupeKey: `open:${event._id}`, title };
  if (students.length) await notifyUsers(ctx, { ...base, userIds: students, body: `Sign up${by}. Open the event for details.` });
  const parentIds = parents.filter(id => !students.includes(id));
  if (parentIds.length) await notifyUsers(ctx, { ...base, userIds: parentIds, body: `Your student can sign up${by}. Open the event for details.` });
}

/**
 * admin.createEvent's one call: open/approval events go to eligible students; Coach-assigned events (selected students or
 * Travel Team) go to the assigned students. Whole Team events notify per enrollment batch (eventEnrollment.processPage).
 */
export async function notifyEventCreated(ctx: MutationCtx, args: { eventId: Id<"events">; assignedStudentIds: Id<"students">[] }): Promise<void> {
  const event = await ctx.db.get(args.eventId);
  if (!event) return;
  if (event.signupMode !== "assigned") await notifyEventOpenForSignup(ctx, { eventId: event._id });
  else if (event.assignmentScope !== "wholeTeam") await notifyEventAssigned(ctx, { eventId: event._id, studentIds: args.assignedStudentIds });
}

/**
 * For the recurring-meetings sprint (no callers yet): ONE notification for a whole new series, linking to its first
 * occurrence. Students get it with their Parents; staff ids are notified as-is.
 */
export async function notifyEventSeriesCreated(ctx: MutationCtx, args: { eventId: Id<"events">; seriesName: string; studentIds?: Id<"students">[]; staffUserIds?: Id<"appUsers">[] }): Promise<void> {
  const event = await ctx.db.get(args.eventId);
  if (!event || event.cancelled) return;
  const { students, parents } = await studentsAndParents(ctx, args.studentIds ?? []);
  const userIds = [...new Set([...students, ...parents, ...args.staffUserIds ?? []])];
  if (!userIds.length) return;
  await notifyUsers(ctx, { userIds, category: "events", url: eventUrl(event._id), dedupeKey: `series:${event._id}`, title: `New recurring event: ${args.seriesName}`, body: `Starts ${when(event.startsAt)}. Open the event for the full schedule.` });
}

/** For the staff-invite sprint (no callers yet): staff invited to help at an event. */
export async function notifyStaffInvited(ctx: MutationCtx, args: { eventId: Id<"events">; staffUserIds: Id<"appUsers">[] }): Promise<void> {
  const event = await ctx.db.get(args.eventId);
  if (!event || event.cancelled || !args.staffUserIds.length) return;
  await notifyUsers(ctx, { userIds: args.staffUserIds, category: "events", url: eventUrl(event._id), dedupeKey: `staff-invite:${event._id}`, title: `You're invited to help: ${event.name}`, body: `${when(event.startsAt)}. Open the event for details.` });
}

// ---------- Travel ----------

const ROOM_TEXT = {
  invited: (name: string) => ({ title: `Room invitation: ${name}`, body: "A teammate invited you to a room group. Open Rooming to answer." }),
  joined: (name: string) => ({ title: `Room group updated: ${name}`, body: "Someone accepted an invitation to your room group. Open Rooming for details." }),
  finalized: (name: string) => ({ title: `Room finalized: ${name}`, body: "Your room is final. Open Rooming for details." }),
} as const;

/** Students only (rooming is never sent to Parents here): a room invitation, a teammate joining, or a finalized room. */
export async function notifyRoomUpdate(ctx: MutationCtx, args: { eventId: Id<"events">; studentIds: Id<"students">[]; kind: keyof typeof ROOM_TEXT; dedupeKey?: string }): Promise<void> {
  const event = await ctx.db.get(args.eventId);
  if (!event || event.cancelled || ended(event)) return;
  const userIds = await studentUserIds(ctx, args.studentIds);
  if (!userIds.length) return;
  await notifyUsers(ctx, { userIds, category: "travel", url: `${eventUrl(event._id)}/rooming`, ...(args.dedupeKey ? { dedupeKey: `room:${args.dedupeKey}` } : {}), ...ROOM_TEXT[args.kind](event.name) });
}

// ---------- Accounts ----------

/**
 * The new student: their join request was approved. Category "announcements": it is a team welcome, not about an event,
 * and it is one of the categories a student can see (events would misfile it under event activity).
 * It links to setup so the Inbox navigates there; only Home-linked team announcements open in place.
 */
export async function notifyJoinApproved(ctx: MutationCtx, args: { userId: Id<"appUsers">; requestId: Id<"joinRequests"> }): Promise<void> {
  await notifyUsers(ctx, { userIds: [args.userId], category: "announcements", url: "/setup", dedupeKey: `join:${args.requestId}`, title: "Welcome to the team", body: "A Coach approved your request to join. Open Venom Status to finish setting up." });
}

// ---------- D3: staff to-do digest (inbox now, one push with the daily digest) ----------

async function queueStaff(ctx: MutationCtx, args: { kind: "withdrawalRequest" | "signupPending" | "joinRequest" | "profileCorrection"; url: string; title: string; body: string }) {
  const userIds = await coachAndTravelLeadUserIds(ctx);
  if (!userIds.length) return;
  await queueDigestItem(ctx, { userIds, category: "staff", kind: args.kind, url: args.url, inboxTitle: args.title, inboxBody: args.body });
}

export async function queueWithdrawalRequestDigest(ctx: MutationCtx): Promise<void> {
  await queueStaff(ctx, { kind: "withdrawalRequest", url: "/withdrawals", title: "Withdrawal request to review", body: "A student asked to withdraw from an event. Open Withdrawals to review." });
}

/** A new signup waiting for approval on an approval-mode event. */
export async function queueSignupPendingDigest(ctx: MutationCtx, args: { eventId: Id<"events"> }): Promise<void> {
  const event = await ctx.db.get(args.eventId);
  if (!event) return;
  await queueStaff(ctx, { kind: "signupPending", url: eventUrl(event._id), title: `Signup to review: ${event.name}`, body: "A signup is waiting for approval. Open the event to review it." });
}

export async function queueJoinRequestDigest(ctx: MutationCtx): Promise<void> {
  await queueStaff(ctx, { kind: "joinRequest", url: "/enroll", title: "Join request to review", body: "Someone asked to join the team. Open Join requests to review." });
}

export async function queueProfileCorrectionDigest(ctx: MutationCtx): Promise<void> {
  await queueStaff(ctx, { kind: "profileCorrection", url: "/adults", title: "Profile correction to review", body: "A family asked for a profile correction. Open the review list to decide." });
}

// ---------- Mentor meetings: 5 PM digest for Mentors ("mentorEvents" category, see lib/notificationDigestRules.ts) ----------

/**
 * M4: Mentors who can sign up for a new event of ANY type (selfSignupEligible: everything except events for other subteams
 * only). Mentor accounts and Parents with Mentor or Travel Lead staff access (isMentorCapable). Not the creator, not the
 * account creating it, not Mentors already invited. Queued for the 5 PM digest, once per Mentor per event. Call once when an
 * event is created; for a new series pass its first meeting.
 */
export async function queueMentorMeetingOpenDigest(ctx: MutationCtx, args: { eventId: Id<"events"> }): Promise<void> {
  const actor = await actorAppUser(ctx);
  await queueMentorMeetingOpenDigestPage(ctx, { eventId: args.eventId, cursor: null, actorId: actor?._id });
}

/** Mentor accounts read per transaction for M4; further pages run as scheduled follow-up mutations. */
export const OPEN_DIGEST_PAGE_SIZE = 200;

/** M4 page size: the default when unset; a non-finite value is refused; otherwise a whole number from 1 to MAX_DIGEST_USERS. */
export function openDigestPageSize(pageSize: number | undefined): number {
  const size = pageSize ?? OPEN_DIGEST_PAGE_SIZE;
  if (!Number.isFinite(size)) throw new ConvexError("The digest page size must be a finite number.");
  return Math.max(1, Math.min(Math.floor(size), MAX_DIGEST_USERS));
}

/** Parents with each staff-access grant queued inline on M4's last Mentor page; a longer list is paged (OpenDigestPhase). */
export const MAX_INLINE_PARENT_MENTORS = 200;

/** Which accounts an M4 page reads: Mentor accounts (by_role), or Parents with Mentor / Travel Lead staff access (by_parentStaffAccess). */
export type OpenDigestPhase = "mentor" | "parentMentor" | "parentTravelLead";
const PARENT_ACCESS = { parentMentor: "mentor", parentTravelLead: "travelLead" } as const;

/**
 * One page of M4 recipients. The "mentor" phase (the default) reads Mentor accounts by the role index (`pageSize` at a time),
 * queues the eligible ones, and while more remain schedules `internal.mentorMeetings.continueOpenDigest` for the next page, so
 * every Mentor is covered without one transaction reading them all. Its last page also covers Parents with Mentor or Travel
 * Lead staff access: a grant list of up to MAX_INLINE_PARENT_MENTORS is queued in the same transaction; a longer one is never
 * cut short but paged in its own phase ("parentMentor" / "parentTravelLead", one paginated read per transaction).
 * Re-checks the event each page. Returns the next cursor of the phase being paged, or null when that phase is done.
 */
export async function queueMentorMeetingOpenDigestPage(ctx: MutationCtx, args: { eventId: Id<"events">; cursor: string | null; actorId?: Id<"appUsers">; pageSize?: number; phase?: OpenDigestPhase }): Promise<string | null> {
  const pageSize = openDigestPageSize(args.pageSize);
  const phase = args.phase ?? "mentor";
  const event = await ctx.db.get(args.eventId);
  const now = Date.now();
  if (!event || event.cancelled || ended(event)) return null;
  const skip = new Set<Id<"appUsers">>();
  const creatorId = await eventCreatorId(ctx, event);
  if (creatorId) skip.add(creatorId);
  if (args.actorId) skip.add(args.actorId);
  for (const row of await ctx.db.query("eventMentorInvites").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(MAX_MEETING_MENTORS + 1)) skip.add(row.mentorUserId);
  const eligible = (user: Doc<"appUsers">) => isMentorCapable(user) && !skip.has(user._id) && selfSignupEligible(user, event, now);
  const place = event.destination.trim();
  const queue = async (userIds: Id<"appUsers">[]) => {
    if (!userIds.length) return;
    await queueMentorDigestItem(ctx, { userIds, kind: "mentorMeetingOpen", url: eventUrl(event._id), dedupeKey: `m4:${event._id}`, title: `${event.type === "Team" ? "New meeting" : "New event"}: ${event.name}`, body: `${when(event.startsAt)}${place ? ` at ${place}` : ""}. Open it to sign up.` });
  };
  const schedule = (next: OpenDigestPhase, cursor: string | null) => ctx.scheduler.runAfter(0, internal.mentorMeetings.continueOpenDigest, {
    eventId: args.eventId, cursor, ...(next !== "mentor" ? { phase: next } : {}), ...(args.actorId ? { actorId: args.actorId } : {}), ...(args.pageSize !== undefined ? { pageSize } : {}),
  });
  const page = phase === "mentor"
    ? await ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", "mentor")).paginate({ numItems: pageSize, cursor: args.cursor })
    : await ctx.db.query("appUsers").withIndex("by_parentStaffAccess", q => q.eq("parentStaffAccess", PARENT_ACCESS[phase])).paginate({ numItems: pageSize, cursor: args.cursor });
  await queue(page.page.filter(eligible).map(user => user._id));
  if (!page.isDone) {
    await schedule(phase, page.continueCursor);
    return page.continueCursor;
  }
  if (phase === "mentor") {
    for (const next of ["parentMentor", "parentTravelLead"] as const) {
      const parents = await ctx.db.query("appUsers").withIndex("by_parentStaffAccess", q => q.eq("parentStaffAccess", PARENT_ACCESS[next])).take(MAX_INLINE_PARENT_MENTORS + 1);
      if (parents.length > MAX_INLINE_PARENT_MENTORS) await schedule(next, null); // too many for this transaction: page them all
      else await queue(parents.filter(eligible).map(user => user._id));
    }
  }
  return null;
}

/**
 * M5: the Mentor who created the meeting (mentorMeetingCreatorId: its createdBy or the series creator, only while the event is
 * still a Mentor meeting and the creator is still a Mentor, isMentorCapable): a Mentor or student
 * signed up or dropped out, or a student signup is waiting for approval. Not sent when the creator did it, or for canceled,
 * archived or past meetings. Queued for the 5 PM digest.
 */
export async function queueMentorMeetingActivityDigest(ctx: MutationCtx, args: { eventId: Id<"events">; activity: MeetingActivity }): Promise<void> {
  const event = await ctx.db.get(args.eventId);
  if (!event || event.cancelled || ended(event)) return;
  const creatorId = await mentorMeetingCreatorId(ctx, event);
  const creator = creatorId ? await ctx.db.get(creatorId) : null;
  if (!isMentorCapable(creator)) return;
  const actor = await actorAppUser(ctx);
  if (actor?._id === creator._id) return;
  const text = MEETING_ACTIVITY[args.activity];
  // One item per meeting + actor + activity + Chicago day, so sign-up/withdraw toggling doesn't repeat for the creator.
  const dedupeKey = `m5:${event._id}:${actor?._id ?? "system"}:${args.activity}:${chicagoDate(Date.now())}`;
  await queueMentorDigestItem(ctx, { userIds: [creator._id], dedupeKey, kind: text.kind, url: eventUrl(event._id), title: text.title(event.name), body: text.body(formatChicagoDay(event.startsAt)) });
}
