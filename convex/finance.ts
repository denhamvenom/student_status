import { requireSeasonFinanceReady } from "./lib/seasonFinance";
import { requireEnrollmentComplete } from "./lib/eventEnrollmentState";
import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { queueMoneyDigest } from "./lib/digest";
import { activeSeason, audit, viewer } from "./lib/access";
import { addCharge, allocateUnapplied } from "./lib/money";
import { validDueAt } from "./lib/feeDefinitions";

import { ensureFinancialAccount, recordProjectedEntry } from "./lib/financialSources";

function financeEditor(user: Awaited<ReturnType<typeof viewer>>) {
  if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead && user.financialEdit)) throw new ConvexError("Only a Coach or a Travel Lead with Money editing access can do this.");
}

/**
 * Fee order for a fee added without one: one step after the latest fee of the season and the latest charge this student already has,
 * so it is paid last. (Once the season fee order is ready, the fee definition assigns the same "after every existing fee" rank itself.)
 */
async function nextFeePriority(ctx: MutationCtx, seasonId: Id<"seasons">, studentId: Id<"students">) {
  const lastFee = await ctx.db.query("feeDefinitions").withIndex("by_seasonId_and_priority", q => q.eq("seasonId", seasonId)).order("desc").first();
  const lastCharge = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", studentId)).order("desc").first();
  const next = Math.max(lastFee?.priority ?? 0, lastCharge?.priority ?? 0) + 1;
  if (!Number.isSafeInteger(next)) throw new ConvexError("The fee order isn't ready yet. Reload, then try again.");
  return next;
}

export const createCharge = mutation({
  args: { studentId: v.id("students"), eventId: v.optional(v.id("events")), category: v.optional(v.union(v.literal("main"), v.literal("extra"))), label: v.string(), amountCents: v.number(), priority: v.optional(v.number()), idempotencyKey: v.string(), dueAt: v.optional(v.number()) }, returns: v.union(v.id("charges"), v.null()),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx); financeEditor(user);
    const student = await ctx.db.get(args.studentId); const season = await activeSeason(ctx);
    if (!student || student.seasonId !== season._id) throw new ConvexError("This student no longer exists. Reload to see the latest.");
    if (!args.label.trim() || args.label.length > 150 || args.priority !== undefined && !Number.isSafeInteger(args.priority) || args.idempotencyKey.length < 8 || args.idempotencyKey.length > 150 || args.category && !args.eventId) throw new ConvexError("Enter a fee name of up to 150 characters, then try again.");
    if (args.eventId) {
      const event = await ctx.db.get(args.eventId);
      if (!event || event.seasonId !== season._id) throw new ConvexError("This event no longer exists. Reload to see the latest.");
      requireEnrollmentComplete(event);
      const p = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
      if (p?.status !== "confirmed") throw new ConvexError("Add an event fee only for a student who is signed up for the event.");
    }
    validDueAt(args.dueAt);
    const priority = args.priority ?? await nextFeePriority(ctx, season._id, student._id);
    const replay = await ctx.db.query("ledgerEntries").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", args.idempotencyKey)).unique();
    const chargeId = await addCharge(ctx, user, student._id, args.label.trim(), args.amountCents, priority, args.idempotencyKey, args.eventId, args.category) ?? null;
    if (chargeId && !replay) {
      if (args.dueAt !== undefined) await ctx.db.patch(chargeId, { dueAt: args.dueAt });
      if (args.amountCents > 0) await queueMoneyDigest(ctx, student._id, "charge");
    }
    return chargeId;
  },
});

/** The events a student is signed up for, so Add a fee only offers events the server will accept. */
export const signedUpEventIds = query({
  args: { studentId: v.id("students") }, returns: v.array(v.id("events")),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); financeEditor(user);
    const season = await activeSeason(ctx);
    const student = await ctx.db.get(args.studentId);
    if (!student || student.seasonId !== season._id) throw new ConvexError("This student no longer exists. Reload to see the latest.");
    const rows = await ctx.db.query("participants").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(200);
    return rows.filter(row => row.status === "confirmed").map(row => row.eventId);
  },
});

/** How much of a just-added fee was paid at once from the student's Available funds. */
export const feePaidSoFar = query({
  args: { chargeId: v.id("charges") }, returns: v.number(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); financeEditor(user);
    const season = await activeSeason(ctx);
    const charge = await ctx.db.get(args.chargeId);
    const student = charge ? await ctx.db.get(charge.studentId) : null;
    if (!charge || !student || student.seasonId !== season._id) throw new ConvexError("This fee no longer exists. Reload to see the latest.");
    return charge.appliedCents;
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
    await queueMoneyDigest(ctx, student._id, "payment");
    return null;
  },
});

/** Sets or clears a charge's own due date (R6). Without one, the charge uses its fee definition's due date. */
export const setChargeDueAt = mutation({
  args: { chargeId: v.id("charges"), dueAt: v.union(v.number(), v.null()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); financeEditor(user);
    validDueAt(args.dueAt);
    const season = await activeSeason(ctx);
    const charge = await ctx.db.get(args.chargeId);
    const student = charge ? await ctx.db.get(charge.studentId) : null;
    if (!charge || !student || student.seasonId !== season._id) throw new ConvexError("This fee no longer exists. Reload to see the latest.");
    const dueAt = args.dueAt ?? undefined;
    if (charge.dueAt === dueAt) return null;
    await ctx.db.patch(charge._id, { dueAt });
    await audit(ctx, user, "charges", charge._id, "setDueAt", { dueAt: charge.dueAt ?? null }, { dueAt: dueAt ?? null });
    return null;
  },
});
