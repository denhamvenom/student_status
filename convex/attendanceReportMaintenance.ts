import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { activeSeason, requireRole, viewer } from "./lib/access";
import { buildDayFromTitle, discoverReportMember, invalidateAttendanceSession, projectAttendanceMember } from "./lib/attendanceReports";
import { updateSessionAggregate } from "./lib/reportAggregates";

const phase=v.union(v.literal("originals"),v.literal("corrections"),v.literal("verify"));
const cursor=v.union(v.string(),v.null());
const pageArgs={sessionId:v.id("timeclockSessions"),expectedGeneration:v.number(),expectedSessionRevision:v.number(),expectedPhase:phase,expectedCursor:cursor};
export const continueSession=internalMutation({
  args:pageArgs,returns:v.null(),
  handler:async(ctx,args):Promise<null>=>{
    try{await ctx.runMutation(internal.attendanceReportMaintenance.processSessionPage,args)}catch{
      const state=await ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId",q=>q.eq("sessionId",args.sessionId)).unique();
      if(state?.state==="rebuilding"&&state.reportGeneration===args.expectedGeneration&&state.sessionRevision===args.expectedSessionRevision&&state.phase===args.expectedPhase&&state.cursor===args.expectedCursor){
        await ctx.db.patch(state._id,{state:"failed",updatedAt:Date.now(),lastError:"Attendance evidence needs Coach review before reports can be rebuilt."});
        const failed=await ctx.db.get(state._id);if(failed)await updateSessionAggregate(ctx,state,failed);
      }
    }
    return null;
  },
});

/** A nested page transaction rolls back projection, aggregates and cursor together on failure. */
export const processSessionPage=internalMutation({
  args:pageArgs,returns:v.null(),
  handler:async(ctx,args):Promise<null>=>{
    const state=await ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId",q=>q.eq("sessionId",args.sessionId)).unique();
    const session=await ctx.db.get(args.sessionId);
    if(!state||!session||state.state!=="rebuilding"||state.reportGeneration!==args.expectedGeneration||state.sessionRevision!==args.expectedSessionRevision||session.revision!==args.expectedSessionRevision||state.phase!==args.expectedPhase||state.cursor!==args.expectedCursor)return null;
    const occurrence=await ctx.db.get(session.occurrenceId);if(!occurrence)throw new Error("Attendance source event is unavailable.");
    if(state.occurrenceTitle!==occurrence.title||state.buildDay!==buildDayFromTitle(occurrence.title,session.scheduledStart)){await invalidateAttendanceSession(ctx,session._id);return null;}
      let nextPhase=state.phase,nextCursor:string|null,done=false,processed=state.processed;
      if(state.phase==="originals"){
        const page=await ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId",q=>q.eq("sessionId",session._id)).paginate({numItems:20,cursor:state.cursor});
        for(const row of page.page)await discoverReportMember(ctx,session._id,row.studentId,state.reportGeneration);
        nextPhase=page.isDone?"corrections":"originals";nextCursor=page.isDone?null:page.continueCursor;
      }else if(state.phase==="corrections"){
        const page=await ctx.db.query("timeclockCorrections").withIndex("by_sessionId_and_studentId",q=>q.eq("sessionId",session._id)).paginate({numItems:20,cursor:state.cursor});
        for(const row of page.page)await discoverReportMember(ctx,session._id,row.studentId,state.reportGeneration);
        nextPhase=page.isDone?"verify":"corrections";nextCursor=page.isDone?null:page.continueCursor;
      }else{
        const page=await ctx.db.query("timeclockAttendanceReportMembers").withIndex("by_sessionId_and_reportGeneration",q=>q.eq("sessionId",session._id).eq("reportGeneration",state.reportGeneration)).paginate({numItems:1,cursor:state.cursor});
        for(const member of page.page){
          await projectAttendanceMember(ctx,session,member.studentId,state.reportGeneration);
          await ctx.db.patch(member._id,{projectedGeneration:state.reportGeneration});processed++;
        }
        done=page.isDone;nextCursor=done?null:page.continueCursor;
      }
      await ctx.db.patch(state._id,{state:done?"ready":"rebuilding",phase:nextPhase,cursor:nextCursor,processed,updatedAt:Date.now(),lastError:undefined});
      if(done){const next=await ctx.db.get(state._id);if(!next)throw new Error("Attendance report state unavailable.");await updateSessionAggregate(ctx,state,next)}
      else await ctx.scheduler.runAfter(0,internal.attendanceReportMaintenance.continueSession,{sessionId:session._id,expectedGeneration:state.reportGeneration,expectedSessionRevision:state.sessionRevision,expectedPhase:nextPhase,expectedCursor:nextCursor});
    return null;
  },
});

export const start=mutation({
  args:{},returns:v.id("attendanceReportBackfills"),
  handler:async ctx=>{
    requireRole(await viewer(ctx),"coach");const season=await activeSeason(ctx);
    const previous=await ctx.db.query("attendanceReportBackfills").withIndex("by_seasonId",q=>q.eq("seasonId",season._id)).unique();
    if(previous?.state==="running")return previous._id;
    const id=previous?previous._id:await ctx.db.insert("attendanceReportBackfills",{seasonId:season._id,state:"running",cursor:null,processed:0,updatedAt:Date.now()});
    if(previous)await ctx.db.patch(id,{state:"running",cursor:null,processed:0,updatedAt:Date.now(),lastError:undefined});
    await ctx.scheduler.runAfter(0,internal.attendanceReportMaintenance.continueSeason,{backfillId:id,expectedCursor:null});return id;
  },
});

export const continueSeason=internalMutation({
  args:{backfillId:v.id("attendanceReportBackfills"),expectedCursor:cursor},returns:v.null(),
  handler:async(ctx,args):Promise<null>=>{
    try{await ctx.runMutation(internal.attendanceReportMaintenance.processSeasonPage,args)}catch{
      const state=await ctx.db.get(args.backfillId);
      if(state?.state==="running"&&state.cursor===args.expectedCursor)await ctx.db.patch(state._id,{state:"failed",updatedAt:Date.now(),lastError:"Attendance report coverage needs Coach review."});
    }
    return null;
  },
});

export const processSeasonPage=internalMutation({
  args:{backfillId:v.id("attendanceReportBackfills"),expectedCursor:cursor},returns:v.null(),
  handler:async(ctx,args):Promise<null>=>{
    const state=await ctx.db.get(args.backfillId);if(!state||state.state!=="running"||state.cursor!==args.expectedCursor)return null;
      const page=await ctx.db.query("timeclockSessions").withIndex("by_seasonId_and_state",q=>q.eq("seasonId",state.seasonId)).paginate({numItems:5,cursor:state.cursor});
      for(const session of page.page)await invalidateAttendanceSession(ctx,session._id);
      await ctx.db.patch(state._id,{state:page.isDone?"complete":"running",cursor:page.isDone?null:page.continueCursor,processed:state.processed+page.page.length,updatedAt:Date.now()});
      if(!page.isDone)await ctx.scheduler.runAfter(0,internal.attendanceReportMaintenance.continueSeason,{backfillId:state._id,expectedCursor:page.continueCursor});
    return null;
  },
});

export const rebuildSession=mutation({
  args:{sessionId:v.id("timeclockSessions")},returns:v.null(),
  handler:async(ctx,args)=>{
    requireRole(await viewer(ctx),"coach");const season=await activeSeason(ctx);const session=await ctx.db.get(args.sessionId);
    if(!session||session.seasonId!==season._id)throw new Error("Session unavailable in the active season.");
    await invalidateAttendanceSession(ctx,session._id);return null;
  },
});

export const status=query({
  args:{},returns:v.object({state:v.union(v.literal("uninitialized"),v.literal("running"),v.literal("failed"),v.literal("complete")),processed:v.number(),lastError:v.union(v.string(),v.null())}),
  handler:async ctx=>{requireRole(await viewer(ctx),"coach");const season=await activeSeason(ctx);const state=await ctx.db.query("attendanceReportBackfills").withIndex("by_seasonId",q=>q.eq("seasonId",season._id)).unique();return{state:state?.state??"uninitialized" as const,processed:state?.processed??0,lastError:state?.lastError??null}},
});
