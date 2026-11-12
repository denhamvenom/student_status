import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalQuery } from "../_generated/server";
import { effectiveChargeCents } from "../lib/chargeObligation";
import { seasonFinanceControl } from "../lib/seasonFinance";
import type { SheetLoader } from "../lib/sheetKinds";
import type { Data, EventFeeCharge, EventFeeDefinition, EventFeeParticipant } from "../sheetKinds/eventFees";

const PAGE = 40;
const cursorArg = v.union(v.string(), v.null());
const NOT_READY = "Money isn't ready: fees are still updating.";
const paging = { isDone: v.boolean(), cursor: cursorArg };

/** Event fee settings, by_eventId_and_kind: indexed by event, no scan. */
export const definitionPage = internalQuery({
  args: { eventId: v.id("events"), cursor: cursorArg },
  returns: v.object({ rows: v.array(v.object({ id: v.string(), fee: v.string(), kind: v.union(v.literal("eventMain"), v.literal("eventExtra"), v.literal("custom")), amountCents: v.number(), canceled: v.boolean() })), ...paging }),
  handler: async (ctx, args) => {
    const result = await ctx.db.query("feeDefinitions").withIndex("by_eventId_and_kind", q => q.eq("eventId", args.eventId)).paginate({ numItems: PAGE, cursor: args.cursor, maximumRowsRead: PAGE + 1 });
    return { rows: result.page.map(d => ({ id: d._id, fee: d.label, kind: d.kind, amountCents: d.defaultAmountCents, canceled: d.state === "cancelled" })), isDone: result.isDone, cursor: result.isDone ? null : result.continueCursor };
  },
});

/** Every fee charged for the event, by_eventId_and_studentId. Not read while shared fee maintenance is running. */
export const chargePage = internalQuery({
  args: { seasonId: v.id("seasons"), eventId: v.id("events"), cursor: cursorArg },
  returns: v.object({ rows: v.array(v.object({ studentId: v.string(), student: v.string(), feeId: v.union(v.string(), v.null()), amountCents: v.number(), paidCents: v.number() })), ...paging }),
  handler: async (ctx, args) => {
    const control = await seasonFinanceControl(ctx, args.seasonId);
    if (control && control.state !== "ready") throw new Error(NOT_READY);
    const result = await ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", args.eventId)).paginate({ numItems: PAGE, cursor: args.cursor, maximumRowsRead: PAGE + 1 });
    const names = new Map<Id<"students">, string>();
    const rows: EventFeeCharge[] = [];
    for (const charge of result.page) {
      if (!names.has(charge.studentId)) { const student = await ctx.db.get(charge.studentId); names.set(charge.studentId, student ? student.legalName || student.preferredName : ""); }
      rows.push({ studentId: charge.studentId, student: names.get(charge.studentId)!, feeId: charge.feeDefinitionId ?? null, amountCents: effectiveChargeCents(charge), paidCents: charge.appliedCents });
    }
    return { rows, isDone: result.isDone, cursor: result.isDone ? null : result.continueCursor };
  },
});

export const participantPage = internalQuery({
  args: { eventId: v.id("events"), cursor: cursorArg },
  returns: v.object({ rows: v.array(v.object({ studentId: v.string(), student: v.string(), status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("waitlist"), v.literal("withdrawn")) })), ...paging }),
  handler: async (ctx, args) => {
    const result = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", args.eventId)).paginate({ numItems: PAGE, cursor: args.cursor, maximumRowsRead: PAGE + 1 });
    const rows: EventFeeParticipant[] = [];
    for (const p of result.page) { const student = await ctx.db.get(p.studentId); rows.push({ studentId: p.studentId, student: student ? student.legalName || student.preferredName : "", status: p.status }); }
    return { rows, isDone: result.isDone, cursor: result.isDone ? null : result.continueCursor };
  },
});

type Page<T> = { rows: T[]; isDone: boolean; cursor: string | null };
async function readAll<T>(what: string, read: (cursor: string | null) => Promise<Page<T>>): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 200; i++) {
    const result: Page<T> = await read(cursor);
    rows.push(...result.rows);
    if (result.isDone) return rows;
    cursor = result.cursor;
  }
  throw new Error(`Too many ${what} to read`);
}

export const load: SheetLoader<Data> = async (ctx, args) => {
  const eventId = args.eventId;
  if (!eventId) throw new Error("An event fees file needs its event");
  const charges = await readAll<EventFeeCharge>("fees", cursor => ctx.runQuery(internal.sheetData.eventFees.chargePage, { seasonId: args.seasonId, eventId, cursor }));
  const definitions = await readAll<EventFeeDefinition>("fee settings", cursor => ctx.runQuery(internal.sheetData.eventFees.definitionPage, { eventId, cursor }));
  const participants = await readAll<EventFeeParticipant>("participants", cursor => ctx.runQuery(internal.sheetData.eventFees.participantPage, { eventId, cursor }));
  return { definitions, charges, participants };
};
