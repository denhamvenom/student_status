import { v, type Infer } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { env, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { activeSeason, audit, privateStudent, studentAccess, viewer } from "./lib/access";
import { verifiedParent, tokenHash } from "./lib/invitationIdentity";
import { enrollmentPending } from "./lib/eventEnrollmentState";
import { consentEventValidator, consentSnapshotValidator, correctionFieldValidator, expectedCoverageValidator, medicationChoicesValidator, publicVersion, parseSnapshot, validateSnapshot, selectedEvents, snapshotHash, boundedText, versionValidator, type ConsentSnapshot, type ExpectedCoverage } from "./lib/consentSnapshot";
import { compareCoverage, controlledCoverage, coverageFor, expectedCoverage, sealedSnapshot, setPendingCoverage } from "./lib/permissionCoverage";
import { consentSnapshotV2Validator } from "./lib/consentSnapshotV2";
import { sealedSnapshotV2 } from "./permissionsV2";
import { permissionSigningMode, v2SigningAllowed } from "./lib/permissionSigningMode";

type Ctx = QueryCtx | MutationCtx;
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
  receipts: v.array(receiptSummaryValidator), signingMode: v.union(v.literal("synthetic"), v.literal("real"), v.literal("closed")), canSign: v.boolean(), canRecordPaper: v.boolean(), canReview: v.boolean(), canHealthExport: v.boolean(), gateReason: v.union(v.string(), v.null()),
});
const paperFields = { studentId: v.id("students"), eventIds: v.array(v.id("events")), signerName: v.string(), signerEmail: v.optional(v.string()), paperSignedAt: v.number(), paperReference: v.string() };
const paperPreviewValidator = v.object({snapshot: consentSnapshotValidator, versionId: v.id("permissionVersions"), expectedProfileRevision: v.number(), eventFingerprint: v.string(), expectedCoverage: v.array(expectedCoverageValidator)});
function operations(actor: Doc<"appUsers">) {if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead)) throw new Error("Permission review requires a Coach or Travel Lead.")}
function formAccess(actor: Doc<"appUsers">) {if (actor.role !== "parent" && actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead)) throw new Error("Form access denied.")}
async function syntheticAllowed(ctx: Ctx, studentId: Id<"students">, parentId?: Id<"appUsers">) {
  if (env.CONVEX_CLOUD_URL !== DEV_URL) return false;
  const row = await ctx.db.query("syntheticConsentSubjects").withIndex("by_studentId_and_parentId", q => q.eq("studentId", studentId).eq("parentId", parentId)).unique();
  return row?.enabled === true;
}
async function syntheticGate(ctx: Ctx, studentId: Id<"students">, parentId?: Id<"appUsers">) {if (!await syntheticAllowed(ctx, studentId, parentId)) throw new Error("Real permission signing is unavailable. Only internally registered fictional development subjects may use this workflow.")}
async function signer(ctx: Ctx, actor: Doc<"appUsers">) {
  if (actor.role !== "parent") throw new Error("Only a linked parent may sign.");
  const who = await verifiedParent(ctx);
  if (!who || who.authUserId !== actor.authUserId) throw new Error("A verified parent account is required.");
  return who;
}
async function currentVersion(ctx: Ctx, student: Doc<"students">) {
  const season = await activeSeason(ctx);
  const version = season.activePermissionVersionId ? await ctx.db.get(season.activePermissionVersionId) : null;
  if (!version || version.seasonId !== student.seasonId || student.seasonId !== season._id) throw new Error("No current permission wording is available.");
  if (version.formFormat === 2) throw new Error("This season uses the new PDF permission form. Prepare it in the updated form workflow.");
  return version;
}
async function buildSnapshot(ctx: Ctx, student: Doc<"students">, actor: Doc<"appUsers">, eventIds: Id<"events">[], identity: ConsentSnapshot["signer"]) {
  const version = await currentVersion(ctx, student);
  for (const [label, value] of [["Emergency contact name", student.emergencyName], ["Emergency contact relationship", student.emergencyRelationship], ["Emergency contact phone", student.emergencyPhone]] as const) boundedText(value ?? "", 254, label);
  function health(report: Doc<"students">["allergies"]) {
    if (report.state === "unknown") throw new Error("Complete allergy and medication reports before preparing permission.");
    if (report.state === "reported") boundedText(report.text ?? "", 4000, "Health details");
    return { state: report.state, text: report.state === "reported" ? report.text!.trim() : null };
  }
  const events = await selectedEvents(ctx, student, eventIds);
  const expected = await expectedCoverage(ctx, student._id, events.map(event => event.eventId));
  const priorCoverage = await Promise.all(expected.map(async item => ({...item, submissionId: (await coverageFor(ctx, student._id, item.eventId))?.latestSubmissionId ?? null})));
  const snapshot: ConsentSnapshot = { format: 1, synthetic: true, version: publicVersion(version), student: {studentId: student._id, seasonId: student.seasonId, legalName: student.legalName, preferredName: student.preferredName, email: student.email, subteam: student.subteam, profileRevision: student.profileRevision ?? 0}, events, emergency: {name: student.emergencyName!.trim(), relationship: student.emergencyRelationship!.trim(), phone: student.emergencyPhone!.trim()}, health: {allergies: health(student.allergies), medications: health(student.medications)}, priorCoverage, signer: identity, choices: null, typedName: null, acknowledged: false, signedAt: null, recordedAt: null, paper: null };
  void actor;
  validateSnapshot(ctx, snapshot);
  return { snapshot, version, expected, eventFingerprint: await tokenHash(JSON.stringify(events)) };
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
    if (participation.length > 500) throw new Error("Permission event list requires pagination.");
    const events: Infer<typeof consentEventValidator>[] = [];
    for (const participant of participation) {
      const event = await ctx.db.get(participant.eventId);
      if (participant.status === "confirmed" && event && !event.archived && event.seasonId === student.seasonId && !enrollmentPending(event)) events.push(...await selectedEvents(ctx, student, [event._id]));
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
    const canSign = !!who && who.authUserId === actor.authUserId && (v2 ? await v2SigningAllowed(ctx, student._id, actor._id) : await syntheticAllowed(ctx, student._id, actor._id));
    const canRecordPaper = (v2 ? actor.role === "coach" || actor.role === "mentor" && actor.travelLead && actor.healthExport === true : canReview) && (v2 ? await v2SigningAllowed(ctx, student._id) : await syntheticAllowed(ctx, student._id));
    const projected = privateStudent(student);
    return {student: {studentId: student._id, legalName: student.legalName, preferredName: student.preferredName, profileRevision: student.profileRevision ?? 0, emergencyName: projected.emergencyName, emergencyRelationship: projected.emergencyRelationship, emergencyPhone: projected.emergencyPhone, allergies: projected.allergies, medications: projected.medications}, actor: {name: who?.name ?? actor.name, email: who?.email ?? actor.email, role: actor.role, travelLead: actor.travelLead, healthExport: actor.healthExport ?? false}, version: version ? {...publicVersion(version), formFormat: version.formFormat === 2 ? 2 as const : 1 as const} : null, events, coverage, receipts: await Promise.all(submissions.map(submission => summary(ctx, submission))), signingMode, canSign, canRecordPaper, canReview, canHealthExport: actor.role === "coach" || actor.role === "mentor" && actor.travelLead && (actor.healthExport ?? false), gateReason: canSign || canRecordPaper ? null : signingMode === "synthetic" ? "Only registered fictional development subjects may use consent." : "You cannot sign for this student right now."};
  },
});

export const listSubmissions = query({
  args: { studentId: v.id("students") }, returns: v.array(receiptSummaryValidator),
  handler: async (ctx, args) => {const actor = await viewer(ctx); formAccess(actor); await studentAccess(ctx, actor, args.studentId); const rows = await ctx.db.query("permissionSubmissions").withIndex("by_studentId_and_signedAt", q => q.eq("studentId", args.studentId)).order("desc").take(30); return Promise.all(rows.map(row => summary(ctx, row)))},
});
export const receipt = query({
  args: {submissionId: v.id("permissionSubmissions")}, returns: receiptValidator,
  handler: async (ctx, args) => {const actor = await viewer(ctx); formAccess(actor); const submission = await ctx.db.get(args.submissionId); if (!submission) throw new Error("Signed form not found."); await studentAccess(ctx, actor, submission.studentId); const recorder = submission.recordedBy ? await ctx.db.get(submission.recordedBy) : null; return {summary: await summary(ctx, submission), snapshot: submission.snapshotFormat === 1 ? await sealedSnapshot(ctx, submission) : null, recorderName: recorder?.name ?? "Historical recorder unavailable"}},
});
export const prepare = mutation({
  args: {studentId: v.id("students"), eventIds: v.array(v.id("events"))}, returns: v.object({draftId: v.id("permissionDrafts"), expiresAt: v.number(), snapshot: consentSnapshotValidator, expectedCoverage: v.array(expectedCoverageValidator)}),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); const who = await signer(ctx, actor); const student = await studentAccess(ctx, actor, args.studentId); await syntheticGate(ctx, student._id, actor._id);
    const prepared = await buildSnapshot(ctx, student, actor, args.eventIds, {source: "electronic", accountId: actor._id, name: who.name, email: who.email, recordedBy: actor._id});
    const snapshotJson = JSON.stringify(prepared.snapshot); const expiresAt = Date.now() + 30 * 60000;
    const draftId = await ctx.db.insert("permissionDrafts", {studentId: student._id, seasonId: student.seasonId, parentId: actor._id, versionId: prepared.version._id, snapshotJson, snapshotHash: await snapshotHash(prepared.snapshot), profileRevision: student.profileRevision ?? 0, eventFingerprint: prepared.eventFingerprint, expectedCoverage: prepared.expected, createdAt: Date.now(), expiresAt});
    return {draftId, expiresAt, snapshot: prepared.snapshot, expectedCoverage: prepared.expected};
  },
});
export const submit = mutation({
  args: { studentId: v.id("students"), eventIds: v.array(v.id("events")), typedName: v.string(), answersJson: v.string() }, returns: v.id("permissionSubmissions"),
  handler: async (ctx, args) => {const actor = await viewer(ctx); if (actor.role !== "parent") throw new Error("Only a linked parent may sign."); await studentAccess(ctx, actor, args.studentId); await activeSeason(ctx); throw new Error("Permission wording is still draft. Use the registered synthetic workflow; real signing is unavailable.")},
});

async function insertSealed(ctx: MutationCtx, actor: Doc<"appUsers">, student: Doc<"students">, snapshot: ConsentSnapshot, expected: ExpectedCoverage[], extra: {draftId?: Id<"permissionDrafts">; idempotencyKey?: string; operationHash?: string}) {
  // This common transition intentionally has no real-signing enable switch.
  await syntheticGate(ctx, student._id, snapshot.signer.source === "electronic" ? actor._id : undefined);
  await compareCoverage(ctx, student._id, expected, snapshot.events.map(event => event.eventId));
  validateSnapshot(ctx, snapshot);
  if (!snapshot.acknowledged || !snapshot.choices || snapshot.signedAt === null || snapshot.recordedAt === null || snapshot.typedName === null) throw new Error("A complete signed snapshot is required.");
  const priorIds = [...new Set(snapshot.priorCoverage.flatMap(row => row.submissionId ? [row.submissionId] : []))];
  const sealedHash = await snapshotHash(snapshot);
  const submissionId = await ctx.db.insert("permissionSubmissions", { studentId: student._id, seasonId: student.seasonId, signedBy: snapshot.signer.accountId ?? undefined, typedName: snapshot.typedName!, wordingVersion: snapshot.version.version, eventIds: snapshot.events.map(event => event.eventId), answersJson: JSON.stringify({choices: snapshot.choices, acknowledged: snapshot.acknowledged}), signedAt: snapshot.signedAt!, versionId: snapshot.version.versionId, draftId: extra.draftId, source: snapshot.signer.source, synthetic: true, snapshotFormat: 1, snapshotJson: JSON.stringify(snapshot), snapshotHash: sealedHash, recordedBy: actor._id, signerName: snapshot.signer.name, signerEmail: snapshot.signer.email ?? undefined, supersedesSubmissionId: priorIds.length === 1 ? priorIds[0] : undefined, idempotencyKey: extra.idempotencyKey, operationHash: extra.operationHash, paperReference: snapshot.paper?.reference, paperSignedAt: snapshot.paper?.signedAt, paperAttestation: snapshot.paper?.attested });
  await setPendingCoverage(ctx, actor, student, submissionId, snapshot.version.versionId, expected, {snapshotHash: sealedHash, source: snapshot.signer.source});
  await audit(ctx, actor, "permissionSubmissions", submissionId, "submitSyntheticPermission", null, {source: snapshot.signer.source, eventIds: snapshot.events.map(event => event.eventId), wordingVersion: snapshot.version.version, synthetic: true});
  return submissionId;
}

export const submitDraft = mutation({
  args: {draftId: v.id("permissionDrafts"), typedName: v.string(), acknowledged: v.boolean(), choices: medicationChoicesValidator}, returns: v.id("permissionSubmissions"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); const who = await signer(ctx, actor); const draft = await ctx.db.get(args.draftId);
    if (!draft || draft.parentId !== actor._id) throw new Error("Permission draft not found for this account.");
    const student = await studentAccess(ctx, actor, draft.studentId); await syntheticGate(ctx, student._id, actor._id);
    if (!args.acknowledged || args.typedName.trim() !== who.name.trim()) throw new Error("Type the verified account name exactly and acknowledge the permission wording.");
    if (draft.usedSubmissionId) {
      const original = await ctx.db.get(draft.usedSubmissionId);
      if (!original || original.signedBy !== actor._id) throw new Error("The signed form from this draft is unavailable.");
      const sealed = await sealedSnapshot(ctx, original);
      if (sealed.typedName !== args.typedName.trim() || JSON.stringify(sealed.choices) !== JSON.stringify(args.choices)) throw new Error("This draft was already signed with different answers.");
      return original._id;
    }
    if (draft.expiresAt <= Date.now()) throw new Error("Permission draft expired. Prepare it again.");
    const snapshot = parseSnapshot(ctx, draft.snapshotJson);
    if (await snapshotHash(snapshot) !== draft.snapshotHash) throw new Error("Prepared permission evidence is inconsistent.");
    const current = await buildSnapshot(ctx, student, actor, snapshot.events.map(event => event.eventId), {source: "electronic", accountId: actor._id, name: who.name, email: who.email, recordedBy: actor._id});
    if (current.version._id !== draft.versionId || student.profileRevision !== undefined && student.profileRevision !== draft.profileRevision || current.eventFingerprint !== draft.eventFingerprint || await snapshotHash(current.snapshot) !== draft.snapshotHash) throw new Error("Profile, event, wording or coverage changed. Prepare a new permission draft.");
    await compareCoverage(ctx, student._id, draft.expectedCoverage, snapshot.events.map(event => event.eventId));
    const now = Date.now(); const final: ConsentSnapshot = {...snapshot, choices: args.choices, typedName: args.typedName.trim(), acknowledged: true, signedAt: now, recordedAt: now};
    const submissionId = await insertSealed(ctx, actor, student, final, draft.expectedCoverage, {draftId: draft._id});
    await ctx.db.patch(draft._id, {usedSubmissionId: submissionId});
    return submissionId;
  },
});

type PaperArgs = {studentId: Id<"students">; eventIds: Id<"events">[]; signerName: string; signerEmail?: string; paperSignedAt: number; paperReference: string};
async function paperSnapshot(ctx: MutationCtx, actor: Doc<"appUsers">, args: PaperArgs) {
  operations(actor); const student = await studentAccess(ctx, actor, args.studentId); await syntheticGate(ctx, student._id);
  boundedText(args.signerName, 160, "Parent or guardian named on paper"); boundedText(args.paperReference, 254, "Paper reference");
  if (!Number.isFinite(args.paperSignedAt) || args.paperSignedAt <= 0 || args.paperSignedAt > Date.now()) throw new Error("Paper signing date must be valid and not in the future.");
  if (args.signerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.signerEmail.trim())) throw new Error("Paper signer email is invalid.");
  const prepared = await buildSnapshot(ctx, student, actor, args.eventIds, {source: "paper", accountId: null, name: args.signerName.trim(), email: args.signerEmail?.trim().toLowerCase() || null, recordedBy: actor._id});
  return {student, ...prepared};
}
export const preparePaper = mutation({
  args: paperFields, returns: paperPreviewValidator,
  handler: async (ctx, args) => {const actor = await viewer(ctx); const prepared = await paperSnapshot(ctx, actor, args); return {snapshot: prepared.snapshot, versionId: prepared.version._id, expectedProfileRevision: prepared.student.profileRevision ?? 0, eventFingerprint: prepared.eventFingerprint, expectedCoverage: prepared.expected}},
});
export const recordPaper = mutation({
  args: {...paperFields, versionId: v.id("permissionVersions"), expectedProfileRevision: v.number(), eventFingerprint: v.string(), expectedCoverage: v.array(expectedCoverageValidator), choices: medicationChoicesValidator, paperAttested: v.boolean(), idempotencyKey: v.string()}, returns: v.id("permissionSubmissions"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); operations(actor); const student = await studentAccess(ctx, actor, args.studentId); await syntheticGate(ctx, student._id);
    boundedText(args.idempotencyKey, 128, "Retry key"); if (!args.paperAttested) throw new Error("Signed paper authorization on file must be attested.");
    const operationHash = await tokenHash(JSON.stringify({...args, eventIds: [...args.eventIds].sort(), expectedCoverage: [...args.expectedCoverage].sort((a,b) => a.eventId.localeCompare(b.eventId)), signerName: args.signerName.trim(), signerEmail: args.signerEmail?.trim().toLowerCase(), paperReference: args.paperReference.trim()}));
    const duplicate = await ctx.db.query("permissionSubmissions").withIndex("by_recordedBy_and_idempotencyKey", q => q.eq("recordedBy", actor._id).eq("idempotencyKey", args.idempotencyKey)).unique();
    if (duplicate) {if (duplicate.operationHash !== operationHash || duplicate.source !== "paper") throw new Error("Retry key is already used for a different paper record."); await sealedSnapshot(ctx, duplicate); return duplicate._id}
    const prepared = await paperSnapshot(ctx, actor, args);
    if (prepared.version._id !== args.versionId || (student.profileRevision ?? 0) !== args.expectedProfileRevision || prepared.eventFingerprint !== args.eventFingerprint) throw new Error("Profile, event or wording changed. Prepare the paper record again.");
    await compareCoverage(ctx, student._id, args.expectedCoverage, args.eventIds);
    const final: ConsentSnapshot = {...prepared.snapshot, choices: args.choices, typedName: args.signerName.trim(), acknowledged: true, signedAt: args.paperSignedAt, recordedAt: Date.now(), paper: {reference: args.paperReference.trim(), signedAt: args.paperSignedAt, attested: true}};
    return insertSealed(ctx, actor, student, final, args.expectedCoverage, {idempotencyKey: args.idempotencyKey, operationHash});
  },
});

export const review = mutation({
  args: {submissionId: v.id("permissionSubmissions"), status: reviewStatusValidator, note: v.optional(v.string()), field: v.optional(correctionFieldValidator), expectedLatestReviewId: v.union(v.id("permissionReviews"), v.null()), expectedCoverage: v.array(expectedCoverageValidator), idempotencyKey: v.string()}, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); operations(actor); boundedText(args.idempotencyKey, 128, "Retry key");
    const submission = await ctx.db.get(args.submissionId); if (!submission) throw new Error("Submission not found.");
    await studentAccess(ctx, actor, submission.studentId); if (submission.snapshotFormat === 2) {if (actor.role === "mentor" && !actor.healthExport) throw new Error("The Health export permission is required to review signed form PDFs."); await sealedSnapshotV2(ctx, submission);} else await sealedSnapshot(ctx, submission);
    if (args.status === "correction") boundedText(args.note ?? "", 1000, "Correction note");
    if ((args.note?.length ?? 0) > 1000) throw new Error("Review note is too long.");
    const operationHash = await tokenHash(JSON.stringify({...args, expectedCoverage: [...args.expectedCoverage].sort((a,b) => a.eventId.localeCompare(b.eventId))}));
    const duplicate = await ctx.db.query("permissionReviews").withIndex("by_reviewedBy_and_idempotencyKey", q => q.eq("reviewedBy", actor._id).eq("idempotencyKey", args.idempotencyKey)).unique();
    if (duplicate) {if (duplicate.operationHash !== operationHash) throw new Error("Retry key is already used for a different review."); return null}
    const latest = await ctx.db.query("permissionReviews").withIndex("by_submissionId", q => q.eq("submissionId", submission._id)).order("desc").take(1);
    if ((latest[0]?._id ?? null) !== args.expectedLatestReviewId) throw new Error("Review changed. Reload before deciding.");
    const rows = await controlledCoverage(ctx, submission._id);
    if (rows.some(row => row.studentId !== submission.studentId || row.seasonId !== submission.seasonId || row.versionId !== submission.versionId || !submission.eventIds.includes(row.eventId))) throw new Error("Current permission coverage is inconsistent.");
    if (!rows.length) throw new Error("This signed form no longer covers an event that can be reviewed, or a new signature was requested.");
    await compareCoverage(ctx, submission.studentId, args.expectedCoverage, rows.map(row => row.eventId));
    const reviewId = await ctx.db.insert("permissionReviews", {submissionId: submission._id, status: args.status, note: args.note?.trim() || undefined, field: args.field, controlledCoverage: rows.map(row => ({eventId: row.eventId, priorRevision: row.revision})), snapshotHash: submission.snapshotHash, reviewedBy: actor._id, reviewedAt: Date.now(), idempotencyKey: args.idempotencyKey, operationHash});
    for (const row of rows) await ctx.db.patch(row._id, {state: args.status, latestReviewId: reviewId, revision: row.revision + 1, updatedAt: Date.now(), updatedBy: actor._id, reason: args.status === "correction" ? args.note?.trim() : undefined, correctionField: args.status === "correction" ? args.field ?? "general" : undefined});
    await audit(ctx, actor, "permissionSubmissions", submission._id, submission.synthetic ? "reviewSyntheticPermission" : "reviewPermission", null, {status: args.status, synthetic: submission.synthetic ?? false, eventIds: rows.map(row => row.eventId)});
    return null;
  },
});

export const requestNewSignature = mutation({
  args: {studentId: v.id("students"), eventIds: v.array(v.id("events")), expectedCoverage: v.array(expectedCoverageValidator), reason: v.string()}, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); operations(actor); const student = await studentAccess(ctx, actor, args.studentId);
    boundedText(args.reason, 1000, "New-signature reason"); await selectedEvents(ctx, student, args.eventIds); await compareCoverage(ctx, student._id, args.expectedCoverage, args.eventIds);
    const prior = await Promise.all(args.expectedCoverage.map(async item => ({...item, submissionId: (await coverageFor(ctx, student._id, item.eventId))?.latestSubmissionId})));
    const now = Date.now(); const requestId = await ctx.db.insert("permissionSignatureRequests", {studentId: student._id, seasonId: student.seasonId, eventIds: [...args.eventIds].sort(), requestedBy: actor._id, requestedAt: now, reason: args.reason.trim(), priorCoverage: prior});
    for (const item of args.expectedCoverage) {
      const row = await coverageFor(ctx, student._id, item.eventId);
      const fields = {seasonId: student.seasonId, studentId: student._id, eventId: item.eventId, state: "required" as const, revision: item.revision + 1, updatedAt: now, updatedBy: actor._id, signatureRequestedAt: now, reason: args.reason.trim(), correctionField: undefined, sealedSnapshotFormat: undefined, sealedSnapshotHash: undefined, synthetic: undefined, source: undefined};
      if (row) await ctx.db.patch(row._id, fields); else await ctx.db.insert("permissionCoverage", fields);
    }
    await audit(ctx, actor, "permissionSignatureRequests", requestId, "requestNewSignature", null, {eventIds: args.eventIds});
    return null;
  },
});

const exportRecordValidator = v.object({studentId: v.id("students"), studentName: v.string(), state: stateValidator, revision: v.number(), submissionId: nullableId, signerName: v.union(v.string(), v.null()), signedAt: v.union(v.number(), v.null()), source: v.union(sourceValidator, v.null()), synthetic: v.union(v.boolean(), v.null()), snapshot: v.optional(v.union(consentSnapshotValidator, consentSnapshotV2Validator)), collectedAt: v.number()});
export const exportPacket = mutation({
  args: {eventId: v.id("events"), includeHealth: v.boolean(), paginationOpts: v.optional(paginationOptsValidator)}, returns: v.object({event: v.object({eventId: v.id("events"), name: v.string()}), synthetic: v.boolean(), generatedAt: v.number(), schemaVersion: v.literal(1), isDone: v.boolean(), continueCursor: v.string(), records: v.array(exportRecordValidator)}),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); operations(actor);
    if (args.includeHealth && actor.role !== "coach" && !actor.healthExport) throw new Error("Separate health-export permission is required.");
    const season = await activeSeason(ctx); const event = await ctx.db.get(args.eventId);
    if (!event || event.archived || event.seasonId !== season._id || enrollmentPending(event)) throw new Error("Event export is unavailable.");
    const options = args.paginationOpts ?? {cursor: null, numItems: 10};
    if (!Number.isSafeInteger(options.numItems) || options.numItems < 1 || options.numItems > 10) throw new Error("Collect export pages of at most 10 event participants.");
    if (options.maximumRowsRead !== undefined && (!Number.isSafeInteger(options.maximumRowsRead) || options.maximumRowsRead < 1)) throw new Error("Export row budget must be a positive integer.");
    // Keep every native option while enforcing a server read budget for adaptive/end-cursor pages.
    options.maximumRowsRead = Math.min(options.maximumRowsRead ?? 11, 11);
    const page = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).paginate(options);
    if (page.page.length > 10) throw new Error("Export page expanded beyond 10 rows. Retry with a simple cursor page.");
    const generatedAt = Date.now();
    const records: Infer<typeof exportRecordValidator>[] = [];
    for (const participant of page.page) {
      if (participant.status !== "confirmed") continue;
      const student = await ctx.db.get(participant.studentId);
      if (!student?.active || student.seasonId !== season._id) continue;
      const row = await coverageFor(ctx, student._id, event._id); const submission = row?.latestSubmissionId ? await ctx.db.get(row.latestSubmissionId) : null;
      const snapshot = args.includeHealth && submission?.snapshotFormat === 1 ? await sealedSnapshot(ctx, submission) : args.includeHealth && submission?.snapshotFormat === 2 ? await sealedSnapshotV2(ctx, submission) : undefined;
      records.push({studentId: student._id, studentName: student.legalName || student.preferredName, state: row?.state ?? "required", revision: row?.revision ?? 0, submissionId: submission?._id ?? null, signerName: submission?.signerName ?? null, signedAt: submission?.signedAt ?? null, source: submission?.source ?? null, synthetic: submission?.synthetic ?? null, ...(snapshot ? {snapshot} : {}), collectedAt: generatedAt});
    }
    await audit(ctx, actor, "permissionExports", event._id, "export", null, {includeHealth: args.includeHealth, count: records.length, generatedAt});
    return {event: {eventId: event._id, name: event.name}, synthetic: records.length > 0 && records.every(record => record.synthetic === true), generatedAt, schemaVersion: 1 as const, isDone: page.isDone, continueCursor: page.continueCursor, records};
  },
});
