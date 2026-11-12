/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../../testUtils";
import schema from "../schema";
import { adultRosterTabs, definition, type AdultRow } from "./adultRoster";

const modules = import.meta.glob("../**/*.ts");
const sheetPage = makeFunctionReference<"query">("sheetData/adultRoster:page");

const adult = (name: string, role: AdultRow["role"], extra: Partial<AdultRow> = {}): AdultRow => ({ name, role, travelLead: false, subteams: "", email: "a@example.invalid", phone: "", students: [], ...extra });

describe("adult roster rows", () => {
  it("sorts by role (Coach, Travel Lead, Mentor, Parent) then name", () => {
    const [{ rows }] = adultRosterTabs([adult("Zed", "Parent", { students: ["Ann S", "Bob S"] }), adult("Mia", "Mentor", { subteams: "Build, Programming" }), adult("Lee", "Travel Lead", { travelLead: true }), adult("Cat", "Coach"), adult("Abe", "Parent")]);
    expect(rows[0]).toEqual(["Name", "Role", "Travel Lead", "Subteams", "Email", "Phone", "Students (linked)"]);
    expect(rows.slice(1).map(row => row[0])).toEqual(["Cat", "Lee", "Mia", "Abe", "Zed"]);
    expect(rows[2].slice(1, 3)).toEqual(["Travel Lead", "Yes"]);
    expect(rows[3][3]).toBe("Build, Programming");
    expect(rows[5][6]).toBe("Ann S; Bob S");
  });
});

describe("adult roster file", () => {
  it("is a General team file named after the season", () => {
    expect([definition.folder, definition.scope, definition.ready, definition.title({ seasonName: "Synthetic 2027", event: null })]).toEqual(["general", "team", true, "Adult roster - Synthetic 2027"]);
  });
});

describe("adult roster loading", () => {
  it("skips inactive and archived adults, labels roles and links Parents to this season's students", async () => {
    const t = createTest(schema, modules);
    const season = await t.run(async ctx => {
      const make = async (key: string, fields: Record<string, unknown>) => {
        const authUserId = await ctx.db.insert("users", { email: `${key}@example.invalid` });
        return await ctx.db.insert("appUsers", { authUserId, name: key, email: `${key}@example.invalid`, role: "parent", active: true, travelLead: false, financialEdit: false, ...fields } as never);
      };
      const coach = await make("coach", { role: "coach", phone: "555-0101" });
      const season = await ctx.db.insert("seasons", { name: "S", year: 2027, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
      const other = await ctx.db.insert("seasons", { name: "Old", year: 2026, status: "archived", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach });
      await make("mentor-tl", { role: "mentor", travelLead: true });
      await make("mentor-gone", { role: "mentor", active: false });
      await make("mentor-archived", { role: "mentor", archivedAt: 5 });
      const parentMentor = await make("parent-mentor", { parentStaffAccess: "mentor" });
      const parent = await make("plain-parent", {});
      const common = { subteam: "Mechanical", travelTeam: false, roomCategoryLocked: false, active: true, allergies: { state: "unknown" as const }, medications: { state: "unknown" as const } };
      const here = await ctx.db.insert("students", { ...common, seasonId: season, legalName: "Here Student", preferredName: "Here", email: "h@example.invalid" });
      const old = await ctx.db.insert("students", { ...common, seasonId: other, legalName: "Old Student", preferredName: "Old", email: "o@example.invalid" });
      await ctx.db.insert("familyLinks", { parentUserId: parent, studentId: here, seasonId: season, active: true, createdBy: coach });
      await ctx.db.insert("familyLinks", { parentUserId: parent, studentId: old, seasonId: other, active: true, createdBy: coach });
      await ctx.db.insert("familyLinks", { parentUserId: parentMentor, studentId: here, seasonId: season, active: false, createdBy: coach });
      return season;
    });
    const rows: AdultRow[] = [];
    for (const source of ["coach", "mentor", "parent"]) rows.push(...(await t.query(sheetPage, { seasonId: season, source, paginationOpts: { numItems: 25, cursor: null } })).rows);
    const [{ rows: sheet }] = adultRosterTabs(rows);
    expect(sheet.slice(1).map(row => [row[0], row[1], row[2], row[6]])).toEqual([
      ["coach", "Coach", "No", ""], ["mentor-tl", "Travel Lead", "Yes", ""], ["parent-mentor", "Mentor", "No", ""], ["plain-parent", "Parent", "No", "Here Student"],
    ]);
  });
});
