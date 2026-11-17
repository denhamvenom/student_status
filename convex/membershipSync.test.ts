/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { internal } from "./_generated/api";
import { syncWholeTeamMembership } from "./lib/wholeTeam";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
vi.mock("./eventArchive", () => ({ scheduleEventArchive: async () => {} }));

// One upcoming Whole Team event whose enrollment count is missing, so every page fails until it is repaired.
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, financialEdit: true, travelLead: false });
    const season = await ctx.db.insert("seasons", { name: "Test", year: 2026, status: "active", startsAt: 0, permissionVersion: "test", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Member", preferredName: "Member", email: "m@example.invalid", active: true, travelTeam: false, subteam: "", roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Whole Team", type: "Team", startsAt: Date.now() + 86400000, endsAt: Date.now() + 90000000, destination: "School", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "assigned", assignmentScope: "wholeTeam", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    return { coach, student, event };
  });
  const page = { kind: "wholeTeam" as const, studentId: ids.student, actorId: ids.coach, after: { startsAt: 0, creationTime: 0 }, notifiedSeriesIds: [] };
  return { t, ids, page };
}

describe("background membership sync that cannot finish", () => {
  it("keeps trying until the last attempt, then leaves a saved stop with a plain reason", async () => {
    const f = await fixture();
    vi.useFakeTimers();
    try {
      await f.t.mutation(internal.membershipSync.continueSync, f.page);
      expect(await f.t.run(ctx => ctx.db.query("membershipSyncStops").take(5))).toHaveLength(0);
      await f.t.mutation(internal.membershipSync.continueSync, { ...f.page, attempt: 29 });
      const stops = await f.t.run(ctx => ctx.db.query("membershipSyncStops").take(5));
      expect(stops).toHaveLength(1);
      expect(stops[0]).toMatchObject({ studentId: f.ids.student, kind: "wholeTeam", attempts: 30, state: "stopped", after: f.page.after });
      expect(stops[0].reason).toMatch(/couldn't|could not/i);
      expect(stops[0].reason).not.toMatch(/retry|cursor|job|reconcil/i);
    } finally { vi.useRealTimers(); }
  });

  it("resumes from the saved place without enrolling twice, and only once per stop", async () => {
    const f = await fixture();
    await f.t.mutation(internal.membershipSync.continueSync, { ...f.page, attempt: 29 });
    // A second give-up for the same student updates the same record instead of adding another.
    await f.t.mutation(internal.membershipSync.continueSync, { ...f.page, attempt: 29 });
    expect(await f.t.query(internal.membershipSync.listStopped, {})).toHaveLength(1);
    await f.t.run(ctx => ctx.db.patch(f.ids.event, { wholeTeamParticipantCount: 0 }));
    vi.useFakeTimers();
    try {
      const [stop] = await f.t.query(internal.membershipSync.listStopped, {});
      expect(await f.t.mutation(internal.membershipSync.resume, { stopId: stop._id, actorId: f.ids.coach })).toBe(true);
      expect(await f.t.mutation(internal.membershipSync.resume, { stopId: stop._id, actorId: f.ids.coach })).toBe(false);
      await f.t.finishAllScheduledFunctions(() => vi.runAllTimers(), 1000);
    } finally { vi.useRealTimers(); }
    const rows = await f.t.run(ctx => ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", f.ids.event)).collect());
    expect(rows).toHaveLength(1);
    expect(await f.t.run(ctx => ctx.db.get(f.ids.event))).toMatchObject({ wholeTeamParticipantCount: 1 });
    expect(await f.t.query(internal.membershipSync.listStopped, {})).toHaveLength(0);
    // Running the same page again is harmless.
    await f.t.mutation(internal.membershipSync.runPage, f.page);
    expect(await f.t.run(ctx => ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", f.ids.event)).collect())).toHaveLength(1);
  });

  it("logs the raw error but stores only safe detail", async () => {
    const f = await fixture();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await f.t.mutation(internal.membershipSync.continueSync, { ...f.page, attempt: 29 });
      expect(spy.mock.calls[0].join(" ")).toContain(f.ids.student);
      expect(spy.mock.calls[0].join(" ")).toContain("wholeTeam");
    } finally { spy.mockRestore(); }
    const [stop] = await f.t.run(ctx => ctx.db.query("membershipSyncStops").take(1));
    expect(stop.technicalDetail).toBe("Error (see logs)");
    expect(JSON.stringify(stop)).not.toMatch(/reconciliation/);
  });

  it("hides a stop once a later sync for that student finishes", async () => {
    const f = await fixture();
    await f.t.mutation(internal.membershipSync.continueSync, { ...f.page, attempt: 29 });
    expect(await f.t.query(internal.membershipSync.listStopped, {})).toHaveLength(1);
    await f.t.run(async ctx => {
      await ctx.db.patch(f.ids.event, { wholeTeamParticipantCount: 0 });
      const student = await ctx.db.get(f.ids.student); const actor = await ctx.db.get(f.ids.coach);
      await syncWholeTeamMembership(ctx, actor!, student!);
    });
    expect(await f.t.query(internal.membershipSync.listStopped, {})).toHaveLength(0);
  });

  it("resumes only as an existing, active actor", async () => {
    const f = await fixture();
    await f.t.mutation(internal.membershipSync.continueSync, { ...f.page, attempt: 29 });
    const [stop] = await f.t.query(internal.membershipSync.listStopped, {});
    await f.t.run(ctx => ctx.db.patch(f.ids.coach, { active: false }));
    expect(await f.t.mutation(internal.membershipSync.resume, { stopId: stop._id, actorId: f.ids.coach })).toBe(false);
    expect(await f.t.query(internal.membershipSync.listStopped, {})).toHaveLength(1);
  });
});
