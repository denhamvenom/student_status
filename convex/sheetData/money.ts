import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import { financeRow } from "../lib/financeRow";
import { feeStatus } from "../lib/financeRows";
import { effectiveChargeCents } from "../lib/chargeObligation";
import { seasonFinanceControl } from "../lib/seasonFinance";
import type { SheetLoader } from "../lib/sheetKinds";
import type { Data, MoneyBalance, MoneyFee, MoneyFundraising } from "../sheetKinds/money";

/** Students per page: each reads an account, a summary and up to MAX_FEES fees, so a page stays far inside the read limits. */
const STUDENT_PAGE = 10;
const FUNDRAISING_PAGE = 50;
const MAX_FEES = 100;
const cursorArg = v.union(v.string(), v.null());

/** Same gate the finance CSV export uses: shared fee maintenance must be finished, and every account must be ready. Throwing keeps the previous file unchanged. */
const NOT_READY = "Money is updating, so its spreadsheet kept the last numbers. Try again in a few minutes.";

const balanceValidator = v.object({ name: v.string(), chargedCents: v.number(), paidCents: v.number(), personalAppliedCents: v.number(), fundraisingAppliedCents: v.number(), dueCents: v.number(), personalAvailableCents: v.number(), fundraisingAvailableCents: v.number() });
const feeValidator = v.object({ student: v.string(), fee: v.string(), event: v.string(), amountCents: v.number(), paidCents: v.number(), dueCents: v.number(), status: v.string() });

/** One page of active students with their balance and fees. */
export const studentPage = internalQuery({
  args: { seasonId: v.id("seasons"), cursor: cursorArg },
  returns: v.object({ balances: v.array(balanceValidator), fees: v.array(feeValidator), isDone: v.boolean(), cursor: cursorArg }),
  handler: async (ctx, args) => {
    const control = await seasonFinanceControl(ctx, args.seasonId);
    if (control && control.state !== "ready") throw new ConvexError(NOT_READY);
    const page = await ctx.db.query("students").withIndex("by_seasonId_and_active", q => q.eq("seasonId", args.seasonId).eq("active", true)).paginate({ numItems: STUDENT_PAGE, cursor: args.cursor, maximumRowsRead: STUDENT_PAGE + 1 });
    const events = new Map<Id<"events">, string>();
    const balances: MoneyBalance[] = [], fees: MoneyFee[] = [];
    for (const student of page.page) {
      const name = student.legalName || student.preferredName;
      const row = await financeRow(ctx, student._id);
      if (row.state !== "ready") throw new ConvexError(NOT_READY);
      balances.push({ name, chargedCents: row.chargedCents!, paidCents: row.personalAppliedCents! + row.fundraisingAppliedCents!, personalAppliedCents: row.personalAppliedCents!, fundraisingAppliedCents: row.fundraisingAppliedCents!, dueCents: row.dueCents!, personalAvailableCents: row.personalAvailableCents!, fundraisingAvailableCents: row.fundraisingAvailableCents! });
      const charges = await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", student._id)).take(MAX_FEES + 1);
      if (charges.length > MAX_FEES) throw new Error("A student has too many fees to list.");
      for (const charge of charges) {
        let event = "";
        if (charge.eventId) {
          if (!events.has(charge.eventId)) events.set(charge.eventId, (await ctx.db.get(charge.eventId))?.name ?? "");
          event = events.get(charge.eventId)!;
        }
        const effective = effectiveChargeCents(charge);
        fees.push({ student: name, fee: charge.label, event, amountCents: effective, paidCents: charge.appliedCents, dueCents: effective - charge.appliedCents, status: feeStatus(effective, charge.appliedCents, charge.cancelledCents ?? 0) });
      }
    }
    return { balances, fees, isDone: page.isDone, cursor: page.isDone ? null : page.continueCursor };
  },
});

/** One page of the season's fundraiser totals per student. */
export const fundraisingPage = internalQuery({
  args: { seasonId: v.id("seasons"), cursor: cursorArg },
  returns: v.object({ rows: v.array(v.object({ student: v.string(), fundraiser: v.string(), raisedCents: v.number(), teamCents: v.number(), creditCents: v.number() })), isDone: v.boolean(), cursor: cursorArg }),
  handler: async (ctx, args) => {
    const page = await ctx.db.query("fundraiserStudentTotals").withIndex("by_seasonId_and_studentId", q => q.eq("seasonId", args.seasonId)).paginate({ numItems: FUNDRAISING_PAGE, cursor: args.cursor, maximumRowsRead: FUNDRAISING_PAGE + 1 });
    const students = new Map<Id<"students">, string>(), fundraisers = new Map<Id<"fundraisers">, string>();
    const rows: MoneyFundraising[] = [];
    for (const total of page.page) {
      if (!students.has(total.studentId)) { const student = await ctx.db.get(total.studentId); students.set(total.studentId, student ? student.legalName || student.preferredName : ""); }
      if (!fundraisers.has(total.fundraiserId)) fundraisers.set(total.fundraiserId, (await ctx.db.get(total.fundraiserId))?.name ?? "");
      rows.push({ student: students.get(total.studentId)!, fundraiser: fundraisers.get(total.fundraiserId)!, raisedCents: total.grossCents, teamCents: total.teamCents, creditCents: total.travelCreditCents });
    }
    return { rows, isDone: page.isDone, cursor: page.isDone ? null : page.continueCursor };
  },
});

export const load: SheetLoader<Data> = async (ctx, args) => {
  const balances: MoneyBalance[] = [], fees: MoneyFee[] = [], fundraising: MoneyFundraising[] = [];
  let cursor: string | null = null, done = false;
  for (let page = 0; page < 200 && !done; page++) {
    const result: { balances: MoneyBalance[]; fees: MoneyFee[]; isDone: boolean; cursor: string | null } = await ctx.runQuery(internal.sheetData.money.studentPage, { seasonId: args.seasonId, cursor });
    balances.push(...result.balances); fees.push(...result.fees);
    done = result.isDone; cursor = result.cursor;
  }
  if (!done) throw new Error("Too many students to read");
  cursor = null; done = false;
  for (let page = 0; page < 200 && !done; page++) {
    const result: { rows: MoneyFundraising[]; isDone: boolean; cursor: string | null } = await ctx.runQuery(internal.sheetData.money.fundraisingPage, { seasonId: args.seasonId, cursor });
    fundraising.push(...result.rows);
    done = result.isDone; cursor = result.cursor;
  }
  if (!done) throw new Error("Too many fundraiser totals to read");
  return { balances, fees, fundraising };
};
