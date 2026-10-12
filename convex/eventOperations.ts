import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { activeSeason, audit, viewer } from "./lib/access";
import { addCharge } from "./lib/money";

function requireOperations(user: Doc<"appUsers">) {
  if (user.role !== "coach" && !user.travelLead) throw new Error("Event operations require a Coach or Travel Lead.");
}

async function currentEvent(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  const season = await activeSeason(ctx);
  if (!event || event.seasonId !== season._id || event.archived) throw new Error("Active event not found.");
  return event;
}

async function roster(ctx: QueryCtx | MutationCtx, eventId: Id<"events">) {
  const rows = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(501);
  if (rows.length > 500) throw new Error("Event roster limit reached.");
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
      return { participantId: p._id, studentId: p.studentId, name: student?.preferredName || student?.legalName || "Student", status: p.status, signedUpAt: p.createdAt, active: !!student?.active };
    }));
    const requirements = await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(101);
    if (requirements.length > 100) throw new Error("Requirement limit reached.");
    const reserved = participants.filter(p => p.status === "pending" || p.status === "confirmed").length;
    const waitlist = students.filter(p => p.status === "waitlist").sort((a, b) => a.signedUpAt - b.signedUpAt || a.participantId.localeCompare(b.participantId));
    return { event, canEdit: user.role === "coach", reserved, available: event.capacity === undefined ? null : Math.max(0, event.capacity - reserved), participants: students.filter(p => p.status !== "waitlist").sort((a, b) => a.name.localeCompare(b.name)), waitlist, requirements };
  },
});

export const reviewSignup = mutation({
  args: { eventId: v.id("events"), studentId: v.id("students"), decision: v.union(v.literal("approve"), v.literal("decline"), v.literal("promote")), reason: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); requireOperations(user);
    const event = await currentEvent(ctx, args.eventId);
    if (event.signupMode === "assigned") throw new Error("Required event assignments use the Coach roster.");
    const rows = await roster(ctx, event._id);
    const participant = rows.find(p => p.studentId === args.studentId);
    if (!participant) throw new Error("Signup not found.");
    const student = await ctx.db.get(args.studentId);
    if (!student?.active || student.seasonId !== event.seasonId) throw new Error("Student is unavailable.");
    if (args.decision === "decline") {
      if (participant.status !== "pending" && participant.status !== "waitlist") throw new Error("Only pending or waitlisted signups can be declined.");
      if (!args.reason?.trim()) throw new Error("A reason is required to decline a signup.");
      await ctx.db.patch(participant._id, { status: "withdrawn", updatedAt: Date.now() });
      await audit(ctx, user, "participants", participant._id, "declineSignup", participant.status, "withdrawn", args.reason.trim());
      return null;
    }
    if (args.decision === "approve" && participant.status !== "pending") throw new Error("Only pending signups can be approved.");
    if (args.decision === "promote") {
      if (participant.status !== "waitlist") throw new Error("Only waitlisted signups can be promoted.");
      const first = rows.filter(p => p.status === "waitlist").sort((a, b) => a.createdAt - b.createdAt || a._id.localeCompare(b._id))[0];
      if (first?._id !== participant._id) throw new Error("Promote the earliest waitlisted signup first.");
    }
    const reserved = rows.filter(p => p.status === "pending" || p.status === "confirmed").length;
    if (event.capacity !== undefined && reserved >= event.capacity && participant.status !== "pending") throw new Error("Event capacity is full.");
    await ctx.db.patch(participant._id, { status: "confirmed", updatedAt: Date.now() });
    if (event.feeCents > 0) await addCharge(ctx, user, student._id, event.name, event.feeCents, event.startsAt, `eventFee:${event._id}:${student._id}`, event._id);
    await audit(ctx, user, "participants", participant._id, args.decision === "promote" ? "promoteWaitlist" : "approveSignup", participant.status, "confirmed", args.reason?.trim());
    return null;
  },
});

export const updateSettings = mutation({
  args: { eventId: v.id("events"), capacity: v.optional(v.union(v.number(), v.null())), signupClosesAt: v.optional(v.union(v.number(), v.null())), roomDeadline: v.optional(v.union(v.number(), v.null())), allowWithdrawal: v.optional(v.boolean()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach") throw new Error("Only a Coach can edit event settings.");
    const event = await currentEvent(ctx, args.eventId);
    const patch: Partial<Doc<"events">> = {};
    if (args.capacity !== undefined) {
      if (args.capacity !== null && (!Number.isSafeInteger(args.capacity) || args.capacity < 1 || args.capacity > 500)) throw new Error("Capacity must be between 1 and 500.");
      const used = (await roster(ctx, event._id)).filter(p => p.status === "pending" || p.status === "confirmed").length;
      if (args.capacity !== null && args.capacity < used) throw new Error("Capacity cannot be below reserved places.");
      patch.capacity = args.capacity ?? undefined;
    }
    if (args.signupClosesAt !== undefined) {
      if (event.signupMode === "assigned") throw new Error("Required events do not have a signup deadline.");
      if (args.signupClosesAt !== null && (!Number.isFinite(args.signupClosesAt) || args.signupClosesAt > event.startsAt)) throw new Error("Signup deadline must be before the event.");
      patch.signupClosesAt = args.signupClosesAt ?? undefined;
    }
    if (args.roomDeadline !== undefined) {
      if (!event.overnight || !event.roomingEnabled) throw new Error("Rooming is unavailable for this event.");
      if (args.roomDeadline !== null && (!Number.isFinite(args.roomDeadline) || args.roomDeadline > event.startsAt)) throw new Error("Room deadline must be before the event.");
      patch.roomDeadline = args.roomDeadline ?? undefined;
    }
    if (args.allowWithdrawal !== undefined) patch.allowWithdrawal = args.allowWithdrawal;
    if (Object.keys(patch).length === 0) return null;
    await ctx.db.patch(event._id, patch);
    await audit(ctx, user, "events", event._id, "updateSettings", { capacity: event.capacity, signupClosesAt: event.signupClosesAt, roomDeadline: event.roomDeadline, allowWithdrawal: event.allowWithdrawal }, patch);
    return null;
  },
});

export const saveRequirement = mutation({
  args: { eventId: v.id("events"), key: v.string(), label: v.string(), instructions: v.optional(v.string()), url: v.optional(v.string()), dueAt: v.optional(v.union(v.number(), v.null())) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); if (user.role !== "coach") throw new Error("Only a Coach can edit requirements.");
    const event = await currentEvent(ctx, args.eventId);
    const key = args.key.trim(); const label = args.label.trim();
    if (!/^[a-zA-Z0-9_-]{1,32}$/.test(key) || ["pay", "perm", "room", "first"].includes(key) || !label || label.length > 100 || (args.instructions?.length ?? 0) > 1000 || (args.url?.length ?? 0) > 500) throw new Error("Invalid requirement details.");
    if (args.dueAt !== undefined && args.dueAt !== null && !Number.isFinite(args.dueAt)) throw new Error("Invalid due date.");
    if (args.url && !/^https:\/\//i.test(args.url)) throw new Error("Requirement links must use HTTPS.");
    const prior = await ctx.db.query("requirements").withIndex("by_eventId_and_key", q => q.eq("eventId", event._id).eq("key", key)).unique();
    const values = { label, instructions: args.instructions?.trim() || undefined, url: args.url?.trim() || undefined, dueAt: args.dueAt ?? undefined };
    if (prior) await ctx.db.patch(prior._id, values);
    else {
      const existing = await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(101);
      if (existing.length >= 100) throw new Error("Requirement limit reached.");
      await ctx.db.insert("requirements", { eventId: event._id, key, ...values });
    }
    await audit(ctx, user, "requirements", `${event._id}:${key}`, prior ? "update" : "create", prior ?? null, values);
    return null;
  },
});

export const removeRequirement = mutation({
  args: { eventId: v.id("events"), key: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); if (user.role !== "coach") throw new Error("Only a Coach can edit requirements.");
    const event = await currentEvent(ctx, args.eventId);
    const prior = await ctx.db.query("requirements").withIndex("by_eventId_and_key", q => q.eq("eventId", event._id).eq("key", args.key)).unique();
    if (!prior) return null;
    const completions = await ctx.db.query("requirementCompletions").withIndex("by_eventId_and_studentId_and_key", q => q.eq("eventId", event._id)).take(501);
    if (completions.length > 500) throw new Error("Completion limit reached; cannot safely remove requirement.");
    if (completions.some(c => c.key === args.key)) throw new Error("A completed requirement cannot be removed; preserve its history.");
    await ctx.db.delete(prior._id);
    await audit(ctx, user, "requirements", `${event._id}:${args.key}`, "remove", prior, null);
    return null;
  },
});
