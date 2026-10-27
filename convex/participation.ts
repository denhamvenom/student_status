import { requireSeasonFinanceReady } from "./lib/seasonFinance";
import { ConvexError, v, type Infer } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import type { SignupAvailability } from "../src/features/student-home/contract";
import { activeSeason, audit, ownStudent, viewer } from "./lib/access";
import { addCharge } from "./lib/money";
import { enrollmentPending, requireEnrollmentComplete } from "./lib/eventEnrollmentState";

async function reserved(ctx: MutationCtx, eventId: Id<"events">) {
  const rows = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(501);
  if (rows.length > 500) throw new ConvexError("This event has too many signups to check open places. Contact a Coach.");
  return rows.filter(x => x.status === "confirmed" || x.status === "pending").length;
}

export const signUp = mutation({
  args: { eventId: v.id("events") }, returns: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("waitlist")),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx); const student = await ownStudent(ctx, user);
    const event = await ctx.db.get(args.eventId); const season = await activeSeason(ctx);
    if (!event || event.seasonId !== season._id || student.seasonId !== season._id || event.archived || event.cancelled || event.signupMode === "assigned") throw new ConvexError("You can't sign up for this event. It may be canceled, past, or assigned by a Coach.");
    if (event.signupClosesAt !== undefined && Date.now() > event.signupClosesAt) throw new ConvexError("Signup for this event has closed. Ask a Coach or Travel Lead if you still need to go.");
    const prior = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    if (prior && prior.status !== "withdrawn") return prior.status;
    const withdrawal = await ctx.db.query("withdrawalRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(100);
    if (withdrawal.some(x => x.status === "approved")) throw new ConvexError("You withdrew from this event. Ask a Coach to sign you up again.");
    const waiting = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(501);
    if (waiting.length > 500) throw new ConvexError("This event has too many signups to update here. Contact a Coach.");
    const full = waiting.some(p => p.status === "waitlist") || event.capacity !== undefined && waiting.filter(p => p.status === "confirmed" || p.status === "pending").length >= event.capacity;
    const status = full ? "waitlist" : event.signupMode === "approval" ? "pending" : "confirmed";
    const now = Date.now();
    if (prior) await ctx.db.patch(prior._id, { status, createdAt: now, updatedAt: now });
    else await ctx.db.insert("participants", { eventId: event._id, studentId: student._id, status, createdAt: now, updatedAt: now });
    if (status === "confirmed" && event.feeCents > 0) await addCharge(ctx, user, student._id, event.name, event.feeCents, event.startsAt, `eventFee:${event._id}:${student._id}`, event._id);
    await audit(ctx, user, "participants", `${event._id}:${student._id}`, "signup", prior?.status ?? null, status);
    return status;
  },
});

const availabilityResult = v.object({
  eventId: v.id("events"), name: v.string(), startsAt: v.number(), endsAt: v.number(), feeCents: v.number(),
  signupMode: v.union(v.literal("open"), v.literal("approval")),
  signupClosesAt: v.union(v.number(), v.null()),
  capacity: v.union(v.number(), v.null()),
  spotsLeft: v.union(v.number(), v.null()),
  outcome: v.union(v.literal("signedUp"), v.literal("waitlisted"), v.literal("waitingForApproval"), v.literal("closed")),
});
// Compile-time guard: the return validator and the shared screen contract must stay identical.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const _availabilityMatchesContract: Same<Infer<typeof availabilityResult>, SignupAvailability> = true;

/** What pressing Sign up would do right now, with signUp's rules except the close time (the browser checks that). Counts only, never names. */
export const signupAvailability = query({
  args: { eventId: v.id("events") }, returns: availabilityResult,
  handler: async (ctx, args): Promise<SignupAvailability> => {
    const user = await viewer(ctx); const student = await ownStudent(ctx, user);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.seasonId !== student.seasonId) throw new ConvexError("This event is no longer available. Reload to see current events.");
    if (event.archived) throw new ConvexError("This event has ended and moved to Past events. Any balance due for it stays in Money.");
    if (event.signupMode === "assigned") throw new ConvexError("A Coach assigns students to this event, so it has no signup. Ask a Coach if you need to go.");
    const prior = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    const signedUp = !!prior && prior.status !== "withdrawn";
    const withdrew = !signedUp && (await ctx.db.query("withdrawalRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(100)).some(x => x.status === "approved");
    const rows = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(501);
    const counted = rows.length <= 500;
    const reserved = rows.filter(p => p.status === "confirmed" || p.status === "pending").length;
    const full = rows.some(p => p.status === "waitlist") || event.capacity !== undefined && reserved >= event.capacity;
    const outcome = event.cancelled || enrollmentPending(event) || signedUp || withdrew || !counted ? "closed" as const : full ? "waitlisted" as const : event.signupMode === "approval" ? "waitingForApproval" as const : "signedUp" as const;
    return { eventId: event._id, name: event.name, startsAt: event.startsAt, endsAt: event.endsAt, feeCents: event.feeCents, signupMode: event.signupMode, signupClosesAt: event.signupClosesAt ?? null, capacity: event.capacity ?? null, spotsLeft: event.capacity === undefined || !counted ? null : Math.max(0, event.capacity - reserved), outcome };
  },
});

export const withdraw = mutation({
  args: { eventId: v.id("events") }, returns: v.null(),
  handler: async () => {
    throw new ConvexError("Send a withdrawal request instead. A Coach or Travel Lead will review it.");
  },
});

export const setParticipation = mutation({
  args: { eventId: v.id("events"), studentId: v.id("students"), status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("waitlist"), v.literal("withdrawn")), reason: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx);
    if (user.role !== "coach" && !user.travelLead) throw new ConvexError("Only a Coach or Travel Lead can change signups.");
    const event = await ctx.db.get(args.eventId); const student = await ctx.db.get(args.studentId); const season = await activeSeason(ctx);
    if (!event || event.archived || event.cancelled || !student || !student.active || event.seasonId !== season._id || student.seasonId !== season._id) throw new ConvexError("This student or event is no longer active in the current season. Reload to see the latest.");
    requireEnrollmentComplete(event);
    if (event.signupMode === "assigned" && user.role !== "coach") throw new ConvexError("Only a Coach can change signups for a required event.");
    if (event.signupMode === "assigned" && (args.status === "pending" || args.status === "waitlist")) throw new ConvexError("Students on a required event can't be Waiting for approval or Waitlisted. Choose Signed up instead.");
    const prior = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    if (args.status === "withdrawn") throw new ConvexError("To take a student off this event, use Withdrawal requests.");
    if (prior?.status === args.status) return null;
    if (args.status === "confirmed" || args.status === "pending" || args.status === "waitlist") {
      const withdrawals = await ctx.db.query("withdrawalRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(100);
      if (withdrawals.some(x => x.status === "approved")) throw new ConvexError("This student withdrew from this event. Only a Coach can sign them up again.");
    }
    if (prior?.status === "confirmed" && (args.status === "pending" || args.status === "waitlist")) throw new ConvexError("A student who is Signed up can't be moved back to Waiting for approval or Waitlisted.");
    if (prior?.status === "waitlist" && args.status !== "waitlist") throw new ConvexError("This student is Waitlisted. Use Promote on the event's signups to move them up.");
    if (event.signupMode !== "assigned" && args.status !== "waitlist" && prior?.status !== "confirmed" && prior?.status !== "pending") {
      const queue = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(501);
      if (queue.length > 500) throw new ConvexError("This event has too many signups to update here. Contact a Coach.");
      if (queue.some(p => p.status === "waitlist")) throw new ConvexError("Students are Waitlisted for this event. Promote them before adding another student.");
    }
    const takesSeat = args.status === "confirmed" || args.status === "pending";
    const alreadyReserved = prior?.status === "confirmed" || prior?.status === "pending";
    if (takesSeat && !alreadyReserved && event.capacity !== undefined && await reserved(ctx, event._id) >= event.capacity) throw new ConvexError("This event is full. A Coach can raise its capacity in event settings.");
    const now = Date.now();
    if (prior) await ctx.db.patch(prior._id, { status: args.status, createdAt: prior.status === "withdrawn" ? now : prior.createdAt, updatedAt: now });
    else {
      if (event.assignmentScope === "wholeTeam") {
        const count = event.wholeTeamParticipantCount;
        if (count === undefined || !Number.isSafeInteger(count) || count < 0) throw new ConvexError("The signup count for this Whole Team event needs review. Contact a Coach.");
        if (count >= 500) throw new ConvexError("This Whole Team event has too many students to add more. Contact a Coach.");
        await ctx.db.patch(event._id, { wholeTeamParticipantCount: count + 1 });
      }
      await ctx.db.insert("participants", { eventId: event._id, studentId: student._id, status: args.status, createdAt: now, updatedAt: now });
    }
    if (args.status === "confirmed" && event.feeCents > 0) await addCharge(ctx, user, student._id, event.name, event.feeCents, event.startsAt, `eventFee:${event._id}:${student._id}`, event._id);
    await audit(ctx, user, "participants", `${event._id}:${student._id}`, "setStatus", prior?.status ?? null, args.status, args.reason);
    return null;
  },
});

export const recordRequirement = mutation({
  args: { eventId: v.id("events"), studentId: v.id("students"), key: v.string(), complete: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !user.travelLead) throw new ConvexError("Only a Coach or Travel Lead can update requirements.");
    const event = await ctx.db.get(args.eventId); const student = await ctx.db.get(args.studentId);
    const season = await activeSeason(ctx);
    if (!event || !student || !student.active || event.seasonId !== season._id || student.seasonId !== season._id || ["pay", "perm", "room"].includes(args.key)) throw new ConvexError("This requirement can't be updated here. Fees, permission forms and rooms update on their own pages. Reload and try again.");
    if (event.type === "Competition" && args.key === "first") throw new ConvexError("For competitions, a Coach verifies FIRST registration on the student record.");
    requireEnrollmentComplete(event);
    if (args.key !== "first") {
      const requirement = await ctx.db.query("requirements").withIndex("by_eventId_and_key", q => q.eq("eventId", event._id).eq("key", args.key)).unique();
      if (!requirement) throw new ConvexError("This requirement was removed. Reload to see the event's current requirements.");
    }
    const prior = await ctx.db.query("requirementCompletions").withIndex("by_eventId_and_studentId_and_key", q => q.eq("eventId", event._id).eq("studentId", student._id).eq("key", args.key)).unique();
    if (args.complete && !prior) await ctx.db.insert("requirementCompletions", { eventId: event._id, studentId: student._id, key: args.key, completedAt: Date.now(), completedBy: user._id });
    if (!args.complete && prior) await ctx.db.delete(prior._id);
    await audit(ctx, user, "requirements", `${event._id}:${student._id}:${args.key}`, "setCompletion", !!prior, args.complete);
    return null;
  },
});
