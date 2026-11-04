/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../../testUtils";
import { api } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import schema from "../schema";

/**
 * studentAccess grants another student's record to a Coach or a Mentor with Travel Lead (including a Parent whose session
 * selected the Travel Lead staff role). A Travel Lead flag stored on a Student or Parent row grants nothing; a Student still
 * reads their own record and a linked Parent still reads their child's.
 */
const modules = import.meta.glob("../**/*.ts");
const DAY = 86_400_000;
const REFUSED = "You don't have permission for this student's record.";

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: Doc<"appUsers">["role"], extra: Partial<Doc<"appUsers">> = {}) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead: false, financialEdit: false, active: true, ...extra });
      return { auth, id, session: "session" as string };
    }
    const coach = await account("sa-coach", "coach");
    const mentorLead = await account("sa-mentor-lead", "mentor", { travelLead: true });
    const mentorPlain = await account("sa-mentor", "mentor");
    const parentLead = await account("sa-parent-lead", "parent", { parentStaffAccess: "travelLead" });
    const studentFlagged = await account("sa-student-flagged", "student", { travelLead: true });
    const parentFlagged = await account("sa-parent-flagged", "parent", { travelLead: true });
    const linkedParent = await account("sa-linked-parent", "parent");
    const targetUser = await account("sa-target", "student");
    const leadSession = await ctx.db.insert("authSessions", { userId: parentLead.auth, expirationTime: Date.now() + DAY });
    await ctx.db.insert("operatingRoles", { sessionId: leadSession, userId: parentLead.id, role: "travelLead", accessRevision: 0 });
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    const studentRow = (userId: Id<"appUsers">, name: string) => ctx.db.insert("students", { seasonId: season, userId, legalName: name, preferredName: name, email: `${name}@example.invalid`, subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } });
    const ownStudent = await studentRow(studentFlagged.id, "sa-student-flagged");
    const target = await studentRow(targetUser.id, "sa-target");
    await ctx.db.insert("familyLinks", { parentUserId: linkedParent.id, studentId: target, seasonId: season, active: true, createdBy: coach.id });
    return { coach, mentorLead, mentorPlain, parentLead: { ...parentLead, session: leadSession as string }, parentInParentMode: parentLead, studentFlagged, parentFlagged, linkedParent, targetUser, ownStudent, target };
  });
  const as = (who: { auth: Id<"users">; session: string }) => t.withIdentity({ subject: `${who.auth}|${who.session}` });
  return { ids, as };
}
type Caller = "coach" | "mentorLead" | "mentorPlain" | "parentLead" | "parentInParentMode" | "studentFlagged" | "parentFlagged" | "linkedParent" | "targetUser";

const cases: { caller: Caller; student: "target" | "ownStudent"; allowed: boolean }[] = [
  { caller: "studentFlagged", student: "target", allowed: false },
  { caller: "parentFlagged", student: "target", allowed: false },
  { caller: "parentInParentMode", student: "target", allowed: false },
  { caller: "mentorPlain", student: "target", allowed: false },
  { caller: "coach", student: "target", allowed: true },
  { caller: "mentorLead", student: "target", allowed: true },
  { caller: "parentLead", student: "target", allowed: true },
  { caller: "studentFlagged", student: "ownStudent", allowed: true },
  { caller: "targetUser", student: "target", allowed: true },
  { caller: "linkedParent", student: "target", allowed: true },
];

describe("studentAccess Travel Lead rule", () => {
  it.each(cases)("$caller reading $student: allowed=$allowed", async ({ caller, student, allowed }) => {
    const { ids, as } = await fixture();
    const read = as(ids[caller]).query(api.app.studentProfile, { studentId: ids[student] });
    if (allowed) await expect(read).resolves.toMatchObject({ _id: ids[student] });
    else await expect(read).rejects.toThrow(REFUSED);
  });
});
