import { requireSeasonFinanceReady } from "./lib/seasonFinance";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { invalidateAttendanceSession } from "./lib/attendanceReports";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { activeSeason, audit, viewer, isCoachOrTravelLead } from "./lib/access";
import { addCharge } from "./lib/money";
import { requireEnrollmentComplete } from "./lib/eventEnrollmentState";
import { RESERVED_REQUIREMENT_KEYS, activeQuestions, activeShifts, clearShifts, requirementKey } from "./lib/eventSignupExtras";
import { notifySignupDecision } from "./lib/notificationTriggers";
import { activeApprovedWithdrawal, recentWithdrawals } from "./lib/withdrawalState";

function requireOperations(user: Doc<"appUsers">) {
  if (!isCoachOrTravelLead(user)) throw new ConvexError("Only a Coach or Travel Lead can manage events.");
}

async function currentEvent(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  const season = await activeSeason(ctx);
  if (!event || event.seasonId !== season._id || event.archived) throw new ConvexError("This event is no longer active. It may have moved to Past events. Reload to see current events.");
  return event;
}

async function roster(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  const rows = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(501);
  if (rows.length > 500) throw new ConvexError("This event has too many signups to show here. Contact a Coach.");
  return rows;
}

export const workspace = query({
  args: { eventId: v.id("events") }, returns: v.any(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); requireOperations(user);
    const event = await currentEvent(ctx, args.eventId);
    const participants = await roster(ctx, event._id);
    const students = await Promise.all(participants.map(async p => {
      const student = await ctx.db.get(p.studentId);
      return { participantId: p._id, studentId: p.studentId, name: student?.legalName || student?.preferredName || "Student", status: p.status, signedUpAt: p.createdAt, active: !!student?.active };
    }));
    const requirements = await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(101);
    if (requirements.length > 100) throw new ConvexError("This event has too many requirements to show here. Contact a Coach.");
    const reserved = participants.filter(p => p.status === "pending" || p.status === "confirmed").length;
    const waitlist = students.filter(p => p.status === "waitlist").sort((a, b) => a.signedUpAt - b.signedUpAt || a.participantId.localeCompare(b.participantId));
    // Withdrawn students for "Put back on event": whether a reviewed withdrawal moved money, and whether one is still in review.
    // Display hints only, from each student's newest rows (putBackOnEvent re-checks the full history).
    const withdrawn = [];
    for (const row of students.filter(p => p.status === "withdrawn" && p.active)) {
      const requests = await recentWithdrawals(ctx, event._id, row.studentId);
      const approved = activeApprovedWithdrawal(requests);
      withdrawn.push({ ...row, moneyDecision: !!approved?.jobId, inReview: requests.some(r => r.status === "pending" || r.status === "processing") });
    }
    withdrawn.sort((a, b) => a.name.localeCompare(b.name));
    const shiftSettings = { shiftsEnabled: event.shiftsEnabled ?? false, maxShiftsPerStudent: event.maxShiftsPerStudent ?? null, minShiftsPerStudent: event.minShiftsPerStudent ?? 1, shiftCount: (await activeShifts(ctx, event._id)).length };
    return { event, canEdit: user.role === "coach", shiftSettings, questionCount: (await activeQuestions(ctx, event._id)).length, reserved, available: event.capacity === undefined ? null : Math.max(0, event.capacity - reserved), participants: students.filter(p => p.status !== "waitlist").sort((a, b) => a.name.localeCompare(b.name)), waitlist, withdrawn, requirements };
  },
});

export const reviewSignup = mutation({
  args: { eventId: v.id("events"), studentId: v.id("students"), decision: v.union(v.literal("approve"), v.literal("decline"), v.literal("promote")), reason: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx); requireOperations(user);
    const event = await currentEvent(ctx, args.eventId);
    if (event.cancelled) throw new ConvexError("This event is canceled. New signups and approvals are unavailable.");
    requireEnrollmentComplete(event);
    if (event.signupMode === "assigned") throw new ConvexError("Required events don't use signup approval. A Coach assigns students on the event roster.");
    const rows = await roster(ctx, event._id);
    const participant = rows.find(p => p.studentId === args.studentId);
    if (!participant) throw new ConvexError("This signup was removed. Reload to see the latest signups.");
    const student = await ctx.db.get(args.studentId);
    if (!student?.active || student.seasonId !== event.seasonId) throw new ConvexError("This student is no longer active in this event's season. Reload to see the latest signups.");
    if (args.decision === "decline") {
      if (participant.status !== "pending" && participant.status !== "waitlist") throw new ConvexError("Only signups Waiting for approval or Waitlisted can be declined. Reload to see the latest.");
      if (!args.reason?.trim()) throw new ConvexError("Enter a reason to decline this signup.");
      await ctx.db.patch(participant._id, { status: "withdrawn", updatedAt: Date.now() });
      await clearShifts(ctx, event._id, participant.studentId);
      await audit(ctx, user, "participants", participant._id, "declineSignup", participant.status, "withdrawn", args.reason.trim());
      await notifySignupDecision(ctx, { eventId: event._id, studentId: student._id, decision: "decline" });
      return null;
    }
    if (args.decision === "approve" && participant.status !== "pending") throw new ConvexError("Only signups Waiting for approval can be approved. Reload to see the latest.");
    if (args.decision === "promote") {
      if (participant.status !== "waitlist") throw new ConvexError("Only Waitlisted signups can be promoted. Reload to see the latest.");
      const first = rows.filter(p => p.status === "waitlist").sort((a, b) => a.createdAt - b.createdAt || a._id.localeCompare(b._id))[0];
      if (first?._id !== participant._id) throw new ConvexError("Promote the student who joined the waitlist first.");
    }
    const reserved = rows.filter(p => p.status === "pending" || p.status === "confirmed").length;
    if (event.capacity !== undefined && reserved >= event.capacity && participant.status !== "pending") throw new ConvexError("This event is full. A Coach can raise its capacity in event settings.");
    await ctx.db.patch(participant._id, { status: "confirmed", updatedAt: Date.now() });
    if (event.feeCents > 0) await addCharge(ctx, user, student._id, event.name, event.feeCents, event.startsAt, `eventFee:${event._id}:${student._id}`, event._id);
    await audit(ctx, user, "participants", participant._id, args.decision === "promote" ? "promoteWaitlist" : "approveSignup", participant.status, "confirmed", args.reason?.trim());
    await notifySignupDecision(ctx, { eventId: event._id, studentId: student._id, decision: args.decision });
    return null;
  },
});

export const updateSettings = mutation({
  args: { eventId: v.id("events"), capacity: v.optional(v.union(v.number(), v.null())), signupClosesAt: v.optional(v.union(v.number(), v.null())), roomDeadline: v.optional(v.union(v.number(), v.null())), allowWithdrawal: v.optional(v.boolean()), isOutreach: v.optional(v.boolean()) }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx);
    // A Travel Lead may only mark or unmark Outreach; every other setting stays with Coaches.
    const outreachOnly = Object.keys(args).every(key => key === "eventId" || key === "isOutreach");
    if (user.role !== "coach" && !(outreachOnly && user.role === "mentor" && user.travelLead)) throw new ConvexError(outreachOnly ? "Only a Coach or Travel Lead can mark an event as Outreach." : "Only a Coach can edit event settings.");
    const event = await currentEvent(ctx, args.eventId);
    requireEnrollmentComplete(event);
    const patch: Partial<Doc<"events">> = {};
    if (args.capacity !== undefined) {
      if (event.assignmentScope === "wholeTeam" && args.capacity !== null) throw new ConvexError("Whole Team events include every active member. Leave capacity blank.");
      if (args.capacity !== null && (!Number.isSafeInteger(args.capacity) || args.capacity < 1 || args.capacity > 500)) throw new ConvexError("Enter a capacity from 1 to 500, or leave it blank for no limit.");
      const used = (await roster(ctx, event._id)).filter(p => p.status === "pending" || p.status === "confirmed").length;
      if (args.capacity !== null && args.capacity < used) throw new ConvexError("Capacity can't be lower than the places already taken.");
      patch.capacity = args.capacity ?? undefined;
    }
    if (args.signupClosesAt !== undefined) {
      if (event.signupMode === "assigned") throw new ConvexError("Required events don't have a signup deadline. Leave it blank.");
      if (args.signupClosesAt !== null && (!Number.isFinite(args.signupClosesAt) || args.signupClosesAt > event.startsAt)) throw new ConvexError("Choose a signup deadline before the event starts.");
      patch.signupClosesAt = args.signupClosesAt ?? undefined;
    }
    if (args.roomDeadline !== undefined) {
      if (!event.overnight || !event.roomingEnabled) throw new ConvexError("This event doesn't use rooms, so it has no room deadline. Rooms apply only to overnight events set up with room choice.");
      if (args.roomDeadline !== null && (!Number.isFinite(args.roomDeadline) || args.roomDeadline > event.startsAt)) throw new ConvexError("Choose a room deadline before the event starts.");
      patch.roomDeadline = args.roomDeadline ?? undefined;
    }
    if (args.allowWithdrawal !== undefined) patch.allowWithdrawal = args.allowWithdrawal;
    if (args.isOutreach !== undefined && args.isOutreach !== (event.isOutreach ?? false)) {
      patch.isOutreach = args.isOutreach;
      // Carry the change to an already-created session so attendance is recalculated.
      const claim = event.calendarEventId ? await ctx.db.query("eventCalendarClaims").withIndex("by_calendarEventId", q => q.eq("calendarEventId", event.calendarEventId!)).unique() : null;
      const occurrence = claim ? await ctx.db.query("timeclockOccurrences").withIndex("by_source_and_sourceKey", q => q.eq("source", "calendar").eq("sourceKey", claim.calendarEventId)).unique() : null;
      const session = occurrence ? await ctx.db.query("timeclockSessions").withIndex("by_occurrenceId", q => q.eq("occurrenceId", occurrence._id)).unique() : null;
      if (session) {
        await ctx.db.patch(session._id, { outreachOverride: args.isOutreach });
        await invalidateAttendanceSession(ctx, session._id);
      }
    }
    if (Object.keys(patch).length === 0) return null;
    await ctx.db.patch(event._id, patch);
    await audit(ctx, user, "events", event._id, "updateSettings", { capacity: event.capacity, signupClosesAt: event.signupClosesAt, roomDeadline: event.roomDeadline, allowWithdrawal: event.allowWithdrawal }, patch);
    return null;
  },
});

/**
 * Adds a requirement (no key: the short name is made from the display name, unique for the event) or edits one (its key).
 * kind "info" ("Something to know") is a note only and has no due date; "checkoff" (also when omitted on a new one) is
 * checked off by a Coach or Travel Lead. Editing without kind keeps the saved kind.
 */
export const saveRequirement = mutation({
  args: { eventId: v.id("events"), key: v.optional(v.string()), label: v.string(), instructions: v.optional(v.string()), url: v.optional(v.string()), dueAt: v.optional(v.union(v.number(), v.null())), kind: v.optional(v.union(v.literal("info"), v.literal("checkoff"))) }, returns: v.object({ key: v.string() }),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); if (user.role !== "coach") throw new ConvexError("Only a Coach can edit requirements.");
    const event = await currentEvent(ctx, args.eventId);
    requireEnrollmentComplete(event);
    const label = args.label.trim();
    if (!label || label.length > 100 || (args.instructions?.length ?? 0) > 1000 || (args.url?.length ?? 0) > 500) throw new ConvexError("Check the requirement. What it says: up to 100 characters. Instructions: up to 1,000. Link: up to 500.");
    if (args.dueAt !== undefined && args.dueAt !== null && !Number.isFinite(args.dueAt)) throw new ConvexError("Enter a valid due date.");
    if (args.url && !/^https:\/\//i.test(args.url)) throw new ConvexError("Requirement links must start with https://.");
    const existing = await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(101);
    const editKey = args.key?.trim();
    const prior = editKey ? existing.find(r => r.key === editKey) ?? await ctx.db.query("requirements").withIndex("by_eventId_and_key", q => q.eq("eventId", event._id).eq("key", editKey)).unique() : null;
    if (editKey && !prior) throw new ConvexError("This requirement was removed. Reload to see the event's current requirements.");
    const kind = args.kind ?? prior?.kind ?? "checkoff";
    if (kind === "info" && prior && prior.kind !== "info") {
      // A requirement some students already have checked off keeps its records, so it can't become a note.
      const done = await ctx.db.query("requirementCompletions").withIndex("by_eventId_and_studentId_and_key", q => q.eq("eventId", event._id)).take(501);
      if (done.length > 500) throw new ConvexError("This requirement has too many student records to change here. Contact a Coach.");
      if (done.some(c => c.key === prior.key)) throw new ConvexError("Some students already have this checked off, so it can't become something to know. Add a new requirement instead.");
    }
    const values = { label, instructions: args.instructions?.trim() || undefined, url: args.url?.trim() || undefined, dueAt: kind === "info" ? undefined : args.dueAt ?? undefined, kind };
    if (prior) {
      await ctx.db.patch(prior._id, values);
      await audit(ctx, user, "requirements", `${event._id}:${prior.key}`, "update", prior, values);
      return { key: prior.key };
    }
    if (existing.length >= 100) throw new ConvexError("This event already has 100 requirements. Remove one before adding another.");
    const key = requirementKey(label, [...existing.map(r => r.key), ...RESERVED_REQUIREMENT_KEYS]);
    await ctx.db.insert("requirements", { eventId: event._id, key, ...values });
    await audit(ctx, user, "requirements", `${event._id}:${key}`, "create", null, values);
    return { key };
  },
});

export const removeRequirement = mutation({
  args: { eventId: v.id("events"), key: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); if (user.role !== "coach") throw new ConvexError("Only a Coach can edit requirements.");
    const event = await currentEvent(ctx, args.eventId);
    requireEnrollmentComplete(event);
    const prior = await ctx.db.query("requirements").withIndex("by_eventId_and_key", q => q.eq("eventId", event._id).eq("key", args.key)).unique();
    if (!prior) return null;
    const completions = await ctx.db.query("requirementCompletions").withIndex("by_eventId_and_studentId_and_key", q => q.eq("eventId", event._id)).take(501);
    if (completions.length > 500) throw new ConvexError("This requirement has too many student records to remove here. Contact a Coach.");
    if (completions.some(c => c.key === args.key)) throw new ConvexError("Students have completed this requirement, so it stays to keep their records.");
    await ctx.db.delete(prior._id);
    await audit(ctx, user, "requirements", `${event._id}:${args.key}`, "remove", prior, null);
    return null;
  },
});
