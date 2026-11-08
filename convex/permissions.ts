import { familyVisibleSubmissions, requireFamilyEventAccess } from "./lib/archivedEventAccess";
import { ConvexError, v, type Infer } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { env, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { activeSeason, audit, privateStudent, studentAccess, viewer } from "./lib/access";
import { verifiedParent, tokenHash } from "./lib/invitationIdentity";
import { enrollmentPending } from "./lib/eventEnrollmentState";
import { consentEventValidator, consentSnapshotValidator, correctionFieldValidator, expectedCoverageValidator, publicVersion, selectedEvents, boundedText, versionValidator } from "./lib/consentSnapshot";
import { compareCoverage, controlledCoverage, coverageFor, sealedSnapshot } from "./lib/permissionCoverage";
import { consentSnapshotV2Validator } from "./lib/consentSnapshotV2";
import { sealedSnapshotV2 } from "./permissionsV2";
import { notifyPermissionNeedsAttention } from "./lib/notificationTriggers";
import { PERMISSION_SIGNING_CLOSED, PERMISSION_SIGNING_PAUSED, permissionSigningMode, permissionSigningPaused, requireParentSigningOn, v2SigningAllowed } from "./lib/permissionSigningMode";

type Ctx = QueryCtx | MutationCtx;
export const signingSettings = query({ args: {}, returns: v.object({ paused: v.boolean(), changedAt: v.union(v.number(), v.null()) }), handler: async ctx => {
  const actor = await viewer(ctx); operations(actor);
  const season = await activeSeason(ctx);
  return { paused: season.permissionSigningPaused !== false, changedAt: season.permissionSigningChangedAt ?? null };
} });
export const setSigningPaused = mutation({ args: { paused: v.boolean() }, returns: v.null(), handler: async (ctx, args) => {
  const actor = await viewer(ctx); operations(actor);
  const season = await activeSeason(ctx);
  const before = season.permissionSigningPaused !== false;
  if (before === args.paused) return null;
  const changedAt = Date.now();
  await ctx.db.patch(season._id, { permissionSigningPaused: args.paused, permissionSigningChangedBy: actor._id, permissionSigningChangedAt: changedAt });
  await audit(ctx, actor, "seasons", season._id, "setPermissionSigningPaused", { paused: before }, { paused: args.paused, changedAt });
  return null;
} });
const DEV_URL = "https://third-bandicoot-18.convex.cloud";
const stateValidator = v.union(v.literal("required"), v.literal("pending"), v.literal("accepted"), v.literal("correction"));
const sourceValidator = v.union(v.literal("electronic"), v.literal("paper"));
const reviewStatusValidator = v.union(v.literal("accepted"), v.literal("correction"));
const nullableId = v.union(v.id("permissionSubmissions"), v.null());
const reportValidator = v.object({state: v.union(v.literal("unknown"), v.literal("none"), v.literal("reported")), text: v.optional(v.string())});
export const receiptSummaryValidator = v.object({ submissionId: v.id("permissionSubmissions"), source: v.union(sourceValidator, v.null()), synthetic: v.boolean(), wordingVersion: v.string(), signerName: v.string(), signedAt: v.number(), format: v.union(v.literal(0), v.literal(1), v.literal(2)), legacy: v.boolean(), controlledCoverage: v.array(expectedCoverageValidator), latestReviewId: v.union(v.id("permissionReviews"), v.null()), latestReviewStatus: v.union(reviewStatusValidator, v.null()), note: v.union(v.string(), v.null()) });
export const receiptValidator = v.object({summary: receiptSummaryValidator, snapshot: v.union(consentSnapshotValidator, v.null()), recorderName: v.string()});
export const workspaceValidator = v.object({
  student: v.object({studentId: v.id("students"), legalName: v.string(), preferredName: v.string(), profileRevision: v.number(), emergencyName: v.union(v.string(), v.null()), emergencyRelationship: v.union(v.string(), v.null()), emergencyPhone: v.union(v.string(), v.null()), allergies: reportValidator, medications: reportValidator}),
  actor: v.object({name: v.string(), email: v.string(), role: v.union(v.literal("coach"), v.literal("mentor"), v.literal("parent"), v.literal("student")), travelLead: v.boolean(), healthExport: v.boolean()}),
  version: v.union(v.object({...versionValidator.fields, formFormat: v.union(v.literal(1), v.literal(2))}), v.null()), events: v.array(consentEventValidator),
  coverage: v.array(v.object({eventId: v.id("events"), state: stateValidator, revision: v.number(), submissionId: nullableId, reviewId: v.union(v.id("permissionReviews"), v.null()), reason: v.union(v.string(), v.null()), field: v.union(correctionFieldValidator, v.null()), signatureRequestedAt: v.union(v.number(), v.null())})),
  receipts: v.array(receiptSummaryValidator), signingMode: v.union(v.literal("synthetic"), v.literal("real"), v.literal("closed")), signingPaused: v.boolean(), canSign: v.boolean(), canRecordPaper: v.boolean(), canReview: v.boolean(), canHealthExport: v.boolean(), gateReason: v.union(v.string(), v.null()),
});
function operations(actor: Doc<"appUsers">) {if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead)) throw new ConvexError("Only a Coach or Travel Lead can do this with permission forms. Ask a Coach if you need Travel Lead access.")}
function formAccess(actor: Doc<"appUsers">) {if (actor.role !== "parent" && actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead)) throw new ConvexError("Permission forms are open to Parents, Coaches and Travel Leads. Ask a Coach if you need access.")}
async function syntheticAllowed(ctx: Ctx, studentId: Id<"students">, parentId?: Id<"appUsers">) {
  if (env.CONVEX_CLOUD_URL !== DEV_URL) return false;
  const row = await ctx.db.query("syntheticConsentSubjects").withIndex("by_studentId_and_parentId", q => q.eq("studentId", studentId).eq("parentId", parentId)).unique();
  return row?.enabled === true;
}
async function summary(ctx: Ctx, submission: Doc<"permissionSubmissions">): Promise<Infer<typeof receiptSummaryValidator>> {
  const rows = await controlledCoverage(ctx, submission._id);
  const review = await ctx.db.query("permissionReviews").withIndex("by_submissionId", q => q.eq("submissionId", submission._id)).order("desc").take(1);
  return {submissionId: submission._id, source: submission.source ?? null, synthetic: submission.synthetic ?? false, wordingVersion: submission.wordingVersion, signerName: submission.signerName ?? submission.typedName, signedAt: submission.signedAt, format: submission.snapshotFormat ?? 0, legacy: submission.snapshotFormat === undefined, controlledCoverage: rows.map(row => ({eventId: row.eventId, revision: row.revision})), latestReviewId: review[0]?._id ?? null, latestReviewStatus: review[0]?.status ?? null, note: review[0]?.note ?? null};
}

export const workspace = query({
  args: {studentId: v.id("students")}, returns: workspaceValidator,
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); formAccess(actor); const student = await studentAccess(ctx, actor, args.studentId);
    const version = await ctx.db.get(student.seasonId).then(season => season?.activePermissionVersionId ? ctx.db.get(season.activePermissionVersionId) : null);
    const participation = await ctx.db.query("participants").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(501);
    if (participation.length > 500) throw new ConvexError("Permission event list requires pagination.");
    const events: Infer<typeof consentEventValidator>[] = [];
    for (const participant of participation) {
      const event = await ctx.db.get(participant.eventId);
      if (participant.status === "confirmed" && event && !event.archived && !event.cancelled && event.seasonId === student.seasonId && !enrollmentPending(event)) events.push(...await selectedEvents(ctx, student, [event._id]));
    }
    events.sort((a,b) => a.startsAt - b.startsAt || a.eventId.localeCompare(b.eventId));
    const coverage = await Promise.all(events.map(async event => {const row = await coverageFor(ctx, student._id, event.eventId); return {eventId: event.eventId, state: row?.state ?? "required" as const, revision: row?.revision ?? 0, submissionId: row?.latestSubmissionId ?? null, reviewId: row?.latestReviewId ?? null, reason: row?.reason ?? null, field: row?.correctionField ?? null, signatureRequestedAt: row?.signatureRequestedAt ?? null}}));
    const submissions = await ctx.db.query("permissionSubmissions").withIndex("by_studentId_and_signedAt", q => q.eq("studentId", student._id)).order("desc").take(30);
    for (const item of coverage) if (item.submissionId && !submissions.some(submission => submission._id === item.submissionId)) {
      const controlling = await ctx.db.get(item.submissionId);
      if (controlling && controlling.studentId === student._id && controlling.seasonId === student.seasonId) submissions.push(controlling);
    }
    submissions.sort((a,b) => b.signedAt - a.signedAt || b._creationTime - a._creationTime);
    const canReview = actor.role === "coach" || actor.role === "mentor" && actor.travelLead;
    const who = actor.role === "parent" ? await verifiedParent(ctx) : null;
    const v2 = version?.formFormat === 2;
    const signingMode = v2 ? permissionSigningMode() : "synthetic";
    const paused = await permissionSigningPaused(ctx);
    const canSign = !paused && !!who && who.authUserId === actor.authUserId && (v2 ? await v2SigningAllowed(ctx, student._id, actor._id) : await syntheticAllowed(ctx, student._id, actor._id));
    const canRecordPaper = (v2 ? actor.role === "coach" || actor.role === "mentor" && actor.travelLead && actor.healthExport === true : canReview) && (v2 ? await v2SigningAllowed(ctx, student._id) : await syntheticAllowed(ctx, student._id));
    const projected = privateStudent(student);
    return {student: {studentId: student._id, legalName: student.legalName, preferredName: student.preferredName, profileRevision: student.profileRevision ?? 0, emergencyName: projected.emergencyName, emergencyRelationship: projected.emergencyRelationship, emergencyPhone: projected.emergencyPhone, allergies: projected.allergies, medications: projected.medications}, actor: {name: who?.name ?? actor.name, email: who?.email ?? actor.email, role: actor.role, travelLead: actor.travelLead, healthExport: actor.healthExport ?? false}, version: version ? {...publicVersion(version), formFormat: version.formFormat === 2 ? 2 as const : 1 as const} : null, events, coverage, receipts: await Promise.all((await familyVisibleSubmissions(ctx, actor, submissions)).map(submission => summary(ctx, submission))), signingMode, signingPaused: paused, canSign, canRecordPaper, canReview, canHealthExport: actor.role === "coach" || actor.role === "mentor" && actor.travelLead && (actor.healthExport ?? false), gateReason: actor.role === "parent" && paused ? PERMISSION_SIGNING_PAUSED : canSign || canRecordPaper ? null : signingMode === "synthetic" ? "Only registered fictional development subjects may use consent." : PERMISSION_SIGNING_CLOSED};
  },
});

export const receipt = query({
  args: {submissionId: v.id("permissionSubmissions")}, returns: receiptValidator,
  handler: async (ctx, args) => {const actor = await viewer(ctx); formAccess(actor); const submission = await ctx.db.get(args.submissionId); if (!submission) throw new ConvexError("This signed permission form isn't available. Reload the page to see the current list."); await studentAccess(ctx, actor, submission.studentId); await requireFamilyEventAccess(ctx, actor, submission.eventIds); const recorder = submission.recordedBy ? await ctx.db.get(submission.recordedBy) : null; return {summary: await summary(ctx, submission), snapshot: submission.snapshotFormat === 1 ? await sealedSnapshot(ctx, submission) : null, recorderName: recorder?.name ?? "Historical recorder unavailable"}},
});
export const review = mutation({
  args: {submissionId: v.id("permissionSubmissions"), status: reviewStatusValidator, note: v.optional(v.string()), field: v.optional(correctionFieldValidator), expectedLatestReviewId: v.union(v.id("permissionReviews"), v.null()), expectedCoverage: v.array(expectedCoverageValidator), idempotencyKey: v.string()}, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); operations(actor); boundedText(args.idempotencyKey, 128, "Retry key");
    const submission = await ctx.db.get(args.submissionId); if (!submission) throw new ConvexError("This signed permission form isn't available. Reload the page to see the current list.");
    await studentAccess(ctx, actor, submission.studentId); await requireFamilyEventAccess(ctx, actor, submission.eventIds); if (submission.snapshotFormat === 2) {if (actor.role === "mentor" && !actor.healthExport) throw new ConvexError("The Health export permission is required to review signed form PDFs."); await sealedSnapshotV2(submission);} else await sealedSnapshot(ctx, submission);
    if (args.status === "correction") boundedText(args.note ?? "", 1000, "Correction note");
    if ((args.note?.length ?? 0) > 1000) throw new ConvexError("Shorten the review note to 1,000 characters or fewer.");
    const operationHash = await tokenHash(JSON.stringify({...args, expectedCoverage: [...args.expectedCoverage].sort((a,b) => a.eventId.localeCompare(b.eventId))}));
    const duplicate = await ctx.db.query("permissionReviews").withIndex("by_reviewedBy_and_idempotencyKey", q => q.eq("reviewedBy", actor._id).eq("idempotencyKey", args.idempotencyKey)).unique();
    if (duplicate) {if (duplicate.operationHash !== operationHash) throw new ConvexError("This review was already saved with different details. Reload the page, then try again."); return null}
    const latest = await ctx.db.query("permissionReviews").withIndex("by_submissionId", q => q.eq("submissionId", submission._id)).order("desc").take(1);
    if ((latest[0]?._id ?? null) !== args.expectedLatestReviewId) throw new ConvexError("Review changed. Reload before deciding.");
    const rows = await controlledCoverage(ctx, submission._id);
    if (rows.some(row => row.studentId !== submission.studentId || row.seasonId !== submission.seasonId || row.versionId !== submission.versionId || !submission.eventIds.includes(row.eventId))) throw new ConvexError("The events this form covers changed. Reload the page, then try again.");
    if (!rows.length) throw new ConvexError("This signed form no longer covers an event that can be reviewed, or a new signature was requested.");
    await compareCoverage(ctx, submission.studentId, args.expectedCoverage, rows.map(row => row.eventId));
    const reviewId = await ctx.db.insert("permissionReviews", {submissionId: submission._id, status: args.status, note: args.note?.trim() || undefined, field: args.field, controlledCoverage: rows.map(row => ({eventId: row.eventId, priorRevision: row.revision})), snapshotHash: submission.snapshotHash, reviewedBy: actor._id, reviewedAt: Date.now(), idempotencyKey: args.idempotencyKey, operationHash});
    for (const row of rows) await ctx.db.patch(row._id, {state: args.status, latestReviewId: reviewId, revision: row.revision + 1, updatedAt: Date.now(), updatedBy: actor._id, reason: args.status === "correction" ? args.note?.trim() : undefined, correctionField: args.status === "correction" ? args.field ?? "general" : undefined});
    if (args.status === "correction") await notifyPermissionNeedsAttention(ctx, {studentId: submission.studentId, reason: "correction", dedupeKey: reviewId});
    await audit(ctx, actor, "permissionSubmissions", submission._id, submission.synthetic ? "reviewSyntheticPermission" : "reviewPermission", null, {status: args.status, synthetic: submission.synthetic ?? false, eventIds: rows.map(row => row.eventId)});
    return null;
  },
});

export const requestNewSignature = mutation({
  args: {studentId: v.id("students"), eventIds: v.array(v.id("events")), expectedCoverage: v.array(expectedCoverageValidator), reason: v.string()}, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); operations(actor); await requireParentSigningOn(ctx); const student = await studentAccess(ctx, actor, args.studentId);
    boundedText(args.reason, 1000, "New-signature reason"); await selectedEvents(ctx, student, args.eventIds); await compareCoverage(ctx, student._id, args.expectedCoverage, args.eventIds);
    const prior = await Promise.all(args.expectedCoverage.map(async item => ({...item, submissionId: (await coverageFor(ctx, student._id, item.eventId))?.latestSubmissionId})));
    const now = Date.now(); const requestId = await ctx.db.insert("permissionSignatureRequests", {studentId: student._id, seasonId: student.seasonId, eventIds: [...args.eventIds].sort(), requestedBy: actor._id, requestedAt: now, reason: args.reason.trim(), priorCoverage: prior});
    for (const item of args.expectedCoverage) {
      const row = await coverageFor(ctx, student._id, item.eventId);
      const fields = {seasonId: student.seasonId, studentId: student._id, eventId: item.eventId, state: "required" as const, revision: item.revision + 1, updatedAt: now, updatedBy: actor._id, signatureRequestedAt: now, reason: args.reason.trim(), correctionField: undefined, sealedSnapshotFormat: undefined, sealedSnapshotHash: undefined, synthetic: undefined, source: undefined};
      if (row) await ctx.db.patch(row._id, fields); else await ctx.db.insert("permissionCoverage", fields);
    }
    await notifyPermissionNeedsAttention(ctx, {studentId: student._id, reason: "newSignature", dedupeKey: requestId});
    await audit(ctx, actor, "permissionSignatureRequests", requestId, "requestNewSignature", null, {eventIds: args.eventIds});
    return null;
  },
});

const exportRecordValidator = v.object({studentId: v.id("students"), studentName: v.string(), state: stateValidator, revision: v.number(), submissionId: nullableId, signerName: v.union(v.string(), v.null()), signedAt: v.union(v.number(), v.null()), source: v.union(sourceValidator, v.null()), synthetic: v.union(v.boolean(), v.null()), snapshot: v.optional(v.union(consentSnapshotValidator, consentSnapshotV2Validator)), collectedAt: v.number()});
export const exportPacket = mutation({
  args: {eventId: v.id("events"), includeHealth: v.boolean(), paginationOpts: v.optional(paginationOptsValidator)}, returns: v.object({event: v.object({eventId: v.id("events"), name: v.string()}), synthetic: v.boolean(), generatedAt: v.number(), schemaVersion: v.literal(1), isDone: v.boolean(), continueCursor: v.string(), records: v.array(exportRecordValidator)}),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); operations(actor);
    if (args.includeHealth && actor.role !== "coach" && !actor.healthExport) throw new ConvexError("Downloading health information needs Health export access. Ask a Coach for it.");
    const season = await activeSeason(ctx); const event = await ctx.db.get(args.eventId);
    if (!event || event.archived || event.seasonId !== season._id || enrollmentPending(event)) throw new ConvexError("This event's permission list can't be downloaded. Choose a current event, then try again.");
    const options = args.paginationOpts ?? {cursor: null, numItems: 10};
    if (!Number.isSafeInteger(options.numItems) || options.numItems < 1 || options.numItems > 10) throw new ConvexError("Collect export pages of at most 10 event participants.");
    if (options.maximumRowsRead !== undefined && (!Number.isSafeInteger(options.maximumRowsRead) || options.maximumRowsRead < 1)) throw new ConvexError("Export row budget must be a positive integer.");
    // Keep every native option while enforcing a server read budget for adaptive/end-cursor pages.
    options.maximumRowsRead = Math.min(options.maximumRowsRead ?? 11, 11);
    const page = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).paginate(options);
    if (page.page.length > 10) throw new ConvexError("The download couldn't continue. Start the download again.");
    const generatedAt = Date.now();
    const records: Infer<typeof exportRecordValidator>[] = [];
    for (const participant of page.page) {
      if (participant.status !== "confirmed") continue;
      const student = await ctx.db.get(participant.studentId);
      if (!student?.active || student.seasonId !== season._id) continue;
      const row = await coverageFor(ctx, student._id, event._id); const submission = row?.latestSubmissionId ? await ctx.db.get(row.latestSubmissionId) : null;
      const snapshot = args.includeHealth && submission?.snapshotFormat === 1 ? await sealedSnapshot(ctx, submission) : args.includeHealth && submission?.snapshotFormat === 2 ? await sealedSnapshotV2(submission) : undefined;
      records.push({studentId: student._id, studentName: student.legalName || student.preferredName, state: row?.state ?? "required", revision: row?.revision ?? 0, submissionId: submission?._id ?? null, signerName: submission?.signerName ?? null, signedAt: submission?.signedAt ?? null, source: submission?.source ?? null, synthetic: submission?.synthetic ?? null, ...(snapshot ? {snapshot} : {}), collectedAt: generatedAt});
    }
    await audit(ctx, actor, "permissionExports", event._id, "export", null, {includeHealth: args.includeHealth, count: records.length, generatedAt});
    return {event: {eventId: event._id, name: event.name}, synthetic: records.length > 0 && records.every(record => record.synthetic === true), generatedAt, schemaVersion: 1 as const, isDone: page.isDone, continueCursor: page.continueCursor, records};
  },
});
