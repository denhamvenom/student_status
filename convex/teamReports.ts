import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { activeSeason, viewer, isCoachOrTravelLead } from "./lib/access";
import { attendanceFor } from "./lib/readModels";
import { studentMatchesSubteams } from "./lib/eventAudienceRules";
import { canonicalSubteam } from "../src/lib/subteams";
import { financeRow } from "./lib/financeRow";
import { teamReportAttendanceGate, teamReportAttendanceRow } from "./lib/teamReportAttendance";
import { studentReadiness } from "./lib/readModels";
import { enrollmentPending } from "./lib/eventEnrollmentState";

const nullableNumber = v.union(v.number(), v.null());
const attendanceCounts = v.object({offTuesday:v.number(),offThursday:v.number(),offOutreach:v.number(),buildWeekday:v.number(),buildSaturday:v.number(),buildSunday:v.number(),buildOutreach:v.number(),buildWeekdayHeld:v.number(),buildWeekendAttended:v.number(),buildWeekendHeld:v.number(),buildMinutes:v.number(),buildWeekdayMinutes:v.number(),buildWeekendMinutes:v.number()});
const attendanceGate = v.object({state:v.union(v.literal("ready"),v.literal("updating"),v.literal("failed"),v.literal("unknownKickoff")),kickoff:v.union(v.null(),v.object({date:v.string(),at:v.number()})),updatedAt:nullableNumber});
const financeValidator = v.object({state:v.union(v.literal("ready"),v.literal("updating"),v.literal("failed"),v.literal("uninitialized")),chargedCents:nullableNumber,paidCents:nullableNumber,dueCents:nullableNumber,raisedCents:nullableNumber,travelAccountCents:nullableNumber,updatedAt:nullableNumber});
const selectedValidator = v.union(v.null(),v.object({participation:v.union(v.literal("confirmed"),v.literal("pending"),v.literal("waitlist"),v.literal("withdrawn"),v.null()),state:v.union(v.literal("ready"),v.literal("open"),v.literal("notApplicable"),v.literal("unknown")),outstanding:v.array(v.string())}));
const rowValidator = v.object({studentId:v.id("students"),name:v.string(),subteam:v.string(),travelTeam:v.boolean(),fundraiserConnected:v.boolean(),finance:financeValidator,attendance:v.union(v.null(),attendanceCounts),eventsCount:nullableNumber,selectedEvent:selectedValidator});

async function requireViewer(ctx: QueryCtx) {
  const actor = await viewer(ctx);
  if (!isCoachOrTravelLead(actor)) throw new ConvexError("Only a Coach or Travel Lead can open team reports.");
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

const eventChoice = v.object({eventId:v.id("events"),name:v.string(),startsAt:v.number(),type:v.union(v.literal("Competition"),v.literal("Outreach"),v.literal("Team"),v.literal("Fundraiser"))});
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

/**
 * Worst case per shown student is 200 participant rows plus 500 attendance records (attendanceFor), 700 reads. Convex stops a
 * query at 32,000 documents read, and the query also reads up to 200 events and 500 meetings. 40 students x 700 = 28,000, plus
 * 700 shared = 28,700, which stays under the limit. One extra student is read to tell whether the list is complete.
 */
const MENTOR_REPORT_MAX_STUDENTS = 40;
/** Active students read to find the Mentor's own; student documents carry no per-student reads. */
const MENTOR_REPORT_ROSTER_BOUND = 600;
const mentorRow = v.object({studentId:v.id("students"),name:v.string(),subteam:v.string(),travelTeam:v.boolean(),requiredPercent:nullableNumber,thursdayAttended:v.number(),events:v.array(v.string())});

/**
 * Mentor student report. Minimal projection (no health, money, contact or parent data): name, subteam, Travel Team, the share of
 * required meetings attended, other meetings and the events the student is confirmed for. Defaults to the Mentor's own subteams
 * (primary, secondary or Leadership); `allSubteams` widens it to every active student, which Mentors could already see here.
 */
export const mentorList = query({
  args:{allSubteams:v.boolean()},
  returns:v.object({subteams:v.array(v.string()),scope:v.union(v.literal("mine"),v.literal("all")),totalStudents:v.number(),studentsComplete:v.boolean(),rows:v.array(mentorRow)}),
  handler:async(ctx,args)=>{
    const user=await viewer(ctx);
    if (user.role!=="mentor") throw new ConvexError("Only a Mentor can open the Mentor student report.");
    const season=await activeSeason(ctx);
    const mine=[...new Set((user.subteams??[]).map(canonicalSubteam))].filter(Boolean);
    // Events are read newest-ending first so a long season keeps its upcoming and recent events.
    const [students,events,meetings]=await Promise.all([
      ctx.db.query("students").withIndex("by_seasonId_and_active",q=>q.eq("seasonId",season._id).eq("active",true)).take(MENTOR_REPORT_ROSTER_BOUND+1),
      ctx.db.query("events").withIndex("by_seasonId_and_archived_and_endsAt",q=>q.eq("seasonId",season._id).eq("archived",false)).order("desc").take(200),
      ctx.db.query("attendanceMeetings").withIndex("by_seasonId_and_startsAt",q=>q.eq("seasonId",season._id)).take(500),
    ]);
    // Filter to the Mentor's subteams first (student documents are cheap); the cap applies only to the costly per-student reads.
    const rosterComplete=students.length<=MENTOR_REPORT_ROSTER_BOUND;
    const matching=students.slice(0,MENTOR_REPORT_ROSTER_BOUND).filter(student=>args.allSubteams||studentMatchesSubteams(student,mine));
    const studentsComplete=rosterComplete&&matching.length<=MENTOR_REPORT_MAX_STUDENTS;
    // Sort by name before taking the cap so the first 40 are the first 40 alphabetically, not an arbitrary 40.
    const shown=[...matching].sort((a,b)=>(a.preferredName||a.legalName).localeCompare(b.preferredName||b.legalName)).slice(0,MENTOR_REPORT_MAX_STUDENTS);
    const current=events.filter(event=>!event.cancelled).sort((a,b)=>a.startsAt-b.startsAt);
    const rows=await Promise.all(shown.map(async student=>{
      const [participation,attendance]=await Promise.all([ctx.db.query("participants").withIndex("by_studentId",q=>q.eq("studentId",student._id)).take(200),attendanceFor(ctx,student,meetings)]);
      return {studentId:student._id,name:student.preferredName||student.legalName,subteam:student.subteam,travelTeam:student.travelTeam,requiredPercent:attendance.tuesdayPercent,thursdayAttended:attendance.thursdayAttended,events:current.filter(event=>participation.some(p=>p.eventId===event._id&&p.status==="confirmed")).map(event=>event.name)};
    }));
    return {subteams:mine,scope:args.allSubteams?"all" as const:"mine" as const,totalStudents:matching.length,studentsComplete,rows};
  },
});
