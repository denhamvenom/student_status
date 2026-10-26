import { requireFamilyEventAccess } from "./lib/archivedEventAccess";
import { normalizeEmail } from "./lib/contactValidation";
import { normalizeConsentContacts } from "./lib/contactEntry";
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { activeSeason, audit, studentAccess, viewer } from "./lib/access";
import { verifiedParent, tokenHash } from "./lib/invitationIdentity";
import { compareCoverage, coverageFor, expectedCoverage, setPendingCoverage } from "./lib/permissionCoverage";
import { boundedText, expectedCoverageValidator } from "./lib/consentSnapshot";
import { consentProfileV2Validator, consentSnapshotV2Validator, selectedEventsV2, snapshotHashV2, validateConsentProfileV2, validateSnapshotV2, type ConsentSnapshotV2 } from "./lib/consentSnapshotV2";
import { fieldTripApproved } from "../src/lib/field-trip-approved";
import { requireV2Signing } from "./lib/permissionSigningMode";
import { gradeForSave } from "../src/lib/grades";

type Ctx = QueryCtx | MutationCtx;
const hashPattern = /^[0-9a-f]{64}$/;
const pdfAccessValidator = v.object({storageId: v.id("_storage"), sha256: v.string()});
const profileResultValidator = v.object({studentId: v.id("students"), revision: v.number(), setupComplete: v.boolean(), completed: v.boolean(), value: v.union(consentProfileV2Validator, v.null())});
const draftResultValidator = v.object({draftId: v.id("permissionDrafts"), expiresAt: v.number(), snapshot: consentSnapshotV2Validator, expectedCoverage: v.array(expectedCoverageValidator)});

async function parentSigner(ctx: Ctx, actor: Doc<"appUsers">) {
  if (actor.role !== "parent") throw new Error("Only a linked parent may complete or sign this form.");
  const who = await verifiedParent(ctx);
  if (!who || who.authUserId !== actor.authUserId) throw new Error("A verified parent account is required.");
  return who;
}
function formReader(actor: Doc<"appUsers">) {
  if (actor.role !== "parent" && actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead && actor.healthExport)) throw new Error("Form access denied.");
}
function operations(actor: Doc<"appUsers">) { if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead && actor.healthExport)) throw new Error("PDF health review requires a Coach or Travel Lead with the health grant."); }
async function build(ctx: Ctx, actor: Doc<"appUsers">, studentId: Id<"students">, eventIds: Id<"events">[], source: "electronic" | "paper", paper?: {name: string; email: string | null}) {
  const student = await studentAccess(ctx, actor, studentId);
  if (student.profileCompletedAt === undefined || !student.consentProfileV2CompletedAt || !student.consentProfileV2ConfirmedBy || !student.consentProfileV2) throw new Error("Student setup and the parent-confirmed profile must be complete before reviewing the populated PDF.");
  const profile = validateConsentProfileV2(student.consentProfileV2);
  const who = source === "electronic" ? await parentSigner(ctx, actor) : null;
  if (source === "paper") operations(actor);
  const signingMode = await requireV2Signing(ctx, student._id, source === "electronic" ? actor._id : undefined);
  const season = await activeSeason(ctx);
  const version = season.activePermissionVersionId ? await ctx.db.get(season.activePermissionVersionId) : null;
  if (!version || version.seasonId !== student.seasonId || version.formFormat !== 2 || version.version !== fieldTripApproved.templateVersion) throw new Error("Select the approved field trip template before preparing a new PDF.");
  const events = (await selectedEventsV2(ctx, student, eventIds)).map(event => ({...event, sponsorName: fieldTripApproved.sponsorName, sponsorPhone: fieldTripApproved.sponsorPhone}));
  const expected = await expectedCoverage(ctx, student._id, events.map(event => event.eventId));
  const priorCoverage = await Promise.all(expected.map(async row => ({...row, submissionId: (await coverageFor(ctx, student._id, row.eventId))?.latestSubmissionId ?? null})));
  const snapshot: ConsentSnapshotV2 = {format: 2, synthetic: signingMode === "synthetic", templateVersion: fieldTripApproved.templateVersion, version: {versionId: version._id, version: version.version, title: version.title, wording: version.wording, schoolName: version.schoolName, teamName: version.teamName, acknowledgmentText: version.acknowledgmentText}, student: {studentId: student._id, seasonId: student.seasonId, legalName: student.legalName, preferredName: student.preferredName, email: student.email, subteam: student.subteam, grade: profile.grade, dateOfBirth: profile.dateOfBirth, profileRevision: student.profileRevision ?? 0, profileConfirmedBy: student.consentProfileV2ConfirmedBy, profileConfirmedAt: student.consentProfileV2CompletedAt}, profile, events, priorCoverage, signer: {source, accountId: source === "electronic" ? actor._id : null, name: source === "electronic" ? who!.name : paper!.name, email: source === "electronic" ? who!.email : paper!.email, recordedBy: actor._id}, typedName: null, acknowledged: false, signedAt: null, recordedAt: null, pdf: null, paper: null};
  validateSnapshotV2(snapshot);
  return {student, snapshot, expected, eventFingerprint: await tokenHash(JSON.stringify(events))};
}
function parseV2(raw: string): ConsentSnapshotV2 {
  let result: ConsentSnapshotV2;
  try { result = JSON.parse(raw) as ConsentSnapshotV2; } catch { throw new Error("Permission snapshot evidence is invalid."); }
  if (result?.format !== 2 || typeof result.synthetic !== "boolean" || result.templateVersion !== "field-trip-v2" && result.templateVersion !== fieldTripApproved.templateVersion) throw new Error("Permission snapshot format is invalid.");
  return validateSnapshotV2(result);
}
async function currentDraft(ctx: Ctx, draft: Doc<"permissionDrafts">, actor: Doc<"appUsers">, now: number) {
  if (draft.snapshotFormat !== 2 || draft.parentId !== actor._id || draft.expiresAt <= now || !draft.reviewedPdfId || !draft.reviewedPdfSha256 || !hashPattern.test(draft.reviewedPdfSha256)) throw new Error("Reviewed PDF draft is unavailable or expired. Prepare it again.");
  const snapshot = parseV2(draft.snapshotJson);
  if (await snapshotHashV2(snapshot) !== draft.snapshotHash) throw new Error("Prepared PDF evidence is inconsistent.");
  const prepared = await build(ctx, actor, draft.studentId, snapshot.events.map(event => event.eventId), snapshot.signer.source, snapshot.signer.source === "paper" ? {name: snapshot.signer.name, email: snapshot.signer.email} : undefined);
  if (prepared.student.profileRevision !== draft.profileRevision || await snapshotHashV2(prepared.snapshot) !== draft.snapshotHash || prepared.eventFingerprint !== draft.eventFingerprint || prepared.snapshot.version.versionId !== draft.versionId) throw new Error("Profile, event, wording or coverage changed. Prepare a new PDF.");
  await compareCoverage(ctx, draft.studentId, draft.expectedCoverage, snapshot.events.map(event => event.eventId));
  return {snapshot, student: prepared.student};
}

export const profile = query({
  args: {studentId: v.id("students")}, returns: profileResultValidator,
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); await parentSigner(ctx, actor); const student = await studentAccess(ctx, actor, args.studentId);
    return {studentId: student._id, revision: student.profileRevision ?? 0, setupComplete: student.profileCompletedAt !== undefined, completed: !!student.consentProfileV2CompletedAt, value: student.consentProfileV2 ?? null};
  },
});
export const saveProfile = mutation({
  args: {studentId: v.id("students"), expectedRevision: v.number(), value: consentProfileV2Validator}, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); await parentSigner(ctx, actor); const student = await studentAccess(ctx, actor, args.studentId);
    if ((student.profileRevision ?? 0) !== args.expectedRevision) throw new ConvexError(`${student.preferredName || student.legalName}'s profile changed since you opened it. Reload to see the latest, then save again.`);
    const setupDraft = await ctx.db.query("setupDrafts").withIndex("by_studentId", q => q.eq("studentId", student._id)).unique();
    const value = validateConsentProfileV2({...normalizeConsentContacts(args.value, student.consentProfileV2), grade: gradeForSave(args.value.grade, [student.consentProfileV2?.grade, setupDraft?.grade])});
    if (Date.parse(`${value.dateOfBirth}T00:00:00Z`) >= Date.now()) throw new ConvexError("Date of birth must be in the past.");
    if (setupDraft) await ctx.db.delete(setupDraft._id);
    await ctx.db.patch(student._id, {consentProfileV2: value, consentProfileV2CompletedAt: Date.now(), consentProfileV2ConfirmedBy: actor._id, profileRevision: args.expectedRevision + 1});
    await audit(ctx, actor, "students", student._id, "confirmStructuredConsentProfile", {revision: args.expectedRevision}, {revision: args.expectedRevision + 1, completed: true});
    return null;
  },
});

export const createDraft = internalMutation({
  args: {studentId: v.id("students"), eventIds: v.array(v.id("events")), source: v.union(v.literal("electronic"), v.literal("paper")), paperName: v.optional(v.string()), paperEmail: v.optional(v.string())}, returns: draftResultValidator,
  handler: async (ctx, args) => {
    const actor = await viewer(ctx);
    if (args.source === "paper") { operations(actor); boundedText(args.paperName ?? "", 160, "Paper signer name"); if (args.paperEmail) normalizeEmail(args.paperEmail, "Paper signer email"); }
    const prepared = await build(ctx, actor, args.studentId, args.eventIds, args.source, args.source === "paper" ? {name: args.paperName!.trim(), email: args.paperEmail?.trim().toLowerCase() ?? null} : undefined);
    const expiresAt = Date.now() + 30 * 60_000;
    const draftId = await ctx.db.insert("permissionDrafts", {studentId: args.studentId, seasonId: prepared.student.seasonId, parentId: actor._id, versionId: prepared.snapshot.version.versionId, snapshotFormat: 2, snapshotJson: JSON.stringify(prepared.snapshot), snapshotHash: await snapshotHashV2(prepared.snapshot), profileRevision: prepared.student.profileRevision ?? 0, eventFingerprint: prepared.eventFingerprint, expectedCoverage: prepared.expected, createdAt: Date.now(), expiresAt});
    return {draftId, expiresAt, snapshot: prepared.snapshot, expectedCoverage: prepared.expected};
  },
});
export const attachReviewedPdf = internalMutation({
  args: {draftId: v.id("permissionDrafts"), storageId: v.id("_storage"), sha256: v.string()}, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); const draft = await ctx.db.get(args.draftId);
    if (!draft || draft.parentId !== actor._id || draft.snapshotFormat !== 2 || draft.reviewedPdfId || !hashPattern.test(args.sha256)) throw new Error("PDF draft cannot be attached.");
    // A profile/event/version mutation during rendering invalidates this draft.
    const snapshot = parseV2(draft.snapshotJson);
    const prepared = await build(ctx, actor, draft.studentId, snapshot.events.map(event => event.eventId), snapshot.signer.source, snapshot.signer.source === "paper" ? {name: snapshot.signer.name, email: snapshot.signer.email} : undefined);
    if (await snapshotHashV2(prepared.snapshot) !== draft.snapshotHash || prepared.eventFingerprint !== draft.eventFingerprint) throw new Error("Profile or event changed while rendering. Prepare a new PDF.");
    await ctx.db.patch(draft._id, {reviewedPdfId: args.storageId, reviewedPdfSha256: args.sha256});
    return null;
  },
});
export const preflightSubmit = internalMutation({
  args: {draftId: v.id("permissionDrafts"), typedName: v.string(), acknowledged: v.boolean(), paperReference: v.optional(v.string()), paperSignedAt: v.optional(v.number())}, returns: v.union(v.object({kind: v.literal("ready"), snapshot: consentSnapshotV2Validator, reviewedPdfId: v.id("_storage"), reviewedPdfSha256: v.string(), signedAt: v.number()}), v.object({kind: v.literal("existing"), submissionId: v.id("permissionSubmissions")})),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); const draft = await ctx.db.get(args.draftId); if (!draft) throw new Error("PDF draft not found.");
    if (draft.parentId !== actor._id || !args.acknowledged) throw new Error("PDF draft is unavailable for this signer.");
    if (draft.usedSubmissionId) {
      const previous = await ctx.db.get(draft.usedSubmissionId);
      if (!previous || previous.draftId !== draft._id || previous.recordedBy !== actor._id || previous.typedName !== args.typedName.trim() || previous.paperReference !== args.paperReference?.trim() || previous.paperSignedAt !== args.paperSignedAt) throw new Error("This PDF draft was already signed differently.");
      if (previous.source === "electronic") await parentSigner(ctx, actor); else operations(actor);
      await studentAccess(ctx, actor, previous.studentId); await requireFamilyEventAccess(ctx, actor, previous.eventIds); await sealedSnapshotV2(ctx, previous);
      return {kind: "existing" as const, submissionId: previous._id};
    }
    const {snapshot} = await currentDraft(ctx, draft, actor, Date.now());
    if (!args.acknowledged || args.typedName.trim() !== snapshot.signer.name.trim()) throw new Error("Check acknowledgment and type the signer name exactly.");
    if (snapshot.signer.source === "paper") {
      boundedText(args.paperReference ?? "", 254, "Paper reference");
      if (!args.paperSignedAt || args.paperSignedAt <= 0 || args.paperSignedAt > Date.now()) throw new Error("Paper signing date is invalid.");
    } else if (args.paperReference || args.paperSignedAt) throw new Error("Paper evidence is not applicable to electronic signing.");
    return {kind: "ready" as const, snapshot, reviewedPdfId: draft.reviewedPdfId!, reviewedPdfSha256: draft.reviewedPdfSha256!, signedAt: snapshot.signer.source === "paper" ? args.paperSignedAt! : Date.now()};
  },
});
export const commitSubmit = internalMutation({
  args: {draftId: v.id("permissionDrafts"), typedName: v.string(), acknowledged: v.boolean(), signedAt: v.number(), signedPdfId: v.id("_storage"), signedPdfSha256: v.string(), reviewedPdfSha256: v.string(), paperReference: v.optional(v.string()), paperSignedAt: v.optional(v.number())}, returns: v.id("permissionSubmissions"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); const draft = await ctx.db.get(args.draftId); if (!draft) throw new Error("PDF draft not found.");
    if (draft.parentId !== actor._id) throw new Error("PDF draft is unavailable for this signer.");
    if (draft.usedSubmissionId) {const previous = await ctx.db.get(draft.usedSubmissionId); if (!previous || previous.draftId !== draft._id || previous.recordedBy !== actor._id || previous.typedName !== args.typedName.trim() || previous.paperReference !== args.paperReference?.trim() || previous.paperSignedAt !== args.paperSignedAt) throw new Error("This PDF draft was already signed differently."); if (previous.source === "electronic") await parentSigner(ctx, actor); else operations(actor); await studentAccess(ctx, actor, previous.studentId); await requireFamilyEventAccess(ctx, actor, previous.eventIds); await sealedSnapshotV2(ctx, previous); return previous._id;}
    const {snapshot, student} = await currentDraft(ctx, draft, actor, Date.now());
    if (!args.acknowledged || args.typedName.trim() !== snapshot.signer.name.trim() || draft.reviewedPdfSha256 !== args.reviewedPdfSha256 || !hashPattern.test(args.signedPdfSha256)) throw new Error("Signed PDF evidence is inconsistent.");
    const signedAt = args.signedAt;
    if (snapshot.signer.source === "electronic" && (signedAt > Date.now() || signedAt < Date.now() - 120_000) || snapshot.signer.source === "paper" && signedAt !== args.paperSignedAt) throw new Error("Signing time changed. Prepare a new PDF.");
    if (snapshot.signer.source === "paper") {boundedText(args.paperReference ?? "", 254, "Paper reference"); if (!signedAt || signedAt <= 0 || signedAt > Date.now()) throw new Error("Paper signing date is invalid.");}
    const final: ConsentSnapshotV2 = {...snapshot, typedName: args.typedName.trim(), acknowledged: true, signedAt, recordedAt: Date.now(), pdf: {reviewedStorageId: draft.reviewedPdfId!, reviewedSha256: draft.reviewedPdfSha256!, signedStorageId: args.signedPdfId, signedSha256: args.signedPdfSha256}, paper: snapshot.signer.source === "paper" ? {reference: args.paperReference!.trim(), signedAt, attested: true} : null};
    validateSnapshotV2(final);
    const sealedHash = await snapshotHashV2(final);
    const priorIds = [...new Set(snapshot.priorCoverage.flatMap(row => row.submissionId ? [row.submissionId] : []))];
    const submissionId = await ctx.db.insert("permissionSubmissions", {studentId: student._id, seasonId: student.seasonId, signedBy: snapshot.signer.accountId ?? undefined, typedName: final.typedName!, wordingVersion: snapshot.version.version, eventIds: snapshot.events.map(event => event.eventId), answersJson: JSON.stringify({acknowledged: true, format: 2}), signedAt, versionId: snapshot.version.versionId, draftId: draft._id, source: snapshot.signer.source, synthetic: snapshot.synthetic, snapshotFormat: 2, snapshotJson: JSON.stringify(final), snapshotHash: sealedHash, reviewedPdfId: draft.reviewedPdfId, reviewedPdfSha256: draft.reviewedPdfSha256, signedPdfId: args.signedPdfId, signedPdfSha256: args.signedPdfSha256, recordedBy: actor._id, signerName: snapshot.signer.name, signerEmail: snapshot.signer.email ?? undefined, supersedesSubmissionId: priorIds.length === 1 ? priorIds[0] : undefined, paperReference: final.paper?.reference, paperSignedAt: final.paper?.signedAt, paperAttestation: final.paper?.attested});
    await setPendingCoverage(ctx, actor, student, submissionId, snapshot.version.versionId, draft.expectedCoverage, {snapshotHash: sealedHash, source: snapshot.signer.source, format: 2, synthetic: snapshot.synthetic});
    await ctx.db.patch(draft._id, {usedSubmissionId: submissionId});
    await audit(ctx, actor, "permissionSubmissions", submissionId, snapshot.synthetic ? "submitSyntheticPdfConsent" : "submitPdfConsent", null, {format: 2, synthetic: snapshot.synthetic, eventIds: snapshot.events.map(event => event.eventId), reviewedPdfSha256: draft.reviewedPdfSha256, signedPdfSha256: args.signedPdfSha256});
    return submissionId;
  },
});
export async function sealedSnapshotV2(ctx: Ctx, submission: Doc<"permissionSubmissions">) {
  if (submission.snapshotFormat !== 2 || typeof submission.synthetic !== "boolean" || !submission.snapshotJson || !submission.snapshotHash || !submission.reviewedPdfId || !submission.reviewedPdfSha256 || !submission.signedPdfId || !submission.signedPdfSha256 || !hashPattern.test(submission.reviewedPdfSha256) || !hashPattern.test(submission.signedPdfSha256)) throw new Error("PDF permission evidence is incomplete.");
  const snapshot = parseV2(submission.snapshotJson);
  if (!snapshot.pdf || snapshot.synthetic !== submission.synthetic || snapshot.pdf.reviewedStorageId !== submission.reviewedPdfId || snapshot.pdf.reviewedSha256 !== submission.reviewedPdfSha256 || snapshot.pdf.signedStorageId !== submission.signedPdfId || snapshot.pdf.signedSha256 !== submission.signedPdfSha256) throw new Error("PDF evidence binding is inconsistent.");
  if (await snapshotHashV2(snapshot) !== submission.snapshotHash || snapshot.student.studentId !== submission.studentId || snapshot.student.seasonId !== submission.seasonId || snapshot.version.versionId !== submission.versionId || snapshot.version.version !== submission.wordingVersion || snapshot.signer.source !== submission.source || snapshot.signer.recordedBy !== submission.recordedBy || snapshot.signer.name !== submission.signerName || snapshot.typedName !== submission.typedName || snapshot.signedAt !== submission.signedAt || !snapshot.acknowledged || snapshot.recordedAt === null || snapshot.events.length !== submission.eventIds.length || snapshot.events.some(event => !submission.eventIds.includes(event.eventId))) throw new Error("PDF permission sealed evidence is inconsistent.");
  if (submission.source === "electronic" && (!submission.signedBy || snapshot.signer.accountId !== submission.signedBy || snapshot.signer.email !== submission.signerEmail || snapshot.paper !== null) || submission.source === "paper" && (submission.signedBy !== undefined || !snapshot.paper || !submission.paperAttestation || snapshot.paper.reference !== submission.paperReference || snapshot.paper.signedAt !== submission.paperSignedAt)) throw new Error("PDF signature provenance is inconsistent.");
  return snapshot;
}
export const receipt = query({
  args: {submissionId: v.id("permissionSubmissions")}, returns: v.object({snapshot: consentSnapshotV2Validator, reviewedPdfSha256: v.string(), signedPdfSha256: v.string()}),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); formReader(actor); const submission = await ctx.db.get(args.submissionId);
    if (!submission) throw new ConvexError("This signed permission form isn't available. Reload the page to see the current list."); await studentAccess(ctx, actor, submission.studentId); await requireFamilyEventAccess(ctx, actor, submission.eventIds);
    const snapshot = await sealedSnapshotV2(ctx, submission);
    return {snapshot, reviewedPdfSha256: submission.reviewedPdfSha256!, signedPdfSha256: submission.signedPdfSha256!};
  },
});
export const pdfAccess = internalQuery({
  args: {draftId: v.optional(v.id("permissionDrafts")), submissionId: v.optional(v.id("permissionSubmissions")), rendition: v.union(v.literal("reviewed"), v.literal("signed")), now: v.number()}, returns: pdfAccessValidator,
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); formReader(actor);
    if (!!args.draftId === !!args.submissionId) throw new Error("Choose one PDF record.");
    if (args.draftId) {
      if (args.rendition !== "reviewed") throw new Error("A draft has no signed PDF.");
      const draft = await ctx.db.get(args.draftId); if (!draft || draft.parentId !== actor._id || draft.snapshotFormat !== 2 || draft.expiresAt <= args.now || !draft.reviewedPdfId || !draft.reviewedPdfSha256) throw new Error("PDF draft is unavailable.");
      await currentDraft(ctx, draft, actor, args.now);
      return {storageId: draft.reviewedPdfId, sha256: draft.reviewedPdfSha256};
    }
    const submission = await ctx.db.get(args.submissionId!); if (!submission) throw new Error("Signed form PDF not found.");
    await studentAccess(ctx, actor, submission.studentId); await requireFamilyEventAccess(ctx, actor, submission.eventIds); await sealedSnapshotV2(ctx, submission);
    return args.rendition === "reviewed" ? {storageId: submission.reviewedPdfId!, sha256: submission.reviewedPdfSha256!} : {storageId: submission.signedPdfId!, sha256: submission.signedPdfSha256!};
  },
});
