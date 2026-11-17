/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "student") {
      const auth = await ctx.db.insert("users", { email: `${name}@synthetic.test`, name });
      const user = await ctx.db.insert("appUsers", { authUserId: auth, email: `${name}@synthetic.test`, name, role, travelLead: false, financialEdit: false, active: true });
      return { auth, user };
    }
    const coach = await account("coach", "coach");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.user });
    const { auth, user } = await account("student0", "student");
    const studentId = await ctx.db.insert("students", { seasonId: season, userId: user, legalName: "Synthetic Student", preferredName: "Student", email: "student0@synthetic.test", subteam: "Other", active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } });
    const startsAt = Date.now() + 30 * 86400_000;
    const eventId = await ctx.db.insert("events", { seasonId: season, name: "Booth day", type: "Outreach", startsAt, endsAt: startsAt + 3600_000, destination: "Fair", travel: "Own", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "approval", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    return { coachAuth: coach.auth, studentAuth: auth, studentId, eventId };
  });
  const as = (auth: typeof ids.coachAuth) => t.withIdentity({ subject: `${auth}|session` });
  const coach = as(ids.coachAuth), student = as(ids.studentAuth);
  const participant = () => t.run(ctx => ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", ids.eventId).eq("studentId", ids.studentId)).unique());
  const decline = async () => {
    await student.mutation(api.participation.signUp, { eventId: ids.eventId });
    await coach.mutation(api.eventOperations.reviewSignup, { eventId: ids.eventId, studentId: ids.studentId, decision: "decline", reason: "Not this time" });
  };
  return { t, ids, coach, student, participant, decline };
}

describe("a declined signup sticks", () => {
  it("refuses the student's own new signup after a Coach declines", async () => {
    const f = await fixture();
    await f.decline();
    await expect(f.student.mutation(api.participation.signUp, { eventId: f.ids.eventId })).rejects.toThrow("Your signup for this event was declined. Ask a Coach or Travel Lead if you think this is a mistake.");
    expect((await f.participant())?.status).toBe("withdrawn");
  });

  it("lets a Coach add the student back, which clears the decline", async () => {
    const f = await fixture();
    await f.decline();
    await f.coach.mutation(api.participation.setParticipation, { eventId: f.ids.eventId, studentId: f.ids.studentId, status: "confirmed" });
    const row = await f.participant();
    expect(row?.status).toBe("confirmed");
    expect(row?.declinedAt).toBeUndefined();
    expect(row?.declinedBy).toBeUndefined();
  });

  it("keeps a decline row without the marker (older rows) re-signable", async () => {
    const f = await fixture();
    await f.decline();
    await f.t.run(async ctx => { const p = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", f.ids.eventId).eq("studentId", f.ids.studentId)).unique(); await ctx.db.patch(p!._id, { declinedAt: undefined, declinedBy: undefined }); });
    expect(await f.student.mutation(api.participation.signUp, { eventId: f.ids.eventId })).toBe("pending");
  });

  it("clears the decline when a Coach puts the student back, so a later self-withdrawal can sign up again", async () => {
    const f = await fixture();
    await f.decline();
    await f.coach.mutation(api.withdrawals.putBackOnEvent, { eventId: f.ids.eventId, studentId: f.ids.studentId });
    const row = await f.participant();
    expect(row?.status).toBe("confirmed");
    expect(row?.declinedAt).toBeUndefined();
    expect(row?.declinedBy).toBeUndefined();
    // The student later ends up withdrawn without a Coach decline (no approved withdrawal request on file in this fixture).
    await f.t.run(ctx => ctx.db.patch(row!._id, { status: "withdrawn" }));
    expect(await f.student.mutation(api.participation.signUp, { eventId: f.ids.eventId })).toBe("pending");
  });

  it("tells the declined student's screen, and nobody else's, that the signup is declined", async () => {
    const f = await fixture();
    expect((await f.student.query(api.participation.signupAvailability, { eventId: f.ids.eventId })).declined).toBeUndefined();
    await f.decline();
    const declined = await f.student.query(api.participation.signupAvailability, { eventId: f.ids.eventId });
    expect(declined.declined).toBe(true);
    expect(declined.outcome).toBe("closed");
  });
});
