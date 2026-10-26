import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { activeSeason, viewer } from "./lib/access";
import { financeRow } from "./lib/financeRow";
import { teamReportAttendanceGate, teamReportAttendanceRow } from "./lib/teamReportAttendance";
import { studentReadiness } from "./lib/readModels";
import { enrollmentPending } from "./lib/eventEnrollmentState";

const nullableNumber = v.union(v.number(), v.null());
const attendanceCounts = v.object({offTuesday:v.number(),offThursday:v.number(),offOutreach:v.number(),buildWeekday:v.number(),buildSaturday:v.number(),buildSunday:v.number(),buildOutreach:v.number()});
const attendanceGate = v.object({state:v.union(v.literal("ready"),v.literal("updating"),v.literal("failed"),v.literal("unknownKickoff")),kickoff:v.union(v.null(),v.object({date:v.string(),at:v.number()})),updatedAt:nullableNumber});
const financeValidator = v.object({state:v.union(v.literal("ready"),v.literal("updating"),v.literal("failed"),v.literal("uninitialized")),chargedCents:nullableNumber,paidCents:nullableNumber,dueCents:nullableNumber,raisedCents:nullableNumber,travelAccountCents:nullableNumber,updatedAt:nullableNumber});
const selectedValidator = v.union(v.null(),v.object({participation:v.union(v.literal("confirmed"),v.literal("pending"),v.literal("waitlist"),v.literal("withdrawn"),v.null()),state:v.union(v.literal("ready"),v.literal("open"),v.literal("notApplicable"),v.literal("unknown")),outstanding:v.array(v.string())}));
const rowValidator = v.object({studentId:v.id("students"),name:v.string(),subteam:v.string(),travelTeam:v.boolean(),fundraiserConnected:v.boolean(),finance:financeValidator,attendance:v.union(v.null(),attendanceCounts),eventsCount:nullableNumber,selectedEvent:selectedValidator});

async function requireViewer(ctx: QueryCtx) {
  const actor = await viewer(ctx);
  if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead)) throw new ConvexError("Only a Coach or Travel Lead can open team reports.");
  return actor;
}

async function reportFinance(ctx: QueryCtx, studentId: Id<"students">) {
  const projection = await financeRow(ctx, studentId);
  const empty = {state:projection.state,chargedCents:projection.chargedCents,paidCents:null,dueCents:projection.dueCents,raisedCents:null,travelAccountCents:null,updatedAt:projection.updatedAt};
  if (projection.state !== "ready") return empty;
  const summary = await ctx.db.query("studentFinanceSummaries").withIndex("by_studentId", q => q.eq("studentId", studentId)).unique();
  if (!summary) return {...empty,state:"failed" as const,chargedCents:null,dueCents:null,updatedAt:null};
  const paid = BigInt(projection.personalAppliedCents!) + BigInt(projection.fundraisingAppliedCents!);
  const available = BigInt(projection.personalAvailableCents!) + BigInt(projection.fundraisingAvailableCents!);
  if (paid > BigInt(Number.MAX_SAFE_INTEGER) || available > BigInt(Number.MAX_SAFE_INTEGER) || summary.paidCents !== Number(paid) || !Number.isSafeInteger(summary.travelBalanceCents) || summary.travelBalanceCents !== Number(available) || summary.knownRaisedCents !== undefined && (!Number.isSafeInteger(summary.knownRaisedCents) || summary.knownRaisedCents < 0)) return {...empty,state:"failed" as const,chargedCents:null,dueCents:null,updatedAt:null};
  return {...empty,paidCents:Number(paid),travelAccountCents:Number(available),raisedCents:summary.raisedComplete === true ? summary.knownRaisedCents ?? null : null};
}

async function reportRow(ctx: QueryCtx, student: Doc<"students">, attendance: Awaited<ReturnType<typeof teamReportAttendanceGate>>, event: Doc<"events"> | null, eventIds: Set<string> | null) {
  const [finance, participations, selectedEvent, counts] = await Promise.all([
    reportFinance(ctx, student._id),
    ctx.db.query("participants").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(101),
    event ? studentReadiness(ctx, event, student) : null,
    attendance.state === "ready" && attendance.kickoff ? teamReportAttendanceRow(ctx, student.seasonId, student._id, attendance.kickoff.at) : null,
  ]);
  const eventsCount = eventIds && participations.length <= 100 ? participations.filter(p => p.status !== "withdrawn" && eventIds.has(p.eventId)).length : null;
  let selected = null;
  if (event && selectedEvent) {
    const uncertain = enrollmentPending(event) || finance.state !== "ready" && selectedEvent.participation === "confirmed" || selectedEvent.open.some(item => item.includes("require review"));
    const awaitingConfirmation = selectedEvent.participation === "pending" || selectedEvent.participation === "waitlist";
    selected = {participation:selectedEvent.participation,state:uncertain?"unknown" as const:awaitingConfirmation?"open" as const:selectedEvent.state,outstanding:awaitingConfirmation && !uncertain?["Signup not confirmed yet"]:selectedEvent.open};
  }
  return {studentId:student._id,name:student.legalName||student.preferredName,subteam:student.subteam,travelTeam:student.travelTeam,fundraiserConnected:!!student.fundraiserUrl,finance,attendance:counts,eventsCount,selectedEvent:selected};
}

const eventChoice = v.object({eventId:v.id("events"),name:v.string(),startsAt:v.number(),type:v.union(v.literal("Competition"),v.literal("Outreach"),v.literal("Team"))});
export const context = query({args:{asOf:v.number()},returns:v.object({seasonId:v.id("seasons"),attendance:attendanceGate,eventsCoverage:v.union(v.literal("complete"),v.literal("unknown"))}),handler:async(ctx,args)=>{
  await requireViewer(ctx);
  if (!Number.isSafeInteger(args.asOf)) throw new ConvexError("This report could not load. Reload the page and try again.");
  const season=await activeSeason(ctx);
  const [attendance,eventPage]=await Promise.all([teamReportAttendanceGate(ctx,season._id,season.year),ctx.db.query("events").withIndex("by_seasonId_and_startsAt",q=>q.eq("seasonId",season._id)).take(51)]);
  return {seasonId:season._id,attendance,eventsCoverage:eventPage.length>50?"unknown" as const:"complete" as const};
}});
export const events = query({args:{asOf:v.number()},returns:v.object({items:v.array(eventChoice),coverage:v.union(v.literal("complete"),v.literal("unknown"))}),handler:async(ctx,args)=>{
  await requireViewer(ctx);
  if (!Number.isSafeInteger(args.asOf)) throw new ConvexError("This report could not load. Reload the page and try again.");
  const season=await activeSeason(ctx);
  const page=await ctx.db.query("events").withIndex("by_seasonId_and_startsAt",q=>q.eq("seasonId",season._id).gte("startsAt",args.asOf)).take(51);
  return {items:page.slice(0,50).filter(e=>!e.archived).map(e=>({eventId:e._id,name:e.name,startsAt:e.startsAt,type:e.type})),coverage:page.length>50?"unknown" as const:"complete" as const};
}});

export const list = query({
  args:{paginationOpts:paginationOptsValidator,asOf:v.number(),eventId:v.optional(v.id("events"))},
  returns:paginationResultValidator(rowValidator).extend({seasonId:v.id("seasons"),attendance:attendanceGate,event:v.union(v.null(),eventChoice),eventsCoverage:v.union(v.literal("complete"),v.literal("unknown"))}),
  handler:async(ctx,args)=>{
    await requireViewer(ctx);
    if (!Number.isSafeInteger(args.asOf) || !Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems<1 || args.paginationOpts.numItems>10 || args.paginationOpts.maximumRowsRead!==undefined && (!Number.isSafeInteger(args.paginationOpts.maximumRowsRead) || args.paginationOpts.maximumRowsRead<1)) throw new ConvexError("This report could not load. Reload the page and try again.");
    const season=await activeSeason(ctx);
    const event=args.eventId?await ctx.db.get(args.eventId):null;
    if (args.eventId && (!event || event.seasonId!==season._id || event.archived)) throw new ConvexError("This event is no longer in the current season or has moved to Past events. Choose another event.");
    const [page,attendance,eventPage]=await Promise.all([
      ctx.db.query("students").withIndex("by_seasonId_and_active",q=>q.eq("seasonId",season._id).eq("active",true)).paginate({...args.paginationOpts,maximumRowsRead:Math.min(args.paginationOpts.maximumRowsRead??11,11)}),
      teamReportAttendanceGate(ctx,season._id,season.year),
      ctx.db.query("events").withIndex("by_seasonId_and_startsAt",q=>q.eq("seasonId",season._id)).take(51),
    ]);
    if (page.page.length>10) throw new ConvexError("Too many students to show at once. Reload the report to see them 10 at a time.");
    const eventIds=eventPage.length>50?null:new Set(eventPage.filter(e=>!e.archived).map(e=>String(e._id)));
    return {...page,page:await Promise.all(page.page.map(student=>reportRow(ctx,student,attendance,event,eventIds))),seasonId:season._id,attendance,event:event?{eventId:event._id,name:event.name,startsAt:event.startsAt,type:event.type}:null,eventsCoverage:eventIds?"complete" as const:"unknown" as const};
  },
});
