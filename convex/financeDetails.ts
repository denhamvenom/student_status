import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { activeSeason, studentAccess, viewer } from "./lib/access";
import schema from "./schema";
import { effectiveChargeDueAt } from "./lib/feeDefinitions";

const familyCharge = v.object({_id: v.id("charges"), eventId: v.optional(v.id("events")), label: v.string(), category: v.optional(v.union(v.literal("main"), v.literal("extra"))), cancelledCents: v.optional(v.number()), outstanding: v.optional(v.boolean()), adjustedCents: v.optional(v.number()), amountCents: v.number(), appliedCents: v.number(), priority: v.number(), createdAt: v.number(), dueAt: v.optional(v.number())});
const familyHistoryEntry = v.object({_id: v.id("ledgerEntries"), kind: schema.doc("ledgerEntries").fields.kind, amountCents: v.number(), recordedAt: v.number(), method: v.optional(schema.doc("ledgerEntries").fields.method), sourceKind: v.optional(schema.doc("ledgerEntries").fields.sourceKind), destination: v.optional(v.literal("team")), safeDescription: v.string()});
const staffHistoryEntry = schema.doc("ledgerEntries").extend({safeDescription: v.string()});
function familyDescription(kind: string, chargeLabel: string | null, destination: "team" | undefined, sourceKind: "payment" | "fundraiser" | undefined) {
  const label = chargeLabel ?? "Charge";
  switch (kind) {
    case "charge": return `${label} charged`;
    case "payment": return "Payment received";
    case "paymentCorrection": return "Payment receipt adjusted";
    case "fundraiser": return "Fundraising credit received";
    case "allocation": return `${sourceKind === "fundraiser" ? "Fundraising credit" : "Payment"} applied to ${label}`;
    case "adjustment": return `${label} adjusted`;
    case "deallocation": return `${sourceKind === "fundraiser" ? "Fundraising credit" : "Payment"} returned to available funds from ${label}`;
    case "cancellation": return `${label} canceled`;
    case "payout": return "Cash or check refund recorded";
    case "transferOut": return destination === "team" ? "Fundraising credit transferred to the team" : "Available funds transferred";
    case "awardReversal": return "Fundraising credit adjusted";
    default: return "Account activity";
  }
}

function boundRead(options: { maximumRowsRead?: number }) {
  if (options.maximumRowsRead !== undefined && (!Number.isSafeInteger(options.maximumRowsRead) || options.maximumRowsRead < 1)) throw new ConvexError("This list couldn't load. Reload the page to try again.");
  options.maximumRowsRead = Math.min(options.maximumRowsRead ?? 26, 26);
}

async function authorize(ctx: QueryCtx, studentId: Id<"students">, size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 25) throw new ConvexError("Finance pages support 1 to 25 records.");
  const actor = await viewer(ctx);
  if (actor.role === "mentor" && !actor.travelLead) throw new ConvexError("Mentors can't see student money. Ask a Coach or Travel Lead.");
  const student = await studentAccess(ctx, actor, studentId);
  if (student.seasonId !== (await activeSeason(ctx))._id) throw new ConvexError("This student is from a past season, so their money can't be shown here.");
  return actor;
}

export const charges = query({
  args: { studentId: v.id("students"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.union(schema.doc("charges"), familyCharge)),
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.studentId, args.paginationOpts.numItems);
    boundRead(args.paginationOpts);
    const result = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", args.studentId)).paginate(args.paginationOpts);
    if (result.page.length > 25) throw new ConvexError("This list couldn't load. Reload the page to try again.");
    // dueAt is the effective due date: the charge's own, else its fee definition's.
    const page = await Promise.all(result.page.map(async charge => ({charge, dueAt: await effectiveChargeDueAt(ctx, charge)})));
    if (actor.role === "coach" || actor.role === "mentor" && actor.travelLead) return {...result, page: page.map(({charge, dueAt}) => ({...charge, dueAt}))};
    return {...result, page: page.map(({charge, dueAt}) => ({_id: charge._id, eventId: charge.eventId, label: charge.label, category: charge.category, cancelledCents: charge.cancelledCents, outstanding: charge.outstanding, adjustedCents: charge.adjustedCents, amountCents: charge.amountCents, appliedCents: charge.appliedCents, priority: charge.priority, createdAt: charge.createdAt, dueAt}))};
  },
});

export const history = query({
  args: { studentId: v.id("students"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.union(staffHistoryEntry, familyHistoryEntry)),
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.studentId, args.paginationOpts.numItems);
    boundRead(args.paginationOpts);
    const result = await ctx.db.query("ledgerEntries").withIndex("by_studentId_and_recordedAt", q => q.eq("studentId", args.studentId)).order("desc").paginate(args.paginationOpts);
    if (result.page.length > 25) throw new ConvexError("This list couldn't load. Reload the page to try again.");
    const page = await Promise.all(result.page.map(async entry => {
      const charge = entry.chargeId ? await ctx.db.get(entry.chargeId) : null;
      const safeDescription = familyDescription(entry.kind, charge?.label ?? null, entry.destination, entry.sourceKind);
      if (actor.role === "coach" || actor.role === "mentor" && actor.travelLead) return {...entry, safeDescription};
      return {_id: entry._id, kind: entry.kind, amountCents: entry.amountCents, recordedAt: entry.recordedAt, method: entry.method, sourceKind: entry.sourceKind, destination: entry.destination, safeDescription};
    }));
    return {...result, page};
  },
});

/** Most unpaid charges one family student can have before the summary refuses to guess. */
const OWED_SUMMARY_LIMIT = 200;

/**
 * The family Money lead line across every unpaid charge, not just the first charges page:
 * what is owed in total, the soonest effective due date (own, else the fee's) and how much is due then.
 */
export const owedSummary = query({
  args: { studentId: v.id("students") },
  returns: v.object({ owedCents: v.number(), soonestDueAt: v.union(v.number(), v.null()), soonestDueCents: v.number() }),
  handler: async (ctx, args) => {
    await authorize(ctx, args.studentId, 1);
    const unpaid = await ctx.db.query("charges").withIndex("by_studentId_and_outstanding_and_priority", q => q.eq("studentId", args.studentId).eq("outstanding", true)).take(OWED_SUMMARY_LIMIT + 1);
    if (unpaid.length > OWED_SUMMARY_LIMIT) throw new ConvexError("This summary couldn't load. Reload the page to try again.");
    const feeDueAt = new Map<Id<"feeDefinitions">, number | undefined>();
    let owedCents = 0, soonestDueAt: number | null = null, soonestDueCents = 0;
    for (const charge of unpaid) {
      const dueCents = charge.amountCents + (charge.adjustedCents ?? 0) - (charge.cancelledCents ?? 0) - charge.appliedCents;
      if (dueCents <= 0) continue;
      owedCents += dueCents;
      let dueAt = charge.dueAt;
      if (dueAt === undefined && charge.feeDefinitionId) {
        if (!feeDueAt.has(charge.feeDefinitionId)) feeDueAt.set(charge.feeDefinitionId, await effectiveChargeDueAt(ctx, charge));
        dueAt = feeDueAt.get(charge.feeDefinitionId);
      }
      if (dueAt === undefined) continue;
      if (soonestDueAt === null || dueAt < soonestDueAt) { soonestDueAt = dueAt; soonestDueCents = dueCents; }
      else if (dueAt === soonestDueAt) soonestDueCents += dueCents;
    }
    return { owedCents, soonestDueAt, soonestDueCents: Math.min(soonestDueCents, owedCents) };
  },
});
