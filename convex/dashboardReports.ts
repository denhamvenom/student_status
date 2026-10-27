import { publicErrorMessage } from './lib/publicErrors';
import { publicErrorResult } from './lib/publicErrors';
import { feeMaintenanceProjection, feeMaintenanceValidator } from "./lib/seasonFinance";
import { ConvexError, v, type Infer } from "convex/values";
import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { activeSeason, requireRole, studentAccess, viewer, type AppUser } from "./lib/access";
import { calculateStudentFinance, FINANCE_SUMMARY_VERSION } from "./lib/financeSummaries";
import { financialAccount } from "./lib/financialSources";
import { attendanceEvidence, outreachForSession, buildDayFromTitle } from "./lib/attendanceReports";
import { attendanceNamespace, studentAttendanceNamespace, studentBuildMinutesNamespace, reportAggregate, buildMinutesContribution } from "./lib/reportAggregates";
import { kickoffBoundaryForCompetitionYear } from "./lib/seasonCalendar";
import { buildDayTypeCounts, teamReportAttendanceGate } from "./lib/teamReportAttendance";
export { correctedIntervals } from "./lib/attendanceReports";

const nullableNumber = v.union(v.number(), v.null());
const financeValidator = v.object({ chargedCents: v.number(), paidCents: v.number(), dueCents: v.number(), travelBalanceCents: v.number(), personalAvailableCents: v.number(), fundraisingAvailableCents: v.number(), raisedCents: nullableNumber, travelShareCents: v.number(), transferredInCents: v.number(), updatedAt: nullableNumber });

/** Only verified current projections can supply financial totals. */
async function financialProjection(ctx: QueryCtx, studentId: Id<"students">) {
  const student = await ctx.db.get(studentId);
  const maintenance = student ? await feeMaintenanceProjection(ctx, student.seasonId) : null;
  const account = await financialAccount(ctx, studentId);
  if (account?.state !== "ready" || account.allocationSourceVersion !== 1) return { state: account?.state === "failed" ? "failed" as const : "updating" as const, maintenance };
  const data = await calculateStudentFinance(ctx, studentId);
  return { state: "ready" as const, maintenance, chargedCents: data.chargedCents, paidCents: data.paidCents, dueCents: data.dueCents,
    travelBalanceCents: data.travelBalanceCents, personalAvailableCents: data.personalAvailableCents,
    fundraisingAvailableCents: data.fundraisingAvailableCents, raisedCents: data.raisedComplete ? data.knownRaisedCents : null,
    travelShareCents: data.travelShareCents, transferredInCents: data.transferredInCents, updatedAt: data.updatedAt };
}

export const familyFinance = query({
  args: { studentId: v.id("students") }, returns: v.union(v.object({ ...financeValidator.fields, state: v.literal("ready"), maintenance: feeMaintenanceValidator }), v.object({ state: v.union(v.literal("updating"), v.literal("failed")), maintenance: feeMaintenanceValidator })),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    requireRole(user, "student", "parent", "coach", "mentor");
    if (user.role === "mentor" && !user.travelLead) throw new ConvexError("Money is not shown to Mentors. Ask a Coach if you need Travel Lead access.");
    await studentAccess(ctx, user, args.studentId);
    return publicErrorResult(financialProjection(ctx, args.studentId));
  },
});

const legacyValidator = v.object({ tuesdayHeld: v.number(), tuesdayAttended: v.number(), tuesdayPercent: nullableNumber, thursdayAttended: v.number(), outreachAttended: v.number() });
const verifiedValidator = v.object({ sessionsHeld: v.number(), sessionsAttended: v.number(), tuesdayHeld: v.number(), tuesdayAttended: v.number(), tuesdayPercent: nullableNumber, thursdayAttended: v.number(), outreachAttended: v.number(), updatedAt: nullableNumber });
const sessionValidator = v.object({ sessionId: v.id("timeclockSessions"), title: v.string(), scheduledStart: v.number(), state: v.union(v.literal("open"), v.literal("closed"), v.literal("cancelled")), totalMs: nullableNumber, scheduledMs: nullableNumber, earlyMs: nullableNumber, extendedMs: nullableNumber, longestScheduledMs: nullableNumber, qualifies: v.union(v.boolean(),v.null()), needsReview: v.boolean(), provisional: v.boolean(), reportState:v.union(v.literal("ready"),v.literal("updating"),v.literal("failed")) });
const phaseBoundaryValidator = v.union(v.object({state:v.literal("verified"),competitionYear:v.number(),kickoffDate:v.string(),kickoffAt:v.number(),currentPhase:v.union(v.literal("offseason"),v.literal("buildSeason"))}),v.object({state:v.literal("unavailable"),competitionYear:v.number(),reason:v.literal("kickoffDateNotVerified")}));
const phaseAttendanceValidator=verifiedValidator.extend({buildWeekdayHeld:v.number(),buildWeekdayAttended:v.number(),buildSaturdayHeld:v.number(),buildSaturdayAttended:v.number(),buildSundayHeld:v.number()});
const phasesValidator = v.union(v.null(),v.object({offseason:phaseAttendanceValidator,buildSeason:phaseAttendanceValidator}));
async function phaseCounts(ctx: QueryCtx, seasonId: Id<"seasons">, studentId: Id<"students">, kickoffAt: number, phase: "offseason" | "buildSeason", updatedAt: number) {
  const bounds = phase === "offseason" ? { upper: {key:kickoffAt,inclusive:false} } : {lower:{key:kickoffAt,inclusive:true}};
  const [sessionsHeld,sessionsAttended,tuesdayHeld,tuesdayAttended,thursdayAttended,outreachAttended,buildWeekdayHeld,buildWeekdayAttended,buildSaturdayHeld,buildSaturdayAttended,buildSundayHeld] = await Promise.all([
    reportAggregate.count(ctx,{namespace:attendanceNamespace(seasonId,"held"),bounds}),
    reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(seasonId,studentId),bounds}),
    reportAggregate.count(ctx,{namespace:attendanceNamespace(seasonId,"held","Tuesday"),bounds}),
    reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(seasonId,studentId,"Tuesday"),bounds}),
    reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(seasonId,studentId,"Thursday"),bounds}),
    reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(seasonId,studentId,"Outreach"),bounds}),
    reportAggregate.count(ctx,{namespace:attendanceNamespace(seasonId,"held","BuildWeekday"),bounds}),
    reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(seasonId,studentId,"BuildWeekday"),bounds}),
    reportAggregate.count(ctx,{namespace:attendanceNamespace(seasonId,"held","BuildSaturday"),bounds}),
    reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(seasonId,studentId,"BuildSaturday"),bounds}),
    reportAggregate.count(ctx,{namespace:attendanceNamespace(seasonId,"held","BuildSunday"),bounds}),
  ]);
  return {sessionsHeld,sessionsAttended,tuesdayHeld,tuesdayAttended,tuesdayPercent:tuesdayHeld?Math.round(100*tuesdayAttended/tuesdayHeld):null,thursdayAttended,outreachAttended,buildWeekdayHeld,buildWeekdayAttended,buildSaturdayHeld,buildSaturdayAttended,buildSundayHeld,updatedAt};
}
const sharedAttendanceFields={nextRefreshAt:nullableNumber,phaseBoundary:phaseBoundaryValidator,phases:phasesValidator,sessions:v.array(sessionValidator),isDone:v.boolean(),continueCursor:v.string(),splitCursor:v.optional(v.union(v.string(),v.null())),pageStatus:v.optional(v.union(v.literal("SplitRequired"),v.literal("SplitRecommended"),v.null())),legacy:legacyValidator,totalsScope:v.literal("currentFinalized")};
export const familyAttendance=query({
  args:{studentId:v.id("students"),asOf:v.number(),includeHistory:v.optional(v.boolean()),paginationOpts:v.optional(paginationOptsValidator)},
  returns:v.union(v.object({...sharedAttendanceFields,state:v.literal("ready"),verified:verifiedValidator}),v.object({...sharedAttendanceFields,state:v.union(v.literal("updating"),v.literal("failed")),verified:v.null(),canRebuild:v.boolean(),rebuildRunning:v.boolean(),processed:v.number(),message:v.string()})),
  handler:async(ctx,args)=>{
    if(!Number.isFinite(args.asOf))throw new ConvexError("Attendance could not load. Reload the page and try again.");
    if(args.paginationOpts && args.paginationOpts.numItems>10)throw new ConvexError("Attendance shows up to 10 meetings at a time. Reload the page and try again.");
    if(args.paginationOpts?.maximumRowsRead!==undefined&&(!Number.isSafeInteger(args.paginationOpts.maximumRowsRead)||args.paginationOpts.maximumRowsRead<1))throw new ConvexError("Attendance could not load. Reload the page and try again.");
    const user=await viewer(ctx);requireRole(user,"student","parent","coach");const student=await studentAccess(ctx,user,args.studentId);
    const season=await ctx.db.get(student.seasonId);if(!season)throw new ConvexError("This student's season could not be found. Reload the page, or contact a Coach if it keeps happening.");
    const kickoff=kickoffBoundaryForCompetitionYear(season.year);
    const phaseBoundary=kickoff.state==="verified"?{state:"verified" as const,competitionYear:season.year,kickoffDate:kickoff.kickoffDate,kickoffAt:kickoff.kickoffAt,currentPhase:args.asOf<kickoff.kickoffAt?"offseason" as const:"buildSeason" as const}:kickoff;
    const backfill=await ctx.db.query("attendanceReportBackfills").withIndex("by_seasonId",q=>q.eq("seasonId",student.seasonId)).unique();
    const unclassified=await ctx.db.query("timeclockSessionReportStates").withIndex("by_seasonId_and_outreach",q=>q.eq("seasonId",student.seasonId).eq("outreach",undefined)).first();
    const unclassifiedBuild=await ctx.db.query("timeclockSessionReportStates").withIndex("by_seasonId_and_buildDay",q=>q.eq("seasonId",student.seasonId).eq("buildDay",undefined)).first();
    const [pending,failed]=await Promise.all([reportAggregate.count(ctx,{namespace:attendanceNamespace(student.seasonId,"pending")}),reportAggregate.count(ctx,{namespace:attendanceNamespace(student.seasonId,"failed")})]);
    // Keep native endCursor/id/byte budgets; enforce a server row budget even when
    // an adaptive native page grows past its originally requested numItems.
    const paginationOpts=args.paginationOpts??{numItems:10,cursor:null};
    const stored=args.includeHistory===false?{page:[],isDone:true,continueCursor:""}:await ctx.db.query("timeclockSessions").withIndex("by_seasonId_and_scheduledStart",q=>q.eq("seasonId",student.seasonId).lte("scheduledStart",args.asOf)).order("desc").paginate({...paginationOpts,maximumRowsRead:Math.min(paginationOpts.maximumRowsRead??11,11)});
    if(stored.page.length>10)throw new ConvexError("Too many meetings to show at once. Reload the meeting list to see them 10 at a time; none were skipped.");
    const boundaries:number[]=[];
    if(kickoff.state==="verified"&&kickoff.kickoffAt>args.asOf)boundaries.push(kickoff.kickoffAt);
    if(args.includeHistory!==false){
      const nextSession=await ctx.db.query("timeclockSessions").withIndex("by_seasonId_and_scheduledStart",q=>q.eq("seasonId",student.seasonId).gt("scheduledStart",args.asOf)).first();
      const nextMeeting=await ctx.db.query("attendanceMeetings").withIndex("by_seasonId_and_startsAt",q=>q.eq("seasonId",student.seasonId).gt("startsAt",args.asOf)).first();
      if(nextSession)boundaries.push(nextSession.scheduledStart);
      if(nextMeeting)boundaries.push(nextMeeting.startsAt);
    }
    const sessions=[];let pageStale=false;
    for(const session of stored.page){
      if(session.state==="open"&&session.effectiveEnd>args.asOf)boundaries.push(Math.min(args.asOf+30000,session.effectiveEnd),...[session.scheduledEnd].filter(at=>at>args.asOf));
      const occurrence=await ctx.db.get(session.occurrenceId);
      const report=await ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId",q=>q.eq("sessionId",session._id)).unique();
      const row=await ctx.db.query("timeclockAttendanceSummaries").withIndex("by_sessionId_and_studentId",q=>q.eq("sessionId",session._id).eq("studentId",student._id)).unique();
      const fresh=report?.state==="ready"&&report.occurrenceTitle===occurrence?.title&&report.outreach===outreachForSession(session,occurrence?.title??"")&&report.buildDay===buildDayFromTitle(occurrence?.title??"",session.scheduledStart)&&report.sessionRevision===session.revision&&report.sessionState===session.state&&report.needsReview===session.needsReview&&(!row||row.sessionRevision===session.revision&&row.reportGeneration===report.reportGeneration&&row.outreach===report.outreach&&row.occurrenceTitle===report.occurrenceTitle&&row.buildDay===report.buildDay);
      if(session.state!=="open"&&!fresh)pageStale=true;
      const math=session.state==="open"?await attendanceEvidence(ctx,session,student._id,args.asOf):fresh?row??{totalMs:0,earlyMs:0,scheduledMs:0,extendedMs:0,longestScheduledMs:0,qualifies:false}:null;
      sessions.push({sessionId:session._id,title:occurrence?.title??"Unavailable event",scheduledStart:session.scheduledStart,state:session.state,totalMs:math?.totalMs??null,scheduledMs:math?.scheduledMs??null,earlyMs:math?.earlyMs??null,extendedMs:math?.extendedMs??null,longestScheduledMs:math?.longestScheduledMs??null,qualifies:math?.qualifies??null,needsReview:session.needsReview,provisional:session.state==="open",reportState:session.state==="open"||fresh?"ready" as const:report?.state==="failed"?"failed" as const:"updating" as const});
    }
    const meetings=args.includeHistory===false?[]:await ctx.db.query("attendanceMeetings").withIndex("by_seasonId_and_startsAt",q=>q.eq("seasonId",student.seasonId).lte("startsAt",args.asOf)).take(501);
    const records=args.includeHistory===false?[]:await ctx.db.query("attendanceRecords").withIndex("by_studentId",q=>q.eq("studentId",student._id)).take(501);
    if(meetings.length>500||records.length>500)throw new ConvexError("Too many older attendance records to total here. Contact a Coach to review this student's attendance.");
    const present=new Set(records.filter(r=>r.present).map(r=>r.meetingId));const held=meetings.filter(m=>!m.cancelled);const tuesdays=held.filter(m=>m.kind==="Tuesday");const attended=tuesdays.filter(m=>present.has(m._id)).length;
    const legacy={tuesdayHeld:tuesdays.length,tuesdayAttended:attended,tuesdayPercent:tuesdays.length?Math.round(100*attended/tuesdays.length):null,thursdayAttended:held.filter(m=>m.kind==="Thursday"&&present.has(m._id)).length,outreachAttended:held.filter(m=>m.kind==="Outreach"&&present.has(m._id)).length};
    const shared={nextRefreshAt:boundaries.length?Math.min(...boundaries):null,phaseBoundary,phases:null,sessions,isDone:stored.isDone,continueCursor:stored.continueCursor,...(stored.splitCursor!==undefined?{splitCursor:stored.splitCursor}:{}),...(stored.pageStatus!==undefined?{pageStatus:stored.pageStatus}:{}),legacy,totalsScope:"currentFinalized" as const};
    if(backfill?.state!=="complete"||pending>0||failed>0||pageStale||!!unclassified||!!unclassifiedBuild)return publicErrorResult({...shared,state:backfill?.state==="failed"||failed>0?"failed" as const:"updating" as const,verified:null,canRebuild:user.role==="coach"&&backfill?.state!=="running",rebuildRunning:backfill?.state==="running"||pending>0,processed:backfill?.processed??0,message:publicErrorMessage(backfill?.lastError)??(failed>0?"Some attendance records need Coach review. Totals will appear after that.":"Attendance totals are updating. Check back in a few minutes.")});
    const [sessionsHeld,sessionsAttended,tuesdayHeld,tuesdayAttended,thursdayAttended,outreachAttended]=await Promise.all([reportAggregate.count(ctx,{namespace:attendanceNamespace(student.seasonId,"held")}),reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(student.seasonId,student._id)}),reportAggregate.count(ctx,{namespace:attendanceNamespace(student.seasonId,"held","Tuesday")}),reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(student.seasonId,student._id,"Tuesday")}),reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(student.seasonId,student._id,"Thursday")}),reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(student.seasonId,student._id,"Outreach")})]);
    const latest=await ctx.db.query("timeclockSessionReportStates").withIndex("by_seasonId_and_updatedAt",q=>q.eq("seasonId",student.seasonId)).order("desc").first();
    const updatedAt=Math.max(backfill.updatedAt,latest?.updatedAt??0);
    const phases=kickoff.state==="verified"?{offseason:await phaseCounts(ctx,student.seasonId,student._id,kickoff.kickoffAt,"offseason",updatedAt),buildSeason:await phaseCounts(ctx,student.seasonId,student._id,kickoff.kickoffAt,"buildSeason",updatedAt)}:null;
    return publicErrorResult({...shared,phases,state:"ready" as const,verified:{sessionsHeld,sessionsAttended,tuesdayHeld,tuesdayAttended,tuesdayPercent:tuesdayHeld?Math.round(100*tuesdayAttended/tuesdayHeld):null,thursdayAttended,outreachAttended,updatedAt:Math.max(backfill.updatedAt,latest?.updatedAt??0)}});
  },
});

const attendedOfHeld = v.object({ attended: v.number(), held: v.number() });
/** Matches HomeAttendance in src/features/student-home/contract.ts. The query never returns "beforeKickoff": it cannot read the clock, so the browser compares kickoffAt with now. */
const homeAttendanceValidator = v.object({
  state: v.union(v.literal("ready"), v.literal("updating"), v.literal("unavailable")),
  meetings: attendedOfHeld,
  outreach: attendedOfHeld,
  buildHours: v.object({ state: v.union(v.literal("beforeKickoff"), v.literal("kickoffUnknown"), v.literal("ready")), minutes: v.number(), targetHours: nullableNumber }),
  kickoffAt: nullableNumber,
});

/** Family access is checked before season status, so another family's student is refused rather than reported as unavailable. */
async function homeAttendanceStudent(ctx: QueryCtx, user: AppUser, studentId: Id<"students">) {
  const student = await ctx.db.get(studentId);
  if (!student) throw new ConvexError("This student was not found. Reload to see the current roster.");
  const link = user.role === "parent" ? await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", user._id).eq("studentId", studentId)).unique() : null;
  const owns = user.role === "coach" || (user.role === "student" && student.userId === user._id) || link?.active === true;
  if (!owns) throw new ConvexError("You don't have permission for this student's record. Ask a Coach if this is wrong.");
  const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
  if (!season || !student.active || student.seasonId !== season._id) return null;
  await studentAccess(ctx, user, studentId);
  return { student, season };
}

function studentBuildMinutes(ctx: QueryCtx, seasonId: Id<"seasons">, studentId: Id<"students">, kickoffAt: number | null) {
  return kickoffAt === null ? Promise.resolve(0) : reportAggregate.sum(ctx, { namespace: studentBuildMinutesNamespace(seasonId, studentId), bounds: { lower: { key: kickoffAt, inclusive: true } } });
}

/** Participation rings for Student Home. Counts appear only when the season's attendance reports are ready. */
export const homeAttendance = query({
  args: { studentId: v.id("students") }, returns: homeAttendanceValidator,
  handler: async (ctx, args): Promise<Infer<typeof homeAttendanceValidator>> => {
    const user = await viewer(ctx);
    requireRole(user, "student", "parent", "coach");
    const found = await homeAttendanceStudent(ctx, user, args.studentId);
    const none = { meetings: { attended: 0, held: 0 }, outreach: { attended: 0, held: 0 } };
    if (!found) return { state: "unavailable" as const, ...none, buildHours: { state: "kickoffUnknown" as const, minutes: 0, targetHours: null }, kickoffAt: null };
    const { student, season } = found;
    const gate = await teamReportAttendanceGate(ctx, season._id, season.year);
    const kickoffAt = gate.kickoff?.at ?? null;
    const targetHours = season.buildHoursTarget ?? null;
    const buildState = kickoffAt === null ? "kickoffUnknown" as const : "ready" as const;
    // A pending or failed session withholds every count, as the family and team reports do.
    if (gate.state === "updating" || gate.state === "failed") return { state: "updating" as const, ...none, buildHours: { state: buildState, minutes: 0, targetHours }, kickoffAt };
    const [held, heldOutreach, attended, attendedOutreach, buildMinutes] = await Promise.all([
      reportAggregate.count(ctx, { namespace: attendanceNamespace(season._id, "held", "Required") }),
      reportAggregate.count(ctx, { namespace: attendanceNamespace(season._id, "held", "Outreach") }),
      reportAggregate.count(ctx, { namespace: studentAttendanceNamespace(season._id, student._id, "Required") }),
      reportAggregate.count(ctx, { namespace: studentAttendanceNamespace(season._id, student._id, "Outreach") }),
      studentBuildMinutes(ctx, season._id, student._id, kickoffAt),
    ]);
    // Meetings are Required meetings only; Other meetings appear in the breakdown.
    return {
      state: "ready" as const,
      meetings: { attended, held },
      outreach: { attended: attendedOutreach, held: heldOutreach },
      buildHours: { state: buildState, minutes: buildMinutes, targetHours },
      kickoffAt,
    };
  },
});

const dayTypeValidator = v.object({ attended: v.number(), held: v.number(), minutes: v.number() });
const breakdownValidator = v.object({
  state: v.union(v.literal("ready"), v.literal("updating")), kickoffAt: nullableNumber,
  required: attendedOfHeld, other: attendedOfHeld, outreach: attendedOfHeld,
  buildHours: v.object({ minutes: v.number(), targetHours: nullableNumber, weekday: dayTypeValidator, weekend: dayTypeValidator }),
});

/** Required / Other / Outreach attended-of-held plus Build hours, for the Student Home breakdown. */
export const attendanceBreakdown = query({
  args: { studentId: v.id("students") }, returns: breakdownValidator,
  handler: async (ctx, args): Promise<Infer<typeof breakdownValidator>> => {
    const user = await viewer(ctx);
    requireRole(user, "student", "parent", "coach");
    const found = await homeAttendanceStudent(ctx, user, args.studentId);
    const zero = { attended: 0, held: 0 };
    const noDays = { weekday: { ...zero, minutes: 0 }, weekend: { ...zero, minutes: 0 } };
    if (!found) return { state: "updating", kickoffAt: null, required: zero, other: zero, outreach: zero, buildHours: { minutes: 0, targetHours: null, ...noDays } };
    const { student, season } = found;
    const gate = await teamReportAttendanceGate(ctx, season._id, season.year);
    const kickoffAt = gate.kickoff?.at ?? null;
    const targetHours = season.buildHoursTarget ?? null;
    if (gate.state === "updating" || gate.state === "failed") return { state: "updating", kickoffAt, required: zero, other: zero, outreach: zero, buildHours: { minutes: 0, targetHours, ...noDays } };
    const pair = async (category: "Required" | "Other" | "Outreach") => {
      const [held, attended] = await Promise.all([
        reportAggregate.count(ctx, { namespace: attendanceNamespace(season._id, "held", category) }),
        reportAggregate.count(ctx, { namespace: studentAttendanceNamespace(season._id, student._id, category) }),
      ]);
      return { attended, held };
    };
    const [required, other, outreach, build] = await Promise.all([pair("Required"), pair("Other"), pair("Outreach"), kickoffAt === null ? Promise.resolve(null) : buildDayTypeCounts(ctx, season._id, student._id, kickoffAt)]);
    return { state: "ready", kickoffAt, required, other, outreach, buildHours: { minutes: build?.totalMinutes ?? 0, targetHours, weekday: build?.weekday ?? noDays.weekday, weekend: build?.weekend ?? noDays.weekend } };
  },
});

const sessionRowValidator = v.object({ sessionId: v.id("timeclockSessions"), scheduledStart: v.number(), title: v.union(v.string(), v.null()), status: v.union(v.literal("attended"), v.literal("missed")), minutes: v.optional(v.number()), dayType: v.optional(v.union(v.literal("weekday"), v.literal("weekend"))) });
const ATTENDANCE_PAGE_ROWS = 10;
const emptyPage = { page: [], isDone: true, continueCursor: "" };

/** Meeting-by-meeting drill-down for one category. Each call reads at most one page of rows; pages can be shorter than 10 when a row is not a held session. Reports that are still updating return no rows. */
export const attendanceSessions = query({
  args: { studentId: v.id("students"), kind: v.union(v.literal("required"), v.literal("other"), v.literal("outreach"), v.literal("build")), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(sessionRowValidator),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    requireRole(user, "student", "parent", "coach");
    if (args.paginationOpts.numItems > ATTENDANCE_PAGE_ROWS) throw new ConvexError("Attendance shows up to 10 meetings at a time. Reload the page and try again.");
    const found = await homeAttendanceStudent(ctx, user, args.studentId);
    if (!found) return emptyPage;
    const { student, season } = found;
    const gate = await teamReportAttendanceGate(ctx, season._id, season.year);
    if (gate.state === "updating" || gate.state === "failed") return emptyPage;
    const opts = { ...args.paginationOpts, maximumRowsRead: Math.min(args.paginationOpts.maximumRowsRead ?? 50, 50) };
    // Every kind lists held sessions from the season's report states; Build starts at kickoff and shows the same whole minutes that make up Build hours.
    const states = ctx.db.query("timeclockSessionReportStates");
    const result = args.kind === "build"
      ? gate.kickoff === null ? null : await states.withIndex("by_seasonId_and_build_and_scheduledStart", q => q.eq("seasonId", season._id).eq("build", true).gte("scheduledStart", gate.kickoff!.at)).order("desc").paginate(opts)
      : await states.withIndex("by_seasonId_and_outreach_and_required_and_scheduledStart", q => q.eq("seasonId", season._id).eq("outreach", args.kind === "outreach").eq("required", args.kind === "required")).order("desc").paginate(opts);
    if (!result) return emptyPage;
    const held = result.page.filter(report => report.state === "ready" && report.sessionState === "closed" && !report.needsReview);
    const page = await Promise.all(held.map(async report => {
      const row = await ctx.db.query("timeclockAttendanceSummaries").withIndex("by_sessionId_and_studentId", q => q.eq("sessionId", report.sessionId).eq("studentId", student._id)).unique();
      const fresh = row !== null && row.reportGeneration === report.reportGeneration;
      const attended = fresh && (args.kind === "build" ? row.totalMs > 0 : row.qualifies) && row.sessionState === "closed" && !row.needsReview;
      const minutes = fresh && args.kind === "build" ? buildMinutesContribution(row) : fresh && attended ? Math.floor(row.totalMs / 60000) : undefined;
      return { sessionId: report.sessionId, scheduledStart: report.scheduledStart, title: report.occurrenceTitle ?? null, status: attended ? "attended" as const : "missed" as const, ...(minutes !== undefined ? { minutes } : {}), ...(args.kind === "build" ? { dayType: report.buildDay === "saturday" || report.buildDay === "sunday" ? "weekend" as const : "weekday" as const } : {}) };
    }));
    return { ...result, page };
  },
});

export const team = query({
  args: {}, returns: v.union(
    v.object({ state: v.literal("ready"), maintenance: feeMaintenanceValidator, activeStudents: v.number(), inactiveStudents: v.number(), travelTeamStudents: v.number(), finance: financeValidator }),
    v.object({ state: v.union(v.literal("updating"), v.literal("failed")), maintenance: feeMaintenanceValidator, activeStudents: v.number(), inactiveStudents: v.number(), travelTeamStudents: v.number(), finance: v.null(), processed: v.number(), rebuildRunning: v.boolean(), canRebuild: v.boolean(), message: v.string() }),
  ),
  handler: async ctx => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new ConvexError("Only a Coach or Travel Lead can see team Money totals.");
    const season = await activeSeason(ctx);
    const students = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(501);
    if (students.length > 500) throw new ConvexError("Too many students this season to show team totals. Each student's account is still available.");
    const backfill = await ctx.db.query("financeSummaryBackfills").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    const readyAccounts = await ctx.db.query("financialAccounts").withIndex("by_seasonId_and_state", q => q.eq("seasonId", season._id).eq("state", "ready")).take(501);
    const readyIds = new Set(readyAccounts.map(account => account.studentId));
    const maintenance = await feeMaintenanceProjection(ctx, season._id);
    const roster = { maintenance, activeStudents: students.filter(s => s.active).length, inactiveStudents: students.filter(s => !s.active).length, travelTeamStudents: students.filter(s => s.active && s.travelTeam).length };
    if (readyAccounts.length !== students.length || students.some(student => !readyIds.has(student._id))) {
      const failedAccount = await ctx.db.query("financialAccounts").withIndex("by_seasonId_and_state", q => q.eq("seasonId", season._id).eq("state", "failed")).first();
      return publicErrorResult({
        state: failedAccount ? "failed" as const : "updating" as const, ...roster, finance: null,
        processed: backfill?.processed ?? 0, rebuildRunning: backfill?.state === "running", canRebuild: user.role === "coach" && backfill?.state !== "running" && (!maintenance || maintenance.state === "ready" || maintenance.state === "failed"),
        message: failedAccount ? "Some student accounts need Coach review before team totals can be shown." : "Money records are still being prepared. Check back in a few minutes.",
      });
    }
    const summaries = await ctx.db.query("studentFinanceSummaries").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(501);
    if (backfill?.state !== "complete" || summaries.length > 500 || summaries.length !== students.length || summaries.some(summary => summary.version !== FINANCE_SUMMARY_VERSION || !students.some(student => student._id === summary.studentId)) || students.some(student => !summaries.some(summary => summary.studentId === student._id))) return publicErrorResult({ state: backfill?.state === "failed" ? "failed" as const : "updating" as const, ...roster, finance: null, processed: backfill?.processed ?? 0, rebuildRunning: backfill?.state === "running", canRebuild: user.role === "coach" && backfill?.state !== "running" && (!maintenance || maintenance.state === "ready" || maintenance.state === "failed"), message:publicErrorMessage(backfill?.lastError) ?? "Money totals are updating. A Coach can choose Rebuild financial reports, or check back later." });
    // Finance includes inactive current-season accounts: archiving never erases debt or credit.
    const metrics = ["chargedCents", "paidCents", "dueCents", "travelBalanceCents", "personalAvailableCents", "fundraisingAvailableCents", "travelShareCents", "transferredInCents", "knownRaisedCents"] as const;
    const invalidProjection = summaries.some(row => {
      const account = readyAccounts.find(item => item.studentId === row.studentId);
      return !account || account.allocationSourceVersion !== 1 || account.operationJobId || account.allocationJobId || account.fundraiserJobId || row.financialGeneration !== account.generation || row.financialRevision !== account.revision || metrics.some(key => row[key] === undefined || !Number.isSafeInteger(row[key]) || row[key]! < 0) || row.personalAppliedCents === undefined || row.fundraisingAppliedCents === undefined || !Number.isSafeInteger(row.personalAppliedCents) || !Number.isSafeInteger(row.fundraisingAppliedCents) || row.personalAppliedCents < 0 || row.fundraisingAppliedCents < 0 || BigInt(row.personalAppliedCents) + BigInt(row.fundraisingAppliedCents) !== BigInt(row.paidCents);
    });
    if (invalidProjection) return publicErrorResult({ state: "failed" as const, ...roster, finance: null, processed: backfill.processed, rebuildRunning: false, canRebuild: user.role === "coach" && (!maintenance || maintenance.state === "ready" || maintenance.state === "failed"), message: "Some student accounts need Coach review before team totals can be shown." });
    const exact = Object.fromEntries(metrics.map(key => [key, summaries.reduce((total, row) => total + BigInt(row[key] ?? 0), 0n)])) as Record<typeof metrics[number], bigint>;
    if (Object.values(exact).some(value => value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))) return publicErrorResult({ state: "failed" as const, ...roster, finance: null, processed: backfill.processed, rebuildRunning: false, canRebuild: user.role === "coach" && (!maintenance || maintenance.state === "ready" || maintenance.state === "failed"), message: "Team totals are too large to show. Each student's account is still available." });
    const { knownRaisedCents, ...aggregated } = Object.fromEntries(metrics.map(key => [key, Number(exact[key])])) as Record<typeof metrics[number], number>;
    const totals = { ...aggregated, raisedCents: summaries.every(row => row.raisedComplete) ? knownRaisedCents : null, updatedAt: null as number | null };
    for (const finance of summaries) {
      if (finance.updatedAt !== null) totals.updatedAt = Math.max(totals.updatedAt ?? finance.updatedAt, finance.updatedAt);
    }
    return publicErrorResult({ state: "ready" as const, ...roster, finance: totals });
  },
});
