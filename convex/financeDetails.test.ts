/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";
import type { FunctionReturnType } from "convex/server";

const modules = import.meta.glob("./**/*.ts");
describe("paginated financial evidence", () => {
  it("omits staff finance reasons and provenance from family responses", async () => {
    const t = createTest(schema, modules);
    const ids = await t.run(async ctx => {
      const authCoach = await ctx.db.insert("users", {email: "coach-privacy@example.invalid"});
      const authParent = await ctx.db.insert("users", {email: "parent-privacy@example.invalid"});
      const coach = await ctx.db.insert("appUsers", {authUserId: authCoach, name: "Coach", email: "coach-privacy@example.invalid", role: "coach", active: true, travelLead: false, financialEdit: true});
      const parent = await ctx.db.insert("appUsers", {authUserId: authParent, name: "Parent", email: "parent-privacy@example.invalid", role: "parent", active: true, travelLead: false, financialEdit: false});
      const seasonId = await ctx.db.insert("seasons", {name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach});
      const studentId = await ctx.db.insert("students", {seasonId, legalName: "Student", preferredName: "Student", email: "student-privacy@example.invalid", subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: false, allergies: {state: "unknown"}, medications: {state: "unknown"}});
      await ctx.db.insert("familyLinks", {parentUserId: parent, studentId, active: true, createdBy: coach});
      const chargeId = await ctx.db.insert("charges", {studentId, label: "Room fee", amountCents: 100, appliedCents: 0, priority: 1, createdBy: coach, createdAt: 1});
      await ctx.db.insert("ledgerEntries", {studentId, chargeId, kind: "cancellation", amountCents: 100, previousCents: 100, newCents: 0, reason: "Internal rehearsal note; never show a family", reference: "private-reference", recordedBy: coach, recordedAt: 2, idempotencyKey: "private-idempotency"});
      return {authCoach, authParent, studentId};
    });
    const parent = t.withIdentity({subject: `${ids.authParent}|session`}), coach = t.withIdentity({subject: `${ids.authCoach}|session`});
    const args = {studentId: ids.studentId, paginationOpts: {cursor: null, numItems: 25}};
    const family = await parent.query(api.financeDetails.history, args);
    expect(family.page[0].safeDescription).toBe("Room fee canceled");
    expect(JSON.stringify(family)).not.toMatch(/Internal rehearsal note|private-reference|private-idempotency|recordedBy/);
    const charge = await parent.query(api.financeDetails.charges, args);
    expect(JSON.stringify(charge)).not.toContain("createdBy");
    const staff = await coach.query(api.financeDetails.history, args);
    expect(JSON.stringify(staff)).toContain("Internal rehearsal note");
  });
  it("keeps all history beyond 500 rows accessible and rejects wrong roles and scopes", async () => {
    const t = createTest(schema, modules);
    const ids = await t.run(async ctx => {
      const auth = await ctx.db.insert("users", { email: "finance-reader@example.invalid" });
      const parent = await ctx.db.insert("appUsers", { authUserId: auth, name: "Synthetic Parent", email: "finance-reader@example.invalid", role: "parent", active: true, travelLead: false, financialEdit: false });
      const seasonId = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: parent });
      const profile = { seasonId, legalName: "Synthetic", preferredName: "Synthetic", email: "synthetic@example.invalid", subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" as const }, medications: { state: "unknown" as const } };
      const studentId = await ctx.db.insert("students", profile);
      const unrelatedId = await ctx.db.insert("students", profile);
      await ctx.db.insert("familyLinks", { parentUserId: parent, studentId, active: true, createdBy: parent });
      for (let index = 0; index < 620; index++) await ctx.db.insert("ledgerEntries", { studentId, kind: "payment", amountCents: 1, previousCents: index, newCents: index + 1, recordedBy: parent, recordedAt: index, idempotencyKey: `history-${index}` });
      for (let index = 0; index < 52; index++) await ctx.db.insert("charges", { studentId, label: `Synthetic ${index}`, amountCents: 1, appliedCents: 0, priority: index, createdBy: parent, createdAt: index });
      return { auth, parent, studentId, unrelatedId };
    });
    const client = t.withIdentity({ subject: `${ids.auth}|session` });
    const seen = new Set<string>();
    let cursor: string | null = null;
    for (let pageIndex = 0; pageIndex < 30; pageIndex++) {
      const result: FunctionReturnType<typeof api.financeDetails.history> = await client.query(api.financeDetails.history, { studentId: ids.studentId, paginationOpts: { cursor, numItems: 25 } });
      expect(result.page.length).toBeLessThanOrEqual(25);
      for (const row of result.page) { expect(seen.has(row._id)).toBe(false); seen.add(row._id); }
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
    expect(seen.size).toBe(620);
    const first = await client.query(api.financeDetails.charges, { studentId: ids.studentId, paginationOpts: { cursor: null, numItems: 25 } });
    const second = await client.query(api.financeDetails.charges, { studentId: ids.studentId, paginationOpts: { cursor: first.continueCursor, numItems: 25 } });
    const third = await client.query(api.financeDetails.charges, { studentId: ids.studentId, paginationOpts: { cursor: second.continueCursor, numItems: 25 } });
    expect([...first.page, ...second.page, ...third.page].map(row => row.priority)).toEqual(Array.from({ length: 52 }, (_, index) => index));
    expect(third.isDone).toBe(true);
    await expect(client.query(api.financeDetails.history, { studentId: ids.unrelatedId, paginationOpts: { cursor: null, numItems: 25 } })).rejects.toThrow();
    await expect(client.query(api.financeDetails.history, { studentId: ids.studentId, paginationOpts: { cursor: null, numItems: 26 } })).rejects.toThrow("25 records");
    await t.run(ctx => ctx.db.patch(ids.parent, { role: "mentor" }));
    await expect(client.query(api.financeDetails.charges, { studentId: ids.studentId, paginationOpts: { cursor: null, numItems: 25 } })).rejects.toThrow("Finance access denied");
  });
});
