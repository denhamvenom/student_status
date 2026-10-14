import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { assertRevision, parseSnapshot, snapshotHash, type ExpectedCoverage } from "./consentSnapshot";
type Ctx = MutationCtx | QueryCtx;

export async function coverageFor(ctx: Ctx, studentId: Id<"students">, eventId: Id<"events">) {
  const row = await ctx.db.query("permissionCoverage").withIndex("by_studentId_and_eventId", q => q.eq("studentId", studentId).eq("eventId", eventId)).unique();
  if (row) assertRevision(row.revision);
  return row;
}
export async function expectedCoverage(ctx: Ctx, studentId: Id<"students">, eventIds: Id<"events">[]) {return Promise.all([...eventIds].sort().map(async eventId => ({ eventId, revision: (await coverageFor(ctx, studentId, eventId))?.revision ?? 0 })))}
export async function compareCoverage(ctx: Ctx, studentId: Id<"students">, expected: ExpectedCoverage[], eventIds: Id<"events">[]) {
  if (expected.length !== eventIds.length || new Set(expected.map(row => row.eventId)).size !== expected.length || expected.some(row => !eventIds.includes(row.eventId))) throw new Error("The full current permission scope must be supplied.");
  for (const item of expected) {assertRevision(item.revision); if (((await coverageFor(ctx, studentId, item.eventId))?.revision ?? 0) !== item.revision) throw new Error("Permission coverage changed. Reload before continuing.")}
}
export async function sealedSnapshot(ctx: Ctx, submission: Doc<"permissionSubmissions">) {
  if (submission.snapshotFormat !== 1 || !submission.synthetic || !submission.snapshotJson || !submission.snapshotHash || !submission.versionId || !submission.source || !submission.recordedBy || !submission.signerName) throw new Error("Legacy or incomplete permission evidence cannot establish current acceptance.");
  const snapshot = parseSnapshot(ctx, submission.snapshotJson);
  if (await snapshotHash(snapshot) !== submission.snapshotHash || snapshot.student.studentId !== submission.studentId || snapshot.student.seasonId !== submission.seasonId || snapshot.version.versionId !== submission.versionId || snapshot.version.version !== submission.wordingVersion || snapshot.signer.source !== submission.source || snapshot.signer.recordedBy !== submission.recordedBy || snapshot.signer.name !== submission.signerName || snapshot.typedName !== submission.typedName || snapshot.signedAt !== submission.signedAt || !snapshot.acknowledged || snapshot.choices === null || snapshot.recordedAt === null || snapshot.events.length !== submission.eventIds.length || snapshot.events.some(event => !submission.eventIds.includes(event.eventId))) throw new Error("Permission sealed evidence is inconsistent.");
  if (submission.source === "electronic" && (!submission.signedBy || snapshot.signer.accountId !== submission.signedBy || snapshot.signer.email !== submission.signerEmail) || submission.source === "paper" && (submission.signedBy !== undefined || !snapshot.paper || !submission.paperAttestation || snapshot.paper.reference !== submission.paperReference || snapshot.paper.signedAt !== submission.paperSignedAt || snapshot.paper.signedAt !== snapshot.signedAt || snapshot.signer.email !== (submission.signerEmail ?? null))) throw new Error("Permission signature provenance is inconsistent.");
  return snapshot;
}
export async function setPendingCoverage(ctx: MutationCtx, actor: Doc<"appUsers">, student: Doc<"students">, submissionId: Id<"permissionSubmissions">, versionId: Id<"permissionVersions">, expected: ExpectedCoverage[], seal: {snapshotHash: string; source: "electronic" | "paper"; format?: 1 | 2}) {
  for (const item of expected) {
    const row = await coverageFor(ctx, student._id, item.eventId);
    const fields = { seasonId: student.seasonId, studentId: student._id, eventId: item.eventId, state: "pending" as const, revision: item.revision + 1, updatedAt: Date.now(), updatedBy: actor._id, latestSubmissionId: submissionId, versionId, latestReviewId: undefined, signatureRequestedAt: undefined, reason: undefined, correctionField: undefined, sealedSnapshotFormat: seal.format ?? 1, sealedSnapshotHash: seal.snapshotHash, synthetic: true, source: seal.source };
    if (row) await ctx.db.patch(row._id, fields); else await ctx.db.insert("permissionCoverage", fields);
  }
}
export async function controlledCoverage(ctx: Ctx, submissionId: Id<"permissionSubmissions">) {
  const rows = await ctx.db.query("permissionCoverage").withIndex("by_latestSubmissionId", q => q.eq("latestSubmissionId", submissionId)).take(51);
  if (rows.length > 50) throw new Error("Permission scope limit reached.");
  return rows.filter(row => row.signatureRequestedAt === undefined).sort((a, b) => a.eventId.localeCompare(b.eventId));
}
/** Only authoritative sealed coverage counts; historical acceptance is never a fallback. */
export async function permissionAccepted(ctx: Ctx, studentId: Id<"students">, eventId: Id<"events">) {
  const coverage = await coverageFor(ctx, studentId, eventId);
  if (!coverage || coverage.state !== "accepted" || coverage.signatureRequestedAt !== undefined || !coverage.latestSubmissionId || !coverage.latestReviewId) return false;
  if (coverage.sealedSnapshotFormat !== 1 && coverage.sealedSnapshotFormat !== 2 || coverage.synthetic !== true || !coverage.sealedSnapshotHash || !/^[0-9a-f]{64}$/.test(coverage.sealedSnapshotHash) || !coverage.versionId || !coverage.source) return false;
  const review = await ctx.db.get(coverage.latestReviewId);
  return !!review && review.status === "accepted" && review.submissionId === coverage.latestSubmissionId && review.snapshotHash === coverage.sealedSnapshotHash && !!review.controlledCoverage?.some(item => item.eventId === eventId && item.priorRevision + 1 === coverage.revision);
}
