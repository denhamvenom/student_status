/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../testUtils";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const account = async (key: string, role: Doc<"appUsers">["role"]) => {
      const email = `${key}@example.invalid`;
      const auth = await ctx.db.insert("users", { email });
      const app = await ctx.db.insert("appUsers", { authUserId: auth, email, name: key, role, active: true, travelLead: false, financialEdit: false });
      return { auth, app };
    };
    const coach = await account("coach", "coach"); const parent = await account("parent", "parent"); const other = await account("other", "parent");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2027", year: 2027, status: "active", startsAt: 0, permissionVersion: "v1", createdBy: coach.app });
    const fields = { seasonId: season, legalName: "Dev Student", preferredName: "Dev", email: "s@example.invalid", subteam: "Build", travelTeam: true, active: true, roomCategoryLocked: false, roomCategory: "Girls" as const, allergies: { state: "none" as const }, medications: { state: "none" as const } };
    const student = await ctx.db.insert("students", fields);
    const mate = await ctx.db.insert("students", { ...fields, legalName: "Maya Private Surname", preferredName: "Maya Q", email: "maya@example.invalid" });
    const stranger = await ctx.db.insert("students", { ...fields, legalName: "Other Kid", preferredName: "Other", email: "o@example.invalid" });
    await ctx.db.insert("familyLinks", { parentUserId: parent.app, studentId: student, seasonId: season, active: true, createdBy: coach.app });
    await ctx.db.insert("familyLinks", { parentUserId: other.app, studentId: stranger, seasonId: season, active: true, createdBy: coach.app });
    const event = await ctx.db.insert("events", { seasonId: season, name: "Synthetic Regional", type: "Competition", startsAt: Date.now() + 30 * DAY, endsAt: Date.now() + 32 * DAY, destination: "Synthetic City", travel: "Bus", overnight: true, roomingEnabled: true, roomDeadline: Date.now() + 10 * DAY, feeCents: 0, signupMode: "assigned", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    for (const studentId of [student, mate]) await ctx.db.insert("participants", { eventId: event, studentId, status: "confirmed", createdAt: 1, updatedAt: 1 });
    return { coach, parent, other, season, student, mate, stranger, event };
  });
  const as = (user: { auth: Id<"users"> }) => t.withIdentity({ subject: `${user.auth}|session` });
  const group = (finalized = false) => t.run(async ctx => {
    const groupId = await ctx.db.insert("roomGroups", { eventId: ids.event, category: "Girls", name: "Synthetic group", finalized, adultFifthException: false, needsReview: false, createdBy: ids.coach.app });
    for (const studentId of [ids.student, ids.mate]) await ctx.db.insert("roomMemberships", { eventId: ids.event, groupId, studentId, joinedAt: 1 });
  });
  return { t, ids, group, parent: as(ids.parent), other: as(ids.other), coach: as(ids.coach) };
}

describe("rooms.parentRoomStatus", () => {
  it("shows a linked Parent only the minimized status", async () => {
    const f = await fixture();
    const args = { eventId: f.ids.event, studentId: f.ids.student };
    const before = await f.parent.query(api.rooms.parentRoomStatus, args);
    expect(Object.keys(before).sort()).toEqual(["deadline", "roomChoiceOpen", "roomType", "roommates", "status"]);
    expect(before).toMatchObject({ roomChoiceOpen: true, roomType: "Girls", status: "notChosen", roommates: [] });
    await f.group(true);
    const after = await f.parent.query(api.rooms.parentRoomStatus, args);
    expect(after).toMatchObject({ status: "finalized", roommates: ["Maya"] });
    expect(JSON.stringify(after)).not.toMatch(/Private|example|Id|_id/);
  });
  it("marks a Coach-created group as assigned", async () => {
    const f = await fixture(); await f.group();
    expect((await f.parent.query(api.rooms.parentRoomStatus, { eventId: f.ids.event, studentId: f.ids.student })).status).toBe("assigned");
  });
  it.each([
    ["no participant row", async (f: Awaited<ReturnType<typeof fixture>>) => { const row = await f.t.run(ctx => ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", f.ids.event).eq("studentId", f.ids.student)).unique()); await f.t.run(ctx => ctx.db.delete(row!._id)); }],
    ["a withdrawn student", async (f: Awaited<ReturnType<typeof fixture>>) => { const row = await f.t.run(ctx => ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", f.ids.event).eq("studentId", f.ids.student)).unique()); await f.t.run(ctx => ctx.db.patch(row!._id, { status: "withdrawn" })); }],
    ["a canceled event", async (f: Awaited<ReturnType<typeof fixture>>) => { await f.t.run(ctx => ctx.db.patch(f.ids.event, { cancelled: true })); }],
  ])("refuses the room status for %s", async (_name, setup) => {
    const f = await fixture(); await setup(f);
    await expect(f.parent.query(api.rooms.parentRoomStatus, { eventId: f.ids.event, studentId: f.ids.student })).rejects.toThrow("doesn't use rooms");
  });
  it("refuses unlinked Parents, other families' students, staff and signed-out callers", async () => {
    const f = await fixture();
    const args = { eventId: f.ids.event, studentId: f.ids.student };
    await expect(f.other.query(api.rooms.parentRoomStatus, args)).rejects.toThrow("permission");
    await expect(f.parent.query(api.rooms.parentRoomStatus, { ...args, studentId: f.ids.stranger })).rejects.toThrow("permission");
    await expect(f.coach.query(api.rooms.parentRoomStatus, args)).rejects.toThrow("Only a Parent");
    await expect(f.t.query(api.rooms.parentRoomStatus, args)).rejects.toThrow();
  });
});
