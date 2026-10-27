/// <reference types="vite/client" />
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { DEVELOPER_SIGN_IN_CLOUD_URL, developerEmail } from "./lib/developerSignIn";
import { DEFAULT_ROOM_TYPE, SCENARIO_PREFIX, SCENARIO_TEAMMATE_EMAIL } from "./developerScenarios";

const modules = import.meta.glob("./**/*.ts");
const KEY = "k".repeat(40);
const DAY = 86_400_000;
const apply = internal.developerScenarios.apply;
const STATES = ["busyWeek", "allDone", "newStudent", "reset"] as const;
const SCENARIOS = [...STATES, "forget"] as const;
type Scenario = (typeof SCENARIOS)[number];
/** Every table a scenario may write, except the audit trail (one entry per run by design). */
const TABLES = ["events", "participants", "requirements", "requirementCompletions", "charges", "ledgerEntries", "chargeRevisions", "financialOperationJobs", "financialAccounts", "studentFinanceSummaries", "feeDefinitions", "roomGroups", "roomMemberships", "roomInvites", "roomRequests", "teamAnnouncements", "familyLinks", "students", "appUsers"] as const;
const NOTHING_CREATED = { events: 0, requirements: 0, teammates: 0, roomGroups: 0, roomInvitations: 0, announcements: 0, fees: 0 };

afterEach(() => vi.unstubAllEnvs());

function enable(overrides: { url?: string; enabled?: string; key?: string } = {}) {
  vi.stubEnv("CONVEX_CLOUD_URL", overrides.url ?? DEVELOPER_SIGN_IN_CLOUD_URL);
  vi.stubEnv("DEVELOPER_SIGN_IN_ENABLED", overrides.enabled ?? "true");
  vi.stubEnv("DEVELOPER_SIGN_IN_KEY", overrides.key ?? KEY);
}

/** A real-looking synthetic team: another Coach, another Student with a Parent, an event and a pinned message, plus the developer personas. */
async function fixture(options: { roomCategory?: "Boys" | "Girls"; otherPins?: number; leftoverPin?: boolean; devCoachPin?: boolean } = {}) {
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
  const pins = await t.run(async ctx => {
    if (options.roomCategory) await ctx.db.patch("students", studentId, { roomCategory: options.roomCategory, roomCategoryLocked: true });
    const devCoach = (await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", developerEmail("coach"))).unique())!;
    const pin = (title: string) => ctx.db.insert("teamAnnouncements", { seasonId: ids.season, title, body: "Synthetic message.", authorId: devCoach._id, authorRole: "coach", pinned: true, pinnedAt: 99, createdAt: 99, updatedAt: 99 });
    return { leftover: options.leftoverPin ? await pin(`${SCENARIO_PREFIX}Older message`) : null, devCoachPin: options.devCoachPin ? await pin("Dev Coach notice") : null };
  });
  const signIn = async (email: string) => {
    const authUserId = await t.run(async ctx => (await ctx.db.query("users").withIndex("email", q => q.eq("email", email)).unique())!._id);
    return t.withIdentity({ subject: `${authUserId}|session` });
  };
  return { t, ids, studentId, ...pins, student: await signIn(developerEmail("student")), devCoach: await signIn(developerEmail("coach")), coach: await signIn("scenario-other-coach@example.invalid") };
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
const devStudent = (f: Fixture) => f.t.run(async ctx => (await ctx.db.get("students", f.studentId))!);
const teammate = (f: Fixture) => f.t.run(ctx => ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", f.ids.season).eq("email", SCENARIO_TEAMMATE_EMAIL)).unique());
const jordanInvite = (f: Fixture) => f.t.run(async ctx => (await ctx.db.query("roomInvites").withIndex("by_studentId", q => q.eq("studentId", f.studentId)).order("desc").first())!);

/** Runs a scenario twice and proves the second run changes nothing but the audit trail. */
async function applyTwice(f: Fixture, scenario: Scenario) {
  const first = await f.t.mutation(apply, { scenario });
  const after = await snapshot(f);
  const second = await f.t.mutation(apply, { scenario });
  expect(await snapshot(f), `${scenario} is repeatable`).toEqual(after);
  expect(second.eventIds).toEqual(first.eventIds);
  expect(second.created).toEqual(NOTHING_CREATED);
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
    ["no active season", (f: Fixture) => f.t.run(ctx => ctx.db.patch("seasons", f.ids.season, { status: "archived" })), "active season"],
    ["an open season change", (f: Fixture) => f.t.run(ctx => ctx.db.insert("seasonTransitionPlans", { sourceSeasonId: f.ids.season, targetName: "Next", targetCompetitionYear: 2028, targetStartDate: "2027-08-01", targetEndDate: "2028-07-31", state: "draft", open: true, revision: 1, createdBy: f.ids.coach, updatedBy: f.ids.coach, createdAt: 0, updatedAt: 0, idempotencyKey: "synthetic-plan", requestHash: "synthetic" })), "season change is open"],
    ["season fees still updating", (f: Fixture) => f.t.run(ctx => ctx.db.insert("seasonFinanceControls", { seasonId: f.ids.season, revision: 1, state: "applying", updatedAt: 0 })), "Season fees are updating"],
    ["a deactivated Dev Coach", (f: Fixture) => f.t.run(async ctx => ctx.db.patch("appUsers", (await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", developerEmail("coach"))).unique())!._id, { active: false })), "missing or changed"],
    ["a deactivated Dev Parent", (f: Fixture) => f.t.run(async ctx => ctx.db.patch("appUsers", (await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", developerEmail("parentStaff"))).unique())!._id, { active: false })), "missing or changed"],
    ["a deactivated Dev Student record", (f: Fixture) => f.t.run(ctx => ctx.db.patch("students", f.studentId, { active: false })), "missing or changed"],
  ] as const)("refuses on %s and changes nothing", async (_label, arrange, message) => {
    const f = await fixture();
    await arrange(f);
    const before = await snapshot(f);
    for (const scenario of SCENARIOS) await expect(f.t.mutation(apply, { scenario }), scenario).rejects.toThrow(message);
    expect(await snapshot(f)).toEqual(before);
    expect(await scenarioMarkers(f)).toEqual([]);
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
    expect(busy).toMatchObject({ created: { events: 3, requirements: 2, teammates: 1, roomGroups: 1, roomInvitations: 1, announcements: 2, fees: 2 }, balanceDueCents: 12_500, teammateOtherEvents: [] });
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
    expect(view.signups.map(row => ({ id: row.eventId, type: row.type, feeCents: row.feeCents, signupMode: row.signupMode }))).toEqual([{ id: outreach, type: "Outreach", feeCents: 1_000, signupMode: "open" }, { id: team, type: "Team", feeCents: 0, signupMode: "approval" }]);
    // The signup sheet: Outreach signs up at once within a small capacity; the Team event waits for approval.
    expect(await f.student.query(api.participation.signupAvailability, { eventId: outreach })).toMatchObject({ outcome: "signedUp", feeCents: 1_000, capacity: 10, spotsLeft: 10 });
    expect(await f.student.query(api.participation.signupAvailability, { eventId: team })).toMatchObject({ outcome: "waitingForApproval", signupMode: "approval" });
    expect(view.rooms).toEqual([expect.objectContaining({ eventId: competition, status: "notChosen", invitations: [expect.objectContaining({ fromName: "Jordan W.", initials: "JW" })] })]);
    expect(view.pinnedTitles.sort()).toEqual([`${SCENARIO_PREFIX}Choose your room`, `${SCENARIO_PREFIX}Safety glasses`]);
    expect(JSON.stringify(view.summary)).not.toContain(SCENARIO_TEAMMATE_EMAIL);

    // The Student signs up during a demo; busyWeek then starts a fresh week and cancels the old SCENARIO fees.
    expect(await f.student.mutation(api.participation.signUp, { eventId: outreach })).toBe("confirmed");
    const again = await f.t.mutation(apply, { scenario: "busyWeek" });
    expect(again.eventIds.some(id => busy.eventIds.includes(id))).toBe(false);
    expect(again.changed).toMatchObject({ eventsCanceled: 3, feesCanceled: 3, canceledCents: 12_500 * 2 + 1_000, announcementsArchived: 2, roomTypesSet: 0 });
    view = await home(f);
    expect(view.dueCents).toBe(12_500);
    expect(view.signups.map(row => row.eventId)).toEqual(again.eventIds.slice(1));

    // A Team signup waits for a Coach on Home until allDone approves it the way a Coach would.
    const freshTeam = again.eventIds[2];
    expect(await f.student.mutation(api.participation.signUp, { eventId: freshTeam })).toBe("pending");
    expect((await home(f)).items.filter(item => item.kind === "signupApproval")).toEqual([expect.objectContaining({ key: `signupApproval:${freshTeam}`, owner: "coach" })]);

    const done = await applyTwice(f, "allDone");
    expect(done).toMatchObject({ eventIds: again.eventIds, roomChoice: "invitationAccepted", balanceDueCents: 0, changed: { requirementsCompleted: 2, signupsApproved: 1, feesCanceled: 1, signupsClosed: 2, announcementsUnpinned: 1 } });
    view = await home(f);
    expect(view.dueCents).toBe(0);
    expect(view.items).toEqual([]);
    expect(view.signups.every(row => row.signupClosesAt !== null && row.signupClosesAt <= Date.now())).toBe(true);
    expect(view.rooms).toEqual([expect.objectContaining({ status: "inGroup", groupName: `${SCENARIO_PREFIX}Jordan's room`, memberNames: ["Jordan W."], invitations: [] })]);
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
    expect(reset).toMatchObject({ eventIds: [], changed: { parentLinksRestored: 2 }, teammateOtherEvents: [] });
    expect(reset.notes.join(" ")).toContain("append-only");
    view = await home(f);
    expect(view.summary.parentLinked).toBe(true);
    expect(view.summary.whatsLeft.filter(item => item.kind === "inviteParent")).toEqual([]);
    const jordan = await teammate(f);
    expect(jordan).toMatchObject({ active: false, travelTeam: false, roomCategory: DEFAULT_ROOM_TYPE, preferredName: "Jordan", legalName: `${SCENARIO_PREFIX}Jordan Writer` });
    expect(jordan?.userId).toBeUndefined();

    // Back to a busy week after reset: the teammate returns and the Balance due comes back.
    expect(await f.t.mutation(apply, { scenario: "busyWeek" })).toMatchObject({ created: { events: 3, teammates: 0 }, changed: { teammateRestored: 1, roomTypesSet: 0 }, balanceDueCents: 12_500 });
    expect(await others()).toEqual(untouched);
  });

  it.each([
    {
      scenario: "allDone" as const,
      result: { created: { events: 3, teammates: 1, roomGroups: 1, roomInvitations: 1, fees: 2 }, changed: { roomTypesSet: 1, requirementsCompleted: 2, feesCanceled: 1, signupsClosed: 2 }, roomChoice: "invitationAccepted", balanceDueCents: 0 },
      home: { parentLinked: true, inviteParent: 0, items: [], rooms: [{ status: "inGroup", memberNames: ["Jordan W."], invitations: 0 }], pinned: [`${SCENARIO_PREFIX}Safety glasses`], dueCents: 0, openSignups: 2 },
    },
    {
      scenario: "newStudent" as const,
      result: { eventIds: [], created: NOTHING_CREATED, changed: { parentLinksRemoved: 2, teammateDeactivated: 0, eventsCanceled: 0, roomTypesSet: 0 }, roomChoice: null },
      home: { parentLinked: false, inviteParent: 1, items: [], rooms: [], pinned: [], dueCents: 0, openSignups: 0 },
    },
  ])("starts from a clean state with $scenario and repeats it without changes", async ({ scenario, result, home: expected }) => {
    const f = await fixture();
    expect(await applyTwice(f, scenario)).toMatchObject(result);
    const view = await home(f);
    expect({
      parentLinked: view.summary.parentLinked, inviteParent: view.summary.whatsLeft.filter(item => item.kind === "inviteParent").length, items: view.items,
      rooms: view.rooms.map(row => ({ status: row.status, memberNames: row.memberNames, invitations: row.invitations.length })),
      pinned: view.pinnedTitles, dueCents: view.dueCents, openSignups: view.signups.length,
    }).toEqual(expected);
  });

  it("gives a Dev Student without a Room type one first, so Jordan's invitation is one the app accepts", async () => {
    const f = await fixture();
    expect((await devStudent(f)).roomCategory).toBeUndefined();
    const busy = await f.t.mutation(apply, { scenario: "busyWeek" });
    expect(busy.changed.roomTypesSet).toBe(1);
    expect(busy.notes.some(text => text.startsWith("The Dev Student had no Room type"))).toBe(true);
    // The same record a Coach's roster change leaves: Room type locked, one more profile change, an audit entry by the Dev Coach.
    expect(await devStudent(f)).toMatchObject({ roomCategory: DEFAULT_ROOM_TYPE, roomCategoryLocked: true, profileRevision: 1 });
    const audits = await f.t.run(ctx => ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", "students").eq("entityId", f.studentId)).take(10));
    const devCoachId = await f.t.run(async ctx => (await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", developerEmail("coach"))).unique())!._id);
    expect(audits.map(row => ({ action: row.action, actorId: row.actorId }))).toEqual([{ action: "updateRoster", actorId: devCoachId }]);
    expect(await teammate(f)).toMatchObject({ roomCategory: DEFAULT_ROOM_TYPE, travelTeam: false, active: true });

    // rooms.respond accepts the invitation for the Dev Student, and Home shows the room as chosen.
    const [invitation] = (await home(f)).rooms[0].invitations;
    await f.student.mutation(api.rooms.respond, { inviteId: invitation.inviteId, accept: true });
    let view = await home(f);
    expect(view.rooms).toEqual([expect.objectContaining({ status: "inGroup", memberNames: ["Jordan W."], invitations: [] })]);
    expect(view.items.some(item => item.kind === "roomChoice")).toBe(false);
    expect(await f.t.mutation(apply, { scenario: "allDone" })).toMatchObject({ roomChoice: "alreadyChosen", changed: { roomTypesSet: 0 } });
    view = await home(f);
    expect(view.rooms[0].status).toBe("inGroup");
    expect(view.items).toEqual([]);
  });

  it.each([
    { name: "Jordan's invitation is still open", roomCategory: undefined, act: async () => {}, roomTypesSet: 1, roomChoice: "invitationAccepted", status: "inGroup", note: null },
    { name: "a Coach gave the Dev Student a Room type earlier", roomCategory: "Girls" as const, act: async () => {}, roomTypesSet: 0, roomChoice: "invitationAccepted", status: "inGroup", note: null },
    { name: "the Dev Student declined Jordan's invitation", roomCategory: undefined, act: async (f: Fixture) => { await f.student.mutation(api.rooms.respond, { inviteId: (await jordanInvite(f))._id, accept: false }); }, roomTypesSet: 1, roomChoice: "assignmentRequested", status: "assignmentRequested", note: "already answered" },
    { name: "a Coach finalized Jordan's room", roomCategory: undefined, act: async (f: Fixture) => { await f.devCoach.mutation(api.rooms.finalize, { groupId: (await jordanInvite(f)).groupId, allowFifth: false }); }, roomTypesSet: 1, roomChoice: "assignmentRequested", status: "assignmentRequested", note: "room is final" },
    { name: "a Coach changed the Dev Student's Room type", roomCategory: undefined, act: async (f: Fixture) => { await f.devCoach.mutation(api.admin.updateRoster, { studentId: f.studentId, expectedRevision: (await devStudent(f)).profileRevision, reason: "Synthetic correction", roomCategory: "Girls" }); }, roomTypesSet: 1, roomChoice: "assignmentRequested", status: "assignmentRequested", note: "Room type differs" },
  ])("allDone chooses the room when $name", async ({ roomCategory, act, roomTypesSet, roomChoice, status, note }) => {
    const f = await fixture({ roomCategory });
    expect((await f.t.mutation(apply, { scenario: "busyWeek" })).changed.roomTypesSet).toBe(roomTypesSet);
    await act(f);
    const done = await f.t.mutation(apply, { scenario: "allDone" });
    expect(done.roomChoice).toBe(roomChoice);
    expect(done.notes.filter(text => text.startsWith("Jordan's room invitation could not be accepted"))).toEqual(note ? [expect.stringContaining(note)] : []);
    const view = await home(f);
    expect(view.rooms).toEqual([expect.objectContaining({ status, invitations: [] })]);
    expect(view.items).toEqual([]);
  });

  it("keeps the teammate off Travel Team events and reports its signups outside SCENARIO without changing them", async () => {
    const f = await fixture();
    await f.t.mutation(apply, { scenario: "busyWeek" });
    const jordan = (await teammate(f))!;
    const trip = await f.coach.mutation(api.admin.createEvent, { name: "Synthetic Travel Team trip", type: "Competition", startsAt: Date.now() + 40 * DAY, endsAt: Date.now() + 41 * DAY, destination: "Synthetic venue", travel: "Charter Bus", overnight: false, roomingEnabled: false, feeCents: 2_000, signupMode: "assigned", assignmentScope: "travelTeam", allowWithdrawal: true, permissionRequired: false, firstRequired: false, requirements: [] });
    const assigned = await f.t.run(async ctx => (await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", trip)).take(10)).map(row => row.studentId));
    expect(assigned).toContain(f.ids.other);
    expect(assigned).not.toContain(jordan._id);
    // Whole Team events still include every active student; a Coach signing Jordan up stands in for that here.
    await f.coach.mutation(api.participation.setParticipation, { eventId: f.ids.otherEvent, studentId: jordan._id, status: "confirmed" });
    const reset = await f.t.mutation(apply, { scenario: "reset" });
    expect(reset.teammateOtherEvents).toEqual([{ eventId: f.ids.otherEvent, name: "Synthetic Overnight", status: "confirmed" }]);
    expect(reset.notes.some(text => text.includes("outside SCENARIO"))).toBe(true);
    const signup = await f.t.run(ctx => ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", f.ids.otherEvent).eq("studentId", jordan._id)).unique());
    expect(signup?.status).toBe("confirmed");
  });

  it.each([
    { name: "a SCENARIO event was renamed", tamper: (f: Fixture, eventId: Id<"events">) => f.t.run(ctx => ctx.db.patch("events", eventId, { name: "Regional Competition" })), forgetRecovers: true },
    { name: "the teammate became a sign-in account", tamper: (f: Fixture) => f.t.run(async ctx => {
      const row = (await ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", f.ids.season).eq("email", SCENARIO_TEAMMATE_EMAIL)).unique())!;
      await ctx.db.patch("students", row._id, { userId: f.ids.coach });
    }), forgetRecovers: false },
  ])("stops without changes when $name; forget clears only the tool's memory", async ({ tamper, forgetRecovers }) => {
    const f = await fixture();
    const { eventIds } = await f.t.mutation(apply, { scenario: "busyWeek" });
    await tamper(f, eventIds[0]);
    const before = await snapshot(f);
    for (const scenario of STATES) await expect(f.t.mutation(apply, { scenario }), scenario).rejects.toThrow("changed outside this tool");
    expect(await snapshot(f)).toEqual(before);

    const markers = (await scenarioMarkers(f)).length;
    const forgot = await f.t.mutation(apply, { scenario: "forget" });
    expect(forgot).toMatchObject({ scenario: "forget", eventIds: [], created: NOTHING_CREATED, roomChoice: null, teammateOtherEvents: [] });
    expect(Object.values(forgot.changed).every(count => count === 0)).toBe(true);
    expect(forgot.notes.join(" ")).toContain("no longer remembers");
    expect(await snapshot(f), "forget writes only its audit marker").toEqual(before);
    expect(await scenarioMarkers(f)).toHaveLength(markers + 1);

    if (!forgetRecovers) {
      await expect(f.t.mutation(apply, { scenario: "busyWeek" })).rejects.toThrow("fictional teammate");
      return;
    }
    const fresh = await f.t.mutation(apply, { scenario: "busyWeek" });
    expect(fresh.created.events).toBe(3);
    expect(fresh.eventIds.some(id => eventIds.includes(id))).toBe(false);
    // Forgotten records stay exactly as they were for a Coach to clean up.
    const forgotten = await f.t.run(ctx => Promise.all(eventIds.map(id => ctx.db.get("events", id))));
    expect(forgotten.map(event => event?.cancelled ?? false)).toEqual([false, false, false]);
  });

  it.each([
    { name: "room for both", otherPins: 3, leftoverPin: false, devCoachPin: false, ours: 2, leftoverPinned: null },
    { name: "room for one", otherPins: 4, leftoverPin: false, devCoachPin: false, ours: 1, leftoverPinned: null },
    { name: "an older SCENARIO pin makes room", otherPins: 4, leftoverPin: true, devCoachPin: false, ours: 1, leftoverPinned: false },
    { name: "five other pins stay pinned", otherPins: 5, leftoverPin: false, devCoachPin: false, ours: 0, leftoverPinned: null },
    { name: "a Dev Coach pin outside SCENARIO stays pinned", otherPins: 4, leftoverPin: false, devCoachPin: true, ours: 0, leftoverPinned: null },
  ])("keeps the five-pin limit: $name", async ({ otherPins, leftoverPin, devCoachPin, ours, leftoverPinned }) => {
    const f = await fixture({ otherPins, leftoverPin, devCoachPin });
    const result = await f.t.mutation(apply, { scenario: "busyWeek" });
    const state = await f.t.run(async ctx => ({
      others: await Promise.all(f.ids.otherPins.map(async id => (await ctx.db.get("teamAnnouncements", id))?.pinned)),
      leftover: f.leftover ? (await ctx.db.get("teamAnnouncements", f.leftover))?.pinned ?? null : null,
      devCoachPin: f.devCoachPin ? (await ctx.db.get("teamAnnouncements", f.devCoachPin))?.pinned ?? null : null,
      pinned: await ctx.db.query("teamAnnouncements").withIndex("by_seasonId_and_pinned_and_pinnedAt", q => q.eq("seasonId", f.ids.season).eq("pinned", true)).take(10),
    }));
    expect(state.others.every(Boolean)).toBe(true);
    expect(state.leftover).toBe(leftoverPinned);
    expect(state.devCoachPin).toBe(devCoachPin ? true : null);
    expect(state.pinned.length).toBeLessThanOrEqual(5);
    expect(result.changed.announcementsPinned).toBe(ours);
    expect(result.notes.some(text => text.startsWith("Five other announcements"))).toBe(ours < 2);
  });
});
