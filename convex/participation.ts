import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { activeSeason, audit, ownStudent, viewer } from "./lib/access";
import { addCharge } from "./lib/money";

async function reserved(ctx: MutationCtx, eventId: Id<"events">) {
  const rows = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(501);
  if (rows.length > 500) throw new Error("Event roster limit reached; capacity cannot be checked safely.");
  return rows.filter(x => x.status === "confirmed" || x.status === "pending").length;
}

export const signUp = mutation({
  args: { eventId: v.id("events") }, returns: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("waitlist")),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); const student = await ownStudent(ctx, user);
    const event = await ctx.db.get(args.eventId); const season = await activeSeason(ctx);
    if (!event || event.seasonId !== season._id || student.seasonId !== season._id || event.archived || event.signupMode === "assigned") throw new Error("Signup is unavailable.");
    if (event.signupClosesAt !== undefined && Date.now() > event.signupClosesAt) throw new Error("Signup has closed.");
    const prior = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    if (prior && prior.status !== "withdrawn") return prior.status;
    const withdrawal = await ctx.db.query("withdrawalRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(100);
    if (withdrawal.some(x => x.status === "approved")) throw new Error("A Coach must review reenrollment after an approved withdrawal.");
    const waiting = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(501);
    if (waiting.length > 500) throw new Error("Event roster limit reached.");
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

export const withdraw = mutation({
  args: { eventId: v.id("events") }, returns: v.null(),
  handler: async () => {
    throw new Error("Submit a withdrawal request for Coach or Travel Lead review.");
  },
});

export const setParticipation = mutation({
  args: { eventId: v.id("events"), studentId: v.id("students"), status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("waitlist"), v.literal("withdrawn")), reason: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !user.travelLead) throw new Error("Participation edit denied.");
    const event = await ctx.db.get(args.eventId); const student = await ctx.db.get(args.studentId); const season = await activeSeason(ctx);
    if (!event || event.archived || !student || !student.active || event.seasonId !== season._id || student.seasonId !== season._id) throw new Error("Student or event not found.");
    if (event.signupMode === "assigned" && user.role !== "coach") throw new Error("Required-event roster is coach only.");
    if (event.signupMode === "assigned" && (args.status === "pending" || args.status === "waitlist")) throw new Error("Required events cannot have pending or waitlisted participants.");
    const prior = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    if (args.status === "withdrawn") throw new Error("Use a reviewed withdrawal decision to remove participation.");
    if (prior?.status === args.status) return null;
    if (args.status === "confirmed" || args.status === "pending" || args.status === "waitlist") {
      const withdrawals = await ctx.db.query("withdrawalRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(100);
      if (withdrawals.some(x => x.status === "approved")) throw new Error("A Coach must review reenrollment after an approved withdrawal.");
    }
    if (prior?.status === "confirmed" && (args.status === "pending" || args.status === "waitlist")) throw new Error("Reconcile confirmed participation before changing its status.");
    if (prior?.status === "waitlist" && args.status !== "waitlist") throw new Error("Use manual waitlist promotion in event operations.");
    if (event.signupMode !== "assigned" && args.status !== "waitlist" && prior?.status !== "confirmed" && prior?.status !== "pending") {
      const queue = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(501);
      if (queue.length > 500) throw new Error("Event roster limit reached.");
      if (queue.some(p => p.status === "waitlist")) throw new Error("Promote the waitlist before adding another reserved place.");
    }
    const takesSeat = args.status === "confirmed" || args.status === "pending";
    const alreadyReserved = prior?.status === "confirmed" || prior?.status === "pending";
    if (takesSeat && !alreadyReserved && event.capacity !== undefined && await reserved(ctx, event._id) >= event.capacity) throw new Error("Event capacity is full.");
    const now = Date.now();
    if (prior) await ctx.db.patch(prior._id, { status: args.status, createdAt: prior.status === "withdrawn" ? now : prior.createdAt, updatedAt: now });
    else await ctx.db.insert("participants", { eventId: event._id, studentId: student._id, status: args.status, createdAt: now, updatedAt: now });
    if (args.status === "confirmed" && event.feeCents > 0) await addCharge(ctx, user, student._id, event.name, event.feeCents, event.startsAt, `eventFee:${event._id}:${student._id}`, event._id);
    await audit(ctx, user, "participants", `${event._id}:${student._id}`, "setStatus", prior?.status ?? null, args.status, args.reason);
    return null;
  },
});

export const recordRequirement = mutation({
  args: { eventId: v.id("events"), studentId: v.id("students"), key: v.string(), complete: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !user.travelLead) throw new Error("Requirement edit denied.");
    const event = await ctx.db.get(args.eventId); const student = await ctx.db.get(args.studentId);
    const season = await activeSeason(ctx);
    if (!event || !student || !student.active || event.seasonId !== season._id || student.seasonId !== season._id || ["pay", "perm", "room"].includes(args.key)) throw new Error("Invalid requirement.");
    if (args.key !== "first") {
      const requirement = await ctx.db.query("requirements").withIndex("by_eventId_and_key", q => q.eq("eventId", event._id).eq("key", args.key)).unique();
      if (!requirement) throw new Error("Requirement not found.");
    }
    const prior = await ctx.db.query("requirementCompletions").withIndex("by_eventId_and_studentId_and_key", q => q.eq("eventId", event._id).eq("studentId", student._id).eq("key", args.key)).unique();
    if (args.complete && !prior) await ctx.db.insert("requirementCompletions", { eventId: event._id, studentId: student._id, key: args.key, completedAt: Date.now(), completedBy: user._id });
    if (!args.complete && prior) await ctx.db.delete(prior._id);
    await audit(ctx, user, "requirements", `${event._id}:${student._id}:${args.key}`, "setCompletion", !!prior, args.complete);
    return null;
  },
});
