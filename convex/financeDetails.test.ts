/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";
import type { FunctionReturnType } from "convex/server";

const modules = import.meta.glob("./**/*.ts");
describe("paginated financial evidence", () => {
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
