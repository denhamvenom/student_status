/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { DEVELOPER_SIGN_IN_CLOUD_URL, developerEmail } from "./lib/developerSignIn";
import { SCENARIO_PREFIX, SCENARIO_TEAMMATE_EMAIL } from "./developerScenarios";

const modules = import.meta.glob("./**/*.ts");
const KEY = "k".repeat(40);
const DAY = 86_400_000;
const apply = internal.developerScenarios.apply;
const SCENARIOS = ["busyWeek", "allDone", "newStudent", "reset"] as const;
type Scenario = (typeof SCENARIOS)[number];
/** Every table a scenario may write, except the audit trail (one entry per run by design). */
const TABLES = ["events", "participants", "requirements", "requirementCompletions", "charges", "ledgerEntries", "chargeRevisions", "financialOperationJobs", "financialAccounts", "studentFinanceSummaries", "feeDefinitions", "roomGroups", "roomMemberships", "roomInvites", "roomRequests", "teamAnnouncements", "familyLinks", "students", "appUsers"] as const;

afterEach(() => vi.unstubAllEnvs());

function enable(overrides: { url?: string; enabled?: string; key?: string } = {}) {
  vi.stubEnv("CONVEX_CLOUD_URL", overrides.url ?? DEVELOPER_SIGN_IN_CLOUD_URL);
  vi.stubEnv("DEVELOPER_SIGN_IN_ENABLED", overrides.enabled ?? "true");
  vi.stubEnv("DEVELOPER_SIGN_IN_KEY", overrides.key ?? KEY);
}

/** A real-looking synthetic team: another Coach, another Student with a Parent, an event and a pinned message, plus the developer personas. */
async function fixture(options: { roomCategory?: "Boys" | "Girls"; otherPins?: number; leftoverPin?: boolean } = {}) {
  enable();
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const user = async (key: string, role: Doc<"appUsers">["role"], name: string) => {
      const authUserId = await ctx.db.insert("users", { email: `${key}@example.invalid` });
      return await ctx.db.insert("appUsers", { authUserId, email: `${key}@example.invalid`, name, role, travelLead: false, financialEdit: role === "coach", active: true });
    };
    const coach = await user("scenario-other-coach", "coach", "Synthetic Coach");
    const parent = await user("scenario-other-parent", "parent", "Synthetic Parent");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, status: "active", startsAt: Date.now() - 60 * DAY, permissionVersion: "DRAFT", createdBy: coach });
    const other = await ctx.db.insert("students", { seasonId: season, legalName: "Casey Morgan Example", preferredName: "Casey", email: "casey@example.invalid", subteam: "Build", active: true, travelTeam: true, roomCategory: "Girls", roomCategoryLocked: true, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const otherLink = await ctx.db.insert("familyLinks", { parentUserId: parent, studentId: other, seasonId: season, active: true, createdBy: coach });
    const otherEvent = await ctx.db.insert("events", { seasonId: season, name: "Synthetic Overnight", type: "Competition", startsAt: Date.now() + 10 * DAY, endsAt: Date.now() + 12 * DAY, destination: "Synthetic venue", travel: "Charter Bus", overnight: true, roomingEnabled: true, roomDeadline: Date.now() + 5 * DAY, feeCents: 0, signupMode: "assigned", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    const otherSignup = await ctx.db.insert("participants", { eventId: otherEvent, studentId: other, status: "confirmed", createdAt: 1, updatedAt: 1 });
    const otherPins: Id<"teamAnnouncements">[] = [];
    for (let i = 0; i < (options.otherPins ?? 1); i++) otherPins.push(await ctx.db.insert("teamAnnouncements", { seasonId: season, title: `Synthetic notice ${i}`, body: "Bring water.", authorId: coach, authorRole: "coach", pinned: true, pinnedAt: i + 1, createdAt: i + 1, updatedAt: i + 1 }));
    return { coach, season, other, otherLink, otherEvent, otherSignup, otherPins };
  });
  const { studentId } = await t.mutation(internal.developerSignIn.ensurePersonas, {});
  const leftover = await t.run(async ctx => {
    if (options.roomCategory) await ctx.db.patch("students", studentId, { roomCategory: options.roomCategory, roomCategoryLocked: true });
    if (!options.leftoverPin) return null;
    const devCoach = (await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", developerEmail("coach"))).unique())!;
    return await ctx.db.insert("teamAnnouncements", { seasonId: ids.season, title: `${SCENARIO_PREFIX}Older message`, body: "Left from an earlier run.", authorId: devCoach._id, authorRole: "coach", pinned: true, pinnedAt: 99, createdAt: 99, updatedAt: 99 });
  });
  const authUserId = await t.run(async ctx => (await ctx.db.query("users").withIndex("email", q => q.eq("email", developerEmail("student"))).unique())!._id);
  return { t, ids, studentId, leftover, student: t.withIdentity({ subject: `${authUserId}|session` }) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

async function snapshot(f: Fixture) {
  return await f.t.run(async ctx => {
    const rows: Record<string, unknown[]> = {};
    for (const table of TABLES) rows[table] = await ctx.db.query(table).take(500);
    return rows;
  });
}
const scenarioMarkers = (f: Fixture) => f.t.run(ctx => ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", "developerScenarios").eq("entityId", f.ids.season)).take(50));

/** Runs a scenario twice and proves the second run changes nothing but the audit trail. */
async function applyTwice(f: Fixture, scenario: Scenario) {
  const first = await f.t.mutation(apply, { scenario });
  const after = await snapshot(f);
  const second = await f.t.mutation(apply, { scenario });
  expect(await snapshot(f), `${scenario} is repeatable`).toEqual(after);
  expect(second.eventIds).toEqual(first.eventIds);
  expect(second.created).toEqual({ events: 0, requirements: 0, teammates: 0, roomGroups: 0, roomInvitations: 0, announcements: 0, fees: 0 });
  return first;
}

/** What the Dev Student sees: Home, Money and pinned messages, limited to SCENARIO records where it matters. */
async function home(f: Fixture) {
  const summary = await f.student.query(api.studentHome.summary, { asOfDay: new Date().toISOString().slice(0, 10) });
  const finance = await f.student.query(api.dashboardReports.familyFinance, { studentId: f.studentId });
  const pinned = await f.student.query(api.announcements.pinnedForHome, {});
  const scenarioEvent = (name: string | null) => !!name?.startsWith(SCENARIO_PREFIX);
  return {
    summary,
    dueCents: finance.state === "ready" ? finance.dueCents : null,
    items: summary.whatsLeft.filter(item => scenarioEvent(item.eventName)),
    signups: summary.openSignups.filter(row => scenarioEvent(row.name)),
    rooms: summary.roomChoices.filter(row => scenarioEvent(row.eventName)),
    pinnedTitles: pinned.map(row => row.title).filter(title => scenarioEvent(title)),
  };
}

describe("developer scenarios", () => {
  it.each([
    ["a different deployment", () => enable({ url: "https://amicable-eel-413.convex.cloud" }), "development-only"],
    ["developer sign-in switched off", () => enable({ enabled: "false" }), "disabled"],
    ["a missing developer key", () => enable({ key: "" }), "disabled"],
  ])("refuses on %s and changes nothing", async (_label, arrange, message) => {
    const f = await fixture();
    const before = await snapshot(f);
    arrange();
    for (const scenario of SCENARIOS) await expect(f.t.mutation(apply, { scenario })).rejects.toThrow(message);
    expect(await snapshot(f)).toEqual(before);
    expect(await scenarioMarkers(f)).toEqual([]);
  });

  it("refuses without an active season", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch("seasons", f.ids.season, { status: "archived" }));
    const before = await snapshot(f);
    for (const scenario of SCENARIOS) await expect(f.t.mutation(apply, { scenario })).rejects.toThrow("active season");
    expect(await snapshot(f)).toEqual(before);
  });

  it("moves the Dev Student's Home through every state, repeatably, without touching anyone else", async () => {
    const f = await fixture();
    const others = () => f.t.run(async ctx => ({
      student: await ctx.db.get("students", f.ids.other), link: await ctx.db.get("familyLinks", f.ids.otherLink), event: await ctx.db.get("events", f.ids.otherEvent),
      signup: await ctx.db.get("participants", f.ids.otherSignup), pins: await Promise.all(f.ids.otherPins.map(id => ctx.db.get("teamAnnouncements", id))),
      coach: await ctx.db.get("appUsers", f.ids.coach),
      otherFees: await ctx.db.query("charges").withIndex("by_studentId_and_priority", q => q.eq("studentId", f.ids.other)).take(10),
    }));
    const untouched = await others();
    const now = Date.now();

    const busy = await applyTwice(f, "busyWeek");
    const [competition, outreach, team] = busy.eventIds;
    expect(busy).toMatchObject({ created: { events: 3, requirements: 2, teammates: 1, roomGroups: 1, roomInvitations: 1, announcements: 2, fees: 2 }, balanceDueCents: 12_500 });
    let view = await home(f);
    expect(view.dueCents).toBe(12_500);
    expect(view.items.map(({ key, kind, owner }) => ({ key, kind, owner })).sort((a, b) => a.key.localeCompare(b.key))).toEqual([
      { key: `payment:${competition}`, kind: "requiredPayment", owner: "parent" },
      { key: `requirement:${competition}:scenario-packet`, kind: "requirement", owner: "student" },
      { key: `requirement:${competition}:scenario-packing`, kind: "requirement", owner: "student" },
      { key: `room:${competition}`, kind: "roomChoice", owner: "student" },
    ]);
    const due = (key: string) => view.items.find(item => item.key === `requirement:${competition}:${key}`)?.dueAt ?? 0;
    expect(due("scenario-packet")).toBeLessThan(now - DAY);
    expect(due("scenario-packing")).toBeGreaterThan(now + 2 * DAY);
    expect(due("scenario-packing")).toBeLessThan(now + 4 * DAY);
    expect(view.signups.map(row => ({ id: row.eventId, type: row.type, feeCents: row.feeCents }))).toEqual([{ id: outreach, type: "Outreach", feeCents: 1_000 }, { id: team, type: "Team", feeCents: 0 }]);
    expect(view.rooms).toEqual([expect.objectContaining({ eventId: competition, status: "notChosen", invitations: [expect.objectContaining({ fromName: "Jordan W.", initials: "JW" })] })]);
    expect(view.pinnedTitles.sort()).toEqual([`${SCENARIO_PREFIX}Choose your room`, `${SCENARIO_PREFIX}Safety glasses`]);
    expect(JSON.stringify(view.summary)).not.toContain(SCENARIO_TEAMMATE_EMAIL);

    // The Student signs up during a demo; busyWeek then starts a fresh week and cancels the old SCENARIO fees.
    expect(await f.student.mutation(api.participation.signUp, { eventId: outreach })).toBe("confirmed");
    const again = await f.t.mutation(apply, { scenario: "busyWeek" });
    expect(again.eventIds.some(id => busy.eventIds.includes(id))).toBe(false);
    expect(again.changed).toMatchObject({ eventsCanceled: 3, feesCanceled: 3, canceledCents: 12_500 * 2 + 1_000, announcementsArchived: 2 });
    view = await home(f);
    expect(view.dueCents).toBe(12_500);
    expect(view.signups.map(row => row.eventId)).toEqual(again.eventIds.slice(1));

    const done = await applyTwice(f, "allDone");
    expect(done).toMatchObject({ eventIds: again.eventIds, roomChoice: "assignmentRequested", balanceDueCents: 0, changed: { requirementsCompleted: 2, feesCanceled: 1, signupsClosed: 2, announcementsUnpinned: 1 } });
    view = await home(f);
    expect(view.dueCents).toBe(0);
    expect(view.items).toEqual([]);
    expect(view.signups.every(row => row.signupClosesAt !== null && row.signupClosesAt <= Date.now())).toBe(true);
    expect(view.rooms).toEqual([expect.objectContaining({ status: "assignmentRequested", invitations: [] })]);
    expect(view.pinnedTitles).toEqual([`${SCENARIO_PREFIX}Safety glasses`]);

    const fresh = await applyTwice(f, "newStudent");
    expect(fresh).toMatchObject({ eventIds: [], changed: { eventsCanceled: 3, parentLinksRemoved: 2, teammateDeactivated: 1, announcementsArchived: 2 } });
    view = await home(f);
    expect(view.summary.parentLinked).toBe(false);
    expect(view.summary.whatsLeft.filter(item => item.kind === "inviteParent")).toHaveLength(1);
    expect({ items: view.items, signups: view.signups, rooms: view.rooms, pinned: view.pinnedTitles, dueCents: view.dueCents }).toEqual({ items: [], signups: [], rooms: [], pinned: [], dueCents: 0 });
    const revoked = await f.t.run(ctx => ctx.db.query("familyLinks").withIndex("by_studentId", q => q.eq("studentId", f.studentId)).take(5));
    expect(revoked.map(link => ({ active: link.active, revoked: link.revokedAt !== undefined && link.revokedBy !== undefined }))).toEqual([{ active: false, revoked: true }, { active: false, revoked: true }]);

    const reset = await applyTwice(f, "reset");
    expect(reset).toMatchObject({ eventIds: [], changed: { parentLinksRestored: 2 } });
    expect(reset.notes.join(" ")).toContain("append-only");
    view = await home(f);
    expect(view.summary.parentLinked).toBe(true);
    expect(view.summary.whatsLeft.filter(item => item.kind === "inviteParent")).toEqual([]);
    const teammate = await f.t.run(ctx => ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", f.ids.season).eq("email", SCENARIO_TEAMMATE_EMAIL)).unique());
    expect(teammate).toMatchObject({ active: false, preferredName: "Jordan", legalName: `${SCENARIO_PREFIX}Jordan Writer` });
    expect(teammate?.userId).toBeUndefined();

    // Back to a busy week after reset: the teammate returns and the Balance due comes back.
    expect(await f.t.mutation(apply, { scenario: "busyWeek" })).toMatchObject({ created: { events: 3, teammates: 0 }, changed: { teammateRestored: 1 }, balanceDueCents: 12_500 });
    expect(await others()).toEqual(untouched);
  });

  it.each([
    ["a SCENARIO event was renamed", (f: Fixture, eventId: Id<"events">) => f.t.run(ctx => ctx.db.patch("events", eventId, { name: "Regional Competition" }))],
    ["the teammate became a sign-in account", (f: Fixture) => f.t.run(async ctx => {
      const teammate = (await ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", f.ids.season).eq("email", SCENARIO_TEAMMATE_EMAIL)).unique())!;
      await ctx.db.patch("students", teammate._id, { userId: f.ids.coach });
    })],
  ])("stops without changes when %s", async (_label, tamper) => {
    const f = await fixture();
    const { eventIds } = await f.t.mutation(apply, { scenario: "busyWeek" });
    await tamper(f, eventIds[0]);
    const before = await snapshot(f);
    for (const scenario of SCENARIOS) await expect(f.t.mutation(apply, { scenario })).rejects.toThrow("changed outside this tool");
    expect(await snapshot(f)).toEqual(before);
  });

  it("accepts Jordan's invitation when the Dev Student has the same Room type", async () => {
    const f = await fixture({ roomCategory: "Girls" });
    await f.t.mutation(apply, { scenario: "busyWeek" });
    expect(await f.t.mutation(apply, { scenario: "allDone" })).toMatchObject({ roomChoice: "invitationAccepted", notes: [] });
    const view = await home(f);
    expect(view.rooms).toEqual([expect.objectContaining({ status: "inGroup", groupName: `${SCENARIO_PREFIX}Jordan's room`, memberNames: ["Jordan W."], invitations: [] })]);
    expect(view.items).toEqual([]);
  });

  it.each([
    { name: "room for both", otherPins: 3, leftoverPin: false, ours: 2, leftoverPinned: null },
    { name: "room for one", otherPins: 4, leftoverPin: false, ours: 1, leftoverPinned: null },
    { name: "an older SCENARIO pin makes room", otherPins: 4, leftoverPin: true, ours: 1, leftoverPinned: false },
    { name: "five other pins stay pinned", otherPins: 5, leftoverPin: false, ours: 0, leftoverPinned: null },
  ])("keeps the five-pin limit: $name", async ({ otherPins, leftoverPin, ours, leftoverPinned }) => {
    const f = await fixture({ otherPins, leftoverPin });
    const result = await f.t.mutation(apply, { scenario: "busyWeek" });
    const state = await f.t.run(async ctx => ({
      others: await Promise.all(f.ids.otherPins.map(async id => (await ctx.db.get("teamAnnouncements", id))?.pinned)),
      leftover: f.leftover ? (await ctx.db.get("teamAnnouncements", f.leftover))?.pinned ?? null : null,
      pinned: await ctx.db.query("teamAnnouncements").withIndex("by_seasonId_and_pinned_and_pinnedAt", q => q.eq("seasonId", f.ids.season).eq("pinned", true)).take(10),
    }));
    expect(state.others.every(Boolean)).toBe(true);
    expect(state.leftover).toBe(leftoverPinned);
    expect(state.pinned.length).toBeLessThanOrEqual(5);
    expect(result.changed.announcementsPinned).toBe(ours);
    expect(result.notes.some(text => text.startsWith("Five other announcements"))).toBe(ours < 2);
  });
});
