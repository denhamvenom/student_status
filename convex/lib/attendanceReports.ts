import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { assertNoOverlap, classifiedTime } from "./timeclock";
import { updateSessionAggregate, updateStudentAttendanceAggregate, type AttendanceWeekday } from "./reportAggregates";

export const outreachFromTitle = (title: string) => /outreach/i.test(title);

export function buildDayFromTitle(title: string, scheduledStart: number): "weekday" | "saturday" | "sunday" | null {
  if (!/build/i.test(title)) return null;
  const day = new Intl.DateTimeFormat("en-US", {timeZone:"America/Chicago",weekday:"long"}).format(scheduledStart);
  return day === "Saturday" ? "saturday" : day === "Sunday" ? "sunday" : "weekday";
}

export function attendanceWeekday(at: number): AttendanceWeekday {
  const day = new Intl.DateTimeFormat("en-US",{timeZone:"America/Chicago",weekday:"long"}).format(at);
  return day === "Tuesday" || day === "Thursday" ? day : "other";
}

export function correctedIntervals(session: Doc<"timeclockSessions">, originals: Doc<"timeclockIntervals">[], corrections: Doc<"timeclockCorrections">[], asOf: number) {
  // asOf limits elapsed time, not history: the latest audited corrections apply.
  const latest = new Map<string, Doc<"timeclockCorrections">>();
  for (const correction of corrections) { const key = correction.originalIntervalId ?? correction.targetCorrectionId; if(key) latest.set(key,correction); }
  const rows = [...originals.map(row=>({id:row._id as string,inAt:row.inAt,outAt:row.outAt ?? (session.state === "open" ? Math.min(asOf,session.effectiveEnd) : session.closedAt ?? session.effectiveEnd)})),...corrections.filter(c=>c.kind === "add" && c.inAt !== undefined && c.outAt !== undefined).map(c=>({id:c._id as string,inAt:c.inAt!,outAt:c.outAt!}))];
  const result=rows.flatMap(row=>{const correction=latest.get(row.id);if(correction?.kind === "void") return [];const inAt=correction?.kind === "replace" ? correction.inAt : row.inAt;const outAt=correction?.kind === "replace" ? correction.outAt : row.outAt;if(inAt === undefined || outAt === undefined) throw new Error("Attendance correction is incomplete.");return Math.min(outAt,asOf)>inAt ? [{inAt,outAt:Math.min(outAt,asOf)}] : []});
  assertNoOverlap(result);return result;
}

export async function attendanceEvidence(ctx: QueryCtx | MutationCtx, session: Doc<"timeclockSessions">, studentId: Id<"students">, asOf: number) {
  const originals=await ctx.db.query("timeclockIntervals").withIndex("by_sessionId_and_studentId",q=>q.eq("sessionId",session._id).eq("studentId",studentId)).take(501);
  const corrections=await ctx.db.query("timeclockCorrections").withIndex("by_sessionId_and_studentId",q=>q.eq("sessionId",session._id).eq("studentId",studentId)).take(501);
  if(originals.length>500 || corrections.length>500) throw new Error("Attendance history exceeds the supported review limit.");
  const math=classifiedTime(correctedIntervals(session,originals,corrections,asOf),session.scheduledStart,session.scheduledEnd,session.effectiveEnd);
  return {...math,updatedAt:Math.max(session.openedAt,session.closedAt??0,...originals.flatMap(i=>[i.inAt,i.outAt??0]),...corrections.map(c=>c.at))};
}

/** Coalesce each transaction's session changes through the caller; never publish stale finalized totals. */
export async function invalidateAttendanceSession(ctx: MutationCtx, sessionId: Id<"timeclockSessions">) {
  const session=await ctx.db.get(sessionId);if(!session) return;
  const previous=await ctx.db.query("timeclockSessionReportStates").withIndex("by_sessionId",q=>q.eq("sessionId",sessionId)).unique();
  const reportGeneration=(previous?.reportGeneration??0)+1;
  const occurrence=await ctx.db.get(session.occurrenceId);if(!occurrence)throw new Error("Attendance source event is unavailable.");
  const fields={buildDay:buildDayFromTitle(occurrence.title,session.scheduledStart),outreach:outreachFromTitle(occurrence.title),occurrenceTitle:occurrence.title,sessionId,seasonId:session.seasonId,scheduledStart:session.scheduledStart,weekday:attendanceWeekday(session.scheduledStart),sessionState:session.state,needsReview:session.needsReview,sessionRevision:session.revision,reportGeneration,state:session.state === "open" ? "ready" as const : "rebuilding" as const,phase:"originals" as const,cursor:null,processed:0,updatedAt:Date.now(),lastError:undefined};
  const id=previous?previous._id:await ctx.db.insert("timeclockSessionReportStates",fields);
  if(previous) await ctx.db.patch(id,fields);
  const next=await ctx.db.get(id);if(!next) throw new Error("Attendance report state unavailable.");
  await updateSessionAggregate(ctx,previous,next);
  if(session.state !== "open") await ctx.scheduler.runAfter(0,internal.attendanceReportMaintenance.continueSession,{sessionId,expectedGeneration:reportGeneration,expectedSessionRevision:session.revision,expectedPhase:"originals",expectedCursor:null});
}

export async function discoverReportMember(ctx:MutationCtx,sessionId:Id<"timeclockSessions">,studentId:Id<"students">,reportGeneration:number) {
  const previous=await ctx.db.query("timeclockAttendanceReportMembers").withIndex("by_sessionId_and_studentId",q=>q.eq("sessionId",sessionId).eq("studentId",studentId)).unique();
  if(previous?.reportGeneration===reportGeneration)return;
  if(previous)await ctx.db.patch(previous._id,{reportGeneration,projectedGeneration:undefined});
  else await ctx.db.insert("timeclockAttendanceReportMembers",{sessionId,studentId,reportGeneration});
}

export async function projectAttendanceMember(ctx:MutationCtx,session:Doc<"timeclockSessions">,studentId:Id<"students">,generation:number) {
  if(session.state === "open")throw new Error("Open attendance is provisional.");
  const evidence=await attendanceEvidence(ctx,session,studentId,Number.MAX_SAFE_INTEGER);
  const previous=await ctx.db.query("timeclockAttendanceSummaries").withIndex("by_sessionId_and_studentId",q=>q.eq("sessionId",session._id).eq("studentId",studentId)).unique();
  const occurrence=await ctx.db.get(session.occurrenceId);if(!occurrence)throw new Error("Attendance source event is unavailable.");
  const fields={buildDay:buildDayFromTitle(occurrence.title,session.scheduledStart),outreach:outreachFromTitle(occurrence.title),occurrenceTitle:occurrence.title,sessionId:session._id,studentId,seasonId:session.seasonId,scheduledStart:session.scheduledStart,weekday:attendanceWeekday(session.scheduledStart),...evidence,sessionRevision:session.revision,reportGeneration:generation,sessionState:session.state,needsReview:session.needsReview,version:1 as const};
  const id=previous?previous._id:await ctx.db.insert("timeclockAttendanceSummaries",fields);
  if(previous)await ctx.db.patch(id,fields);
  const next=await ctx.db.get(id);if(!next)throw new Error("Attendance projection unavailable.");
  await updateStudentAttendanceAggregate(ctx,previous,next);
}
