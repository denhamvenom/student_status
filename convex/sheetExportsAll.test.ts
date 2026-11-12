/// <reference types="vite/client" />
/* eslint-disable @typescript-eslint/no-explicit-any -- fake Google payloads are untyped JSON */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportPKCS8, generateKeyPair } from "jose";
import rateLimiter from "@convex-dev/rate-limiter/test";
import { createTest } from "../testUtils";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { googleRetry } from "./lib/googleSheets";
import { addCharges } from "./lib/money";
import { ensureFinancialAccount } from "./lib/financialSources";
import { allSheetKinds } from "./lib/sheetRegistry";
import { makeFunctionReference } from "convex/server";

const modules = import.meta.glob("./**/*.ts");
const DAY = 86_400_000;
const NOW = Date.parse("2026-11-12T18:00:00Z");
const FOLDERS = { general: "folderGeneral0001", money: "folderMoney000002", health: "folderHealth00003", events: "folderEvents000008" };
const DRIVE = "sharedDrive0000001";

/** A small in-memory stand-in for Google that remembers which folder each file was made in and what was written. Nothing reaches a real service. */
function fakeGoogle() {
  const files = new Map<string, { name: string; key: string; parents: string[] }>();
  const written = new Map<string, any[]>();
  const handler = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = init?.method ?? "GET";
    const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });
    if (url.host === "oauth2.googleapis.com") return json(200, { access_token: "synthetic-token" });
    if (url.pathname === "/drive/v3/files" && method === "GET") {
      const key = /value='([^']*)'/.exec(url.searchParams.get("q") ?? "")?.[1];
      return json(200, { files: [...files].filter(([, file]) => file.key === key).map(([id]) => ({ id })) });
    }
    if (url.pathname === "/drive/v3/files" && method === "POST") {
      const body = JSON.parse(String(init?.body));
      const id = `sheet${files.size + 1}`;
      files.set(id, { name: body.name, key: body.appProperties.venomStatusKey, parents: body.parents });
      return json(200, { id });
    }
    const fileMatch = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname);
    if (fileMatch) { const file = files.get(fileMatch[1]); return file ? json(200, { id: fileMatch[1], trashed: false, parents: file.parents }) : json(404); }
    const sheetMatch = /^\/v4\/spreadsheets\/([^/:]+)(:batchUpdate)?$/.exec(url.pathname);
    if (sheetMatch && files.has(sheetMatch[1])) {
      if (sheetMatch[2]) { written.set(sheetMatch[1], JSON.parse(String(init?.body)).requests); return json(200); }
      return json(200, { sheets: [{ properties: { sheetId: 0, title: "Sheet1" } }] });
    }
    return json(404);
  };
  return { files, written, handler };
}

/** Tab titles written in one batch. */
function tabTitles(requests: any[]) {
  return requests.filter(request => request.addSheet || request.updateSheetProperties?.properties.title).map(request => (request.addSheet ?? request.updateSheetProperties).properties.title as string);
}

const setupFinance = makeFunctionReference<"mutation">("financialAllocation:processPage");

async function seedSeason() {
  const t = createTest(schema, modules);
  rateLimiter.register(t);
  const ids = await t.run(async ctx => {
    const account = async (key: string, role: "coach" | "mentor" | "parent" | "student", name: string, extra: Record<string, unknown> = {}) => {
      const email = `${key}@example.invalid`;
      const auth = await ctx.db.insert("users", { email });
      const app = await ctx.db.insert("appUsers", { authUserId: auth, email, name, role, active: true, travelLead: false, financialEdit: false, ...extra });
      return { auth, app };
    };
    const coach = await account("coach", "coach", "Casey Coach", { phone: "555-0100" });
    const mentor = await account("mentor", "mentor", "Morgan Mentor", { shirtSize: "L", subteams: ["Build"], phone: "555-0101" });
    const mentorParent = await account("mentorparent", "parent", "Mel Mentor-Parent", { parentStaffAccess: "mentor", subteams: ["Software"], shirtSize: "M" });
    const parent = await account("parent", "parent", "Pat Parent", { shirtSize: "XL" });
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2027", year: 2027, status: "active", startsAt: 0, permissionVersion: "v1", createdBy: coach.app });
    const students: Id<"students">[] = [];
    for (let i = 0; i < 6; i++) {
      students.push(await ctx.db.insert("students", {
        seasonId: season, legalName: `Student ${i} Synthetic`, preferredName: `S${i}`, email: `student${i}@example.invalid`, subteam: i % 2 ? "Build" : "Software", travelTeam: i < 4, active: true, roomCategoryLocked: false,
        shirtSize: ["S", "M", "L", "XL"][i % 4], allergies: i === 1 ? { state: "reported" as const, text: "Synthetic peanut allergy" } : { state: "none" as const }, medications: { state: "none" as const },
      } as any));
    }
    await ctx.db.insert("familyLinks", { parentUserId: parent.app, studentId: students[0], seasonId: season, active: true, createdBy: coach.app });
    await ctx.db.insert("familyLinks", { parentUserId: mentorParent.app, studentId: students[1], seasonId: season, active: true, createdBy: coach.app });
    await ctx.db.insert("sheetExportSettings", { driveId: DRIVE, generalFolderId: FOLDERS.general, moneyFolderId: FOLDERS.money, healthFolderId: FOLDERS.health, eventsFolderId: FOLDERS.events, setBy: coach.app, setAt: 1 });
    // Attendance reports are ready once the backfill finished (the same gate the app uses).
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    const driver = await ctx.db.insert("drivers", { ownerAppUserId: parent.app, seasonId: season, name: "Pat Parent", phone: "555-0102", email: "parent@example.invalid", seats: 5, approved: true, vehicleName: "Synthetic van", towCapable: true });
    const event = await ctx.db.insert("events", {
      seasonId: season, name: "Synthetic Regional", type: "Competition", startsAt: NOW + 20 * DAY, endsAt: NOW + 22 * DAY, destination: "Synthetic Arena", travel: "Bus", overnight: true, roomingEnabled: false,
      feeCents: 5000, signupMode: "open", allowWithdrawal: true, permissionRequired: true, firstRequired: false, archived: false,
    });
    await ctx.db.insert("eventVehicles", { eventId: event, driverId: driver, seats: 4 });
    for (const [i, studentId] of students.slice(0, 4).entries()) await ctx.db.insert("participants", { eventId: event, studentId, status: i === 3 ? "waitlist" : "confirmed", createdAt: 1, updatedAt: 1 });
    const question = await ctx.db.insert("eventQuestions", { eventId: event, order: 0, kind: "singleChoice", prompt: "Meal choice", options: ["Chicken", "Veggie"], required: true });
    await ctx.db.insert("eventQuestionAnswers", { eventId: event, studentId: students[0], questionId: question, value: "Veggie", answeredBy: coach.app, updatedAt: 1 });
    await ctx.db.insert("eventMentorInvites", { eventId: event, mentorUserId: mentor.app, source: "individual", status: "accepted", invitedBy: coach.app, createdAt: 1, respondedAt: 2, canDriveStudents: true });
    const shift = await ctx.db.insert("eventShifts", { eventId: event, label: "Pit crew", startsAt: NOW + 20 * DAY, endsAt: NOW + 20 * DAY + 3_600_000, capacity: 3 });
    await ctx.db.insert("shiftSignups", { eventId: event, shiftId: shift, studentId: students[0], createdAt: 1 });
    // Money: one event fee for each of the first four students.
    const fee = await ctx.db.insert("feeDefinitions", { seasonId: season, kind: "eventMain", label: "Regional fee", eventId: event, defaultAmountCents: 5000, priority: 1, revision: 1, state: "active", createdBy: coach.app, createdAt: 1, updatedAt: 1 });
    const actor = (await ctx.db.get(coach.app))!;
    for (const studentId of students) {
      await ensureFinancialAccount(ctx, studentId);
      await addCharges(ctx, actor, studentId, [{ label: "Regional fee", amountCents: 5000, priority: 1, idempotencyKey: `fee:${studentId}`, eventId: event, category: "main", feeDefinitionId: fee }], "seed-fee");
    }
    return { coach, season, event, students };
  });
  // Let each student's fee allocation finish so every account is ready.
  for (const studentId of ids.students) {
    for (let i = 0; i < 60; i++) {
      const account = await t.run(ctx => ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", studentId)).unique());
      if (!account?.allocationJobId) break;
      const job = await t.run(ctx => ctx.db.get(account.allocationJobId!));
      if (!job) break;
      await t.mutation(setupFinance, { jobId: job._id, step: (job as any).step });
    }
  }
  return { t, ids, coach: t.withIdentity({ subject: `${ids.coach.auth}|session` }) };
}

let google: ReturnType<typeof fakeGoogle>;
const readyBefore = allSheetKinds().map(entry => ({ definition: entry.definition, ready: entry.definition.ready }));

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  googleRetry.delaysMs = [0, 0, 0];
  const keys = await generateKeyPair("RS256", { extractable: true });
  vi.stubEnv("GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL", "reports@synthetic.invalid");
  vi.stubEnv("GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY", await exportPKCS8(keys.privateKey));
  vi.stubEnv("GOOGLE_SHEETS_EXPORT_ENABLED", "true");
  google = fakeGoogle();
  vi.stubGlobal("fetch", vi.fn(google.handler));
});
afterEach(() => { for (const { definition, ready } of readyBefore) definition.ready = ready; vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("a full update with every kind", () => {
  it("writes every kind into its own folder from a realistic season, with no kind failing", async () => {
    const f = await seedSeason();
    expect(await f.coach.mutation(api.sheetExports.requestUpdate, {})).toEqual({ status: "started" });
    const run = (await f.t.run(ctx => ctx.db.query("sheetExportRuns").withIndex("by_startedAt").order("desc").first()))!;
    expect(run.total).toBe(11);
    for (let i = 0; i < run.total; i++) await f.t.action(internal.sheetExportActions.runOne, { runId: run._id });
    const finished = (await f.t.run(ctx => ctx.db.get(run._id)))!;
    // A kind that fails shows its plain message here instead of just a count.
    expect({ state: finished.state, problems: finished.problems ?? [] }).toEqual({ state: "done", problems: [] });

    const stored = await f.t.run(ctx => ctx.db.query("sheetExportFiles").collect());
    const folderOf = Object.fromEntries(stored.map(file => [file.kind, file.folderId]));
    expect(folderOf).toEqual({
      studentRoster: FOLDERS.general, shirtSizes: FOLDERS.general, adultRoster: FOLDERS.general, drivers: FOLDERS.general, readiness: FOLDERS.general, attendance: FOLDERS.general,
      money: FOLDERS.money, eventFees: FOLDERS.money, health: FOLDERS.health, eventTravelEmergency: FOLDERS.health, event: FOLDERS.events,
    });
    // Each file was made in its folder in Drive and got at least one tab of content.
    for (const file of stored) {
      expect(google.files.get(file.spreadsheetId)!.parents).toEqual([file.folderId]);
      expect(tabTitles(google.written.get(file.spreadsheetId) ?? []).length).toBeGreaterThan(0);
    }
    expect(google.files.size).toBe(11);
    expect(stored.filter(file => file.kind === "event" || file.kind === "eventFees" || file.kind === "eventTravelEmergency").every(file => file.eventId === f.ids.event)).toBe(true);
  });

  it("shows a plain owner-facing message, and keeps the old file, when Money is still updating", async () => {
    const f = await seedSeason();
    await f.t.run(ctx => ctx.db.insert("seasonFinanceControls", { seasonId: f.ids.season, revision: 1, state: "draining", updatedAt: 1 }));
    await f.coach.mutation(api.sheetExports.requestUpdate, {});
    const run = (await f.t.run(ctx => ctx.db.query("sheetExportRuns").withIndex("by_startedAt").order("desc").first()))!;
    for (let i = 0; i < run.total; i++) await f.t.action(internal.sheetExportActions.runOne, { runId: run._id });
    const finished = (await f.t.run(ctx => ctx.db.get(run._id)))!;
    expect(finished.state).toBe("partial");
    // Money and the event Fees file refuse; everything else still updates. No Google or engineering text reaches the message.
    expect(finished.problems!.map(problem => [problem.kind, problem.message])).toEqual([
      ["money", "Money is updating, so its spreadsheet kept the last numbers. Try again in a few minutes."],
      ["eventFees", "Fees are updating, so this spreadsheet kept the last numbers. Try again in a few minutes."],
    ]);
  });
});
