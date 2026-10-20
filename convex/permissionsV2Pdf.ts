"use node";

import { ConvexError, v } from "convex/values";
import { action } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { appendFieldTripSignature, renderFieldTripPdf } from "../src/lib/field-trip-pdf";
import { consentSnapshotV2Validator, type ConsentSnapshotV2, type ExpectedCoverageV2 } from "./lib/consentSnapshotV2";
import { expectedCoverageValidator } from "./lib/consentSnapshot";

const preparedValidator = v.object({draftId: v.id("permissionDrafts"), expiresAt: v.number(), snapshot: consentSnapshotV2Validator, expectedCoverage: v.array(expectedCoverageValidator), pdfSha256: v.string()});
type Draft = {draftId: Id<"permissionDrafts">; expiresAt: number; snapshot: ConsentSnapshotV2; expectedCoverage: ExpectedCoverageV2[]};
type Preflight = {kind: "ready"; snapshot: ConsentSnapshotV2; reviewedPdfId: Id<"_storage">; reviewedPdfSha256: string; signedAt: number} | {kind: "existing"; submissionId: Id<"permissionSubmissions">};
async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
  return Buffer.from(digest).toString("hex");
}
async function storePdf(ctx: {storage: {store(blob: Blob): Promise<import("./_generated/dataModel").Id<"_storage">>}}, bytes: Uint8Array) {
  if (bytes.length < 100 || bytes.length > 4_000_000 || Buffer.from(bytes.subarray(0, 5)).toString("ascii") !== "%PDF-") throw new ConvexError("Rendered PDF is invalid or too large.");
  const storageId = await ctx.storage.store(new Blob([Uint8Array.from(bytes)], {type: "application/pdf"}));
  return {storageId, sha256: await sha256(bytes)};
}
export const prepare = action({
  args: {studentId: v.id("students"), eventIds: v.array(v.id("events"))}, returns: preparedValidator,
  handler: async (ctx, args) => {
    const draft: Draft = await ctx.runMutation(internal.permissionsV2.createDraft, {...args, source: "electronic"});
    const pdf = await storePdf(ctx, await renderFieldTripPdf(draft.snapshot));
    await ctx.runMutation(internal.permissionsV2.attachReviewedPdf, {draftId: draft.draftId, storageId: pdf.storageId, sha256: pdf.sha256});
    return {...draft, pdfSha256: pdf.sha256};
  },
});
export const preparePaper = action({
  args: {studentId: v.id("students"), eventIds: v.array(v.id("events")), signerName: v.string(), signerEmail: v.optional(v.string())}, returns: preparedValidator,
  handler: async (ctx, args) => {
    const draft: Draft = await ctx.runMutation(internal.permissionsV2.createDraft, {studentId: args.studentId, eventIds: args.eventIds, source: "paper", paperName: args.signerName, paperEmail: args.signerEmail});
    const pdf = await storePdf(ctx, await renderFieldTripPdf(draft.snapshot));
    await ctx.runMutation(internal.permissionsV2.attachReviewedPdf, {draftId: draft.draftId, storageId: pdf.storageId, sha256: pdf.sha256});
    return {...draft, pdfSha256: pdf.sha256};
  },
});
export const submit = action({
  args: {draftId: v.id("permissionDrafts"), typedName: v.string(), acknowledged: v.boolean()}, returns: v.id("permissionSubmissions"),
  handler: async (ctx, args): Promise<Id<"permissionSubmissions">> => {
    const prepared: Preflight = await ctx.runMutation(internal.permissionsV2.preflightSubmit, args);
    if (prepared.kind === "existing") return prepared.submissionId;
    const reviewedBlob = await ctx.storage.get(prepared.reviewedPdfId);
    if (!reviewedBlob) throw new ConvexError("Reviewed PDF is unavailable.");
    const reviewedBytes = new Uint8Array(await reviewedBlob.arrayBuffer());
    if (await sha256(reviewedBytes) !== prepared.reviewedPdfSha256) throw new ConvexError("Reviewed PDF failed integrity check.");
    const bytes = await appendFieldTripSignature(reviewedBytes, {typedName: args.typedName.trim(), signedAt: prepared.signedAt, reviewedSha256: prepared.reviewedPdfSha256, source: "electronic", templateVersion: prepared.snapshot.templateVersion});
    const pdf = await storePdf(ctx, bytes);
    return ctx.runMutation(internal.permissionsV2.commitSubmit, {...args, signedAt: prepared.signedAt, signedPdfId: pdf.storageId, signedPdfSha256: pdf.sha256, reviewedPdfSha256: prepared.reviewedPdfSha256});
  },
});
export const submitPaper = action({
  args: {draftId: v.id("permissionDrafts"), typedName: v.string(), acknowledged: v.boolean(), paperReference: v.string(), paperSignedAt: v.number()}, returns: v.id("permissionSubmissions"),
  handler: async (ctx, args): Promise<Id<"permissionSubmissions">> => {
    const prepared: Preflight = await ctx.runMutation(internal.permissionsV2.preflightSubmit, args);
    if (prepared.kind === "existing") return prepared.submissionId;
    if (prepared.snapshot.signer.source !== "paper") throw new ConvexError("This is not a paper record.");
    const reviewedBlob = await ctx.storage.get(prepared.reviewedPdfId);
    if (!reviewedBlob) throw new ConvexError("Reviewed PDF is unavailable.");
    const reviewedBytes = new Uint8Array(await reviewedBlob.arrayBuffer());
    if (await sha256(reviewedBytes) !== prepared.reviewedPdfSha256) throw new ConvexError("Reviewed PDF failed integrity check.");
    const pdf = await storePdf(ctx, await appendFieldTripSignature(reviewedBytes, {typedName: args.typedName.trim(), signedAt: prepared.signedAt, reviewedSha256: prepared.reviewedPdfSha256, source: "paper", templateVersion: prepared.snapshot.templateVersion}));
    return ctx.runMutation(internal.permissionsV2.commitSubmit, {...args, signedAt: prepared.signedAt, signedPdfId: pdf.storageId, signedPdfSha256: pdf.sha256, reviewedPdfSha256: prepared.reviewedPdfSha256});
  },
});
export const pdf = action({
  args: {draftId: v.optional(v.id("permissionDrafts")), submissionId: v.optional(v.id("permissionSubmissions")), rendition: v.union(v.literal("reviewed"), v.literal("signed"))}, returns: v.object({bytes: v.bytes(), sha256: v.string()}),
  handler: async (ctx, args) => {
    const access: {storageId: Id<"_storage">; sha256: string} = await ctx.runQuery(internal.permissionsV2.pdfAccess, {...args, now: Date.now()});
    const blob: Blob | null = await ctx.storage.get(access.storageId);
    if (!blob) throw new ConvexError("PDF evidence is unavailable.");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (await sha256(bytes) !== access.sha256) throw new ConvexError("PDF evidence failed integrity check.");
    return {bytes: Uint8Array.from(bytes).buffer, sha256: access.sha256};
  },
});
