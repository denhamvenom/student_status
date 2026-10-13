import { feeMaintenanceProjection, feeMaintenanceValidator } from "./lib/seasonFinance";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { activeSeason, requireRole, studentAccess, viewer } from "./lib/access";
import { calculateStudentFinance, FINANCE_SUMMARY_VERSION } from "./lib/financeSummaries";
import { financialAccount } from "./lib/financialSources";
import { attendanceEvidence } from "./lib/attendanceReports";
import { attendanceNamespace, studentAttendanceNamespace, reportAggregate } from "./lib/reportAggregates";
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
    if (user.role === "mentor" && !user.travelLead) throw new Error("You do not have permission for finances.");
    await studentAccess(ctx, user, args.studentId);
    return financialProjection(ctx, args.studentId);
  },
});

const legacyValidator = v.object({ tuesdayHeld: v.number(), tuesdayAttended: v.number(), tuesdayPercent: nullableNumber, thursdayAttended: v.number(), outreachAttended: v.number() });
const verifiedValidator = v.object({ sessionsHeld: v.number(), sessionsAttended: v.number(), tuesdayHeld: v.number(), tuesdayAttended: v.number(), tuesdayPercent: nullableNumber, thursdayAttended: v.number(), outreachAttended: v.null(), updatedAt: nullableNumber });
const sessionValidator = v.object({ sessionId: v.id("timeclockSessions"), title: v.string(), scheduledStart: v.number(), state: v.union(v.literal("open"), v.literal("closed"), v.literal("cancelled")), totalMs: nullableNumber, scheduledMs: nullableNumber, earlyMs: nullableNumber, extendedMs: nullableNumber, longestScheduledMs: nullableNumber, qualifies: v.union(v.boolean(),v.null()), needsReview: v.boolean(), provisional: v.boolean(), reportState:v.union(v.literal("ready"),v.literal("updating"),v.literal("failed")) });
const sharedAttendanceFields={sessions:v.array(sessionValidator),isDone:v.boolean(),continueCursor:v.string(),splitCursor:v.optional(v.union(v.string(),v.null())),pageStatus:v.optional(v.union(v.literal("SplitRequired"),v.literal("SplitRecommended"),v.null())),legacy:legacyValidator,totalsScope:v.literal("currentFinalized")};
export const familyAttendance=query({
  args:{studentId:v.id("students"),asOf:v.number(),paginationOpts:v.optional(paginationOptsValidator)},
  returns:v.union(v.object({...sharedAttendanceFields,state:v.literal("ready"),verified:verifiedValidator}),v.object({...sharedAttendanceFields,state:v.union(v.literal("updating"),v.literal("failed")),verified:v.null(),canRebuild:v.boolean(),rebuildRunning:v.boolean(),processed:v.number(),message:v.string()})),
  handler:async(ctx,args)=>{
    if(!Number.isFinite(args.asOf))throw new Error("Invalid report time.");
    if(args.paginationOpts && args.paginationOpts.numItems>10)throw new Error("Attendance pages support up to 10 sessions.");
    if(args.paginationOpts?.maximumRowsRead!==undefined&&(!Number.isSafeInteger(args.paginationOpts.maximumRowsRead)||args.paginationOpts.maximumRowsRead<1))throw new Error("Attendance row budgets must be positive integers.");
    const user=await viewer(ctx);requireRole(user,"student","parent","coach");const student=await studentAccess(ctx,user,args.studentId);
    const backfill=await ctx.db.query("attendanceReportBackfills").withIndex("by_seasonId",q=>q.eq("seasonId",student.seasonId)).unique();
    const [pending,failed]=await Promise.all([reportAggregate.count(ctx,{namespace:attendanceNamespace(student.seasonId,"pending")}),reportAggregate.count(ctx,{namespace:attendanceNamespace(student.seasonId,"failed")})]);
    // Keep native endCursor/id/byte budgets; enforce a server row budget even when
    // an adaptive native page grows past its originally requested numItems.
    const paginationOpts=args.paginationOpts??{numItems:10,cursor:null};
    const stored=await ctx.db.query("timeclockSessions").withIndex("by_seasonId_and_scheduledStart",q=>q.eq("seasonId",student.seasonId).lte("scheduledStart",args.asOf)).order("desc").paginate({...paginationOpts,maximumRowsRead:Math.min(paginationOpts.maximumRowsRead??11,11)});
    if(stored.page.length>10)throw new Error("Attendance page expanded beyond 10 sessions. Reload the session list to continue; no session cards were skipped.");
    const sessions=[];let pageStale=false;
    for(const session of stored.page){
      const occurrence=await ctx.db.get(session.occurrenceId);
      const report=await ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId",q=>q.eq("sessionId",session._id)).unique();
      const row=await ctx.db.query("timeclockAttendanceSummaries").withIndex("by_sessionId_and_studentId",q=>q.eq("sessionId",session._id).eq("studentId",student._id)).unique();
      const fresh=report?.state==="ready"&&report.sessionRevision===session.revision&&report.sessionState===session.state&&report.needsReview===session.needsReview&&(!row||row.sessionRevision===session.revision&&row.reportGeneration===report.reportGeneration);
      if(session.state!=="open"&&!fresh)pageStale=true;
      const math=session.state==="open"?await attendanceEvidence(ctx,session,student._id,args.asOf):fresh?row??{totalMs:0,earlyMs:0,scheduledMs:0,extendedMs:0,longestScheduledMs:0,qualifies:false}:null;
      sessions.push({sessionId:session._id,title:occurrence?.title??"Unavailable event",scheduledStart:session.scheduledStart,state:session.state,totalMs:math?.totalMs??null,scheduledMs:math?.scheduledMs??null,earlyMs:math?.earlyMs??null,extendedMs:math?.extendedMs??null,longestScheduledMs:math?.longestScheduledMs??null,qualifies:math?.qualifies??null,needsReview:session.needsReview,provisional:session.state==="open",reportState:session.state==="open"||fresh?"ready" as const:report?.state==="failed"?"failed" as const:"updating" as const});
    }
    const meetings=await ctx.db.query("attendanceMeetings").withIndex("by_seasonId_and_startsAt",q=>q.eq("seasonId",student.seasonId).lte("startsAt",args.asOf)).take(501);
    const records=await ctx.db.query("attendanceRecords").withIndex("by_studentId",q=>q.eq("studentId",student._id)).take(501);
    if(meetings.length>500||records.length>500)throw new Error("Legacy attendance limit reached; totals are unavailable.");
    const present=new Set(records.filter(r=>r.present).map(r=>r.meetingId));const held=meetings.filter(m=>!m.cancelled);const tuesdays=held.filter(m=>m.kind==="Tuesday");const attended=tuesdays.filter(m=>present.has(m._id)).length;
    const legacy={tuesdayHeld:tuesdays.length,tuesdayAttended:attended,tuesdayPercent:tuesdays.length?Math.round(100*attended/tuesdays.length):null,thursdayAttended:held.filter(m=>m.kind==="Thursday"&&present.has(m._id)).length,outreachAttended:held.filter(m=>m.kind==="Outreach"&&present.has(m._id)).length};
    const shared={sessions,isDone:stored.isDone,continueCursor:stored.continueCursor,...(stored.splitCursor!==undefined?{splitCursor:stored.splitCursor}:{}),...(stored.pageStatus!==undefined?{pageStatus:stored.pageStatus}:{}),legacy,totalsScope:"currentFinalized" as const};
    if(backfill?.state!=="complete"||pending>0||failed>0||pageStale)return{...shared,state:backfill?.state==="failed"||failed>0?"failed" as const:"updating" as const,verified:null,canRebuild:user.role==="coach"&&backfill?.state!=="running",rebuildRunning:backfill?.state==="running"||pending>0,processed:backfill?.processed??0,message:backfill?.lastError??(failed>0?"Attendance evidence needs Coach review.":"Attendance reports are updating. Verified totals will appear when rebuilding completes.")};
    const [sessionsHeld,sessionsAttended,tuesdayHeld,tuesdayAttended,thursdayAttended]=await Promise.all([reportAggregate.count(ctx,{namespace:attendanceNamespace(student.seasonId,"held")}),reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(student.seasonId,student._id)}),reportAggregate.count(ctx,{namespace:attendanceNamespace(student.seasonId,"held","Tuesday")}),reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(student.seasonId,student._id,"Tuesday")}),reportAggregate.count(ctx,{namespace:studentAttendanceNamespace(student.seasonId,student._id,"Thursday")})]);
    const latest=await ctx.db.query("timeclockSessionReportStates").withIndex("by_seasonId_and_updatedAt",q=>q.eq("seasonId",student.seasonId)).order("desc").first();
    return{...shared,state:"ready" as const,verified:{sessionsHeld,sessionsAttended,tuesdayHeld,tuesdayAttended,tuesdayPercent:tuesdayHeld?Math.round(100*tuesdayAttended/tuesdayHeld):null,thursdayAttended,outreachAttended:null,updatedAt:Math.max(backfill.updatedAt,latest?.updatedAt??0)}};
  },
});

export const team = query({
  args: {}, returns: v.union(
    v.object({ state: v.literal("ready"), maintenance: feeMaintenanceValidator, activeStudents: v.number(), inactiveStudents: v.number(), travelTeamStudents: v.number(), finance: financeValidator }),
    v.object({ state: v.union(v.literal("updating"), v.literal("failed")), maintenance: feeMaintenanceValidator, activeStudents: v.number(), inactiveStudents: v.number(), travelTeamStudents: v.number(), finance: v.null(), processed: v.number(), rebuildRunning: v.boolean(), canRebuild: v.boolean(), message: v.string() }),
  ),
  handler: async ctx => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new Error("You do not have permission for team finances.");
    const season = await activeSeason(ctx);
    const students = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(501);
    if (students.length > 500) throw new Error("Dashboard roster limit reached; totals are unavailable.");
    const backfill = await ctx.db.query("financeSummaryBackfills").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).unique();
    const summaries = await ctx.db.query("studentFinanceSummaries").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(501);
    const readyAccounts = await ctx.db.query("financialAccounts").withIndex("by_seasonId_and_state", q => q.eq("seasonId", season._id).eq("state", "ready")).take(501);
    const failedAccount = await ctx.db.query("financialAccounts").withIndex("by_seasonId_and_state", q => q.eq("seasonId", season._id).eq("state", "failed")).first();
    const readyIds = new Set(readyAccounts.map(account => account.studentId));
    const maintenance = await feeMaintenanceProjection(ctx, season._id);
    const roster = { maintenance, activeStudents: students.filter(s => s.active).length, inactiveStudents: students.filter(s => !s.active).length, travelTeamStudents: students.filter(s => s.active && s.travelTeam).length };
    if (readyAccounts.length !== students.length || students.some(student => !readyIds.has(student._id))) return {
      state: failedAccount ? "failed" as const : "updating" as const, ...roster, finance: null,
      processed: backfill?.processed ?? 0, rebuildRunning: backfill?.state === "running", canRebuild: user.role === "coach" && backfill?.state !== "running" && (!maintenance || maintenance.state === "ready" || maintenance.state === "failed"),
      message: failedAccount ? "A financial operation or rebuild requires Coach review before team totals can be verified." : "Financial records are being prepared or transactions are still processing.",
    };
    if (backfill?.state !== "complete" || summaries.length > 500 || summaries.length !== students.length || summaries.some(summary => summary.version !== FINANCE_SUMMARY_VERSION || !students.some(student => student._id === summary.studentId)) || students.some(student => !summaries.some(summary => summary.studentId === student._id))) return { state: backfill?.state === "failed" ? "failed" as const : "updating" as const, ...roster, finance: null, processed: backfill?.processed ?? 0, rebuildRunning: backfill?.state === "running", canRebuild: user.role === "coach" && backfill?.state !== "running" && (!maintenance || maintenance.state === "ready" || maintenance.state === "failed"), message: backfill?.lastError ?? "Financial reports are updating; rebuild reports before viewing totals." };
    // Finance includes inactive current-season accounts: archiving never erases debt or credit.
    const metrics = ["chargedCents", "paidCents", "dueCents", "travelBalanceCents", "personalAvailableCents", "fundraisingAvailableCents", "travelShareCents", "transferredInCents", "knownRaisedCents"] as const;
    const invalidProjection = summaries.some(row => {
      const account = readyAccounts.find(item => item.studentId === row.studentId);
      return !account || account.allocationSourceVersion !== 1 || account.operationJobId || account.allocationJobId || account.fundraiserJobId || row.financialGeneration !== account.generation || row.financialRevision !== account.revision || metrics.some(key => row[key] === undefined || !Number.isSafeInteger(row[key]) || row[key]! < 0) || row.personalAppliedCents === undefined || row.fundraisingAppliedCents === undefined || !Number.isSafeInteger(row.personalAppliedCents) || !Number.isSafeInteger(row.fundraisingAppliedCents) || row.personalAppliedCents < 0 || row.fundraisingAppliedCents < 0 || BigInt(row.personalAppliedCents) + BigInt(row.fundraisingAppliedCents) !== BigInt(row.paidCents);
    });
    if (invalidProjection) return { state: "failed" as const, ...roster, finance: null, processed: backfill.processed, rebuildRunning: false, canRebuild: user.role === "coach" && (!maintenance || maintenance.state === "ready" || maintenance.state === "failed"), message: "Financial projections require verification before team totals are available." };
    const exact = Object.fromEntries(metrics.map(key => [key, summaries.reduce((total, row) => total + BigInt(row[key] ?? 0), 0n)])) as Record<typeof metrics[number], bigint>;
    if (Object.values(exact).some(value => value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER))) return { state: "failed" as const, ...roster, finance: null, processed: backfill.processed, rebuildRunning: false, canRebuild: user.role === "coach" && (!maintenance || maintenance.state === "ready" || maintenance.state === "failed"), message: "Team totals exceed the supported exact-cent range; individual student records remain available." };
    const { knownRaisedCents, ...aggregated } = Object.fromEntries(metrics.map(key => [key, Number(exact[key])])) as Record<typeof metrics[number], number>;
    const totals = { ...aggregated, raisedCents: summaries.every(row => row.raisedComplete) ? knownRaisedCents : null, updatedAt: null as number | null };
    for (const finance of summaries) {
      if (finance.updatedAt !== null) totals.updatedAt = Math.max(totals.updatedAt ?? finance.updatedAt, finance.updatedAt);
    }
    return { state: "ready" as const, ...roster, finance: totals };
  },
});
