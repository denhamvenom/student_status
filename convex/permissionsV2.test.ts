/// <reference types="vite/client" />
import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { PDFDocument } from "pdf-lib";
import { api, internal } from "./_generated/api";
import { privateStudent } from "./lib/access";
import { fieldTripApproved } from "../src/lib/field-trip-approved";
import { validateSnapshotV2 } from "./lib/consentSnapshotV2";
import { resolvePermissionSigningMode } from "./lib/permissionSigningMode";
import { permissionAccepted } from "./lib/permissionCoverage";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.unstubAllEnvs());
const profile = {
  grade: "10", dateOfBirth: "2010-05-12",
  guardian: {name: "Fictional Guardian", relationship: "Parent", phone: "202-555-0100", email: "parent@example.invalid"},
  emergency: {name: "Fictional Alternate", relationship: "Aunt", phone: "202-555-0101"},
  allergies: {state: "reported" as const, entries: [{allergen: "Synthetic pollen", severity: "Moderate", reaction: "Fictional rash", response: "Call guardian"}]},
  prescriptions: {state: "none" as const, entries: []},
  insurance: {state: "unavailable" as const, provider: null, policy: null},
  physician: {state: "none" as const, name: null, phone: null},
};
async function fixture() {
  vi.stubEnv("CONVEX_CLOUD_URL", "https://third-bandicoot-18.convex.cloud");
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "parent" | "mentor", healthExport = false) {
      const email = `${name.toLowerCase().replaceAll(" ", "-")}@example.invalid`;
      const auth = await ctx.db.insert("users", {email, name, emailVerificationTime: 1});
      await ctx.db.insert("authAccounts", {userId: auth, provider: "google", providerAccountId: name, emailVerified: email});
      const id = await ctx.db.insert("appUsers", {authUserId: auth, email, name, role, active: true, travelLead: role === "mentor", healthExport, financialEdit: false});
      return {id, auth};
    }
    const coach = await account("Coach", "coach"), parent = await account("Fictional Parent", "parent"), other = await account("Other Parent", "parent"), ungranted = await account("Ungrant", "mentor");
    const season = await ctx.db.insert("seasons", {name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.id});
    const student = await ctx.db.insert("students", {seasonId: season, legalName: "Fictional Student", preferredName: "Fictional", email: "fictional@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategory: "Girls", roomCategoryLocked: true, shirtSize: "M", profileRevision: 0, allergies: {state: "reported", text: "Original free-text allergy"}, medications: {state: "unknown"}});
    const event = await ctx.db.insert("events", {seasonId: season, name: "Synthetic Trip", type: "Team", startsAt: Date.now() + 86_400_000, endsAt: Date.now() + 90_000_000, destination: "Fictional venue", travel: "Bus", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "assigned", allowWithdrawal: true, permissionRequired: true, firstRequired: false, archived: false});
    await ctx.db.insert("participants", {eventId: event, studentId: student, status: "confirmed", createdAt: 1, updatedAt: 1});
    await ctx.db.insert("familyLinks", {parentUserId: parent.id, studentId: student, seasonId: season, active: true, createdBy: coach.id});
    await ctx.db.insert("syntheticConsentSubjects", {studentId: student, enabled: true, createdBy: coach.id, createdAt: 1});
    await ctx.db.insert("syntheticConsentSubjects", {studentId: student, parentId: parent.id, enabled: true, createdBy: coach.id, createdAt: 1});
    return {coach, parent, other, ungranted, season, student, event};
  });
  const as = (auth: typeof ids.coach.auth) => t.withIdentity({subject: `${auth}|session`});
  const actors = {coach: as(ids.coach.auth), parent: as(ids.parent.auth), other: as(ids.other.auth), ungranted: as(ids.ungranted.auth)};
  await actors.coach.mutation(api.permissionVersions.selectApprovedFieldTripTemplate, {});
  return {t, ids, ...actors};
}

it("requires student setup and explicit parent confirmation before a populated PDF draft", async () => {
  const f = await fixture();
  await expect(f.parent.mutation(internal.permissionsV2.createDraft, {studentId: f.ids.student, eventIds: [f.ids.event], source: "electronic"})).rejects.toThrow("Student setup");
  await expect(f.other.query(api.permissionsV2.profile, {studentId: f.ids.student})).rejects.toThrow();
  await expect(f.parent.mutation(api.permissionsV2.saveProfile, {studentId: f.ids.student, expectedRevision: 0, value: {...profile, prescriptions: {state: "reported", entries: []}}})).rejects.toThrow("Prescriptions require");
  await f.parent.mutation(api.permissionsV2.saveProfile, {studentId: f.ids.student, expectedRevision: 0, value: profile});
  await expect(f.parent.mutation(internal.permissionsV2.createDraft, {studentId: f.ids.student, eventIds: [f.ids.event], source: "electronic"})).rejects.toThrow("Student setup");
  await f.t.run(ctx => ctx.db.patch(f.ids.student, {profileCompletedAt: 1, profileRevision: 2}));
  const draft = await f.parent.mutation(internal.permissionsV2.createDraft, {studentId: f.ids.student, eventIds: [f.ids.event], source: "electronic"});
  expect(draft.snapshot.format).toBe(2);
  expect(draft.snapshot.profile.allergies.entries[0].allergen).toBe("Synthetic pollen");
  expect(draft.snapshot.events[0]).toMatchObject({sponsorName: fieldTripApproved.sponsorName, sponsorPhone: fieldTripApproved.sponsorPhone, lodging: null});
  expect(JSON.stringify(draft.snapshot)).not.toContain("Original free-text allergy");
  const student = await f.t.run(ctx => ctx.db.get(f.ids.student));
  expect(student?.allergies.text).toBe("Original free-text allergy");
  expect(privateStudent(student!).allergies).toMatchObject({state: "reported", text: expect.stringContaining("Synthetic pollen")});
  await expect(f.parent.mutation(api.permissions.prepare, {studentId: f.ids.student, eventIds: [f.ids.event]})).rejects.toThrow("new PDF permission form");
});

it("rejects incomplete insurance and ungranted paper preparation without changing old health evidence", async () => {
  const f = await fixture();
  await expect(f.parent.mutation(api.permissionsV2.saveProfile, {studentId: f.ids.student, expectedRevision: 0, value: {...profile, insurance: {state: "provided", provider: "Fictional Coverage", policy: null}}})).rejects.toThrow("Insurance needs complete details");
  await f.t.run(ctx => ctx.db.patch(f.ids.student, {profileCompletedAt: 1}));
  await f.parent.mutation(api.permissionsV2.saveProfile, {studentId: f.ids.student, expectedRevision: 0, value: profile});
  await expect(f.ungranted.mutation(internal.permissionsV2.createDraft, {studentId: f.ids.student, eventIds: [f.ids.event], source: "paper", paperName: "Fictional Parent"})).rejects.toThrow("health grant");
  const student = await f.t.run(ctx => ctx.db.get(f.ids.student));
  expect(student?.medications.state).toBe("unknown");
});

it("stores the reviewed PDF, refuses stale signing, and retrieves only through linked access", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch(f.ids.student, {profileCompletedAt: 1}));
  await f.parent.mutation(api.permissionsV2.saveProfile, {studentId: f.ids.student, expectedRevision: 0, value: profile});
  const prepared = await f.parent.action(api.permissionsV2Pdf.prepare, {studentId: f.ids.student, eventIds: [f.ids.event]});
  expect(prepared.snapshot.format).toBe(2);
  const downloaded = await f.parent.action(api.permissionsV2Pdf.pdf, {draftId: prepared.draftId, rendition: "reviewed"});
  expect(new TextDecoder().decode(new Uint8Array(downloaded.bytes).subarray(0, 5))).toBe("%PDF-");
  expect(downloaded.sha256).toBe(prepared.pdfSha256);
  await expect(f.other.action(api.permissionsV2Pdf.pdf, {draftId: prepared.draftId, rendition: "reviewed"})).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch(f.ids.event, {destination: "Changed fictional destination"}));
  await expect(f.parent.action(api.permissionsV2Pdf.submit, {draftId: prepared.draftId, typedName: "Fictional Parent", acknowledged: true})).rejects.toThrow("Profile, event, wording or coverage changed");
  await expect(f.parent.action(api.permissionsV2Pdf.pdf, {draftId: prepared.draftId, rendition: "reviewed"})).rejects.toThrow("Profile, event, wording or coverage changed");
});

it("seals reviewed and signed PDFs, preserves the reviewed pages, and retries once", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch(f.ids.student, {profileCompletedAt: 1}));
  await f.parent.mutation(api.permissionsV2.saveProfile, {studentId: f.ids.student, expectedRevision: 0, value: profile});
  const prepared = await f.parent.action(api.permissionsV2Pdf.prepare, {studentId: f.ids.student, eventIds: [f.ids.event]});
  const submissionId = await f.parent.action(api.permissionsV2Pdf.submit, {draftId: prepared.draftId, typedName: "Fictional Parent", acknowledged: true});
  expect(await f.parent.action(api.permissionsV2Pdf.submit, {draftId: prepared.draftId, typedName: "Fictional Parent", acknowledged: true})).toBe(submissionId);
  const receipt = await f.parent.query(api.permissionsV2.receipt, {submissionId});
  expect(receipt.snapshot.pdf?.reviewedSha256).toBe(prepared.pdfSha256);
  expect(receipt.snapshot.pdf?.signedSha256).toBe(receipt.signedPdfSha256);
  const reviewed = await f.parent.action(api.permissionsV2Pdf.pdf, {submissionId, rendition: "reviewed"});
  const signed = await f.parent.action(api.permissionsV2Pdf.pdf, {submissionId, rendition: "signed"});
  expect(await PDFDocument.load(signed.bytes).then(document => document.getPageCount())).toBe((await PDFDocument.load(reviewed.bytes)).getPageCount());
  const summary = await f.coach.query(api.permissions.listSubmissions, {studentId: f.ids.student});
  expect(summary[0]).toMatchObject({submissionId, format: 2, legacy: false});
  await f.coach.mutation(api.permissions.review, {submissionId, status: "accepted", expectedLatestReviewId: null, expectedCoverage: summary[0].controlledCoverage, idempotencyKey: "fictional-review-1"});
  await expect(f.parent.action(api.permissionsV2Pdf.submit, {draftId: prepared.draftId, typedName: "Different Name", acknowledged: true})).rejects.toThrow("already signed differently");
  vi.stubEnv("CONVEX_CLOUD_URL", "https://team-prod.convex.cloud");
  expect((await f.parent.query(api.permissionsV2.receipt, {submissionId})).snapshot.synthetic).toBe(true);
  expect((await f.parent.action(api.permissionsV2Pdf.pdf, {submissionId, rendition: "signed"})).sha256).toBe(receipt.signedPdfSha256);
});

it("selects one immutable approved version and keeps prior V2 snapshot parsing", async () => {
  const f = await fixture();
  const first = await f.coach.mutation(api.permissionVersions.selectApprovedFieldTripTemplate, {});
  expect(await f.coach.mutation(api.permissionVersions.selectApprovedFieldTripTemplate, {})).toBe(first);
  await expect(f.coach.mutation(api.permissionVersions.createVersionV2, {version: "other", title: "Other", wording: "minor first aid", acknowledgmentText: "Other"})).rejects.toThrow("Custom PDF wording is closed");
  await f.t.run(ctx => ctx.db.patch(f.ids.student, {profileCompletedAt: 1}));
  await f.parent.mutation(api.permissionsV2.saveProfile, {studentId: f.ids.student, expectedRevision: 0, value: profile});
  const draft = await f.parent.mutation(internal.permissionsV2.createDraft, {studentId: f.ids.student, eventIds: [f.ids.event], source: "electronic"});
  expect(draft.snapshot.templateVersion).toBe(fieldTripApproved.templateVersion);
  expect(() => validateSnapshotV2({...draft.snapshot, version: {...draft.snapshot.version, wording: "Changed minor first aid"}})).toThrow("Approved field trip template");
  const older = {...draft.snapshot, templateVersion: "field-trip-v2" as const, version: {...draft.snapshot.version, version: "prior-v2", wording: "Prior synthetic minor first aid wording."}};
  expect(validateSnapshotV2(older).templateVersion).toBe("field-trip-v2");
});

it("fails closed until real signing is explicitly bound to this non-development deployment", async () => {
  const prod = "https://team-prod.convex.cloud";
  expect(resolvePermissionSigningMode({cloudUrl: prod})).toBe("closed");
  expect(resolvePermissionSigningMode({cloudUrl: prod, realEnabled: "true", realCloudUrl: "https://other.convex.cloud"})).toBe("closed");
  expect(resolvePermissionSigningMode({cloudUrl: prod, realEnabled: "true", realCloudUrl: "http://team-prod.convex.cloud"})).toBe("closed");
  expect(resolvePermissionSigningMode({cloudUrl: "https://third-bandicoot-18.convex.cloud", realEnabled: "true", realCloudUrl: "https://third-bandicoot-18.convex.cloud"})).toBe("synthetic");
  expect(resolvePermissionSigningMode({cloudUrl: prod, realEnabled: "true", realCloudUrl: prod})).toBe("real");

  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch(f.ids.student, {profileCompletedAt: 1}));
  await f.parent.mutation(api.permissionsV2.saveProfile, {studentId: f.ids.student, expectedRevision: 0, value: profile});
  vi.stubEnv("CONVEX_CLOUD_URL", prod);
  await expect(f.parent.action(api.permissionsV2Pdf.prepare, {studentId: f.ids.student, eventIds: [f.ids.event]})).rejects.toThrow("signing is closed");
  vi.stubEnv("PERMISSION_REAL_SIGNING_ENABLED", "true");
  vi.stubEnv("PERMISSION_REAL_SIGNING_CLOUD_URL", "https://other.convex.cloud");
  await expect(f.parent.action(api.permissionsV2Pdf.prepare, {studentId: f.ids.student, eventIds: [f.ids.event]})).rejects.toThrow("signing is closed");
  vi.stubEnv("PERMISSION_REAL_SIGNING_CLOUD_URL", prod);
  const workspace = await f.parent.query(api.permissions.workspace, {studentId: f.ids.student});
  expect(workspace).toMatchObject({signingMode: "real", canSign: true});
  const dashboard = await f.parent.query(api.app.studentDashboard, {studentId: f.ids.student});
  expect(dashboard.todos).toEqual(expect.arrayContaining([expect.objectContaining({label: "Review and sign the permission form", href: "/forms"})]));
  const prepared = await f.parent.action(api.permissionsV2Pdf.prepare, {studentId: f.ids.student, eventIds: [f.ids.event]});
  expect(prepared.snapshot.synthetic).toBe(false);
  vi.stubEnv("PERMISSION_REAL_SIGNING_ENABLED", "false");
  await expect(f.parent.action(api.permissionsV2Pdf.submit, {draftId: prepared.draftId, typedName: "Fictional Parent", acknowledged: true})).rejects.toThrow("signing is closed");
  vi.stubEnv("PERMISSION_REAL_SIGNING_ENABLED", "true");
  const submissionId = await f.parent.action(api.permissionsV2Pdf.submit, {draftId: prepared.draftId, typedName: "Fictional Parent", acknowledged: true});
  const receipt = await f.parent.query(api.permissionsV2.receipt, {submissionId});
  expect(receipt.snapshot.synthetic).toBe(false);
  const summary = await f.coach.query(api.permissions.listSubmissions, {studentId: f.ids.student});
  expect(summary[0].synthetic).toBe(false);
  expect(await f.t.run(ctx => permissionAccepted(ctx, f.ids.student, f.ids.event))).toBe(false);
  await f.coach.mutation(api.permissions.review, {submissionId, status: "accepted", expectedLatestReviewId: null, expectedCoverage: summary[0].controlledCoverage, idempotencyKey: "real-review-1"});
  expect(await f.t.run(ctx => permissionAccepted(ctx, f.ids.student, f.ids.event))).toBe(true);
  expect((await f.parent.query(api.app.eventDetail, {eventId: f.ids.event, studentId: f.ids.student})).readiness?.open).not.toContain("Permission accepted");
  const paper = await f.coach.action(api.permissionsV2Pdf.preparePaper, {studentId: f.ids.student, eventIds: [f.ids.event], signerName: "Fictional Paper Guardian"});
  expect(paper.snapshot.synthetic).toBe(false);
  const paperId = await f.coach.action(api.permissionsV2Pdf.submitPaper, {draftId: paper.draftId, typedName: "Fictional Paper Guardian", acknowledged: true, paperReference: "paper-real-1", paperSignedAt: Date.now() - 1000});
  expect((await f.coach.query(api.permissionsV2.receipt, {submissionId: paperId})).snapshot.synthetic).toBe(false);
  const exported = await f.coach.mutation(api.permissions.exportPacket, {eventId: f.ids.event, includeHealth: false});
  expect(exported.synthetic).toBe(false);
  expect(exported.records[0].synthetic).toBe(false);
  vi.stubEnv("PERMISSION_REAL_SIGNING_ENABLED", "false");
  expect((await f.parent.query(api.permissionsV2.receipt, {submissionId})).snapshot.synthetic).toBe(false);
  expect((await f.parent.action(api.permissionsV2Pdf.pdf, {submissionId, rendition: "signed"})).sha256).toBe(receipt.signedPdfSha256);
});
