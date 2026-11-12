/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../../testUtils";
import schema from "../schema";
import { definition, readinessTabs, type ReadinessStudent } from "./readiness";
import { balanceDueCents, missingProfileItems, needsAttention, permissionLabel, firstRegistrationLabel } from "../../src/lib/rosterRequirements";

const modules = import.meta.glob("../**/*.ts");
const roster = makeFunctionReference<"query">("coachRoster:list");
const sheetPage = makeFunctionReference<"query">("sheetData/readiness:page");

const base: ReadinessStudent = {
  studentId: "s1", name: "Ada Student", subteam: "Mechanical", active: true, firstRegistrationState: "needsCompletion",
  balance: { state: "ready", dueCents: 12550 }, nextEvent: { name: "Synthetic Regional", state: "open", open: ["Permission form", "Payment"], participation: "confirmed" },
  missingSummary: ["Profile setup", "Shirt size", "Room category"], permission: { state: "notSigned", eventName: "Synthetic Regional" },
};

describe("readiness rows", () => {
  it("writes the roster's own answers, sorted by name", () => {
    const [{ rows }] = readinessTabs([{ ...base, studentId: "s2", name: "Zed Student" }, base]);
    expect(rows[0]).toEqual(["Student", "Subteam", "Profile complete", "FIRST registration", "Permission form", "Balance due ($)", "Needs attention", "What is left"]);
    expect(rows[1]).toEqual(["Ada Student", "Build", "No", "Missing", "Not signed", 125.5, "Yes", "Synthetic Regional: Permission form; Payment"]);
    expect(rows[2][0]).toBe("Zed Student");
  });
  it("covers the quiet cases: complete profile, unavailable balance, unconfirmed event", () => {
    const [{ rows }] = readinessTabs([{ ...base, missingSummary: ["Profile setup"], firstRegistrationState: "verified", balance: { state: "updating", dueCents: null }, permission: { state: "closed", eventName: null }, nextEvent: { name: "E", state: "open", open: ["x"], participation: "pending" } }]);
    expect(rows[1].slice(2)).toEqual(["Yes", "Verified", "Not collecting yet", "Unavailable", "No", ""]);
  });
});

describe("readiness file", () => {
  it("is a General team file named after the season", () => {
    expect([definition.folder, definition.scope, definition.ready, definition.title({ seasonName: "Synthetic 2027", event: null })]).toEqual(["general", "team", true, "Readiness - Synthetic 2027"]);
  });
});

describe("readiness matches the Team roster", () => {
  it("gives the same answers as coachRoster.list for the same students", async () => {
    const t = createTest(schema, modules);
    const ids = await t.run(async ctx => {
      const auth = await ctx.db.insert("users", { email: "synthetic-coach@example.invalid" });
      const coach = await ctx.db.insert("appUsers", { authUserId: auth, name: "Synthetic Coach", email: "synthetic-coach@example.invalid", role: "coach", active: true, travelLead: false, financialEdit: false });
      const season = await ctx.db.insert("seasons", { name: "Synthetic current", year: 2027, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach, permissionSigningPaused: false });
      const common = { seasonId: season, subteam: "Mechanical", travelTeam: true, roomCategoryLocked: false, allergies: { state: "unknown" as const }, medications: { state: "unknown" as const } };
      await ctx.db.insert("students", { ...common, legalName: "Synthetic One", preferredName: "One", email: "one@example.invalid", active: true, shirtSize: "M", profileCompletedAt: 1 });
      await ctx.db.insert("students", { ...common, legalName: "Synthetic Two", preferredName: "Two", email: "two@example.invalid", active: true });
      await ctx.db.insert("students", { ...common, legalName: "Synthetic Gone", preferredName: "Gone", email: "gone@example.invalid", active: false });
      await ctx.db.insert("events", { seasonId: season, name: "Synthetic Regional", type: "Competition", startsAt: 5_000, endsAt: 6_000, destination: "Synthetic", travel: "None", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: false, permissionRequired: true, firstRequired: true, archived: false });
      return { auth, season };
    });
    const asOf = 100;
    const app = (await t.withIdentity({ subject: `${ids.auth}|session` }).query(roster, { paginationOpts: { numItems: 20, cursor: null }, asOf })).page;
    const sheet = await t.query(sheetPage, { seasonId: ids.season, cursor: null, asOf });
    expect(sheet.isDone).toBe(true);
    expect(sheet.rows.map((row: ReadinessStudent) => row.name).sort()).toEqual(["Synthetic One", "Synthetic Two"]);
    const [{ rows }] = readinessTabs(sheet.rows);
    for (const line of rows.slice(1)) {
      const mine = app.find((row: ReadinessStudent) => row.name === line[0]);
      expect(mine).toBeDefined();
      expect(line.slice(2)).toEqual([
        missingProfileItems(mine).length === 0 ? "Yes" : "No", firstRegistrationLabel[mine.firstRegistrationState as ReadinessStudent["firstRegistrationState"]], permissionLabel(mine),
        mine.balance.state === "ready" && mine.balance.dueCents !== null ? balanceDueCents(mine) / 100 : "Unavailable", needsAttention(mine) ? "Yes" : "No", line[7],
      ]);
    }
    expect(rows).toHaveLength(3);
  });
});
