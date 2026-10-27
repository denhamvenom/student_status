/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../testUtils";
import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import schema from "./schema";
import { createFinancialAccount } from "./lib/financialSources";

const modules = import.meta.glob("./**/*.ts");
const DAY = "2026-10-27";
const START = Date.parse("2026-11-07T14:00:00Z");
const HOUR = 3_600_000;

type EventFields = Partial<Omit<Doc<"events">, "_id" | "_creationTime" | "seasonId">>;
type Status = Doc<"participants">["status"];

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const account = async (key: string, role: Doc<"appUsers">["role"], name: string) => {
      const email = `${key}@example.invalid`;
      const authUserId = await ctx.db.insert("users", { email });
      const appUserId = await ctx.db.insert("appUsers", { authUserId, email, name, role, travelLead: false, financialEdit: false, active: true });
      return { authUserId, appUserId, email };
    };
    const coach = await account("home-coach", "coach", "Synthetic Coach");
    const mentor = await account("home-mentor", "mentor", "Synthetic Mentor");
    const parent = await account("home-parent", "parent", "Synthetic Parent");
    const rileyUser = await account("home-riley", "student", "Riley Example");
    const jordanUser = await account("home-jordan", "student", "Jordan Williams");
    const caseyUser = await account("home-casey", "student", "Casey Lee");
    const season = await ctx.db.insert("seasons", { name: "2026–27", year: 2027, status: "active", startsAt: Date.parse("2026-08-01T05:00:00Z"), permissionVersion: "DRAFT", createdBy: coach.appUserId });
    const student = (user: typeof rileyUser, legalName: string, firstName: string, lastName: string) => ctx.db.insert("students", { seasonId: season, userId: user.appUserId, legalName, preferredName: firstName, firstName, lastName, structuredNameReviewed: true, email: user.email, subteam: "Programming", active: true, travelTeam: true, roomCategory: "Girls", roomCategoryLocked: true, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    const riley = await student(rileyUser, "Riley Quinn Example", "Riley", "Example");
    const jordan = await student(jordanUser, "Jordan Avery Williams", "Jordan", "Williams");
    const casey = await student(caseyUser, "Casey Morgan Lee", "Casey", "Lee");
    const link = await ctx.db.insert("familyLinks", { parentUserId: parent.appUserId, studentId: riley, seasonId: season, active: true, createdBy: coach.appUserId });
    return { season, riley, jordan, casey, link, coach: coach.appUserId, parent: parent.appUserId, auth: { coach: coach.authUserId, mentor: mentor.authUserId, parent: parent.authUserId, riley: rileyUser.authUserId, jordan: jordanUser.authUserId, casey: caseyUser.authUserId } };
  });
  const as = (authUserId: Id<"users">) => t.withIdentity({ subject: `${authUserId}|session` });
  const event = (fields: EventFields = {}) => t.run(ctx => ctx.db.insert("events", { seasonId: ids.season, name: "Synthetic event", type: "Team", startsAt: START, endsAt: START + 4 * HOUR, destination: "Synthetic venue", travel: "Bus", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false, ...fields }));
  const join = (eventId: Id<"events">, studentId: Id<"students">, status: Status) => t.run(ctx => ctx.db.insert("participants", { eventId, studentId, status, createdAt: 1, updatedAt: 1 }));
  return { t, ids, event, join, coach: as(ids.auth.coach), mentor: as(ids.auth.mentor), parent: as(ids.auth.parent), riley: as(ids.auth.riley), jordan: as(ids.auth.jordan), casey: as(ids.auth.casey) };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;

/** Student setup, the parent's health and contact profile, and FIRST all done, so only event items remain. */
async function settle(f: Fixture, studentId: Id<"students">) {
  await f.t.run(async ctx => {
    await ctx.db.patch(studentId, { profileCompletedAt: 1, shirtSize: "M", consentProfileV2CompletedAt: 2, consentProfileV2ConfirmedBy: f.ids.parent, consentProfileV2: { grade: "11", dateOfBirth: "2010-01-01", guardian: { name: "Synthetic Parent", relationship: "Parent", phone: "(202) 555-0100", email: "home-parent@example.invalid" }, emergency: { name: "Synthetic Contact", relationship: "Aunt", phone: "(202) 555-0101" }, allergies: { state: "none", entries: [] }, prescriptions: { state: "none", entries: [] }, insurance: { state: "unavailable", provider: null, policy: null }, physician: { state: "unavailable", name: null, phone: null } } });
    await ctx.db.insert("firstRegistrationStates", { studentId, seasonId: f.ids.season, status: "verified", revision: 1, teamAccepted: true, consentRelease: true });
    await createFinancialAccount(ctx as MutationCtx, studentId, "ready");
  });
}
const summary = (actor: Fixture["riley"], asOfDay = DAY) => actor.query(api.studentHome.summary, { asOfDay });

describe("Student Home summary", () => {
  it("serves only the signed-in Student's own record", async () => {
    const f = await fixture();
    const eventId = await f.event({ signupMode: "approval" });
    for (const actor of [f.parent, f.coach, f.mentor]) {
      await expect(summary(actor)).rejects.toThrow("You do not have permission");
      await expect(actor.query(api.participation.signupAvailability, { eventId })).rejects.toThrow("You do not have permission");
    }
    for (const asOfDay of ["2026-13-01", "10/27/2026", "2026-02-30", ""]) await expect(summary(f.riley, asOfDay)).rejects.toThrow("Home could not load");

    // Jordan's own signup, requirement and room never reach Riley's Home.
    const confirmed = await f.event({ name: "Overnight build trip", overnight: true, roomingEnabled: true });
    await f.join(eventId, f.ids.jordan, "pending");
    await f.join(confirmed, f.ids.jordan, "confirmed");
    await f.t.run(ctx => ctx.db.insert("requirements", { eventId: confirmed, key: "packing", label: "Packing list" }));
    const riley = await summary(f.riley);
    const jordan = await summary(f.jordan);
    expect(riley.studentId).toBe(f.ids.riley);
    expect(jordan.studentId).toBe(f.ids.jordan);
    expect(riley.whatsLeft.filter(item => item.eventId !== null)).toEqual([]);
    expect(riley.roomChoices).toEqual([]);
    expect(jordan.whatsLeft.map(item => item.key)).toEqual(expect.arrayContaining([`signupApproval:${eventId}`, `requirement:${confirmed}:packing`, `room:${confirmed}`]));
    expect(JSON.stringify(riley)).not.toMatch(/Jordan|Williams|example\.invalid/);
  });

  it("assigns the season FIRST item by age and verification on the browser's Chicago day", async () => {
    const f = await fixture();
    const competition = await f.event({ type: "Competition", signupMode: "assigned" });
    await f.join(competition, f.ids.riley, "confirmed");
    await f.t.run(ctx => ctx.db.insert("setupDrafts", { studentId: f.ids.riley, seasonId: f.ids.season, dateOfBirth: "2008-10-27", updatedBy: f.ids.parent, updatedAt: 1 }));
    const firstItems = async (asOfDay: string) => (await summary(f.riley, asOfDay)).whatsLeft.filter(item => item.key === "first" || item.eventId === competition && item.kind === "requirement");
    const setState = (status: Doc<"firstRegistrationStates">["status"]) => f.t.run(async ctx => {
      const prior = await ctx.db.query("firstRegistrationStates").withIndex("by_studentId", q => q.eq("studentId", f.ids.riley)).unique();
      if (prior) await ctx.db.patch(prior._id, { status }); else await ctx.db.insert("firstRegistrationStates", { studentId: f.ids.riley, seasonId: f.ids.season, status, revision: 1, teamAccepted: false, consentRelease: false });
    });
    const cases: { name: string; asOfDay: string; state?: Doc<"firstRegistrationStates">["status"]; expected: object[] }[] = [
      { name: "minor the day before turning 18", asOfDay: "2026-10-26", expected: [{ kind: "firstRegistration", owner: "parent", href: null }] },
      { name: "18 on the birthday", asOfDay: "2026-10-27", expected: [{ kind: "firstRegistration", owner: "student", href: "/setup" }] },
      { name: "reported, waiting for Coach", asOfDay: "2026-10-27", state: "awaitingVerification", expected: [{ kind: "firstVerification", owner: "coach", href: null }] },
      { name: "verified", asOfDay: "2026-10-27", state: "verified", expected: [] },
    ];
    for (const item of cases) {
      if (item.state) await setState(item.state);
      expect(await firstItems(item.asOfDay), item.name).toEqual(item.expected.map(expected => expect.objectContaining({ key: "first", eventId: null, ...expected })));
    }
    const setup = (await summary(f.riley)).whatsLeft.filter(item => item.kind === "studentSetup" || item.kind === "healthProfile");
    expect(setup).toEqual([expect.objectContaining({ kind: "studentSetup", owner: "student", href: "/setup" }), expect.objectContaining({ kind: "healthProfile", owner: "parent", href: null })]);
  });

  it("asks the Student to invite a parent until an active parent link exists this season", async () => {
    const f = await fixture();
    const otherSeason = await f.t.run(ctx => ctx.db.insert("seasons", { name: "2025–26", year: 2026, status: "archived", startsAt: 0, permissionVersion: "DRAFT", createdBy: f.ids.coach }));
    const cases: { name: string; link: Partial<Doc<"familyLinks">> | null; parentActive?: boolean; linked: boolean }[] = [
      { name: "active link", link: { active: true, seasonId: f.ids.season }, linked: true },
      { name: "legacy link without a season", link: { active: true, seasonId: undefined }, linked: true },
      { name: "revoked link", link: { active: false, seasonId: f.ids.season }, linked: false },
      { name: "link from another season", link: { active: true, seasonId: otherSeason }, linked: false },
      { name: "inactive parent account", link: { active: true, seasonId: f.ids.season }, parentActive: false, linked: false },
      { name: "no link", link: null, linked: false },
    ];
    for (const item of cases) {
      await f.t.run(async ctx => {
        await ctx.db.patch(f.ids.parent, { active: item.parentActive ?? true });
        const existing = await ctx.db.get(f.ids.link);
        if (item.link && existing) await ctx.db.patch(f.ids.link, item.link);
        if (!item.link && existing) await ctx.db.delete(f.ids.link);
      });
      const home = await summary(f.riley);
      expect(home.parentLinked, item.name).toBe(item.linked);
      expect(home.whatsLeft.filter(row => row.kind === "inviteParent"), item.name).toEqual(item.linked ? [] : [{ key: "inviteParent", kind: "inviteParent", owner: "student", eventId: null, eventName: null, label: null, dueAt: null, href: "/parents" }]);
    }
  });

  it("reports a fundraiser link exactly when the Money page shows the fundraiser", async () => {
    const f = await fixture();
    const cases: { name: string; url: string | undefined; linked: boolean }[] = [
      { name: "no link", url: undefined, linked: false },
      { name: "link set", url: "https://example.invalid/fundraiser/riley", linked: true },
      { name: "blank link", url: "", linked: false },
    ];
    for (const item of cases) {
      await f.t.run(ctx => ctx.db.patch(f.ids.riley, { fundraiserUrl: item.url }));
      const home = await summary(f.riley);
      expect(home.fundraiserLinked, item.name).toBe(item.linked);
      // The Money page renders the fundraiser section only when this query returns a link.
      expect(home.fundraiserLinked, item.name).toBe(!!await f.riley.query(api.fundraiserLinks.forStudent, { studentId: f.ids.riley }));
      expect(JSON.stringify(home), item.name).not.toContain("example.invalid/fundraiser");
    }
  });

  it("lists open signups the Student can still join, soonest close first", async () => {
    const f = await fixture();
    const make = async (name: string, fields: EventFields, status?: Status) => { const id = await f.event({ name, ...fields }); if (status) await f.join(id, f.ids.riley, status); return id; };
    await make("Closes later", { signupClosesAt: START + 10 * HOUR });
    await make("Starts first", { signupMode: "approval", startsAt: START - 48 * HOUR, endsAt: START - 40 * HOUR });
    const rejoin = await make("Withdrawn, may rejoin", { startsAt: START + 1 * HOUR }, "withdrawn");
    const withdrew = await make("Withdrawal approved", {}, "withdrawn");
    await make("Assigned", { signupMode: "assigned" });
    await make("Canceled", { cancelled: true });
    await make("Archived", { archived: true });
    await make("Waiting for approval", { signupMode: "approval" }, "pending");
    await make("Signed up", {}, "confirmed");
    await make("Waitlisted", {}, "waitlist");
    await make("Whole Team enrollment running", { enrollmentState: "running" });
    await f.t.run(async ctx => {
      for (const [eventId, status] of [[rejoin, "denied"], [withdrew, "approved"]] as const) {
        const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", f.ids.riley)).unique();
        await ctx.db.insert("withdrawalRequests", { eventId, studentId: f.ids.riley, participantId: participant!._id, status, requestedBy: f.ids.coach, requestedAt: 1, idempotencyKey: `withdraw-${eventId}` });
      }
    });
    const home = await summary(f.riley);
    expect(home.openSignups.map(row => row.name)).toEqual(["Starts first", "Withdrawn, may rejoin", "Closes later"]);
    expect(home.openSignups[0]).toMatchObject({ signupMode: "approval", signupClosesAt: null, feeCents: 0, type: "Team" });
  });

  it("shows room choice with teammates' short names and pending invitations only", async () => {
    const f = await fixture();
    const deadline = START - 72 * HOUR;
    const trip = await f.event({ name: "Overnight trip", overnight: true, roomingEnabled: true, roomDeadline: deadline });
    for (const id of [f.ids.riley, f.ids.jordan, f.ids.casey]) await f.join(trip, id, "confirmed");
    const { group } = await f.t.run(async ctx => {
      const group = await ctx.db.insert("roomGroups", { eventId: trip, category: "Girls", name: "Synthetic suite", finalized: false, adultFifthException: false, needsReview: false, createdBy: f.ids.coach });
      const caseyGroup = await ctx.db.insert("roomGroups", { eventId: trip, category: "Girls", name: "Casey's room", finalized: false, adultFifthException: false, needsReview: false, createdBy: f.ids.coach });
      await ctx.db.insert("roomMemberships", { eventId: trip, groupId: group, studentId: f.ids.riley, joinedAt: 1 });
      await ctx.db.insert("roomMemberships", { eventId: trip, groupId: group, studentId: f.ids.jordan, joinedAt: 2 });
      await ctx.db.insert("roomMemberships", { eventId: trip, groupId: caseyGroup, studentId: f.ids.casey, joinedAt: 3 });
      await ctx.db.insert("roomInvites", { eventId: trip, groupId: caseyGroup, studentId: f.ids.riley, invitedBy: f.ids.casey, status: "pending", createdAt: 4 });
      await ctx.db.insert("roomInvites", { eventId: trip, groupId: caseyGroup, studentId: f.ids.riley, invitedBy: f.ids.jordan, status: "declined", createdAt: 5 });
      return { group };
    });
    const home = await summary(f.riley);
    expect(home.roomChoices).toEqual([{ eventId: trip, eventName: "Overnight trip", startsAt: START, endsAt: START + 4 * HOUR, roomDeadline: deadline, status: "inGroup", groupName: "Synthetic suite", memberNames: ["Jordan W."], invitations: [{ inviteId: expect.any(String), fromName: "Casey L.", initials: "CL" }] }]);
    expect(JSON.stringify(home)).not.toMatch(/Avery|Williams|Morgan|Lee\b|example\.invalid/);
    expect(home.whatsLeft.some(item => item.kind === "roomChoice")).toBe(false);

    const statuses: { name: string; change: (ctx: MutationCtx) => Promise<unknown>; status: string; roomItem: boolean }[] = [
      { name: "group finalized", change: ctx => ctx.db.patch(group, { finalized: true }), status: "final", roomItem: false },
      { name: "asked to be assigned", change: async ctx => { const own = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", trip).eq("studentId", f.ids.riley)).unique(); await ctx.db.delete(own!._id); await ctx.db.insert("roomRequests", { eventId: trip, studentId: f.ids.riley, requestedAt: 6 }); }, status: "assignmentRequested", roomItem: false },
      { name: "nothing chosen", change: async ctx => { const request = await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", trip).eq("studentId", f.ids.riley)).unique(); await ctx.db.delete(request!._id); }, status: "notChosen", roomItem: true },
    ];
    for (const item of statuses) {
      await f.t.run(item.change);
      const next = await summary(f.riley);
      expect(next.roomChoices[0].status, item.name).toBe(item.status);
      expect(next.whatsLeft.filter(row => row.kind === "roomChoice"), item.name).toEqual(item.roomItem ? [expect.objectContaining({ key: `room:${trip}`, owner: "student", dueAt: deadline, href: `/events/${trip}/rooming` })] : []);
    }
  });

  it("leaves out room invitations that can no longer be answered", async () => {
    const f = await fixture();
    const trip = await f.event({ name: "Overnight trip", overnight: true, roomingEnabled: true });
    for (const id of [f.ids.riley, f.ids.casey]) await f.join(trip, id, "confirmed");
    const caseyGroup = await f.t.run(async ctx => {
      const groupId = await ctx.db.insert("roomGroups", { eventId: trip, category: "Girls", name: "Casey's room", finalized: false, adultFifthException: false, needsReview: false, createdBy: f.ids.coach });
      await ctx.db.insert("roomMemberships", { eventId: trip, groupId, studentId: f.ids.casey, joinedAt: 1 });
      await ctx.db.insert("roomInvites", { eventId: trip, groupId, studentId: f.ids.riley, invitedBy: f.ids.casey, status: "pending", createdAt: 2 });
      return groupId;
    });
    // rooms.respond refuses an invitation from a group that is final or removed, so Home must not offer it.
    const cases: { name: string; change: (ctx: MutationCtx) => Promise<unknown>; shown: boolean }[] = [
      { name: "group still choosing", change: async () => null, shown: true },
      { name: "group finalized", change: ctx => ctx.db.patch(caseyGroup, { finalized: true }), shown: false },
      { name: "group reopened by a Coach", change: ctx => ctx.db.patch(caseyGroup, { finalized: false }), shown: true },
      { name: "group removed", change: ctx => ctx.db.delete(caseyGroup), shown: false },
    ];
    for (const item of cases) {
      await f.t.run(item.change);
      const [room] = (await summary(f.riley)).roomChoices;
      expect(room.invitations, item.name).toEqual(item.shown ? [{ inviteId: expect.any(String), fromName: "Casey L.", initials: "CL" }] : []);
    }
  });

  it("names the Student by the preferred name", async () => {
    const f = await fixture();
    const cases: { name: string; fields: Partial<Doc<"students">>; expected: { greetingName: string; displayName: string; initials: string } }[] = [
      { name: "first name", fields: {}, expected: { greetingName: "Riley", displayName: "Riley Example", initials: "RE" } },
      { name: "preferred full name", fields: { preferredName: "Dev Student", firstName: "Dev", lastName: "Student", legalName: "Dev Student Example" }, expected: { greetingName: "Dev", displayName: "Dev Student", initials: "DS" } },
      { name: "changed preferred name", fields: { preferredName: "Jo", firstName: "Joanna", lastName: "Example", legalName: "Joanna Example" }, expected: { greetingName: "Jo", displayName: "Jo Example", initials: "JE" } },
    ];
    for (const item of cases) {
      await f.t.run(ctx => ctx.db.patch(f.ids.riley, item.fields));
      expect(await summary(f.riley), item.name).toMatchObject(item.expected);
    }
  });

  it("takes the last name from the last name field before the legal name and drops an unclear initial", async () => {
    const f = await fixture();
    const trip = await f.event({ name: "Overnight trip", overnight: true, roomingEnabled: true });
    for (const id of [f.ids.riley, f.ids.jordan]) await f.join(trip, id, "confirmed");
    await f.t.run(async ctx => {
      const groupId = await ctx.db.insert("roomGroups", { eventId: trip, category: "Girls", name: "Synthetic suite", finalized: false, adultFifthException: false, needsReview: false, createdBy: f.ids.coach });
      for (const studentId of [f.ids.riley, f.ids.jordan]) await ctx.db.insert("roomMemberships", { eventId: trip, groupId, studentId, joinedAt: 1 });
    });
    const cases: { name: string; fields: Partial<Doc<"students">>; teammate: string; own: { displayName: string; initials: string } }[] = [
      { name: "suffixed legal name, last name not yet reviewed", fields: { legalName: "Jordan Avery Williams Jr.", lastName: "Williams", structuredNameReviewed: false }, teammate: "Jordan W.", own: { displayName: "Jordan Williams", initials: "JW" } },
      { name: "suffixed legal name, no last name", fields: { legalName: "Jordan Avery Williams Jr.", lastName: undefined, structuredNameReviewed: false }, teammate: "Jordan", own: { displayName: "Jordan", initials: "J" } },
      { name: "last name differs from the legal name's last word", fields: { legalName: "Jordan Avery Williams", lastName: "Avery-Williams", structuredNameReviewed: false }, teammate: "Jordan A.", own: { displayName: "Jordan Avery-Williams", initials: "JA" } },
      { name: "legal name only", fields: { legalName: "Jordan Avery Williams", lastName: undefined, structuredNameReviewed: false }, teammate: "Jordan W.", own: { displayName: "Jordan Williams", initials: "JW" } },
      { name: "last name is only a suffix", fields: { legalName: "Jordan Avery Williams III", lastName: "III", structuredNameReviewed: true }, teammate: "Jordan", own: { displayName: "Jordan", initials: "J" } },
    ];
    for (const item of cases) {
      await f.t.run(ctx => ctx.db.patch(f.ids.jordan, item.fields));
      expect((await summary(f.riley)).roomChoices[0].memberNames, item.name).toEqual([item.teammate]);
      expect(await summary(f.jordan), item.name).toMatchObject({ greetingName: "Jordan", ...item.own });
    }
  });

  it("maps each event's open readiness items to an owner and keeps keys unique", async () => {
    const f = await fixture();
    await settle(f, f.ids.riley);
    expect((await summary(f.riley)).whatsLeft).toEqual([]);
    const dueAt = START - 24 * HOUR;
    const payment = await f.event({ name: "Payment due" });
    const form = await f.event({ name: "Form due", permissionRequired: true });
    const review = await f.event({ name: "Form submitted", permissionRequired: true });
    const custom = await f.event({ name: "Custom requirement", firstRequired: true });
    const competition = await f.event({ name: "Competition", type: "Competition" });
    const approval = await f.event({ name: "Approval event", signupMode: "approval" });
    for (const id of [payment, form, review, custom, competition]) await f.join(id, f.ids.riley, "confirmed");
    await f.join(approval, f.ids.riley, "pending");
    await f.t.run(async ctx => {
      await ctx.db.insert("charges", { eventId: payment, studentId: f.ids.riley, label: "Synthetic fee", amountCents: 2500, appliedCents: 0, priority: 1, createdBy: f.ids.coach, createdAt: 1 });
      await ctx.db.insert("permissionCoverage", { seasonId: f.ids.season, studentId: f.ids.riley, eventId: review, state: "pending", revision: 1, updatedAt: 1, updatedBy: f.ids.parent });
      await ctx.db.insert("requirements", { eventId: custom, key: "packing", label: "Packing list", dueAt });
      await ctx.db.insert("requirements", { eventId: custom, key: "done", label: "Already done" });
      await ctx.db.insert("requirementCompletions", { eventId: custom, studentId: f.ids.riley, key: "done", completedBy: f.ids.coach, completedAt: 1 });
    });
    const shape = (home: Awaited<ReturnType<typeof summary>>) => home.whatsLeft.map(item => [item.key, item.kind, item.owner, item.label, item.dueAt, item.href]);
    expect(shape(await summary(f.riley))).toEqual([
      [`payment:${payment}`, "requiredPayment", "parent", null, START, null],
      [`permission:${form}`, "permissionForm", "parent", null, START, null],
      [`permission:${review}`, "permissionReview", "coach", null, START, null],
      [`requirement:${custom}:first`, "requirement", "student", "FIRST registration", START, `/events/${custom}`],
      [`requirement:${custom}:packing`, "requirement", "student", "Packing list", dueAt, `/events/${custom}`],
      [`signupApproval:${approval}`, "signupApproval", "coach", null, START, null],
    ]);
    // Records being updated add one quiet Coach item per confirmed event, never duplicates.
    await f.t.run(async ctx => { const account = await ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", f.ids.riley)).unique(); await ctx.db.patch(account!._id, { state: "rebuilding" }); });
    const updating = await summary(f.riley);
    expect(updating.whatsLeft.filter(item => item.kind === "staffReview").map(item => [item.key, item.owner])).toEqual([payment, form, review, custom, competition].map(id => [`staffReview:${id}`, "coach"]));
    expect(new Set(updating.whatsLeft.map(item => item.key)).size).toBe(updating.whatsLeft.length);
  });

  it("returns the season, its verified kickoff and current competitions", async () => {
    const f = await fixture();
    const later = await f.event({ name: "State championship", type: "Competition", startsAt: START + 200 * HOUR, endsAt: START + 210 * HOUR });
    const sooner = await f.event({ name: "District event", type: "Competition", signupMode: "assigned" });
    await f.event({ name: "Canceled competition", type: "Competition", cancelled: true });
    await f.event({ name: "Archived competition", type: "Competition", archived: true });
    // Competitions that ended but are not archived yet must not push the next one out of the list.
    const ended: Id<"events">[] = [];
    for (let days = 12; days >= 1; days--) ended.push(await f.event({ name: `Ended scrimmage ${days}`, type: "Competition", startsAt: START - days * 24 * HOUR, endsAt: START - days * 24 * HOUR + 4 * HOUR }));
    const home = await summary(f.riley);
    expect(home.season).toEqual({ name: "2026–27", startsAt: Date.parse("2026-08-01T05:00:00Z"), kickoffAt: Date.parse("2027-01-09T06:00:00Z") });
    expect(home.competitions.map(row => row.eventId)).toEqual([...ended, sooner, later]);
    await f.t.run(ctx => ctx.db.patch(f.ids.season, { year: 2031 }));
    expect((await summary(f.riley)).season.kickoffAt).toBeNull();
  });

  it("stays within its read budget for a busy Student", async () => {
    const f = await fixture();
    await settle(f, f.ids.riley);
    await f.t.run(async ctx => {
      const others = [f.ids.jordan, f.ids.casey];
      for (let index = 0; index < 40; index++) {
        const overnight = index < 3;
        const eventId = await ctx.db.insert("events", { seasonId: f.ids.season, name: `Busy event ${index}`, type: index % 5 === 0 ? "Competition" : "Team", startsAt: START + index * HOUR, endsAt: START + index * HOUR + 1, destination: "Synthetic", travel: "Bus", overnight, roomingEnabled: overnight, roomDeadline: overnight ? START : undefined, feeCents: 1000, signupMode: index % 4 === 0 ? "assigned" : index % 3 === 0 ? "approval" : "open", allowWithdrawal: true, permissionRequired: index < 6, firstRequired: false, archived: false });
        const status: Status | null = index < 8 ? "confirmed" : index < 10 ? "pending" : index < 12 ? "withdrawn" : null;
        if (status) await ctx.db.insert("participants", { eventId, studentId: f.ids.riley, status, createdAt: 1, updatedAt: 1 });
        for (const other of others) await ctx.db.insert("participants", { eventId, studentId: other, status: "confirmed", createdAt: 1, updatedAt: 1 });
        if (index < 8) {
          await ctx.db.insert("charges", { eventId, studentId: f.ids.riley, label: "Synthetic fee", amountCents: 1000, appliedCents: index % 2 ? 1000 : 0, priority: 1, createdBy: f.ids.coach, createdAt: 1 });
          for (const key of ["packing", "waiver"]) await ctx.db.insert("requirements", { eventId, key, label: `Synthetic ${key}` });
        }
        if (overnight) {
          const groupId = await ctx.db.insert("roomGroups", { eventId, category: "Girls", name: `Room ${index}`, finalized: false, adultFifthException: false, needsReview: false, createdBy: f.ids.coach });
          for (const member of [f.ids.riley, ...others]) await ctx.db.insert("roomMemberships", { eventId, groupId, studentId: member, joinedAt: 1 });
        }
      }
    });
    const sample = await f.riley.run(async ctx => {
      const result = await ctx.runQuery(api.studentHome.summary, { asOfDay: DAY });
      const metrics = await ctx.meta.getTransactionMetrics();
      return { result, documentsRead: metrics.documentsRead.used, databaseQueries: metrics.databaseQueries.used };
    });
    expect(sample.result.roomChoices).toHaveLength(3);
    // Measured at 102 documents and 68 queries.
    expect(sample.documentsRead).toBeLessThanOrEqual(160);
    expect(sample.databaseQueries).toBeLessThanOrEqual(100);
  });
});

describe("signup availability", () => {
  it("predicts what Sign up does and counts spots without names", async () => {
    const f = await fixture();
    type Case = { name: string; event: EventFields; others: Status[]; own?: Status; withdrawal?: boolean; spotsLeft: number | null; outcome: string; signUp?: string; refused?: string };
    const cases: Case[] = [
      { name: "open with room", event: { capacity: 3 }, others: ["confirmed", "pending"], spotsLeft: 1, outcome: "signedUp", signUp: "confirmed" },
      { name: "approval", event: { signupMode: "approval", capacity: 3, feeCents: 2500 }, others: ["confirmed"], spotsLeft: 2, outcome: "waitingForApproval", signUp: "pending" },
      { name: "full", event: { capacity: 2 }, others: ["confirmed", "pending"], spotsLeft: 0, outcome: "waitlisted", signUp: "waitlist" },
      { name: "someone already waitlisted", event: { capacity: 5 }, others: ["waitlist"], spotsLeft: 5, outcome: "waitlisted", signUp: "waitlist" },
      { name: "withdrawn teammates free their spots", event: { capacity: 1 }, others: ["withdrawn", "withdrawn"], spotsLeft: 1, outcome: "signedUp", signUp: "confirmed" },
      { name: "no capacity", event: {}, others: ["confirmed"], spotsLeft: null, outcome: "signedUp", signUp: "confirmed" },
      { name: "canceled", event: { capacity: 3, cancelled: true }, others: [], spotsLeft: 3, outcome: "closed", refused: "You can't sign up" },
      // A Coach archived the event or made it Coach-assigned after Home loaded: the sheet still opens and says signup is closed.
      { name: "archived", event: { capacity: 3, archived: true }, others: ["confirmed"], spotsLeft: 2, outcome: "closed", refused: "You can't sign up" },
      { name: "assigned by a Coach", event: { signupMode: "assigned" }, others: ["confirmed"], spotsLeft: null, outcome: "closed", refused: "You can't sign up" },
      { name: "already waiting for approval", event: { signupMode: "approval", capacity: 3 }, others: [], own: "pending", spotsLeft: 2, outcome: "closed" },
      { name: "withdrawal approved", event: {}, others: [], own: "withdrawn", withdrawal: true, spotsLeft: null, outcome: "closed" },
      { name: "withdrawn, may sign up again", event: {}, others: [], own: "withdrawn", spotsLeft: null, outcome: "signedUp", signUp: "confirmed" },
    ];
    for (const item of cases) {
      const eventId = await f.event({ name: item.name, ...item.event });
      for (const [index, status] of item.others.entries()) await f.join(eventId, index % 2 ? f.ids.casey : f.ids.jordan, status);
      if (item.own) {
        const participantId = await f.join(eventId, f.ids.riley, item.own);
        if (item.withdrawal) await f.t.run(ctx => ctx.db.insert("withdrawalRequests", { eventId, studentId: f.ids.riley, participantId, status: "approved", requestedBy: f.ids.coach, requestedAt: 1, idempotencyKey: `withdraw-${eventId}` }));
      }
      const availability = await f.riley.query(api.participation.signupAvailability, { eventId });
      expect(availability, item.name).toEqual({ eventId, name: item.name, startsAt: START, endsAt: START + 4 * HOUR, feeCents: item.event.feeCents ?? 0, signupMode: item.event.signupMode ?? "open", signupClosesAt: null, capacity: item.event.capacity ?? null, spotsLeft: item.spotsLeft, outcome: item.outcome });
      if (item.signUp) expect(await f.riley.mutation(api.participation.signUp, { eventId }), item.name).toBe(item.signUp);
      if (item.refused) await expect(f.riley.mutation(api.participation.signUp, { eventId }), item.name).rejects.toThrow(item.refused);
    }
  });

  it("refuses only an event that is gone or from another season", async () => {
    const f = await fixture();
    const removed = await f.event();
    await f.t.run(ctx => ctx.db.delete(removed));
    const earlier = await f.t.run(async ctx => {
      const seasonId = await ctx.db.insert("seasons", { name: "2025–26", year: 2026, status: "archived", startsAt: 0, permissionVersion: "DRAFT", createdBy: f.ids.coach });
      return ctx.db.insert("events", { seasonId, name: "Last season's event", type: "Team", startsAt: START, endsAt: START + HOUR, destination: "Synthetic venue", travel: "Bus", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    });
    for (const eventId of [removed, earlier]) await expect(f.riley.query(api.participation.signupAvailability, { eventId })).rejects.toThrow("no longer available");
  });
});
