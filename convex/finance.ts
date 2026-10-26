import { requireSeasonFinanceReady } from "./lib/seasonFinance";
import { requireEnrollmentComplete } from "./lib/eventEnrollmentState";
import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { activeSeason, audit, viewer } from "./lib/access";
import { addCharge, allocateUnapplied } from "./lib/money";

import { ensureFinancialAccount, recordProjectedEntry } from "./lib/financialSources";

function financeEditor(user: Awaited<ReturnType<typeof viewer>>) {
  if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead && user.financialEdit)) throw new ConvexError("Only a Coach or a Travel Lead with Money editing access can do this.");
}

export const createCharge = mutation({
  args: { studentId: v.id("students"), eventId: v.optional(v.id("events")), category: v.optional(v.union(v.literal("main"), v.literal("extra"))), label: v.string(), amountCents: v.number(), priority: v.number(), idempotencyKey: v.string() }, returns: v.union(v.id("charges"), v.null()),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx); financeEditor(user);
    const student = await ctx.db.get(args.studentId); const season = await activeSeason(ctx);
    if (!student || student.seasonId !== season._id) throw new ConvexError("This student no longer exists. Reload to see the latest.");
    if (!args.label.trim() || args.label.length > 150 || !Number.isSafeInteger(args.priority) || args.idempotencyKey.length < 8 || args.idempotencyKey.length > 150 || args.category && !args.eventId) throw new ConvexError("Enter a fee name of up to 150 characters, then try again.");
    if (args.eventId) {
      const event = await ctx.db.get(args.eventId);
      if (!event || event.seasonId !== season._id) throw new ConvexError("This event no longer exists. Reload to see the latest.");
      requireEnrollmentComplete(event);
      const p = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
      if (p?.status !== "confirmed") throw new ConvexError("Add an event fee only for a student who is signed up for the event.");
    }
    return await addCharge(ctx, user, student._id, args.label.trim(), args.amountCents, args.priority, args.idempotencyKey, args.eventId, args.category) ?? null;
  },
});

export const recordFunds = mutation({
  args: { studentId: v.id("students"), kind: v.union(v.literal("payment"), v.literal("fundraiser")), amountCents: v.number(), reason: v.string(), idempotencyKey: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx); financeEditor(user);
    const season = await activeSeason(ctx); const student = await ctx.db.get(args.studentId);
    if (!student || student.seasonId !== season._id) throw new ConvexError("This student no longer exists. Reload to see the latest.");
    if (!Number.isSafeInteger(args.amountCents) || args.amountCents <= 0 || !args.reason.trim() || args.reason.length > 1000 || args.idempotencyKey.length < 8 || args.idempotencyKey.length > 150) throw new ConvexError("Enter an amount and a reason, then try again.");
    const existing = await ctx.db.query("ledgerEntries").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", args.idempotencyKey)).unique();
    if (existing) {
      if (existing.studentId !== student._id || existing.kind !== args.kind || existing.amountCents !== args.amountCents) throw new ConvexError("This was already submitted with different details. Reload to see the latest, then try again.");
      return null;
    }
    const account = await ensureFinancialAccount(ctx, student._id);
    const funds = account.paidCents + account.personalAvailableCents + account.fundraisingAvailableCents;
    if (!Number.isSafeInteger(funds + args.amountCents)) throw new ConvexError("That amount is too large. Enter a smaller amount.");
    const entryId = await ctx.db.insert("ledgerEntries", { studentId: student._id, kind: args.kind, amountCents: args.amountCents, previousCents: funds, newCents: funds + args.amountCents, reason: args.reason.trim(), recordedBy: user._id, recordedAt: Date.now(), idempotencyKey: args.idempotencyKey });
    await recordProjectedEntry(ctx, entryId, account);
    await audit(ctx, user, "ledger", student._id, args.kind, { funds }, { funds: funds + args.amountCents }, args.reason.trim());
    await allocateUnapplied(ctx, user, student._id, `auto:${args.idempotencyKey}`);
    return null;
  },
});
