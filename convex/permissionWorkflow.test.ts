/// <reference types="vite/client" />
import type { FunctionReturnType } from "convex/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import { parseSnapshot, snapshotHash } from "./lib/consentSnapshot";
import { api } from "./_generated/api";
import schema from "./schema";
import { sealedSnapshot, permissionAccepted } from "./lib/permissionCoverage";
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
    return {coach, parent, other, lead, ungranted, mentor, studentUser, student, season, link, events};
  });
  const as = (auth: typeof ids.coach.auth) => t.withIdentity({subject: `${auth}|session`});
  const f = {t, ids, coach: as(ids.coach.auth), parent: as(ids.parent.auth), other: as(ids.other.auth), lead: as(ids.lead.auth), ungranted: as(ids.ungranted.auth), mentor: as(ids.mentor.auth), student: as(ids.studentUser.auth)};
  await f.coach.mutation(api.permissionVersions.createVersion, wording);
  return f;
}
async function sign(f: Awaited<ReturnType<typeof fixture>>, eventIds = f.ids.events.slice(0, 2)) {
  const draft = await f.parent.mutation(api.permissions.prepare, {studentId: f.ids.student, eventIds});
  const submissionId = await f.parent.mutation(api.permissions.submitDraft, {draftId: draft.draftId, typedName: "Parent Example", acknowledged: true, choices});
  return {draft, submissionId};
}
async function review(f: Awaited<ReturnType<typeof fixture>>, submissionId: (Awaited<ReturnType<typeof sign>>)["submissionId"], status: "accepted" | "correction" = "accepted") {
  const receipt = await f.coach.query(api.permissions.receipt, {submissionId});
  const args = {submissionId, status, expectedCoverage: receipt.summary.controlledCoverage, expectedLatestReviewId: receipt.summary.latestReviewId, idempotencyKey: crypto.randomUUID(), ...(status === "correction" ? {note: "Correct emergency phone", field: "emergencyPhone" as const} : {})};
  await f.coach.mutation(api.permissions.review, args); return args;
}
const accepted = (f: Awaited<ReturnType<typeof fixture>>, eventId = f.ids.events[0]) => f.t.run(ctx => permissionAccepted(ctx, f.ids.student, eventId));

describe("synthetic versioned permission workflow", () => {
  it("captures immutable full electronic evidence, explicit choices, review and retry", async () => {
    const f = await fixture(); const {draft, submissionId} = await sign(f);
    expect(draft.snapshot.choices).toBeNull(); expect(draft.snapshot.acknowledged).toBe(false);
    expect(await accepted(f)).toBe(false);
    const before = await f.t.run(ctx => ctx.db.get(submissionId));
    expect(before).toMatchObject({source: "electronic", signedBy: f.ids.parent.id, recordedBy: f.ids.parent.id, snapshotFormat: 1, synthetic: true});
    await expect(f.parent.mutation(api.permissions.submitDraft, {draftId: draft.draftId, typedName: "Parent Example", acknowledged: true, choices})).resolves.toBe(submissionId);
    await expect(f.parent.mutation(api.permissions.submitDraft, {draftId: draft.draftId, typedName: "Parent Example", acknowledged: true, choices: {...choices, pain: "deny"}})).rejects.toThrow("different answers");
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
    const bDoc = await f.t.run(ctx => ctx.db.get(b.submissionId)); expect(bDoc?.supersedesSubmissionId).toBe(a.submissionId);
    const c = await sign(f, [f.ids.events[0]]); await review(f, c.submissionId); expect(await accepted(f)).toBe(true);
  });

  it("requires a fresh signature after an explicit request and rejects stale or hidden review scope", async () => {
    const f = await fixture(); const a = await sign(f, [f.ids.events[0]]); await review(f, a.submissionId);
    const view = await f.coach.query(api.permissions.workspace, {studentId: f.ids.student}); const row = view.coverage.find(row => row.eventId === f.ids.events[0])!;
    await f.coach.mutation(api.permissions.requestNewSignature, {studentId: f.ids.student, eventIds: [f.ids.events[0]], expectedCoverage: [{eventId: row.eventId, revision: row.revision}], reason: "New wording needed"});
    expect(await accepted(f)).toBe(false);
    await expect(review(f, a.submissionId)).rejects.toThrow("no longer controls");
    const b = await sign(f, [f.ids.events[0]]); await review(f, b.submissionId); expect(await accepted(f)).toBe(true);
    const c = await sign(f); const receipt = await f.coach.query(api.permissions.receipt, {submissionId: c.submissionId});
    await expect(f.coach.mutation(api.permissions.review, {submissionId: c.submissionId, status: "accepted", expectedLatestReviewId: null, expectedCoverage: receipt.summary.controlledCoverage.slice(0, 1), idempotencyKey: "hidden-scope"})).rejects.toThrow("full current permission scope");
  });

  it("rejects stale profile, event, version, expired draft and wrong signer", async () => {
    const f = await fixture(); const args = {studentId: f.ids.student, eventIds: [f.ids.events[0]]};
    let draft = await f.parent.mutation(api.permissions.prepare, args);
    await expect(f.other.mutation(api.permissions.submitDraft, {draftId: draft.draftId, typedName: "Other Parent", acknowledged: true, choices})).rejects.toThrow("this account");
    await expect(f.parent.mutation(api.permissions.submitDraft, {draftId: draft.draftId, typedName: "Not Parent Example", acknowledged: true, choices})).rejects.toThrow("exactly");
    await f.t.run(ctx => ctx.db.patch(f.ids.student, {profileRevision: 1, emergencyPhone: "555-0111"}));
    await expect(f.parent.mutation(api.permissions.submitDraft, {draftId: draft.draftId, typedName: "Parent Example", acknowledged: true, choices})).rejects.toThrow("changed");
    draft = await f.parent.mutation(api.permissions.prepare, args);
    await f.t.run(ctx => ctx.db.patch(f.ids.events[0], {name: "New event name"}));
    await expect(f.parent.mutation(api.permissions.submitDraft, {draftId: draft.draftId, typedName: "Parent Example", acknowledged: true, choices})).rejects.toThrow("changed");
    draft = await f.parent.mutation(api.permissions.prepare, args);
    await f.coach.mutation(api.permissionVersions.createVersion, {...wording, version: "SYNTHETIC-DRAFT-2"});
    await expect(f.parent.mutation(api.permissions.submitDraft, {draftId: draft.draftId, typedName: "Parent Example", acknowledged: true, choices})).rejects.toThrow("changed");
    draft = await f.parent.mutation(api.permissions.prepare, args); await f.t.run(ctx => ctx.db.patch(draft.draftId, {expiresAt: 0}));
    await expect(f.parent.mutation(api.permissions.submitDraft, {draftId: draft.draftId, typedName: "Parent Example", acknowledged: true, choices})).rejects.toThrow("expired");
  });

  it("blocks unregistered subjects, wrong deployments, revoked links and ordinary Mentor access", async () => {
    const f = await fixture(); const args = {studentId: f.ids.student, eventIds: [f.ids.events[0]]};
    await expect(f.mentor.query(api.permissions.workspace, {studentId: f.ids.student})).rejects.toThrow("Form access");
    vi.stubEnv("CONVEX_CLOUD_URL", "https://production.example.invalid"); await expect(f.parent.mutation(api.permissions.prepare, args)).rejects.toThrow("Real permission signing");
    vi.stubEnv("CONVEX_CLOUD_URL", "https://third-bandicoot-18.convex.cloud");
    const draft = await f.parent.mutation(api.permissions.prepare, args); await f.t.run(ctx => ctx.db.patch(f.ids.link, {active: false}));
    await expect(f.parent.mutation(api.permissions.submitDraft, {draftId: draft.draftId, typedName: "Parent Example", acknowledged: true, choices})).rejects.toThrow("permission");
    await f.t.run(async ctx => {await ctx.db.patch(f.ids.link, {active: true}); const rows = await ctx.db.query("syntheticConsentSubjects").withIndex("by_studentId_and_parentId", q => q.eq("studentId", f.ids.student)).collect(); for (const row of rows) await ctx.db.delete(row._id)});
    await expect(f.parent.mutation(api.permissions.prepare, args)).rejects.toThrow("internally registered");
    await expect(f.coach.mutation(api.permissions.preparePaper, {...args, signerName: "Paper Guardian", paperReference: "TEST-1", paperSignedAt: Date.now() - 1000})).rejects.toThrow("internally registered");
  });

  it("records paper signer separately from recorder, rejects mismatched retries and restricts health exports", async () => {
    const f = await fixture(); const paper = {studentId: f.ids.student, eventIds: [f.ids.events[0]], signerName: "Paper Guardian", paperReference: "TEST-PAPER-1", paperSignedAt: Date.now() - 1000};
    const prepared = await f.coach.mutation(api.permissions.preparePaper, paper);
    const args = {...paper, versionId: prepared.versionId, expectedProfileRevision: prepared.expectedProfileRevision, eventFingerprint: prepared.eventFingerprint, expectedCoverage: prepared.expectedCoverage, choices, paperAttested: true, idempotencyKey: "paper-one"};
    const submissionId = await f.coach.mutation(api.permissions.recordPaper, args);
    expect(await f.coach.mutation(api.permissions.recordPaper, args)).toBe(submissionId);
    await expect(f.coach.mutation(api.permissions.recordPaper, {...args, paperReference: "OTHER"})).rejects.toThrow("different paper");
    const doc = await f.t.run(ctx => ctx.db.get(submissionId)); expect(doc?.signedBy).toBeUndefined(); expect(doc).toMatchObject({source: "paper", signerName: "Paper Guardian", recordedBy: f.ids.coach.id, paperAttestation: true});
    await review(f, submissionId);
    const manifest = await f.ungranted.mutation(api.permissions.exportPacket, {eventId: f.ids.events[0], includeHealth: false});
    expect(manifest.records[0]).not.toHaveProperty("snapshot"); expect(JSON.stringify(manifest)).not.toContain("Synthetic prescription");
    await expect(f.ungranted.mutation(api.permissions.exportPacket, {eventId: f.ids.events[0], includeHealth: true})).rejects.toThrow("health-export");
    const packet = await f.lead.mutation(api.permissions.exportPacket, {eventId: f.ids.events[0], includeHealth: true}); expect(packet.records[0].snapshot?.signer.name).toBe("Paper Guardian");
    await f.t.run(ctx => ctx.db.patch(f.ids.lead.id, {healthExport: false}));
    await expect(f.lead.mutation(api.permissions.exportPacket, {eventId: f.ids.events[0], includeHealth: true})).rejects.toThrow("health-export");
    await expect(f.mentor.mutation(api.permissions.exportPacket, {eventId: f.ids.events[0], includeHealth: false})).rejects.toThrow("Coach or Travel Lead");
  });

  it("uses compact accepted evidence without loading full receipt JSON and invalidates stale hash markers", async () => {
    const f = await fixture(); const signed = await sign(f, [f.ids.events[0]]); await review(f, signed.submissionId);
    const inspected = await f.t.run(async ctx => {
      const reads: string[] = [];
      const db = new Proxy(ctx.db, {get(target, key, receiver) {
        if (key !== "get") return Reflect.get(target, key, receiver);
        return (...args: unknown[]) => {reads.push(String(args[0])); return Reflect.apply(target.get, target, args)};
      }});
      return {accepted: await permissionAccepted({...ctx, db}, f.ids.student, f.ids.events[0]), reads};
    });
    expect(inspected.accepted).toBe(true); expect(inspected.reads).not.toContain(signed.submissionId); expect(inspected.reads).toHaveLength(1);
    const row = await f.t.run(ctx => ctx.db.query("permissionCoverage").withIndex("by_studentId_and_eventId", q => q.eq("studentId", f.ids.student).eq("eventId", f.ids.events[0])).unique());
    await f.t.run(ctx => ctx.db.patch(row!._id, {sealedSnapshotHash: "b".repeat(64)}));
    expect(await accepted(f)).toBe(false);
    await f.t.run(ctx => ctx.db.patch(row!._id, {sealedSnapshotFormat: undefined}));
    expect(await accepted(f)).toBe(false);
  });

  it("rejects duplicate prior-event evidence and contradictory paper signer provenance", async () => {
    const f = await fixture(); const signed = await sign(f);
    await f.t.run(async ctx => {
      const doc = await ctx.db.get(signed.submissionId); const snapshot = parseSnapshot(ctx, doc!.snapshotJson!);
      snapshot.priorCoverage[1] = {...snapshot.priorCoverage[0]};
      expect(() => parseSnapshot(ctx, JSON.stringify(snapshot))).toThrow("Duplicate prior coverage");
    });
    const paper = {studentId: f.ids.student, eventIds: [f.ids.events[2]], signerName: "Paper Guardian", signerEmail: "guardian@example.invalid", paperReference: "PAPER-SEAL", paperSignedAt: Date.now() - 1000};
    const prepared = await f.coach.mutation(api.permissions.preparePaper, paper);
    const id = await f.coach.mutation(api.permissions.recordPaper, {...paper, versionId: prepared.versionId, expectedProfileRevision: prepared.expectedProfileRevision, eventFingerprint: prepared.eventFingerprint, expectedCoverage: prepared.expectedCoverage, choices, paperAttested: true, idempotencyKey: "paper-seal"});
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

  it("rejects oversized serialized evidence before any draft or submission is written", async () => {
    const f = await fixture();
    await f.coach.mutation(api.permissionVersions.createVersion, {...wording, version: "LARGE-DRAFT", wording: `minor first aid ${"😀".repeat(9000)}`, administrationText: "😀".repeat(2400), acknowledgmentText: "😀".repeat(900), medications: wording.medications.map(item => ({...item, productsText: "😀".repeat(900), exceptionsText: "😀".repeat(900)}))});
    await f.t.run(ctx => ctx.db.patch(f.ids.student, {allergies: {state: "reported", text: "😀".repeat(1900)}, medications: {state: "reported", text: "😀".repeat(1900)}}));
    await f.t.run(async ctx => {for (const eventId of f.ids.events) await ctx.db.patch(eventId, {destination: "😀".repeat(9000)})});
    let error: unknown;
    try {await f.parent.mutation(api.permissions.prepare, {studentId: f.ids.student, eventIds: f.ids.events})} catch (cause) {error = cause}
    expect(error).toBeInstanceOf(Error); expect((error as Error).message).toContain("too large");
    expect(await f.t.run(ctx => ctx.db.query("permissionDrafts").withIndex("by_studentId_and_parentId", q => q.eq("studentId", f.ids.student).eq("parentId", f.ids.parent.id)).collect())).toHaveLength(0);
  });

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
    await expect(f.lead.mutation(api.permissions.exportPacket, {eventId: f.ids.events[0], includeHealth: true, paginationOpts: {cursor: first.continueCursor, numItems: 10}})).rejects.toThrow("health-export");
    await expect(f.coach.mutation(api.permissions.exportPacket, {eventId: f.ids.events[0], includeHealth: true, paginationOpts: {cursor: null, numItems: 11}})).rejects.toThrow("at most 10");
  });

  it("never infers coverage from legacy answers JSON and refuses legacy review promotion", async () => {
    const f = await fixture();
    const submissionId = await f.t.run(async ctx => {const id = await ctx.db.insert("permissionSubmissions", {studentId: f.ids.student, seasonId: f.ids.season, signedBy: f.ids.parent.id, typedName: "Parent Example", wordingVersion: "Approved looking legacy", eventIds: [f.ids.events[0]], answersJson: "{}", signedAt: Date.now()}); await ctx.db.insert("permissionReviews", {submissionId: id, status: "accepted", reviewedBy: f.ids.coach.id, reviewedAt: Date.now()}); return id});
    expect(await accepted(f)).toBe(false);
    expect((await f.parent.query(api.permissions.receipt, {submissionId})).snapshot).toBeNull();
    await expect(review(f, submissionId)).rejects.toThrow("Legacy or incomplete");
  });
});
