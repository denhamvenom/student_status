/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest } from "../testUtils";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const hour = 3_600_000;

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor", travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@example.invalid` });
      const id = await ctx.db.insert("appUsers", { authUserId: auth, name, email: `${name}@example.invalid`, role, travelLead, financialEdit: false, active: true });
      return { auth, id };
    }
    const coach = await account("ce-coach", "coach"), mentor = await account("ce-mentor", "mentor");
    const season = await ctx.db.insert("seasons", { name: "Synthetic 2026–27", year: 2027, startsAt: Date.parse("2026-08-01T05:00:00Z"), status: "active", permissionVersion: "DRAFT", createdBy: coach.id });
    await ctx.db.insert("attendanceReportBackfills", { seasonId: season, state: "complete", cursor: null, processed: 0, updatedAt: 1 });
    return { coach, mentor };
  });
  const as = (who: { auth: Id<"users"> }) => t.withIdentity({ subject: `${who.auth}|session` });
  return { t, coach: as(ids.coach), mentor: as(ids.mentor) };
}

const startsAt = Date.now() + 24 * hour, endsAt = startsAt + 8 * hour;
const base = { name: "Synthetic booth day", type: "Fundraiser" as const, onsite: true, startsAt, endsAt, destination: "On site", travel: "On site", overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open" as const, allowWithdrawal: true, permissionRequired: false, firstRequired: false, shiftsEnabled: true, requirements: [] };
const shift = (from: number, to: number, label?: string) => ({ label, startsAt: startsAt + from * hour, endsAt: startsAt + to * hour, capacity: 3 });
const question = (prompt: string) => ({ kind: "shortText" as const, prompt, required: true });
const counts = (t: Awaited<ReturnType<typeof fixture>>["t"]) => t.run(async ctx => ({
  events: (await ctx.db.query("events").take(10)).length, shifts: (await ctx.db.query("eventShifts").take(200)).length,
  questions: (await ctx.db.query("eventQuestions").take(50)).length, requirements: (await ctx.db.query("requirements").take(10)).length,
}));

describe("createEvent with shifts, questions and requirements", () => {
  it("creates them together with the event, in order", async () => {
    const f = await fixture();
    const id = await f.coach.mutation(api.admin.createEvent, {
      ...base, shifts: [shift(0, 4, " Morning "), shift(4, 8)],
      questions: [question(" T-shirt size? "), { kind: "singleChoice", prompt: "Lunch", options: ["Pizza", "Salad"], required: false }],
      requirements: [{ key: "waiver", label: "Sign the waiver", url: "https://example.invalid/waiver" }],
    });
    const rows = await f.t.run(async ctx => ({
      shifts: await ctx.db.query("eventShifts").withIndex("by_eventId_and_startsAt", q => q.eq("eventId", id)).take(10),
      questions: await ctx.db.query("eventQuestions").withIndex("by_eventId_and_order", q => q.eq("eventId", id)).take(10),
      requirements: await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", id)).take(10),
    }));
    expect(rows.shifts.map(s => [s.label, s.capacity])).toEqual([["Morning", 3], [undefined, 3]]);
    expect(rows.questions.map(q => [q.order, q.prompt, q.options])).toEqual([[0, "T-shirt size?", undefined], [1, "Lunch", ["Pizza", "Salad"]]]);
    expect(rows.requirements.map(r => r.label)).toEqual(["Sign the waiver"]);
  });

  it.each([
    { name: "a shift outside the event window", extra: { shifts: [shift(0, 2), shift(7, 9)], questions: [question("Fine")] }, message: "within the event" },
    { name: "an invalid question after valid ones", extra: { shifts: [shift(0, 2)], questions: [question("Fine"), { kind: "singleChoice" as const, prompt: "One option", options: ["Only"], required: true }] }, message: "2 to 20 options" },
    { name: "a requirement with an http link", extra: { requirements: [{ key: "form", label: "Form", url: "http://example.invalid" }], shifts: [shift(0, 2)] }, message: "https://" },
    { name: "shifts while shifts are off", extra: { shiftsEnabled: false, shifts: [shift(0, 2)] }, message: "Turn on shifts" },
    { name: "too many questions", extra: { questions: Array.from({ length: 26 }, (_, i) => question(`Question ${i}`)) }, message: "up to 25 questions" },
    { name: "too many shifts", extra: { shifts: Array.from({ length: 101 }, () => shift(0, 1)) }, message: "up to 100 shifts" },
  ])("rejects $name and creates nothing", async ({ extra, message }) => {
    const f = await fixture();
    await expect(f.coach.mutation(api.admin.createEvent, { ...base, ...extra })).rejects.toThrow(message);
    expect(await counts(f.t)).toEqual({ events: 0, shifts: 0, questions: 0, requirements: 0 });
  });

  it("accepts the maximum of 25 questions", async () => {
    const f = await fixture();
    await f.coach.mutation(api.admin.createEvent, { ...base, questions: Array.from({ length: 25 }, (_, i) => question(`Question ${i}`)) });
    expect((await counts(f.t)).questions).toBe(25);
  });

  it("keeps who may create events", async () => {
    const f = await fixture();
    await expect(f.mentor.mutation(api.admin.createEvent, { ...base, shifts: [shift(0, 2)] })).rejects.toThrow("Only a Coach or Travel Lead");
    expect(await counts(f.t)).toEqual({ events: 0, shifts: 0, questions: 0, requirements: 0 });
  });

  it("rejects oversized lists before writing anything", async () => {
    const f = await fixture();
    const many = (n: number) => Array.from({ length: n }, (_, i) => i);
    await expect(f.coach.mutation(api.admin.createEvent, { ...base, shiftsEnabled: true, shifts: many(101).map(i => shift(0, 1, `s${i}`)) })).rejects.toThrow(/up to 100 shifts/);
    await expect(f.coach.mutation(api.admin.createEvent, { ...base, questions: many(26).map(i => question(`Q${i}`)) })).rejects.toThrow(/up to 25 questions/);
    await expect(f.coach.mutation(api.admin.createEvent, { ...base, requirements: many(101).map(i => ({ key: `r${i}`, label: `R${i}` })) })).rejects.toThrow(/up to 100 requirements/);
    await expect(f.coach.mutation(api.admin.createEvent, { ...base, questions: [{ kind: "singleChoice", prompt: "Pick", options: many(21).map(String), required: true }] })).rejects.toThrow(/options/);
    expect(await counts(f.t)).toEqual({ events: 0, shifts: 0, questions: 0, requirements: 0 });
  });
});
