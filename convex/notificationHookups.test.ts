/// <reference types="vite/client" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { createFinancialAccount } from "./lib/financialSources";

const modules = import.meta.glob("./**/*.ts");
// Wed 2026-01-14 16:00 Chicago: outside quiet hours.
const NOW = Date.parse("2026-01-14T22:00:00Z");
const DAY = 86_400_000;
const prepareBulk = makeFunctionReference<"mutation">("feeDefinitions:prepareBulk");
const commitBulk = makeFunctionReference<"mutation">("feeDefinitions:commitBulk");
const processBulk = makeFunctionReference<"mutation">("feeBulkWorker:processPage");

/** Students s0..s2 with accounts; Parent A is linked to s0 and s1, Parent B to s2. Staff: a Coach, a Travel Lead and a plain Mentor. */
async function fixture() {
  const t = createTest(schema, modules); rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const person = async (name: string, role: "coach" | "mentor" | "parent" | "student", travelLead = false) => {
      const auth = await ctx.db.insert("users", { email: `${name}@synthetic.test`, name, emailVerificationTime: 1 });
      const app = await ctx.db.insert("appUsers", { authUserId: auth, email: `${name}@synthetic.test`, name, role, travelLead, financialEdit: role === "coach", active: true });
      return { auth, app };
    };
    const coach = await person("coach", "coach");
    const lead = await person("lead", "mentor", true);
    const mentor = await person("mentor", "mentor");
    const parentA = await person("parenta", "parent");
    const parentB = await person("parentb", "parent");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.app });
    const control = await ctx.db.insert("seasonFinanceControls", { seasonId: season, revision: 0, state: "ready", mappingInitialized: true, orderReady: true, unmappedCount: 0, updatedAt: 0 });
    const studentUsers = [];
    const students: Id<"students">[] = [];
    for (let i = 0; i < 3; i++) {
      const user = await person(`student${i}`, "student");
      studentUsers.push(user);
      const id = await ctx.db.insert("students", { seasonId: season, userId: user.app, legalName: `Student ${i}`, preferredName: `Student ${i}`, email: `student${i}@synthetic.test`, subteam: "Other", active: true, travelTeam: true, roomCategory: "Boys", roomCategoryLocked: true, allergies: { state: "none" }, medications: { state: "none" } });
      await createFinancialAccount(ctx, id, "ready");
      students.push(id);
    }
    for (const [parent, studentId] of [[parentA, students[0]], [parentA, students[1]], [parentB, students[2]]] as const) {
      await ctx.db.insert("familyLinks", { parentUserId: parent.app, studentId, seasonId: season, active: true, createdBy: coach.app });
    }
    return { coach, lead, mentor, parentA, parentB, season, control, studentUsers, students };
  });
  const as = (auth: Id<"users">) => t.withIdentity({ subject: `${auth}|session` });
  const addEvent = (fields: Partial<{ signupMode: "assigned" | "open" | "approval"; assignmentScope: "wholeTeam"; wholeTeamParticipantCount: number }> = {}) => t.run(ctx => ctx.db.insert("events", {
    seasonId: ids.season, name: "Synthetic Regional", type: "Competition", startsAt: NOW + 30 * DAY, endsAt: NOW + 31 * DAY, destination: "Test City", travel: "Bus", overnight: false, roomingEnabled: false,
    feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, ...fields,
  }));
  const name = (userId: Id<"appUsers">) => {
    for (const key of ["coach", "lead", "mentor", "parentA", "parentB"] as const) if (ids[key].app === userId) return key;
    return `s${ids.studentUsers.findIndex(user => user.app === userId)}`;
  };
  /** Recipient names of instant notifications, sorted; a repeated name means a person got two rows. */
  const instant = async () => (await t.run(ctx => ctx.db.query("notifications").take(200))).filter(row => row.pushStatus !== "digest").map(row => name(row.userId)).sort();
  /** "recipient:kind" for each queued digest item, sorted. */
  const digests = async () => (await t.run(ctx => ctx.db.query("notificationDigestItems").take(200))).map(row => `${name(row.userId)}:${row.kind}`).sort();
  return { t, ids, as, addEvent, instant, digests, coach: as(ids.coach.auth) };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); });

describe("notification hook-ups", () => {
  it("a signup waiting for approval queues one staff digest item for Coaches and Travel Leads; an open signup queues none", async () => {
    const f = await fixture();
    const approval = await f.addEvent({ signupMode: "approval" });
    const open = await f.addEvent({ signupMode: "open" });
    expect(await f.as(f.ids.studentUsers[0].auth).mutation(api.participation.signUp, { eventId: approval })).toBe("pending");
    // Repeating the signup returns the existing status and queues nothing more.
    expect(await f.as(f.ids.studentUsers[0].auth).mutation(api.participation.signUp, { eventId: approval })).toBe("pending");
    expect(await f.as(f.ids.studentUsers[1].auth).mutation(api.participation.signUp, { eventId: open })).toBe("confirmed");
    expect(await f.digests()).toEqual(["coach:signupPending", "lead:signupPending"]);
    const rows = await f.t.run(ctx => ctx.db.query("notificationDigestItems").take(10));
    expect(rows.every(row => row.url === `/events/${approval}`)).toBe(true);
  });

  it("a student newly signed up by staff is notified with their Parents once; pending, waitlist and repeat changes notify no one", async () => {
    const f = await fixture();
    const eventId = await f.addEvent({ signupMode: "approval" });
    await f.coach.mutation(api.participation.setParticipation, { eventId, studentId: f.ids.students[2], status: "pending" });
    expect(await f.instant()).toEqual([]);
    await f.coach.mutation(api.participation.setParticipation, { eventId, studentId: f.ids.students[0], status: "confirmed" });
    await f.coach.mutation(api.participation.setParticipation, { eventId, studentId: f.ids.students[0], status: "confirmed" });
    expect(await f.instant()).toEqual(["parentA", "s0"]);
    const rows = await f.t.run(ctx => ctx.db.query("notifications").take(10));
    expect(rows.every(row => row.category === "events" && row.url === `/events/${eventId}`)).toBe(true);
    // Parent A's second student on the same event: the per-event dedupe keeps Parent A at one notice.
    await f.coach.mutation(api.participation.setParticipation, { eventId, studentId: f.ids.students[1], status: "confirmed" });
    expect(await f.instant()).toEqual(["parentA", "s0", "s1"]);
  });

  it("reactivating a student notifies them for Whole Team events they were newly added to, not ones they were already on", async () => {
    const f = await fixture();
    const added = await f.addEvent({ signupMode: "assigned", assignmentScope: "wholeTeam", wholeTeamParticipantCount: 0 });
    const already = await f.addEvent({ signupMode: "assigned", assignmentScope: "wholeTeam", wholeTeamParticipantCount: 1 });
    await f.t.run(async ctx => {
      await ctx.db.insert("participants", { eventId: already, studentId: f.ids.students[2], status: "confirmed", createdAt: NOW, updatedAt: NOW });
      await ctx.db.patch(f.ids.students[2], { active: false });
    });
    await f.coach.mutation(api.admin.updateRoster, { studentId: f.ids.students[2], active: true, expectedRevision: 0, reason: "Synthetic student returned" });
    expect(await f.instant()).toEqual([]);
    vi.runOnlyPendingTimers();
    await f.t.finishInProgressScheduledFunctions();
    const rows = await f.t.run(ctx => ctx.db.query("notifications").take(10));
    expect(rows.map(row => row.url)).toEqual([`/events/${added}`, `/events/${added}`]);
    expect(await f.instant()).toEqual(["parentB", "s2"]);
  });

  it("a join request queues a staff digest when created and when a declined request is sent again", async () => {
    const f = await fixture();
    const applicant = await f.t.run(ctx => ctx.db.insert("users", { email: "applicant@synthetic.test", name: "Applicant", emailVerificationTime: 1 }));
    const code = await f.coach.mutation(api.admin.createJoinCode, { duration: "24h" });
    const login = f.as(applicant);
    const requestId = await login.mutation(api.app.requestJoin, { code: code.code, firstName: "Synthetic", lastName: "Applicant" });
    expect(requestId).not.toBeNull();
    // Still pending: asking again returns the same request without another digest item.
    expect(await login.mutation(api.app.requestJoin, { code: code.code, firstName: "Synthetic", lastName: "Applicant" })).toBe(requestId);
    expect(await f.digests()).toEqual(["coach:joinRequest", "lead:joinRequest"]);
    await f.t.run(ctx => ctx.db.patch(requestId!, { status: "declined" }));
    expect(await login.mutation(api.app.requestJoin, { code: code.code, firstName: "Synthetic", lastName: "Applicant" })).toBe(requestId);
    expect(await f.digests()).toEqual(["coach:joinRequest", "coach:joinRequest", "lead:joinRequest", "lead:joinRequest"]);
  });

  it("a bulk fee that creates new charges queues one Money digest item per student; re-running the finished job adds none", async () => {
    const f = await fixture();
    const step = async (jobId: Id<"feeBulkJobs">) => {
      for (let i = 0; i < 200; i++) {
        const job = await f.t.run(ctx => ctx.db.get(jobId));
        if (!job || ["prepared", "held", "complete", "failed", "cancelled"].includes(job.state)) return job;
        await f.t.mutation(processBulk, { jobId, step: job.step });
      }
      throw new Error("Bulk fee job did not finish.");
    };
    const jobId = await f.coach.mutation(prepareBulk, { kind: "create", label: "Synthetic shirt", targetAmountCents: 1500, scope: "selected", studentIds: [f.ids.students[0], f.ids.students[2]], reason: "Synthetic shirt order for two", idempotencyKey: "synthetic-shirt" }) as Id<"feeBulkJobs">;
    expect(await step(jobId)).toMatchObject({ state: "prepared" });
    expect(await f.digests()).toEqual([]);
    const job = await f.t.run(ctx => ctx.db.get(jobId)); const control = await f.t.run(ctx => ctx.db.get(f.ids.control));
    await f.coach.mutation(commitBulk, { jobId, expectedScopeHash: job!.snapshotHash, expectedOrderRevision: control!.revision, expectedDefinitionRevision: job!.expectedDefinitionRevision, reason: "Coach confirmed the synthetic scope" });
    expect(await step(jobId)).toMatchObject({ state: "complete", committed: 2 });
    expect(await f.digests()).toEqual(["parentA:charge", "parentB:charge"]);
    const finished = await f.t.run(ctx => ctx.db.get(jobId));
    await f.t.mutation(processBulk, { jobId, step: finished!.step });
    expect(await f.digests()).toEqual(["parentA:charge", "parentB:charge"]);
  });

  it("family and staff charge lists return the effective due date: the charge's own, else its fee's", async () => {
    const f = await fixture();
    const dueAt = NOW + 10 * DAY, ownDueAt = NOW + 3 * DAY;
    await f.t.run(async ctx => {
      const fee = await ctx.db.insert("feeDefinitions", { seasonId: f.ids.season, kind: "custom", label: "Synthetic fee", defaultAmountCents: 100, priority: 1, revision: 0, state: "active", createdBy: f.ids.coach.app, createdAt: 0, updatedAt: 0, dueAt });
      const base = { studentId: f.ids.students[0], amountCents: 100, appliedCents: 0, createdBy: f.ids.coach.app, createdAt: 1 };
      await ctx.db.insert("charges", { ...base, label: "Inherits", feeDefinitionId: fee, priority: 1 });
      await ctx.db.insert("charges", { ...base, label: "Own date", feeDefinitionId: fee, priority: 2, dueAt: ownDueAt });
      await ctx.db.insert("charges", { ...base, label: "No date", priority: 3 });
    });
    const args = { studentId: f.ids.students[0], paginationOpts: { cursor: null, numItems: 25 } };
    for (const reader of [f.as(f.ids.parentA.auth), f.coach]) {
      const result = await reader.query(api.financeDetails.charges, args);
      expect(result.page.map(row => [row.label, row.dueAt ?? null])).toEqual([["Inherits", dueAt], ["Own date", ownDueAt], ["No date", null]]);
    }
  });
});
