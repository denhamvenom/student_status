/// <reference types="vite/client" />
import type { FunctionReturnType } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { parseSnapshot, publicVersion, selectedEvents, snapshotHash, type ConsentSnapshot } from "./lib/consentSnapshot";
import { api } from "./_generated/api";
import schema from "./schema";
import { coverageFor, expectedCoverage, sealedSnapshot, permissionAccepted, setPendingCoverage } from "./lib/permissionCoverage";
import type { Id } from "./_generated/dataModel";
const modules = import.meta.glob("./**/*.ts");
afterEach(() => vi.unstubAllEnvs());
const choices = {pain: "allow" as const, allergy: "contact" as const, cold: "deny" as const};
const wording = {version: "SYNTHETIC-DRAFT-1", title: "Synthetic permission", wording: "Denham Springs High School and FIRST Team 8044, Denham Venom: participation, travel and minor first aid. Synthetic unapproved wording only.", schoolName: "Denham Springs High School", teamName: "FIRST Team 8044, Denham Venom", medications: [{key: "pain" as const, label: "Pain Medication", productsText: "Unapproved synthetic products", exceptionsText: "Unapproved exceptions"}, {key: "allergy" as const, label: "Allergy Medication", productsText: "Unapproved synthetic products", exceptionsText: "Unapproved exceptions"}, {key: "cold" as const, label: "Cold Medication", productsText: "Unapproved synthetic products", exceptionsText: "Unapproved exceptions"}], administrationText: "Synthetic administration only; Coach approval pending.", acknowledgmentText: "I authorize the options selected for these listed events."};
async function fixture() {
  vi.stubEnv("CONVEX_CLOUD_URL", "https://third-bandicoot-18.convex.cloud");
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function user(name: string, role: "coach" | "parent" | "mentor" | "student", travelLead = false, healthExport = false) {
      const auth = await ctx.db.insert("users", {email: `${name.toLowerCase().replaceAll(" ", "-")}@example.invalid`, name, emailVerificationTime: 1});
      await ctx.db.insert("authAccounts", {userId: auth, provider: "google", providerAccountId: name, emailVerified: `${name.toLowerCase().replaceAll(" ", "-")}@example.invalid`});
      const id = await ctx.db.insert("appUsers", {authUserId: auth, name, email: `${name.toLowerCase().replaceAll(" ", "-")}@example.invalid`, role, active: true, travelLead, healthExport, financialEdit: false});
      return {id, auth};
    }
    const coach = await user("Coach", "coach"), parent = await user("Parent Example", "parent"), other = await user("Other Parent", "parent"), lead = await user("Lead", "mentor", true, true), ungranted = await user("Ungrant", "mentor", true), mentor = await user("Mentor", "mentor"), studentUser = await user("Student", "student");
    const season = await ctx.db.insert("seasons", {name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "Draft", createdBy: coach.id});
    const student = await ctx.db.insert("students", {seasonId: season, userId: studentUser.id, legalName: "Fictional Student", preferredName: "Fictional", email: "fictional@example.invalid", subteam: "Mechanical", active: true, travelTeam: false, roomCategory: "Boys", roomCategoryLocked: true, shirtSize: "M", profileCompletedAt: 1, profileRevision: 0, emergencyName: "Emergency Person", emergencyRelationship: "Guardian", emergencyPhone: "555-0100", allergies: {state: "none"}, medications: {state: "reported", text: "Synthetic prescription"}});
    const link = await ctx.db.insert("familyLinks", {parentUserId: parent.id, studentId: student, active: true, createdBy: coach.id});
    await ctx.db.insert("syntheticConsentSubjects", {studentId: student, parentId: parent.id, enabled: true, createdBy: coach.id, createdAt: 1});
    await ctx.db.insert("syntheticConsentSubjects", {studentId: student, enabled: true, createdBy: coach.id, createdAt: 1});
    const events = [];
    for (let i = 0; i < 3; i++) {
      const event = await ctx.db.insert("events", {seasonId: season, name: `Synthetic Event ${i}`, type: "Team", startsAt: Date.now() + 86400000, endsAt: Date.now() + 90000000, destination: "School", travel: "Bus", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "assigned", allowWithdrawal: true, permissionRequired: true, firstRequired: false, archived: false});
      await ctx.db.insert("participants", {eventId: event, studentId: student, status: "confirmed", createdAt: 1, updatedAt: 1}); events.push(event);
    }
    const version = await ctx.db.insert("permissionVersions", {...wording, seasonId: season, createdBy: coach.id, createdAt: 1});
    await ctx.db.patch(season, {activePermissionVersionId: version});
    return {coach, parent, other, lead, ungranted, mentor, studentUser, student, season, link, events, version};
  });
  const as = (auth: typeof ids.coach.auth) => t.withIdentity({subject: `${auth}|session`});
  const f = {t, ids, coach: as(ids.coach.auth), parent: as(ids.parent.auth), other: as(ids.other.auth), lead: as(ids.lead.auth), ungranted: as(ids.ungranted.auth), mentor: as(ids.mentor.auth), student: as(ids.studentUser.auth)};
  await f.coach.mutation(api.permissions.setSigningPaused, {paused:false});
  return f;
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Paper = {signerName: string; signerEmail?: string; reference: string; signedAt: number};
/** Seeds sealed format-1 evidence as earlier synthetic signing stored it; review, receipts and exports still read it. */
async function sign(f: Fixture, eventIds = f.ids.events.slice(0, 2), paper?: Paper) {
  const submissionId = await f.t.run(async ctx => {
    const student = (await ctx.db.get(f.ids.student))!; const version = (await ctx.db.get(f.ids.version))!;
    const parent = (await ctx.db.get(f.ids.parent.id))!; const coach = (await ctx.db.get(f.ids.coach.id))!;
    const recorder = paper ? coach : parent;
    const health = (report: typeof student.allergies) => report.state === "reported" ? {state: "reported" as const, text: report.text!} : {state: "none" as const, text: null};
    const expected = await expectedCoverage(ctx, student._id, eventIds);
    const priorCoverage = await Promise.all(expected.map(async item => ({...item, submissionId: (await coverageFor(ctx, student._id, item.eventId))?.latestSubmissionId ?? null})));
    const signedAt = paper?.signedAt ?? Date.now();
    const signer = paper ? {source: "paper" as const, accountId: null, name: paper.signerName, email: paper.signerEmail ?? null, recordedBy: coach._id} : {source: "electronic" as const, accountId: parent._id, name: parent.name, email: parent.email, recordedBy: parent._id};
    const snapshot: ConsentSnapshot = {format: 1, synthetic: true, version: publicVersion(version), student: {studentId: student._id, seasonId: student.seasonId, legalName: student.legalName, preferredName: student.preferredName, email: student.email, subteam: student.subteam, profileRevision: student.profileRevision ?? 0}, events: await selectedEvents(ctx, student, eventIds), emergency: {name: student.emergencyName!, relationship: student.emergencyRelationship!, phone: student.emergencyPhone!}, health: {allergies: health(student.allergies), medications: health(student.medications)}, priorCoverage, signer, choices, typedName: signer.name, acknowledged: true, signedAt, recordedAt: Date.now(), paper: paper ? {reference: paper.reference, signedAt: paper.signedAt, attested: true} : null};
    const hash = await snapshotHash(snapshot);
    const priorIds = [...new Set(priorCoverage.flatMap(row => row.submissionId ? [row.submissionId] : []))];
    const id: Id<"permissionSubmissions"> = await ctx.db.insert("permissionSubmissions", {studentId: student._id, seasonId: student.seasonId, signedBy: paper ? undefined : parent._id, typedName: signer.name, wordingVersion: version.version, eventIds: snapshot.events.map(event => event.eventId), answersJson: JSON.stringify({choices, acknowledged: true}), signedAt, versionId: version._id, source: signer.source, synthetic: true, snapshotFormat: 1, snapshotJson: JSON.stringify(snapshot), snapshotHash: hash, recordedBy: recorder._id, signerName: signer.name, signerEmail: signer.email ?? undefined, supersedesSubmissionId: priorIds.length === 1 ? priorIds[0] : undefined, paperReference: paper?.reference, paperSignedAt: paper?.signedAt, paperAttestation: paper ? true : undefined});
    await setPendingCoverage(ctx, recorder, student, id, version._id, expected, {snapshotHash: hash, source: signer.source});
    return id;
  });
  return {submissionId};
}
async function review(f: Fixture, submissionId: Id<"permissionSubmissions">, status: "accepted" | "correction" = "accepted") {
  const receipt = await f.coach.query(api.permissions.receipt, {submissionId});
  const args = {submissionId, status, expectedCoverage: receipt.summary.controlledCoverage, expectedLatestReviewId: receipt.summary.latestReviewId, idempotencyKey: crypto.randomUUID(), ...(status === "correction" ? {note: "Correct emergency phone", field: "emergencyPhone" as const} : {})};
  await f.coach.mutation(api.permissions.review, args); return args;
}
const accepted = (f: Fixture, eventId = f.ids.events[0]) => f.t.run(ctx => permissionAccepted(ctx, f.ids.student, eventId));

describe("synthetic versioned permission workflow", () => {
  it("defaults off, rejects unauthorized changes, and resumes signing when enabled", async () => {
    const f = await fixture();
    await f.coach.mutation(api.permissions.setSigningPaused, {paused:true});
    await expect(f.parent.mutation(api.permissions.setSigningPaused, {paused:false})).rejects.toThrow("Coach or Travel Lead");
    expect((await f.parent.query(api.permissions.workspace,{studentId:f.ids.student})).canSign).toBe(false);
    await expect(f.coach.mutation(api.permissions.requestNewSignature,{studentId:f.ids.student,eventIds:[f.ids.events[0]],expectedCoverage:[{eventId:f.ids.events[0],revision:0}],reason:"Fictional change"})).rejects.toThrow("signing is off");
    await f.lead.mutation(api.permissions.setSigningPaused,{paused:false});
    expect((await f.parent.query(api.permissions.workspace,{studentId:f.ids.student})).canSign).toBe(true);
  });
  it("keeps sealed electronic evidence immutable through review, retry and later changes", async () => {
    const f = await fixture(); const {submissionId} = await sign(f);
    expect(await accepted(f)).toBe(false);
    const before = await f.t.run(ctx => ctx.db.get(submissionId));
    expect(before).toMatchObject({source: "electronic", signedBy: f.ids.parent.id, recordedBy: f.ids.parent.id, snapshotFormat: 1, synthetic: true});
    const args = await review(f, submissionId); await f.coach.mutation(api.permissions.review, args);
    expect(await accepted(f)).toBe(true); expect(await accepted(f, f.ids.events[2])).toBe(false);
    await f.t.run(async ctx => {await ctx.db.patch(f.ids.student, {emergencyPhone: "555-0999", medications: {state: "none"}, profileRevision: 1}); await ctx.db.patch(f.ids.events[0], {destination: "Changed destination"})});
    const after = await f.t.run(ctx => ctx.db.get(submissionId)); expect(after?.snapshotJson).toBe(before?.snapshotJson);
    const receipt = await f.parent.query(api.permissions.receipt, {submissionId});
    expect(receipt.snapshot?.emergency.phone).toBe("555-0100"); expect(receipt.snapshot?.events.find(event => event.eventId === f.ids.events[0])?.destination).toBe("School");
    expect(receipt.snapshot?.choices).toEqual(choices);
    expect(await f.t.run(ctx => ctx.db.query("permissionReviews").withIndex("by_submissionId", q => q.eq("submissionId", submissionId)).collect())).toHaveLength(1);
  });

  it("uses current coverage so partial supersession and correction never fall back to old acceptance", async () => {
    const f = await fixture(); const a = await sign(f); await review(f, a.submissionId);
    const b = await sign(f, [f.ids.events[0]]); expect(await accepted(f)).toBe(false); expect(await accepted(f, f.ids.events[1])).toBe(true);
    await review(f, b.submissionId, "correction"); expect(await accepted(f)).toBe(false);
    const aReceipt = await f.coach.query(api.permissions.receipt, {submissionId: a.submissionId}); expect(aReceipt.summary.controlledCoverage.map(row => row.eventId)).toEqual([f.ids.events[1]]);
    const c = await sign(f, [f.ids.events[0]]); await review(f, c.submissionId); expect(await accepted(f)).toBe(true);
  });

  it("requires a fresh signature after an explicit request and rejects stale or hidden review scope", async () => {
    const f = await fixture(); const a = await sign(f, [f.ids.events[0]]); await review(f, a.submissionId);
    const view = await f.coach.query(api.permissions.workspace, {studentId: f.ids.student}); const row = view.coverage.find(row => row.eventId === f.ids.events[0])!;
    await f.coach.mutation(api.permissions.requestNewSignature, {studentId: f.ids.student, eventIds: [f.ids.events[0]], expectedCoverage: [{eventId: row.eventId, revision: row.revision}], reason: "New wording needed"});
    expect(await accepted(f)).toBe(false);
    await expect(review(f, a.submissionId)).rejects.toThrow("no longer covers an event that can be reviewed");
    const b = await sign(f, [f.ids.events[0]]); await review(f, b.submissionId); expect(await accepted(f)).toBe(true);
    const c = await sign(f); const receipt = await f.coach.query(api.permissions.receipt, {submissionId: c.submissionId});
    await expect(f.coach.mutation(api.permissions.review, {submissionId: c.submissionId, status: "accepted", expectedLatestReviewId: null, expectedCoverage: receipt.summary.controlledCoverage.slice(0, 1), idempotencyKey: "hidden-scope"})).rejects.toThrow("full current permission scope");
  });

  it("offers signing only to registered subjects on development and refuses ordinary Mentors", async () => {
    const f = await fixture(); const view = () => f.parent.query(api.permissions.workspace, {studentId: f.ids.student});
    await expect(f.mentor.query(api.permissions.workspace, {studentId: f.ids.student})).rejects.toThrow("open to Parents, Coaches and Travel Leads");
    expect((await view()).canSign).toBe(true);
    vi.stubEnv("CONVEX_CLOUD_URL", "https://production.example.invalid"); expect(await view()).toMatchObject({canSign: false, gateReason: expect.stringContaining("fictional")});
    vi.stubEnv("CONVEX_CLOUD_URL", "https://third-bandicoot-18.convex.cloud");
    await f.t.run(async ctx => {const rows = await ctx.db.query("syntheticConsentSubjects").withIndex("by_studentId_and_parentId", q => q.eq("studentId", f.ids.student)).collect(); for (const row of rows) await ctx.db.delete(row._id)});
    expect(await view()).toMatchObject({canSign: false, canRecordPaper: false});
    expect((await f.coach.query(api.permissions.workspace, {studentId: f.ids.student})).canRecordPaper).toBe(false);
  });

  it("reviews paper evidence and restricts health exports", async () => {
    const f = await fixture();
    const {submissionId} = await sign(f, [f.ids.events[0]], {signerName: "Paper Guardian", reference: "TEST-PAPER-1", signedAt: Date.now() - 1000});
    await review(f, submissionId);
    const manifest = await f.ungranted.mutation(api.permissions.exportPacket, {eventId: f.ids.events[0], includeHealth: false});
    expect(manifest.records[0]).not.toHaveProperty("snapshot"); expect(JSON.stringify(manifest)).not.toContain("Synthetic prescription");
    await expect(f.ungranted.mutation(api.permissions.exportPacket, {eventId: f.ids.events[0], includeHealth: true})).rejects.toThrow("Health export access");
    const packet = await f.lead.mutation(api.permissions.exportPacket, {eventId: f.ids.events[0], includeHealth: true}); expect(packet.records[0].snapshot?.signer.name).toBe("Paper Guardian");
    await f.t.run(ctx => ctx.db.patch(f.ids.lead.id, {healthExport: false}));
    await expect(f.lead.mutation(api.permissions.exportPacket, {eventId: f.ids.events[0], includeHealth: true})).rejects.toThrow("Health export access");
    await expect(f.mentor.mutation(api.permissions.exportPacket, {eventId: f.ids.events[0], includeHealth: false})).rejects.toThrow("Coach or Travel Lead");
  });

  it("binds accepted coverage to the receipt and invalidates stale provenance markers", async () => {
    const f = await fixture(); const signed = await sign(f, [f.ids.events[0]]); await review(f, signed.submissionId);
    const inspected = await f.t.run(async ctx => {
      const reads: string[] = [];
      const db = new Proxy(ctx.db, {get(target, key, receiver) {
        if (key !== "get") return Reflect.get(target, key, receiver);
        return (...args: unknown[]) => {reads.push(String(args[0])); return Reflect.apply(target.get, target, args)};
      }});
      return {accepted: await permissionAccepted({...ctx, db}, f.ids.student, f.ids.events[0]), reads};
    });
    expect(inspected.accepted).toBe(true); expect(inspected.reads).toContain(signed.submissionId); expect(inspected.reads).toHaveLength(2);
    const row = await f.t.run(ctx => ctx.db.query("permissionCoverage").withIndex("by_studentId_and_eventId", q => q.eq("studentId", f.ids.student).eq("eventId", f.ids.events[0])).unique());
    await f.t.run(ctx => ctx.db.patch(row!._id, {sealedSnapshotHash: "b".repeat(64)}));
    expect(await accepted(f)).toBe(false);
    await f.t.run(ctx => ctx.db.patch(row!._id, {sealedSnapshotFormat: undefined}));
    expect(await accepted(f)).toBe(false);
    const original = await f.t.run(ctx => ctx.db.get(signed.submissionId));
    await f.t.run(ctx => ctx.db.patch(row!._id, {sealedSnapshotFormat: 1, sealedSnapshotHash: original!.snapshotHash, synthetic: false}));
    expect(await accepted(f)).toBe(false);
  });

  it("rejects duplicate prior-event evidence and contradictory paper signer provenance", async () => {
    const f = await fixture(); const signed = await sign(f);
    await f.t.run(async ctx => {
      const doc = await ctx.db.get(signed.submissionId); const snapshot = parseSnapshot(ctx, doc!.snapshotJson!);
      snapshot.priorCoverage[1] = {...snapshot.priorCoverage[0]};
      expect(() => parseSnapshot(ctx, JSON.stringify(snapshot))).toThrow("listed twice");
    });
    const paper = {signerName: "Paper Guardian", signerEmail: "guardian@example.invalid", reference: "PAPER-SEAL", signedAt: Date.now() - 1000};
    const {submissionId: id} = await sign(f, [f.ids.events[2]], paper);
    await f.t.run(async ctx => {
      const doc = await ctx.db.get(id); const snapshot = parseSnapshot(ctx, doc!.snapshotJson!);
      snapshot.signer.email = "changed@example.invalid";
      await ctx.db.patch(id, {snapshotJson: JSON.stringify(snapshot), snapshotHash: await snapshotHash(snapshot)});
      await expect(sealedSnapshot(ctx, (await ctx.db.get(id))!)).rejects.toThrow("provenance");
      snapshot.signer.email = paper.signerEmail; snapshot.paper!.signedAt -= 100;
      await ctx.db.patch(id, {snapshotJson: JSON.stringify(snapshot), snapshotHash: await snapshotHash(snapshot), paperSignedAt: snapshot.paper!.signedAt});
      await expect(sealedSnapshot(ctx, (await ctx.db.get(id))!)).rejects.toThrow("provenance");
    });
  });

  // Includes 500-record fixture construction and paginated work under parallel-suite load.
  it("paginates a 500-member health export and rechecks revoked grants between pages", async () => {
    const f = await fixture(); const original = await sign(f, [f.ids.events[0]]); await review(f, original.submissionId);
    await f.t.run(async ctx => {
      const templateStudent = await ctx.db.get(f.ids.student); const originalDoc = await ctx.db.get(original.submissionId);
      const base = parseSnapshot(ctx, originalDoc!.snapshotJson!);
      for (let index = 0; index < 499; index++) {
        const { _id: _studentId, _creationTime: _created, userId: _userId, ...studentFields } = templateStudent!;
        const studentId = await ctx.db.insert("students", {...studentFields, legalName: `Export Student ${index}`, preferredName: `Export ${index}`, email: `export-${index}@example.invalid`});
        await ctx.db.insert("participants", {eventId: f.ids.events[0], studentId, status: "confirmed", createdAt: index + 2, updatedAt: index + 2});
        const snapshot = {...base, student: {...base.student, studentId, legalName: `Export Student ${index}`, preferredName: `Export ${index}`, email: `export-${index}@example.invalid`}};
        const hash = await snapshotHash(snapshot);
        const {_id: _submissionId, _creationTime: _submissionCreated, draftId: _draft, ...fields} = originalDoc!;
        const submissionId = await ctx.db.insert("permissionSubmissions", {...fields, studentId, snapshotJson: JSON.stringify(snapshot), snapshotHash: hash});
        await ctx.db.insert("permissionCoverage", {seasonId: f.ids.season, studentId, eventId: f.ids.events[0], state: "pending", revision: 1, updatedAt: 1, updatedBy: f.ids.coach.id, latestSubmissionId: submissionId, versionId: originalDoc!.versionId, sealedSnapshotFormat: 1, sealedSnapshotHash: hash, synthetic: true, source: "electronic"});
      }
    });
    let cursor: string | null = null; let count = 0; let pages = 0;
    const seen = new Set<string>();
    while (true) {
      const packet: FunctionReturnType<typeof api.permissions.exportPacket> = await f.lead.mutation(api.permissions.exportPacket, {eventId: f.ids.events[0], includeHealth: true, paginationOpts: {cursor, numItems: 10}});
      expect(packet.records.length).toBeLessThanOrEqual(10); expect(packet.schemaVersion).toBe(1);
      for (const row of packet.records) {expect(seen.has(row.studentId)).toBe(false); seen.add(row.studentId); expect(row.snapshot).toBeDefined(); expect(row.collectedAt).toBe(packet.generatedAt)}
      count += packet.records.length; pages++;
      if (packet.isDone) break;
      cursor = packet.continueCursor; if (pages > 60) throw new Error("Export pagination did not finish.");
    }
    expect(count).toBe(500); expect(pages).toBe(50);
    const first = await f.lead.mutation(api.permissions.exportPacket, {eventId: f.ids.events[0], includeHealth: true, paginationOpts: {cursor: null, numItems: 10}});
    await f.t.run(ctx => ctx.db.patch(f.ids.lead.id, {healthExport: false}));
    await expect(f.lead.mutation(api.permissions.exportPacket, {eventId: f.ids.events[0], includeHealth: true, paginationOpts: {cursor: first.continueCursor, numItems: 10}})).rejects.toThrow("Health export access");
    await expect(f.coach.mutation(api.permissions.exportPacket, {eventId: f.ids.events[0], includeHealth: true, paginationOpts: {cursor: null, numItems: 11}})).rejects.toThrow("at most 10");
  }, 15_000);

  it("never infers coverage from legacy answers JSON and refuses legacy review promotion", async () => {
    const f = await fixture();
    const submissionId = await f.t.run(async ctx => {const id = await ctx.db.insert("permissionSubmissions", {studentId: f.ids.student, seasonId: f.ids.season, signedBy: f.ids.parent.id, typedName: "Parent Example", wordingVersion: "Approved looking legacy", eventIds: [f.ids.events[0]], answersJson: "{}", signedAt: Date.now()}); await ctx.db.insert("permissionReviews", {submissionId: id, status: "accepted", reviewedBy: f.ids.coach.id, reviewedAt: Date.now()}); return id});
    expect(await accepted(f)).toBe(false);
    expect((await f.parent.query(api.permissions.receipt, {submissionId})).snapshot).toBeNull();
    await expect(review(f, submissionId)).rejects.toThrow("Legacy or incomplete");
  });
});
