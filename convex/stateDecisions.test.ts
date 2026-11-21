/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { publicVersion, selectedEvents, snapshotHash, type ConsentSnapshot } from "./lib/consentSnapshot";
import { expectedCoverage, permissionAccepted, setPendingCoverage } from "./lib/permissionCoverage";
import type { Id } from "./_generated/dataModel";

// Pins the November 17, 2026 owner decisions in docs/DECISIONS.md that current code already satisfies.
const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.unstubAllEnvs());

const choices = { pain: "allow" as const, allergy: "contact" as const, cold: "deny" as const };
const wording = { version: "SYNTHETIC-DRAFT-1", title: "Synthetic permission", wording: "Denham Springs High School and FIRST Team 8044, Denham Venom: participation, travel and minor first aid. Synthetic unapproved wording only.", schoolName: "Denham Springs High School", teamName: "FIRST Team 8044, Denham Venom", medications: [{ key: "pain" as const, label: "Pain Medication", productsText: "Unapproved synthetic products", exceptionsText: "Unapproved exceptions" }, { key: "allergy" as const, label: "Allergy Medication", productsText: "Unapproved synthetic products", exceptionsText: "Unapproved exceptions" }, { key: "cold" as const, label: "Cold Medication", productsText: "Unapproved synthetic products", exceptionsText: "Unapproved exceptions" }], administrationText: "Synthetic administration only; Coach approval pending.", acknowledgmentText: "I authorize the options selected for these listed events." };

async function fixture() {
  vi.stubEnv("CONVEX_CLOUD_URL", "https://third-bandicoot-18.convex.cloud");
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function user(name: string, role: "coach" | "parent" | "student") {
      const email = `${name.toLowerCase().replaceAll(" ", "-")}@example.invalid`;
      const auth = await ctx.db.insert("users", { email, name, emailVerificationTime: 1 });
      await ctx.db.insert("authAccounts", { userId: auth, provider: "google", providerAccountId: name, emailVerified: email });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email, role, active: true, travelLead: false, healthExport: false, financialEdit: false });
      return { id, auth };
    }
    const coach = await user("Coach", "coach"), parent = await user("Parent Example", "parent"), studentUser = await user("Student", "student");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "Draft", createdBy: coach.id });
    const student = await ctx.db.insert("students", { seasonId: season, userId: studentUser.id, legalName: "Fictional Student", preferredName: "Fictional", email: "fictional@example.invalid", subteam: "Build", active: true, travelTeam: false, roomCategory: "Boys", roomCategoryLocked: true, shirtSize: "M", profileCompletedAt: 1, profileRevision: 0, emergencyName: "Emergency Person", emergencyRelationship: "Guardian", emergencyPhone: "555-0100", allergies: { state: "none" }, medications: { state: "none" } });
    await ctx.db.insert("familyLinks", { parentUserId: parent.id, studentId: student, active: true, createdBy: coach.id });
    await ctx.db.insert("syntheticConsentSubjects", { studentId: student, parentId: parent.id, enabled: true, createdBy: coach.id, createdAt: 1 });
    await ctx.db.insert("syntheticConsentSubjects", { studentId: student, enabled: true, createdBy: coach.id, createdAt: 1 });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Synthetic Event", type: "Team", startsAt: Date.now() + 86400000, endsAt: Date.now() + 90000000, destination: "School", travel: "Bus", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "assigned", allowWithdrawal: true, permissionRequired: true, firstRequired: false, archived: false });
    await ctx.db.insert("participants", { eventId: event, studentId: student, status: "confirmed", createdAt: 1, updatedAt: 1 });
    const version = await ctx.db.insert("permissionVersions", { ...wording, seasonId: season, createdBy: coach.id, createdAt: 1 });
    await ctx.db.patch(season, { activePermissionVersionId: version });
    return { coach, parent, season, student, event, version };
  });
  const coach = t.withIdentity({ subject: `${ids.coach.auth}|session` });
  await coach.mutation(api.permissions.setSigningPaused, { paused: false });
  return { t, ids, coach };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

/** Seeds one sealed synthetic format-1 submission, as earlier synthetic signing stored it. */
async function sign(f: Fixture) {
  return f.t.run(async ctx => {
    const student = (await ctx.db.get(f.ids.student))!, version = (await ctx.db.get(f.ids.version))!, parent = (await ctx.db.get(f.ids.parent.id))!;
    const eventIds = [f.ids.event];
    const expected = await expectedCoverage(ctx, student._id, eventIds);
    const priorCoverage = expected.map(item => ({ ...item, submissionId: null }));
    const signedAt = Date.now();
    const signer = { source: "electronic" as const, accountId: parent._id, name: parent.name, email: parent.email, recordedBy: parent._id };
    const none = { state: "none" as const, text: null };
    const snapshot: ConsentSnapshot = { format: 1, synthetic: true, version: publicVersion(version), student: { studentId: student._id, seasonId: student.seasonId, legalName: student.legalName, preferredName: student.preferredName, email: student.email, subteam: student.subteam, profileRevision: student.profileRevision ?? 0 }, events: await selectedEvents(ctx, student, eventIds), emergency: { name: student.emergencyName!, relationship: student.emergencyRelationship!, phone: student.emergencyPhone! }, health: { allergies: none, medications: none }, priorCoverage, signer, choices, typedName: signer.name, acknowledged: true, signedAt, recordedAt: Date.now(), paper: null };
    const hash = await snapshotHash(snapshot);
    const id: Id<"permissionSubmissions"> = await ctx.db.insert("permissionSubmissions", { studentId: student._id, seasonId: student.seasonId, signedBy: parent._id, typedName: signer.name, wordingVersion: version.version, eventIds: snapshot.events.map(event => event.eventId), answersJson: JSON.stringify({ choices, acknowledged: true }), signedAt, versionId: version._id, source: "electronic", synthetic: true, snapshotFormat: 1, snapshotJson: JSON.stringify(snapshot), snapshotHash: hash, recordedBy: parent._id, signerName: signer.name, signerEmail: signer.email ?? undefined });
    await setPendingCoverage(ctx, parent, student, id, version._id, expected, { snapshotHash: hash, source: "electronic" });
    return id;
  });
}

describe("November 17 state decisions", () => {
  it("lets staff move an accepted permission to needs-correction and back on the same submission", async () => {
    const f = await fixture();
    const submissionId = await sign(f);
    const decide = async (status: "accepted" | "correction") => {
      const receipt = await f.coach.query(api.permissions.receipt, { submissionId });
      await f.coach.mutation(api.permissions.review, { submissionId, status, expectedCoverage: receipt.summary.controlledCoverage, expectedLatestReviewId: receipt.summary.latestReviewId, idempotencyKey: crypto.randomUUID(), ...(status === "correction" ? { note: "Correct emergency phone", field: "emergencyPhone" as const } : {}) });
    };
    const isAccepted = () => f.t.run(ctx => permissionAccepted(ctx, f.ids.student, f.ids.event));
    await decide("accepted");
    expect(await isAccepted()).toBe(true);
    await decide("correction");
    expect(await isAccepted()).toBe(false);
    await decide("accepted");
    expect(await isAccepted()).toBe(true);
    const reviews = await f.t.run(ctx => ctx.db.query("permissionReviews").withIndex("by_submissionId", q => q.eq("submissionId", submissionId)).collect());
    expect(reviews.map(row => row.status)).toEqual(["accepted", "correction", "accepted"]);
  });
});
