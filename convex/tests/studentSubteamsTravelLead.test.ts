/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../../testUtils";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";

/**
 * setStudentSecondaryAndLeadership accepts a Coach or a Mentor with Travel Lead (including a Parent whose session selected the
 * Travel Lead staff role). listMentorsForInvite also accepts a plain Mentor (invites to their own meetings) and returns only
 * id, name and subteams. A Travel Lead flag stored on a Student or Parent row grants nothing.
 */
const modules = import.meta.glob("../**/*.ts");
const DAY = 86_400_000;
const SET_REFUSED = "Only a Coach or Travel Lead can change a student's secondary subteam or Leadership.";
const LIST_REFUSED = "Only a Coach or Mentor can invite Mentors.";

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: Doc<"appUsers">["role"], extra: Partial<Doc<"appUsers">> = {}) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead: false, financialEdit: false, active: true, ...extra });
      return { auth, id, session: "session" as string };
    }
    const coach = await account("st-coach", "coach");
    const mentorLead = await account("st-mentor-lead", "mentor", { travelLead: true, subteams: ["Build"], phone: "555-0100" });
    const mentor = await account("st-mentor", "mentor");
    const parentLead = await account("st-parent-lead", "parent", { parentStaffAccess: "travelLead" });
    const studentFlagged = await account("st-student-flagged", "student", { travelLead: true });
    const parentFlagged = await account("st-parent-flagged", "parent", { travelLead: true });
    const targetUser = await account("st-target", "student");
    const leadSession = await ctx.db.insert("authSessions", { userId: parentLead.auth, expirationTime: Date.now() + DAY });
    await ctx.db.insert("operatingRoles", { sessionId: leadSession, userId: parentLead.id, role: "travelLead", accessRevision: 0 });
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    const target = await ctx.db.insert("students", { seasonId: season, userId: targetUser.id, legalName: "st-target", preferredName: "st-target", email: "st-target@example.invalid", subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } });
    return { coach, mentorLead, mentor, parentLead: { ...parentLead, session: leadSession as string }, studentFlagged, parentFlagged, target };
  });
  const as = (who: { auth: Id<"users">; session: string }) => t.withIdentity({ subject: `${who.auth}|${who.session}` });
  return { t, ids, as };
}
type Caller = "coach" | "mentorLead" | "mentor" | "parentLead" | "studentFlagged" | "parentFlagged";

const cases: { caller: Caller; allowed: boolean }[] = [
  { caller: "studentFlagged", allowed: false },
  { caller: "parentFlagged", allowed: false },
  { caller: "coach", allowed: true },
  { caller: "mentorLead", allowed: true },
  { caller: "parentLead", allowed: true },
];
const listCases: { caller: Caller; allowed: boolean }[] = [...cases, { caller: "mentor", allowed: true }];

describe("studentSubteams Travel Lead rule", () => {
  it.each(cases)("$caller setStudentSecondaryAndLeadership: allowed=$allowed", async ({ caller, allowed }) => {
    const { t, ids, as } = await fixture();
    const write = as(ids[caller]).mutation(api.studentSubteams.setStudentSecondaryAndLeadership, { studentId: ids.target, secondarySubteam: "CAD", leadership: true, expectedRevision: 0 });
    if (allowed) {
      await expect(write).resolves.toBeNull();
      const student = await t.run(ctx => ctx.db.get(ids.target));
      expect(student).toMatchObject({ secondarySubteam: "CAD", leadership: true, profileRevision: 1 });
    } else {
      await expect(write).rejects.toThrow(SET_REFUSED);
      const student = await t.run(ctx => ctx.db.get(ids.target));
      expect(student?.leadership).toBeUndefined();
      expect(student?.secondarySubteam).toBeUndefined();
    }
  });

  it("refuses a plain Mentor changing a student's secondary subteam or Leadership", async () => {
    const { ids, as } = await fixture();
    await expect(as(ids.mentor).mutation(api.studentSubteams.setStudentSecondaryAndLeadership, { studentId: ids.target, secondarySubteam: "CAD", leadership: true, expectedRevision: 0 })).rejects.toThrow(SET_REFUSED);
  });

  it.each(listCases)("$caller listMentorsForInvite: allowed=$allowed", async ({ caller, allowed }) => {
    const { ids, as } = await fixture();
    const read = as(ids[caller]).query(api.studentSubteams.listMentorsForInvite, {});
    if (!allowed) return await expect(read).rejects.toThrow(LIST_REFUSED);
    // Only the picker's fields: no email, phone or other account data, for anyone.
    const rows = await read;
    expect(rows.every(row => Object.keys(row).sort().join() === "id,name,subteams")).toBe(true);
    expect(rows).toContainEqual({ id: ids.mentorLead.id, name: "st-mentor-lead", subteams: ["Build"] });
    expect(rows).toContainEqual({ id: ids.mentor.id, name: "st-mentor", subteams: [] });
  });
});
