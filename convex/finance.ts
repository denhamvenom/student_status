import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { activeSeason, audit, viewer } from "./lib/access";
import { addCharge, allocateUnapplied, financialEntries } from "./lib/money";

function financeEditor(user: Awaited<ReturnType<typeof viewer>>) {
  if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead && user.financialEdit)) throw new Error("Financial editing is not enabled for this account.");
}

export const createCharge = mutation({
  args: { studentId: v.id("students"), eventId: v.optional(v.id("events")), category: v.optional(v.union(v.literal("main"), v.literal("extra"))), label: v.string(), amountCents: v.number(), priority: v.number(), idempotencyKey: v.string() }, returns: v.union(v.id("charges"), v.null()),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); financeEditor(user);
    const student = await ctx.db.get(args.studentId); const season = await activeSeason(ctx);
    if (!student || student.seasonId !== season._id) throw new Error("Student not found.");
    if (!args.label.trim() || args.label.length > 150 || !Number.isSafeInteger(args.priority) || args.category && !args.eventId) throw new Error("Invalid charge.");
    if (args.eventId) {
      const event = await ctx.db.get(args.eventId);
      if (!event || event.seasonId !== season._id) throw new Error("Event not found.");
      const p = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
      if (p?.status !== "confirmed") throw new Error("Event charges require confirmed participation.");
    }
    return await addCharge(ctx, user, student._id, args.label.trim(), args.amountCents, args.priority, args.idempotencyKey, args.eventId, args.category) ?? null;
  },
});

export const recordFunds = mutation({
  args: { studentId: v.id("students"), kind: v.union(v.literal("payment"), v.literal("fundraiser")), amountCents: v.number(), reason: v.string(), idempotencyKey: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); financeEditor(user);
    const season = await activeSeason(ctx); const student = await ctx.db.get(args.studentId);
    if (!student || student.seasonId !== season._id) throw new Error("Student not found.");
    if (!Number.isSafeInteger(args.amountCents) || args.amountCents <= 0 || !args.reason.trim() || args.idempotencyKey.length < 8) throw new Error("Provide an amount, reason, and unique transaction key.");
    const existing = await ctx.db.query("ledgerEntries").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", args.idempotencyKey)).unique();
    if (existing) {
      if (existing.studentId !== student._id || existing.kind !== args.kind || existing.amountCents !== args.amountCents) throw new Error("Transaction key is already used for a different payment.");
      return null;
    }
    const prior = await financialEntries(ctx, student._id);
    if (prior.length >= 500) throw new Error("Financial record limit reached; payment was not recorded.");
    const funds = prior.filter(x => x.kind === "payment" || x.kind === "fundraiser").reduce((n, x) => n + x.amountCents, 0);
    await ctx.db.insert("ledgerEntries", { studentId: student._id, kind: args.kind, amountCents: args.amountCents, previousCents: funds, newCents: funds + args.amountCents, reason: args.reason.trim(), recordedBy: user._id, recordedAt: Date.now(), idempotencyKey: args.idempotencyKey });
    await audit(ctx, user, "ledger", student._id, args.kind, { funds }, { funds: funds + args.amountCents }, args.reason.trim());
    await allocateUnapplied(ctx, user, student._id, `auto:${args.idempotencyKey}`);
    return null;
  },
});
