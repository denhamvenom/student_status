/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { createTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";
import { invalidateAttendanceSession, attendanceEvidence } from "./lib/attendanceReports";
import { reportAggregate, updateSessionAggregate } from "./lib/reportAggregates";
const modules=import.meta.glob("./**/*.ts");
const hour=3600000;
const start=Date.parse("2026-10-13T21:00:00Z");
type T=ReturnType<typeof createTest>;

async function fixture(state:"open"|"closed"="closed",studentsCount=1){
  const t=createTest(schema,modules);
  const ids=await t.run(async ctx=>{
    const auth=await ctx.db.insert("users",{email:"attendance-report-coach@example.invalid"});
    const coach=await ctx.db.insert("appUsers",{authUserId:auth,email:"attendance-report-coach@example.invalid",name:"Synthetic Coach",role:"coach",travelLead:false,financialEdit:false,active:true});
    const familyAuth=await ctx.db.insert("users",{email:"attendance-report-family@example.invalid"});
    const family=await ctx.db.insert("appUsers",{authUserId:familyAuth,email:"attendance-report-family@example.invalid",name:"Synthetic Parent",role:"parent",travelLead:false,financialEdit:false,active:true});
    const season=await ctx.db.insert("seasons",{name:"Synthetic",year:2026,status:"active",startsAt:0,permissionVersion:"DRAFT",createdBy:coach});
    const students=[];
    for(let index=0;index<studentsCount;index++)students.push(await ctx.db.insert("students",{seasonId:season,legalName:`Synthetic ${index}`,preferredName:`Synthetic ${index}`,email:`attendance-${index}@example.invalid`,subteam:"Build",active:true,travelTeam:false,roomCategoryLocked:false,allergies:{state:"reported",text:"PRIVATE HEALTH"},medications:{state:"unknown"}}));
    await ctx.db.insert("familyLinks",{studentId:students[0],parentUserId:family,active:true,createdBy:coach});
    const occurrenceId=await ctx.db.insert("timeclockOccurrences",{seasonId:season,source:"manual",sourceKey:"synthetic-session",title:"Synthetic session",allDay:false,cancelled:false,observedAt:start,revision:1,needsReview:false});
    const session=await ctx.db.insert("timeclockSessions",{seasonId:season,occurrenceId,state,scheduledStart:start,scheduledEnd:start+2*hour,effectiveEnd:start+2*hour,extensionMs:0,openedAt:start,openedBy:coach,closedAt:state==="closed"?start+2*hour:undefined,revision:1,needsReview:false});
    const intervals=[];
    for(const studentId of students)intervals.push(await ctx.db.insert("timeclockIntervals",{sessionId:session,studentId,inAt:start,outAt:state==="closed"?start+hour:undefined,openedBy:coach,openCommandKey:`synthetic-${studentId}`,scheduleRevision:1}));
    return{auth,coach,familyAuth,season,students,session,intervals,occurrenceId};
  });
  return{t,ids,coach:t.withIdentity({subject:`${ids.auth}|session`}),family:t.withIdentity({subject:`${ids.familyAuth}|session`})};
}
async function step(t:T,sessionId:Id<"timeclockSessions">){
  const state=await t.run(ctx=>ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId",q=>q.eq("sessionId",sessionId)).unique());
  if(!state||state.state!=="rebuilding")return false;
  await t.mutation(internal.attendanceReportMaintenance.continueSession,{sessionId,expectedGeneration:state.reportGeneration,expectedSessionRevision:state.sessionRevision,expectedPhase:state.phase,expectedCursor:state.cursor});return true;
}
async function settle(t:T,sessionId:Id<"timeclockSessions">){for(let index=0;index<100;index++)if(!await step(t,sessionId))return;throw new Error("Attendance report did not settle.")}
async function initialize(f:Awaited<ReturnType<typeof fixture>>){
  const id=await f.coach.mutation(api.attendanceReportMaintenance.start,{});
  for(let index=0;index<20;index++){
    const row=await f.t.run(ctx=>ctx.db.get(id));if(row?.state!=="running")break;
    await f.t.mutation(internal.attendanceReportMaintenance.continueSeason,{backfillId:id,expectedCursor:row.cursor});
  }
  await settle(f.t,f.ids.session);
}
describe("attendance projection maintenance",()=>{
  it("requires Coach maintenance and keeps unknown coverage unavailable",async()=>{
    const f=await fixture();
    await expect(f.t.mutation(api.attendanceReportMaintenance.start,{})).rejects.toThrow();
    await expect(f.family.mutation(api.attendanceReportMaintenance.start,{})).rejects.toThrow();
    const unknown=await f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+3*hour});
    expect(unknown).toMatchObject({state:"updating",verified:null,legacy:{tuesdayHeld:0}});
    await expect(f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+3*hour,paginationOpts:{numItems:11,cursor:null}})).rejects.toThrow("up to 10 meetings");
    await expect(f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+3*hour,paginationOpts:{numItems:10,cursor:null,maximumRowsRead:Number.NaN}})).rejects.toThrow("Attendance could not load");
    await initialize(f);
    expect(await f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+3*hour})).toMatchObject({state:"ready",verified:{sessionsHeld:1,sessionsAttended:1,tuesdayPercent:100}});
  });
  it("projects paginated unique subjects, includes correction-only visits and fences duplicate workers",async()=>{
    const f=await fixture("closed",23);
    await f.t.run(async ctx=>{
      await ctx.db.delete(f.ids.intervals[22]);
      await ctx.db.insert("timeclockCorrections",{sessionId:f.ids.session,studentId:f.ids.students[22],kind:"add",inAt:start,outAt:start+hour,reason:"Synthetic missing visit",actorId:f.ids.coach,at:start+3*hour,commandKey:"synthetic-added"});
      await invalidateAttendanceSession(ctx,f.ids.session);
    });
    const original=await f.t.run(ctx=>ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId",q=>q.eq("sessionId",f.ids.session)).unique());
    await step(f.t,f.ids.session);
    const after=await f.t.run(ctx=>ctx.db.get(original!._id));
    await f.t.mutation(internal.attendanceReportMaintenance.continueSession,{sessionId:f.ids.session,expectedGeneration:original!.reportGeneration,expectedSessionRevision:original!.sessionRevision,expectedPhase:original!.phase,expectedCursor:original!.cursor});
    expect(await f.t.run(ctx=>ctx.db.get(original!._id))).toEqual(after);
    await settle(f.t,f.ids.session);
    const summaries=await f.t.run(ctx=>ctx.db.query("timeclockAttendanceSummaries").withIndex("by_sessionId_and_studentId",q=>q.eq("sessionId",f.ids.session)).take(30));
    expect(summaries).toHaveLength(23);expect(summaries.every(row=>row.qualifies)).toBe(true);
    expect(summaries.find(row=>row.studentId===f.ids.students[22])?.totalMs).toBe(hour);
  });
  it("invalidates through actual corrections and refuses stale generations and replay double-counting",async()=>{
    const f=await fixture();await initialize(f);
    const before=await f.t.run(ctx=>ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId",q=>q.eq("sessionId",f.ids.session)).unique());
    const correction={sessionId:f.ids.session,studentId:f.ids.students[0],originalIntervalId:f.ids.intervals[0],kind:"void" as const,reason:"Synthetic correction review",key:"report-correction-key"};
    expect(await f.coach.mutation(api.timeclock.correctInterval,correction)).toMatchObject({ok:true});
    const after=await f.t.run(ctx=>ctx.db.get(before!._id));
    expect(after?.reportGeneration).toBe(before!.reportGeneration+1);
    expect(await f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+3*hour})).toMatchObject({state:"updating",verified:null});
    await f.t.mutation(internal.attendanceReportMaintenance.continueSession,{sessionId:f.ids.session,expectedGeneration:before!.reportGeneration,expectedSessionRevision:before!.sessionRevision,expectedPhase:"originals",expectedCursor:null});
    expect(await f.t.run(ctx=>ctx.db.get(before!._id))).toEqual(after);
    expect(await f.coach.mutation(api.timeclock.correctInterval,correction)).toMatchObject({ok:true});
    expect((await f.t.run(ctx=>ctx.db.get(before!._id)))?.reportGeneration).toBe(after!.reportGeneration);
    await settle(f.t,f.ids.session);
    expect(await f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+3*hour})).toMatchObject({state:"ready",verified:{sessionsHeld:1,sessionsAttended:0,tuesdayPercent:0}});
  });
  it("gates stale numerators during cancellation and review changes until rebuilding removes contributions",async()=>{
    for(const change of [{state:"cancelled" as const},{needsReview:true}]){
      const f=await fixture();await initialize(f);
      await f.t.run(async ctx=>{await ctx.db.patch(f.ids.session,change);await invalidateAttendanceSession(ctx,f.ids.session)});
      expect(await f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+3*hour})).toMatchObject({state:"updating",verified:null});
      await settle(f.t,f.ids.session);
      expect(await f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+3*hour})).toMatchObject({state:"ready",verified:{sessionsHeld:0,sessionsAttended:0,tuesdayPercent:null}});
    }
  });
  it("scheduled close initializes projections and source math matches the stored projection",async()=>{
    const f=await fixture("open");
    await f.t.mutation(internal.timeclock.scheduledClose,{sessionId:f.ids.session,expectedRevision:1,expectedEnd:start+2*hour});
    await settle(f.t,f.ids.session);
    await f.t.run(async ctx=>{
      const session=await ctx.db.get(f.ids.session);
      const projection=await ctx.db.query("timeclockAttendanceSummaries").withIndex("by_sessionId_and_studentId",q=>q.eq("sessionId",f.ids.session).eq("studentId",f.ids.students[0])).unique();
      expect(projection).toMatchObject(await attendanceEvidence(ctx,session!,f.ids.students[0],Number.MAX_SAFE_INTEGER));
      expect(projection).toMatchObject({totalMs:2*hour,scheduledMs:2*hour,qualifies:true,sessionRevision:2});
    });
  });
  it("returns structured failed evidence, then repairs and rebuilds without publishing partial counts",async()=>{
    const f=await fixture();
    const bad=await f.t.run(async ctx=>{const id=await ctx.db.insert("timeclockIntervals",{sessionId:f.ids.session,studentId:f.ids.students[0],inAt:start+hour/2,outAt:start+1.5*hour,openedBy:f.ids.coach,openCommandKey:"overlap-synthetic",scheduleRevision:1});await invalidateAttendanceSession(ctx,f.ids.session);return id});
    await initialize(f);
    expect(await f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+3*hour})).toMatchObject({state:"failed",verified:null});
    await f.t.run(ctx=>ctx.db.patch(bad,{inAt:start+hour,outAt:start+1.5*hour}));
    await f.coach.mutation(api.attendanceReportMaintenance.rebuildSession,{sessionId:f.ids.session});await settle(f.t,f.ids.session);
    expect(await f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+3*hour})).toMatchObject({state:"ready",verified:{sessionsHeld:1,sessionsAttended:1}});
  });
  it("reads more than 500 held sessions through aggregates and paginates minimized cards",async()=>{
    const f=await fixture();await initialize(f);
    await f.t.run(async ctx=>{
      const source=await ctx.db.get(f.ids.session);
      for(let index=0;index<505;index++){
        const sessionId=await ctx.db.insert("timeclockSessions",{occurrenceId:f.ids.occurrenceId,seasonId:f.ids.season,state:"closed",scheduledStart:start-index-1,scheduledEnd:start+2*hour,effectiveEnd:start+2*hour,extensionMs:0,openedAt:start,openedBy:f.ids.coach,closedAt:start+2*hour,revision:1,needsReview:false});
        const id=await ctx.db.insert("timeclockSessionReportStates",{buildDay:null,outreach:false,occurrenceTitle:"Synthetic session",sessionId,seasonId:f.ids.season,scheduledStart:start-index-1,weekday:"Tuesday",sessionState:"closed",needsReview:false,sessionRevision:1,reportGeneration:1,state:"ready",phase:"verify",cursor:null,processed:0,updatedAt:start+2*hour});
        const row=await ctx.db.get(id);await updateSessionAggregate(ctx,null,row!);
      }
      expect(source?.state).toBe("closed");
    });
    const first=await f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+3*hour,paginationOpts:{numItems:10,cursor:null}});
    expect(first).toMatchObject({state:"ready",verified:{sessionsHeld:506,sessionsAttended:1},isDone:false});expect(first.sessions).toHaveLength(10);
    const second=await f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+3*hour,paginationOpts:{numItems:10,cursor:first.continueCursor}});
    expect(second.sessions).toHaveLength(10);expect(second.sessions.some(row=>first.sessions.some(previous=>previous.sessionId===row.sessionId))).toBe(false);
    const nativeExpanded=await f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+3*hour,paginationOpts:{numItems:1,cursor:null,endCursor:first.continueCursor,id:47}});
    expect(nativeExpanded.sessions.map(row=>row.sessionId)).toEqual(first.sessions.map(row=>row.sessionId));
    await expect(f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+3*hour,paginationOpts:{numItems:1,cursor:null,endCursor:second.continueCursor,maximumRowsRead:1000}})).rejects.toThrow("Too many meetings to show at once");
    const budgeted=await f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+3*hour,paginationOpts:{numItems:10,cursor:null,endCursor:second.continueCursor,maximumRowsRead:3}});
    expect(budgeted.sessions.length).toBeLessThanOrEqual(3);expect(budgeted.isDone).toBe(false);expect(budgeted.pageStatus).toBe("SplitRequired");expect(budgeted.splitCursor).toBeTruthy();
    expect(JSON.stringify(first)).not.toContain("PRIVATE HEALTH");expect(JSON.stringify(first)).not.toContain("actorId");
  },30000);
  it("rolls back summary and aggregate page writes together after component failure, then repairs the old namespace",async()=>{
    const f=await fixture();await initialize(f);
    const nextStart=Date.parse("2026-10-15T21:00:00Z");
    const before=await f.t.run(ctx=>ctx.db.query("timeclockAttendanceSummaries").withIndex("by_sessionId_and_studentId",q=>q.eq("sessionId",f.ids.session).eq("studentId",f.ids.students[0])).unique());
    await f.t.run(async ctx=>{
      await ctx.db.patch(f.ids.session,{scheduledStart:nextStart,scheduledEnd:nextStart+2*hour,effectiveEnd:nextStart+2*hour,closedAt:nextStart+2*hour,revision:2});
      await ctx.db.patch(f.ids.intervals[0],{inAt:nextStart,outAt:nextStart+hour});
      await invalidateAttendanceSession(ctx,f.ids.session);
    });
    await step(f.t,f.ids.session);await step(f.t,f.ids.session);
    const original=reportAggregate.insertIfDoesNotExist.bind(reportAggregate);
    let failed=false;
    const spy=vi.spyOn(reportAggregate,"insertIfDoesNotExist").mockImplementation(async(ctx,args,options)=>{
      if(!failed&&args.namespace.includes(":qualified:")){failed=true;throw new Error("Synthetic component failure after old contribution removal.")}
      return original(ctx,args,options);
    });
    try{await step(f.t,f.ids.session)}finally{spy.mockRestore()}
    expect(failed).toBe(true);
    expect(await f.t.run(ctx=>ctx.db.get(before!._id))).toEqual(before);
    expect(await f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:nextStart+3*hour})).toMatchObject({state:"failed",verified:null});
    await f.coach.mutation(api.attendanceReportMaintenance.rebuildSession,{sessionId:f.ids.session});await settle(f.t,f.ids.session);
    expect(await f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:nextStart+3*hour})).toMatchObject({state:"ready",verified:{sessionsHeld:1,sessionsAttended:1,tuesdayHeld:0,tuesdayAttended:0,thursdayAttended:1}});
  });
  it("updates report metadata after later corrections and uses elapsed cutoff only for open evidence",async()=>{
    const f=await fixture();await initialize(f);
    await f.t.run(async ctx=>{const backfill=await ctx.db.query("attendanceReportBackfills").withIndex("by_seasonId",q=>q.eq("seasonId",f.ids.season)).unique();await ctx.db.patch(backfill!._id,{updatedAt:1})});
    await f.coach.mutation(api.timeclock.correctInterval,{sessionId:f.ids.session,studentId:f.ids.students[0],originalIntervalId:f.ids.intervals[0],kind:"replace",inAt:start,outAt:start+hour/2,reason:"Synthetic corrected short visit",key:"later-correction-key"});
    await settle(f.t,f.ids.session);
    const report=await f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+3*hour});
    expect(report.state).toBe("ready");expect(report.verified?.updatedAt).toBeGreaterThan(1);expect(report.verified?.sessionsAttended).toBe(0);
    const open=await fixture("open");
    expect((await open.family.query(api.dashboardReports.familyAttendance,{studentId:open.ids.students[0],asOf:start+hour/2})).sessions[0]).toMatchObject({totalMs:hour/2,scheduledMs:hour/2,provisional:true});
  });
  it("coalesces actual group in and bulk out invalidation once per session and ignores command replay",async()=>{
    vi.useFakeTimers();vi.setSystemTime(start+hour/2);
    try{
      const f=await fixture("open",2);
      await f.t.run(async ctx=>{
        for(const interval of f.ids.intervals)await ctx.db.delete(interval);
        for(const student of f.ids.students)await ctx.db.patch(student,{firstName:"Synthetic",lastName:`Report${student}`,structuredNameReviewed:true});
      });
      const args={sessionId:f.ids.session,mode:"in" as const,expectedRevision:1,expected:f.ids.students.map(studentId=>({studentId,intervalId:null})),key:"group-projection-in"};
      expect(await f.coach.mutation(api.timeclock.clockGroup,args)).toMatchObject({ok:true,count:2});
      const state=await f.t.run(ctx=>ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId",q=>q.eq("sessionId",f.ids.session)).unique());
      expect(state?.reportGeneration).toBe(1);
      expect(await f.coach.mutation(api.timeclock.clockGroup,args)).toMatchObject({ok:true,count:2});
      expect((await f.t.run(ctx=>ctx.db.get(state!._id)))?.reportGeneration).toBe(1);
      vi.setSystemTime(start+1.5*hour);
      expect(await f.coach.mutation(api.timeclock.clockOutAll,{sessionId:f.ids.session,expectedRevision:1,key:"group-projection-out"})).toMatchObject({ok:true,count:2});
      expect((await f.t.run(ctx=>ctx.db.get(state!._id)))?.reportGeneration).toBe(2);
    }finally{vi.useRealTimers()}
  });
  it("invalidates actual calendar schedule updates and cancellation with revision fencing",async()=>{
    vi.useFakeTimers();vi.setSystemTime(start+hour);
    try{
      const f=await fixture("open");await initialize(f);
      await f.t.run(async ctx=>{await ctx.db.patch(f.ids.occurrenceId,{source:"calendar",scheduledStart:start,scheduledEnd:start+2*hour});await ctx.db.insert("timeclockCalendarSync",{key:"team",calendarIdHash:"synthetic-calendar",timezone:"America/Chicago",generation:1})});
      const change={sourceKey:"synthetic-session",title:"Synthetic changed calendar",allDay:false,scheduledStart:start,scheduledEnd:start+3*hour,cancelled:false,observedAt:start+hour,generation:1};
      await f.t.mutation(internal.timeclock.applyCalendarOccurrence,change);
      const report=await f.t.run(ctx=>ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId",q=>q.eq("sessionId",f.ids.session)).unique());
      expect(report).toMatchObject({state:"ready",sessionRevision:2,reportGeneration:2,sessionState:"open"});
      await f.t.mutation(internal.timeclock.applyCalendarOccurrence,{...change,cancelled:true});
      expect(await f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+hour})).toMatchObject({state:"updating",verified:null});
      await settle(f.t,f.ids.session);
      expect(await f.family.query(api.dashboardReports.familyAttendance,{studentId:f.ids.students[0],asOf:start+hour})).toMatchObject({state:"ready",verified:{sessionsHeld:0,sessionsAttended:0}});
    }finally{vi.useRealTimers()}
  });
});
