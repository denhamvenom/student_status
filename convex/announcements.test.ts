/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../testUtils";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;
const sixthPin = "Five announcements are already pinned. Unpin one first.";
type Row = Omit<Doc<"teamAnnouncements">, "_id" | "_creationTime">;

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const account = async (key: string, role: Doc<"appUsers">["role"], name: string, extra: Partial<Doc<"appUsers">> = {}) => {
      const email = `${key}@example.invalid`;
      const auth = await ctx.db.insert("users", { email });
      const app = await ctx.db.insert("appUsers", { authUserId: auth, email, name, role, active: true, travelLead: false, financialEdit: false, ...extra });
      return { auth, app };
    };
    const coach = await account("coach", "coach", "Casey Coach");
    const lead = await account("lead", "mentor", "Jordan W.", { travelLead: true });
    const mentor = await account("mentor", "mentor", "Morgan Mentor");
    const parent = await account("parent", "parent", "Pat Parent");
    const parentLead = await account("parentlead", "parent", "Riley Parent", { parentStaffAccess: "travelLead" });
    const student = await account("student", "student", "Dev Student");
    const offRoster = await account("offroster", "student", "Sam Former");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2027", year: 2027, status: "active", startsAt: 0, permissionVersion: "v1", createdBy: coach.app });
    const oldSeason = await ctx.db.insert("seasons", { name: "Synthetic 2026", year: 2026, status: "archived", startsAt: 0, permissionVersion: "v1", createdBy: coach.app });
    const studentFields = { legalName: "Dev Student", preferredName: "Dev", email: "student@example.invalid", subteam: "Build", travelTeam: false, active: true, roomCategoryLocked: false, allergies: { state: "none" as const }, medications: { state: "none" as const } };
    await ctx.db.insert("students", { ...studentFields, seasonId: season, userId: student.app });
    await ctx.db.insert("students", { ...studentFields, seasonId: oldSeason, userId: offRoster.app });
    // The same Parent account in two sessions: one selected Travel Lead, the other did not.
    const leadSession = await ctx.db.insert("authSessions", { userId: parentLead.auth, expirationTime: Date.now() + DAY });
    const parentSession = await ctx.db.insert("authSessions", { userId: parentLead.auth, expirationTime: Date.now() + DAY });
    await ctx.db.insert("operatingRoles", { sessionId: leadSession, userId: parentLead.app, role: "travelLead", accessRevision: 0 });
    return { coach, lead, mentor, parent, parentLead, student, offRoster, season, oldSeason, leadSession, parentSession };
  });
  const as = (user: { auth: Id<"users"> }, session = "session") => t.withIdentity({ subject: `${user.auth}|${session}` });
  const insert = (fields: Partial<Row>) => t.run(ctx => ctx.db.insert("teamAnnouncements", { seasonId: ids.season, body: "Synthetic message", authorId: ids.coach.app, authorRole: "coach", pinned: false, createdAt: 1, updatedAt: 1, ...fields }));
  const get = (id: Id<"teamAnnouncements">) => t.run(ctx => ctx.db.get(id));
  return {
    t, ids, insert, get,
    coach: as(ids.coach), lead: as(ids.lead), mentor: as(ids.mentor), parent: as(ids.parent), student: as(ids.student), offRoster: as(ids.offRoster),
    parentAsLead: as(ids.parentLead, ids.leadSession), parentAsParent: as(ids.parentLead, ids.parentSession),
  };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
type Client = Fixture["coach"] | Fixture["t"];

describe("announcement management access", () => {
  it("refuses Students, Parents, plain Mentors and signed-out visitors on every write and on the staff list", async () => {
    const f = await fixture();
    const id = await f.coach.mutation(api.announcements.create, { body: "Bring safety glasses", pin: false });
    const before = await f.get(id);
    const operations: ((client: Client) => Promise<unknown>)[] = [
      client => client.mutation(api.announcements.create, { body: "Not allowed", pin: true }),
      client => client.mutation(api.announcements.update, { id, body: "Changed" }),
      client => client.mutation(api.announcements.pin, { id }),
      client => client.mutation(api.announcements.unpin, { id }),
      client => client.mutation(api.announcements.archive, { id }),
      client => client.query(api.announcements.listForStaff, {}),
    ];
    const refused: [Client, string][] = [
      [f.student, "Only a Coach or Travel Lead"], [f.parent, "Only a Coach or Travel Lead"], [f.mentor, "Only a Coach or Travel Lead"],
      [f.parentAsParent, "Only a Coach or Travel Lead"], [f.t, "not signed in"],
    ];
    for (const [client, message] of refused) for (const operation of operations) await expect(operation(client)).rejects.toThrow(message);
    expect(await f.get(id)).toEqual(before);
    expect(await f.t.run(ctx => ctx.db.query("teamAnnouncements").take(5))).toHaveLength(1);
    expect(await f.t.run(ctx => ctx.db.query("audit").take(5))).toHaveLength(1);
  });

  it("lets a Coach, a Travel Lead and a Parent who selected Travel Lead manage any announcement, auditing each actor", async () => {
    const f = await fixture();
    const id = await f.coach.mutation(api.announcements.create, { body: "Shop opens at 6", pin: false });
    await f.lead.mutation(api.announcements.update, { id, title: "Shop hours", body: "Shop opens at 6:30" });
    await f.parentAsLead.mutation(api.announcements.pin, { id });
    await f.coach.mutation(api.announcements.unpin, { id });
    await f.lead.mutation(api.announcements.archive, { id });
    expect(await f.get(id)).toMatchObject({ authorId: f.ids.coach.app, authorRole: "coach", title: "Shop hours", body: "Shop opens at 6:30", pinned: false });
    const trail = await f.t.run(ctx => ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", "teamAnnouncements").eq("entityId", id)).take(10));
    expect(trail.map(entry => [entry.action, entry.actorId])).toEqual([
      ["createAnnouncement", f.ids.coach.app], ["updateAnnouncement", f.ids.lead.app], ["pinAnnouncement", f.ids.parentLead.app],
      ["unpinAnnouncement", f.ids.coach.app], ["archiveAnnouncement", f.ids.lead.app],
    ]);
    for (const [client, author] of [[f.lead, f.ids.lead.app], [f.parentAsLead, f.ids.parentLead.app]] as const) {
      const own = await client.mutation(api.announcements.create, { body: "Travel packet is ready", pin: true });
      expect(await f.get(own)).toMatchObject({ authorId: author, authorRole: "travelLead", pinned: true });
    }
  });
});

describe("five-pin limit", () => {
  it("refuses a sixth pin, ignores earlier seasons and frees a slot on unpin or remove", async () => {
    const f = await fixture();
    await f.insert({ seasonId: f.ids.oldSeason, pinned: true, pinnedAt: 5 });
    const pinned = [];
    for (let index = 0; index < 5; index++) pinned.push(await f.coach.mutation(api.announcements.create, { body: `Pinned ${index}`, pin: true }));
    await expect(f.coach.mutation(api.announcements.create, { body: "One more", pin: true })).rejects.toThrow(sixthPin);
    const waiting = await f.lead.mutation(api.announcements.create, { body: "One more", pin: false });
    await expect(f.lead.mutation(api.announcements.pin, { id: waiting })).rejects.toThrow(sixthPin);
    // Pinning something already pinned is not a sixth pin.
    await f.coach.mutation(api.announcements.pin, { id: pinned[0] });
    await f.coach.mutation(api.announcements.unpin, { id: pinned[0] });
    await f.lead.mutation(api.announcements.pin, { id: waiting });
    await f.coach.mutation(api.announcements.archive, { id: pinned[1] });
    await f.coach.mutation(api.announcements.create, { body: "Fits after a removal", pin: true });
    const current = await f.t.run(ctx => ctx.db.query("teamAnnouncements").withIndex("by_seasonId_and_pinned_and_pinnedAt", q => q.eq("seasonId", f.ids.season).eq("pinned", true)).take(10));
    expect(current).toHaveLength(5);
    expect(await f.get(pinned[1])).toMatchObject({ pinned: false, archivedAt: expect.any(Number) });
    expect(await f.get(pinned[1])).not.toHaveProperty("pinnedAt");
  });
});

describe("pinnedForHome", () => {
  it("returns at most five current pins, newest pin first, with names but never emails", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.lead.app, { name: "lead@example.invalid" }));
    const rows = [];
    for (let index = 1; index <= 7; index++) rows.push(await f.insert({ body: `Message ${index}`, pinned: true, pinnedAt: index * 100 }));
    const expired = await f.insert({ title: "Old news", body: "Already past its date", authorId: f.ids.lead.app, authorRole: "travelLead", pinned: true, pinnedAt: 650, showUntil: 1 });
    await f.insert({ seasonId: f.ids.oldSeason, pinned: true, pinnedAt: 10_000 });
    await f.coach.mutation(api.announcements.archive, { id: rows[6] });
    const home = await f.student.query(api.announcements.pinnedForHome, {});
    expect(home.map(item => item.id)).toEqual([expired, rows[5], rows[4], rows[3], rows[2]]);
    expect(home[0]).toEqual({ id: expired, title: "Old news", body: "Already past its date", authorName: "Travel Lead", authorRole: "travelLead", pinnedAt: 650, showUntil: 1 });
    expect(home[1]).toEqual({ id: rows[5], title: null, body: "Message 6", authorName: "Casey Coach", authorRole: "coach", pinnedAt: 600, showUntil: null });
    expect(JSON.stringify(home)).not.toContain("@");
  });

  it("is readable by active accounts in the season, but not by a Student off the roster, an inactive account or a signed-out visitor", async () => {
    const f = await fixture();
    await f.insert({ pinned: true, pinnedAt: 1 });
    for (const client of [f.student, f.parent, f.parentAsParent, f.mentor, f.lead, f.coach]) expect(await client.query(api.announcements.pinnedForHome, {})).toHaveLength(1);
    await expect(f.offRoster.query(api.announcements.pinnedForHome, {})).rejects.toThrow("No student on this season's roster");
    await expect(f.t.query(api.announcements.pinnedForHome, {})).rejects.toThrow("not signed in");
    await f.t.run(ctx => ctx.db.patch(f.ids.parent.app, { active: false }));
    await expect(f.parent.query(api.announcements.pinnedForHome, {})).rejects.toThrow("inactive");
  });
});

describe("announcement validation", () => {
  it("rejects empty or long text and a Show until date that has passed, on create and update", async () => {
    const f = await fixture();
    const id = await f.coach.mutation(api.announcements.create, { body: "Original", pin: false });
    const invalid: [{ title?: string; body: string; showUntil?: number }, string][] = [
      [{ body: " \n " }, "Write a message"],
      [{ body: "x".repeat(501) }, "500 characters"],
      [{ title: "t".repeat(81), body: "ok" }, "80 characters"],
      [{ body: "ok", showUntil: Date.now() - 1000 }, "hasn't passed"],
      [{ body: "ok", showUntil: Number.POSITIVE_INFINITY }, "hasn't passed"],
    ];
    for (const [args, message] of invalid) {
      await expect(f.coach.mutation(api.announcements.create, { ...args, pin: false })).rejects.toThrow(message);
      await expect(f.coach.mutation(api.announcements.update, { ...args, id })).rejects.toThrow(message);
    }
    expect(await f.get(id)).toMatchObject({ body: "Original" });
  });

  it("stores trimmed text at the limits, keeps an unchanged past date and refuses removed or earlier-season messages", async () => {
    const f = await fixture();
    const showUntil = Date.now() + DAY;
    const id = await f.coach.mutation(api.announcements.create, { title: `  ${"t".repeat(80)}  `, body: `\n${"b".repeat(500)}  `, showUntil, pin: false });
    expect(await f.get(id)).toMatchObject({ title: "t".repeat(80), body: "b".repeat(500), showUntil });
    await f.coach.mutation(api.announcements.update, { id, title: "   ", body: "Shorter" });
    const cleared = await f.get(id);
    expect(cleared).toMatchObject({ body: "Shorter" });
    expect(cleared).not.toHaveProperty("title");
    expect(cleared).not.toHaveProperty("showUntil");

    const lapsed = await f.insert({ showUntil: 1 });
    await f.coach.mutation(api.announcements.update, { id: lapsed, body: "Fixed a typo", showUntil: 1 });
    expect(await f.get(lapsed)).toMatchObject({ body: "Fixed a typo", showUntil: 1 });
    await expect(f.coach.mutation(api.announcements.update, { id: lapsed, body: "Fixed a typo", showUntil: 2 })).rejects.toThrow("hasn't passed");

    await f.coach.mutation(api.announcements.archive, { id });
    const earlier = await f.insert({ seasonId: f.ids.oldSeason });
    for (const [target, message] of [[id, "was removed"], [earlier, "earlier season"]] as const) {
      await expect(f.coach.mutation(api.announcements.update, { id: target, body: "Again" })).rejects.toThrow(message);
      await expect(f.coach.mutation(api.announcements.pin, { id: target })).rejects.toThrow(message);
      await expect(f.coach.mutation(api.announcements.archive, { id: target })).rejects.toThrow(message);
    }
  });
});

describe("listForStaff", () => {
  it("lists every pin and the newest twenty unpinned messages, leaving out removed ones", async () => {
    const f = await fixture();
    const unpinned = [];
    for (let index = 1; index <= 22; index++) unpinned.push(await f.insert({ body: `Note ${index}`, createdAt: index }));
    const firstPin = await f.insert({ pinned: true, pinnedAt: 10, createdAt: 30 });
    const secondPin = await f.insert({ pinned: true, pinnedAt: 20, createdAt: 31 });
    await f.insert({ archivedAt: 40, createdAt: 40 });
    const list = await f.lead.query(api.announcements.listForStaff, {});
    expect(list.pinned.map(row => row.id)).toEqual([secondPin, firstPin]);
    expect(list.notPinned.map(row => row.id)).toEqual(unpinned.slice(2).reverse());
    expect(list).toMatchObject({ moreNotPinned: true, pinLimit: 5 });
    expect(list.notPinned[0]).toEqual({ id: unpinned[21], title: null, body: "Note 22", authorName: "Casey Coach", authorRole: "coach", pinned: false, pinnedAt: null, showUntil: null, createdAt: 22, updatedAt: 1 });
  });
});
