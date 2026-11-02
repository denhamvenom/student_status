import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { effectiveChargeCents } from "./lib/chargeObligation";
import { eventEligibleStudentIds } from "./lib/eventAudience";
import { effectiveChargeDueAt } from "./lib/feeDefinitions";
import { notifyUsers, parentUserIdsForStudents, studentUserIds } from "./lib/notify";
import { permissionAccepted } from "./lib/permissionCoverage";
import {
  chicagoDateKey, chicagoDayWindow, deadlineReminderDue, formatChicagoDay, formatChicagoTime, R2_DAYS_BEFORE, remindersDue, shouldSendUnpaidReminder, type ReminderKind,
} from "./lib/reminderSchedule";

/**
 * Scheduled reminders R1–R7. The hourly cron calls `hourly`, which starts each reminder only at its Chicago local hour
 * (see lib/reminderSchedule.ts). Every pass is paginated with continuation scheduling, and every send uses a notifyUsers
 * dedupeKey (per user), so re-runs are harmless. Text follows the PII rule in lib/notify.ts: no amounts, health, rooming or other students' names.
 */
const EVENTS_PER_PAGE = 25;
const PEOPLE_PER_PAGE = 100;
const STUDENTS_PER_PAGE = 25;
const CHARGES_PER_STUDENT = 100;
const REQUIREMENTS_PER_EVENT = 50;

const kind = v.union(v.literal("r1EventTomorrow"), v.literal("r2PermissionMissing"), v.literal("r3SignupCloses"), v.literal("r4RoomingDeadline"), v.literal("r5RequirementDue"), v.literal("r6UnpaidBalance"), v.literal("r7SetupUnfinished"));
type RunArgs = { kind: ReminderKind; now: number; cursor: string | null };
type EventArgs = { kind: ReminderKind; eventId: Id<"events">; now: number; cursor: string | null; tag: string; requirementId?: Id<"requirements"> };
const runRef = makeFunctionReference<"mutation", RunArgs, null>("notificationReminders:run");
const eventRef = makeFunctionReference<"mutation", EventArgs, null>("notificationReminders:runEvent");
const chargesRef = makeFunctionReference<"mutation", { studentId: Id<"students">; now: number; cursor: string | null }, null>("notificationReminders:runCharges");

async function activeSeasonOrNull(ctx: MutationCtx) {
  return await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
}

const live = (event: Doc<"events">) => !event.archived && !event.cancelled;
const within = (ms: number, window: { start: number; end: number }) => ms >= window.start && ms < window.end;

export const hourly = internalMutation({
  args: {}, returns: v.null(),
  handler: async ctx => {
    const now = Date.now();
    for (const reminder of remindersDue(now)) await ctx.scheduler.runAfter(0, runRef, { kind: reminder, now, cursor: null });
    return null;
  },
});

/** One page of the reminder's driving list: upcoming events (R1–R5) or active students (R6/R7). */
export const run = internalMutation({
  args: { kind, now: v.number(), cursor: v.union(v.string(), v.null()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const season = await activeSeasonOrNull(ctx);
    if (!season) return null;
    if (args.kind === "r6UnpaidBalance" || args.kind === "r7SetupUnfinished") {
      const page = await ctx.db.query("students").withIndex("by_seasonId_and_active", q => q.eq("seasonId", season._id).eq("active", true)).paginate({ numItems: STUDENTS_PER_PAGE, cursor: args.cursor });
      for (const student of page.page) {
        if (args.kind === "r6UnpaidBalance") await unpaidBalance(ctx, student, args.now);
        else await setupUnfinished(ctx, student, args.now);
      }
      if (!page.isDone) await ctx.scheduler.runAfter(0, runRef, { ...args, cursor: page.continueCursor });
      return null;
    }
    const page = await ctx.db.query("events").withIndex("by_seasonId_and_archived_and_endsAt", q => q.eq("seasonId", season._id).eq("archived", false).gte("endsAt", args.now)).paginate({ numItems: EVENTS_PER_PAGE, cursor: args.cursor });
    for (const event of page.page) {
      if (!live(event)) continue;
      const start = (tag: string, requirementId?: Id<"requirements">) => ctx.scheduler.runAfter(0, eventRef, { kind: args.kind, eventId: event._id, now: args.now, cursor: null, tag, ...(requirementId ? { requirementId } : {}) });
      if (args.kind === "r1EventTomorrow") {
        const tomorrow = chicagoDayWindow(args.now, 1);
        if (within(event.startsAt, tomorrow)) await start(tomorrow.dateKey);
      } else if (args.kind === "r2PermissionMissing") {
        if (!event.permissionRequired) continue;
        for (const days of R2_DAYS_BEFORE) if (within(event.startsAt, chicagoDayWindow(args.now, days))) await start(`${days}d:${chicagoDateKey(event.startsAt)}`);
      } else if (args.kind === "r3SignupCloses") {
        if (event.signupMode !== "assigned" && event.signupClosesAt !== undefined && deadlineReminderDue(args.now, event.signupClosesAt)) await start(String(event.signupClosesAt));
      } else if (args.kind === "r4RoomingDeadline") {
        if (event.roomingEnabled && event.roomDeadline !== undefined && deadlineReminderDue(args.now, event.roomDeadline)) await start(String(event.roomDeadline));
      } else if (args.kind === "r5RequirementDue") {
        const requirements = await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(REQUIREMENTS_PER_EVENT);
        for (const requirement of requirements) if (requirement.dueAt !== undefined && deadlineReminderDue(args.now, requirement.dueAt)) await start(String(requirement.dueAt), requirement._id);
      }
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, runRef, { ...args, cursor: page.continueCursor });
    return null;
  },
});

/** One page of people for one event (or one requirement). */
export const runEvent = internalMutation({
  args: { kind, eventId: v.id("events"), now: v.number(), cursor: v.union(v.string(), v.null()), tag: v.string(), requirementId: v.optional(v.id("requirements")) }, returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event || !live(event)) return null;
    const url = `/events/${event._id}`;
    if (args.kind === "r3SignupCloses") {
      // Eligibility is a list, not a query, so the cursor is an offset into it.
      const offset = Number(args.cursor ?? 0);
      const eligible = await eventEligibleStudentIds(ctx, event);
      const slice = eligible.slice(offset, offset + PEOPLE_PER_PAGE);
      const missing: Id<"students">[] = [];
      for (const studentId of slice) if (!await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", studentId)).first()) missing.push(studentId);
      const userIds = await studentUserIds(ctx, missing);
      if (userIds.length) await notifyUsers(ctx, { userIds, category: "events", url, dedupeKey: `r3:${event._id}:${args.tag}`, title: `Sign-up closes soon: ${event.name}`, body: `Sign-up closes ${formatChicagoDay(event.signupClosesAt!)} at ${formatChicagoTime(event.signupClosesAt!)}. Sign up if you plan to go.` });
      if (offset + PEOPLE_PER_PAGE < eligible.length) await ctx.scheduler.runAfter(0, eventRef, { ...args, cursor: String(offset + PEOPLE_PER_PAGE) });
      return null;
    }
    const page = await ctx.db.query("participants").withIndex("by_eventId_and_status", q => q.eq("eventId", event._id).eq("status", "confirmed")).paginate({ numItems: PEOPLE_PER_PAGE, cursor: args.cursor });
    const studentIds = page.page.map(row => row.studentId);
    if (args.kind === "r1EventTomorrow") {
      const userIds = [...await studentUserIds(ctx, studentIds), ...await parentUserIdsForStudents(ctx, studentIds)];
      const place = event.destination.trim();
      if (userIds.length) await notifyUsers(ctx, { userIds, category: "events", url, dedupeKey: `r1:${event._id}:${args.tag}`, title: `Tomorrow: ${event.name}`, body: `Starts at ${formatChicagoTime(event.startsAt)}${place ? ` at ${place}` : ""}.` });
    } else if (args.kind === "r2PermissionMissing") {
      const missing: Id<"students">[] = [];
      for (const studentId of studentIds) if (!await permissionAccepted(ctx, studentId, event._id) && await permissionNeedsParent(ctx, studentId, event._id)) missing.push(studentId);
      const userIds = await parentUserIdsForStudents(ctx, missing);
      if (userIds.length) await notifyUsers(ctx, { userIds, category: "forms", url: "/forms", dedupeKey: `r2:${event._id}:${args.tag}`, title: "Permission form needed", body: `${event.name} is on ${formatChicagoDay(event.startsAt)}. A permission form still needs your signature.` });
    } else if (args.kind === "r4RoomingDeadline") {
      const unroomed: Id<"students">[] = [];
      for (const studentId of studentIds) if (!await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", studentId)).first()) unroomed.push(studentId);
      const userIds = await studentUserIds(ctx, unroomed);
      if (userIds.length) await notifyUsers(ctx, { userIds, category: "travel", url: `${url}/rooming`, dedupeKey: `r4:${event._id}:${args.tag}`, title: `Choose a room: ${event.name}`, body: `Room choices close ${formatChicagoDay(event.roomDeadline!)} at ${formatChicagoTime(event.roomDeadline!)}.` });
    } else if (args.kind === "r5RequirementDue" && args.requirementId) {
      const requirement = await ctx.db.get(args.requirementId);
      if (!requirement || requirement.eventId !== event._id || requirement.dueAt === undefined) return null;
      const open: Id<"students">[] = [];
      for (const studentId of studentIds) if (!await ctx.db.query("requirementCompletions").withIndex("by_eventId_and_studentId_and_key", q => q.eq("eventId", event._id).eq("studentId", studentId).eq("key", requirement.key)).first()) open.push(studentId);
      const userIds = [...await studentUserIds(ctx, open), ...await parentUserIdsForStudents(ctx, open)];
      if (userIds.length) await notifyUsers(ctx, { userIds, category: "events", url, dedupeKey: `r5:${requirement._id}:${args.tag}`, title: `Due soon: ${requirement.label}`, body: `For ${event.name}, due ${formatChicagoDay(requirement.dueAt)} at ${formatChicagoTime(requirement.dueAt)}.` });
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, eventRef, { ...args, cursor: page.continueCursor });
    return null;
  },
});

/** A parent action is still needed: no coverage yet, still required, or sent back for correction (pending review is not the parent's turn). */
async function permissionNeedsParent(ctx: MutationCtx, studentId: Id<"students">, eventId: Id<"events">) {
  const coverage = await ctx.db.query("permissionCoverage").withIndex("by_studentId_and_eventId", q => q.eq("studentId", studentId).eq("eventId", eventId)).unique();
  return !coverage || coverage.state === "required" || coverage.state === "correction";
}

/** True when any of these charges alone warrants R6 (shouldSendUnpaidReminder is "parity Monday, or any charge due soon"). */
async function anyChargeWarrantsReminder(ctx: MutationCtx, charges: Doc<"charges">[], now: number) {
  for (const charge of charges) {
    let unpaid: boolean;
    try { unpaid = effectiveChargeCents(charge) > charge.appliedCents; } catch { continue; }
    if (unpaid && shouldSendUnpaidReminder(now, [await effectiveChargeDueAt(ctx, charge)])) return true;
  }
  return false;
}

async function sendUnpaidReminder(ctx: MutationCtx, studentId: Id<"students">, now: number) {
  const userIds = await parentUserIdsForStudents(ctx, [studentId]);
  if (userIds.length) await notifyUsers(ctx, { userIds, category: "money", url: "/finances", dedupeKey: `r6:${chicagoDateKey(now)}`, title: "Balance reminder", body: "There is an unpaid balance on your student's account. Open Money to review it." });
}

/**
 * R6 for one student: Parents hear about an unpaid balance on parity Mondays, or any Monday a charge is due within seven
 * days. A student with more charges than one page is checked by `runCharges`, which pages through all of them.
 */
async function unpaidBalance(ctx: MutationCtx, student: Doc<"students">, now: number) {
  const charges = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", student._id)).take(CHARGES_PER_STUDENT + 1);
  if (charges.length > CHARGES_PER_STUDENT) {
    await ctx.scheduler.runAfter(0, chargesRef, { studentId: student._id, now, cursor: null });
    return;
  }
  if (await anyChargeWarrantsReminder(ctx, charges, now)) await sendUnpaidReminder(ctx, student._id, now);
}

/** One page of a student's charges for R6; stops at the first charge that warrants the reminder. */
export const runCharges = internalMutation({
  args: { studentId: v.id("students"), now: v.number(), cursor: v.union(v.string(), v.null()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const student = await ctx.db.get(args.studentId);
    if (!student?.active) return null;
    const page = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", student._id)).paginate({ numItems: CHARGES_PER_STUDENT, cursor: args.cursor });
    if (await anyChargeWarrantsReminder(ctx, page.page, args.now)) await sendUnpaidReminder(ctx, student._id, args.now);
    else if (!page.isDone) await ctx.scheduler.runAfter(0, chargesRef, { ...args, cursor: page.continueCursor });
    return null;
  },
});

/** R7 for one student: unfinished Student setup or no linked Parent reaches the Student; an unconfirmed parent profile reaches linked Parents. */
async function setupUnfinished(ctx: MutationCtx, student: Doc<"students">, now: number) {
  const dedupeKey = `r7:${chicagoDateKey(now)}`;
  const parents = await parentUserIdsForStudents(ctx, [student._id]);
  const studentIncomplete = student.profileCompletedAt === undefined;
  if (studentIncomplete || !parents.length) {
    const userIds = await studentUserIds(ctx, [student._id]);
    if (userIds.length) await notifyUsers(ctx, { userIds, category: "events", url: "/setup", dedupeKey, title: "Finish your setup", body: studentIncomplete ? "Your profile setup isn't finished yet. It only takes a few minutes." : "Link a parent or guardian to your account to finish setup." });
  }
  const parentIncomplete = !student.consentProfileV2CompletedAt || !student.consentProfileV2ConfirmedBy || !student.consentProfileV2;
  if (parentIncomplete && parents.length) await notifyUsers(ctx, { userIds: parents, category: "forms", url: "/setup", dedupeKey, title: "Finish your student's setup", body: "Your student's profile still needs a parent or guardian to review and confirm it." });
}
