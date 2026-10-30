/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { createTest as convexTest } from "../testUtils";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    async function account(name: string, role: "coach" | "mentor" | "student", travelLead = false) {
      const auth = await ctx.db.insert("users", { email: `${name}@synthetic.test`, name });
      const user = await ctx.db.insert("appUsers", { authUserId: auth, email: `${name}@synthetic.test`, name, role, travelLead, financialEdit: false, active: true });
      return { auth, user };
    }
    const coach = await account("coach", "coach"), lead = await account("lead", "mentor", true), mentor = await account("mentor", "mentor");
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "DRAFT", createdBy: coach.user });
    const studentAuths = [], students = [];
    for (let i = 0; i < 2; i++) {
      const { auth, user } = await account(`student${i}`, "student");
      students.push(await ctx.db.insert("students", { seasonId: season, userId: user, legalName: `Synthetic Student ${i}`, preferredName: `Student ${i}`, email: `student${i}@synthetic.test`, subteam: "Other", active: true, travelTeam: true, roomCategoryLocked: false, allergies: { state: "none" }, medications: { state: "none" } }));
      studentAuths.push(auth);
    }
    const base = { seasonId: season, type: "Outreach" as const, startsAt: Date.now() + 30 * 86400_000, endsAt: Date.now() + 30 * 86400_000 + 8 * 3600_000, destination: "Library", travel: "Own", overnight: false, roomingEnabled: false, feeCents: 0, allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false };
    const event = await ctx.db.insert("events", { ...base, name: "Open outreach", signupMode: "open" });
    const other = await ctx.db.insert("events", { ...base, name: "Other outreach", signupMode: "open" });
    const assigned = await ctx.db.insert("events", { ...base, name: "Assigned outreach", signupMode: "assigned" });
    await ctx.db.insert("participants", { eventId: assigned, studentId: students[0], status: "confirmed", createdAt: 0, updatedAt: 0 });
    return { coach, lead, mentor, studentAuths, students, event, other, assigned };
  });
  const as = (auth: typeof ids.coach.auth) => t.withIdentity({ subject: `${auth}|session` });
  return { t, ids, coach: as(ids.coach.auth), lead: as(ids.lead.auth), mentor: as(ids.mentor.auth), student: ids.studentAuths.map(as) };
}

describe("event signup questions", () => {
  it("lets only a Coach or Travel Lead manage questions", async () => {
    const f = await fixture();
    for (const caller of [f.mentor, f.student[0]]) {
      await expect(caller.mutation(api.eventQuestions.saveQuestion, { eventId: f.ids.event, kind: "shortText", prompt: "T-shirt size?", required: false })).rejects.toThrow("Only a Coach or Travel Lead");
      await expect(caller.query(api.eventQuestions.responses, { eventId: f.ids.event })).rejects.toThrow("Only a Coach or Travel Lead");
    }
    await expect(f.lead.mutation(api.eventQuestions.saveQuestion, { eventId: f.ids.event, kind: "shortText", prompt: "T-shirt size?", required: false })).resolves.toBeTruthy();
  });

  it.each([
    { options: ["Only one"], error: "2 to 20 options" },
    { options: ["Pizza", " pizza "], error: "must be different" },
    { options: ["Pizza", ""], error: "2 to 20 options" },
    { options: ["Pizza", "x".repeat(101)], error: "2 to 20 options" },
  ])("rejects invalid choice options $options", async ({ options, error }) => {
    const f = await fixture();
    await expect(f.coach.mutation(api.eventQuestions.saveQuestion, { eventId: f.ids.event, kind: "singleChoice", prompt: "Lunch?", options, required: true })).rejects.toThrow(error);
  });

  it("enforces required questions and valid choices at signup, then saves the answers", async () => {
    const f = await fixture();
    const lunch = await f.coach.mutation(api.eventQuestions.saveQuestion, { eventId: f.ids.event, kind: "singleChoice", prompt: "Lunch?", options: ["Pizza", "Salad"], required: true });
    const notes = await f.coach.mutation(api.eventQuestions.saveQuestion, { eventId: f.ids.event, kind: "longText", prompt: "Anything else?", required: false });
    expect((await f.student[0].query(api.participation.signupAvailability, { eventId: f.ids.event })).hasQuestions).toBe(true);
    await expect(f.student[0].mutation(api.participation.signUp, { eventId: f.ids.event })).rejects.toThrow('Please answer "Lunch?"');
    await expect(f.student[0].mutation(api.participation.signUp, { eventId: f.ids.event, answers: [{ questionId: lunch, value: "" }] })).rejects.toThrow("Please answer");
    await expect(f.student[0].mutation(api.participation.signUp, { eventId: f.ids.event, answers: [{ questionId: lunch, value: "Tacos" }] })).rejects.toThrow("Choose one of the listed options");
    await expect(f.student[0].mutation(api.participation.signUp, { eventId: f.ids.event, answers: [{ questionId: lunch, value: true }] })).rejects.toThrow("Choose one of the listed options");
    await expect(f.student[0].mutation(api.participation.signUp, { eventId: f.ids.event, answers: [{ questionId: lunch, value: "Pizza" }, { questionId: notes, value: "x".repeat(2001) }] })).rejects.toThrow("2,000 characters");
    expect(await f.t.run(ctx => ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", f.ids.event)).take(5))).toEqual([]);
    expect(await f.student[0].mutation(api.participation.signUp, { eventId: f.ids.event, answers: [{ questionId: lunch, value: "Pizza" }, { questionId: notes, value: "  " }] })).toBe("confirmed");
    expect((await f.student[0].query(api.eventQuestions.forSignup, { eventId: f.ids.event })).answers).toEqual([{ questionId: lunch, value: "Pizza" }]);
  });

  it("rejects an answer to another event's question", async () => {
    const f = await fixture();
    const foreign = await f.coach.mutation(api.eventQuestions.saveQuestion, { eventId: f.ids.other, kind: "yesNo", prompt: "Driving?", required: false });
    await expect(f.student[0].mutation(api.participation.signUp, { eventId: f.ids.event, answers: [{ questionId: foreign, value: true }] })).rejects.toThrow("changed or removed");
    await expect(f.student[0].mutation(api.eventQuestions.saveMyAnswers, { eventId: f.ids.assigned, answers: [{ questionId: foreign, value: true }] })).rejects.toThrow("changed or removed");
  });

  it("locks kind and options once answered, and archives instead of deleting answered questions", async () => {
    const f = await fixture();
    const q = await f.coach.mutation(api.eventQuestions.saveQuestion, { eventId: f.ids.assigned, kind: "multiChoice", prompt: "Which tasks?", options: ["Setup", "Booth"], required: true });
    const unanswered = await f.coach.mutation(api.eventQuestions.saveQuestion, { eventId: f.ids.assigned, kind: "number", prompt: "Hours?", required: false });
    await expect(f.student[1].mutation(api.eventQuestions.saveMyAnswers, { eventId: f.ids.assigned, answers: [{ questionId: q, value: ["Setup"] }] })).rejects.toThrow("not signed up");
    await expect(f.student[0].mutation(api.eventQuestions.saveMyAnswers, { eventId: f.ids.assigned, answers: [{ questionId: q, value: ["Setup", "Setup"] }] })).rejects.toThrow("each only once");
    await f.student[0].mutation(api.eventQuestions.saveMyAnswers, { eventId: f.ids.assigned, answers: [{ questionId: q, value: ["Booth", "Setup"] }] });
    await expect(f.coach.mutation(api.eventQuestions.saveQuestion, { eventId: f.ids.assigned, questionId: q, kind: "multiChoice", prompt: "Which tasks?", options: ["Setup", "Teardown"], required: true })).rejects.toThrow("type and options can't change");
    await expect(f.coach.mutation(api.eventQuestions.saveQuestion, { eventId: f.ids.assigned, questionId: q, kind: "singleChoice", prompt: "Which tasks?", options: ["Setup", "Booth"], required: true })).rejects.toThrow("type and options can't change");
    await f.coach.mutation(api.eventQuestions.saveQuestion, { eventId: f.ids.assigned, questionId: q, kind: "multiChoice", prompt: "Which tasks would you like?", options: ["Setup", "Booth"], required: false });
    expect(await f.coach.mutation(api.eventQuestions.removeQuestion, { questionId: unanswered })).toBe("deleted");
    expect(await f.coach.mutation(api.eventQuestions.removeQuestion, { questionId: q })).toBe("archived");
    expect((await f.student[0].query(api.eventQuestions.forSignup, { eventId: f.ids.assigned })).questions).toEqual([]);
    const responses = await f.coach.query(api.eventQuestions.responses, { eventId: f.ids.assigned });
    expect(responses.questions).toMatchObject([{ questionId: q, prompt: "Which tasks would you like?", archived: true }]);
    expect(responses.rows).toEqual([{ studentId: f.ids.students[0], name: "Synthetic Student 0", status: "confirmed", answers: [{ questionId: q, value: ["Booth", "Setup"] }] }]);
  });

  it("shows a student only their own answers", async () => {
    const f = await fixture();
    const q = await f.coach.mutation(api.eventQuestions.saveQuestion, { eventId: f.ids.event, kind: "shortText", prompt: "Allergies to snacks?", required: true });
    await f.student[0].mutation(api.participation.signUp, { eventId: f.ids.event, answers: [{ questionId: q, value: "Peanuts" }] });
    await f.student[1].mutation(api.participation.signUp, { eventId: f.ids.event, answers: [{ questionId: q, value: "None" }] });
    expect((await f.student[1].query(api.eventQuestions.forSignup, { eventId: f.ids.event })).answers).toEqual([{ questionId: q, value: "None" }]);
    await expect(f.student[1].query(api.eventQuestions.responses, { eventId: f.ids.event })).rejects.toThrow("Only a Coach or Travel Lead");
  });

  it("leaves inactive students out of responses", async () => {
    const f = await fixture();
    const q = await f.coach.mutation(api.eventQuestions.saveQuestion, { eventId: f.ids.event, kind: "shortText", prompt: "T-shirt size?", required: true });
    await f.student[0].mutation(api.participation.signUp, { eventId: f.ids.event, answers: [{ questionId: q, value: "M" }] });
    await f.student[1].mutation(api.participation.signUp, { eventId: f.ids.event, answers: [{ questionId: q, value: "L" }] });
    await f.t.run(ctx => ctx.db.patch(f.ids.students[0], { active: false }));
    expect((await f.coach.query(api.eventQuestions.responses, { eventId: f.ids.event })).rows.map(r => r.name)).toEqual(["Synthetic Student 1"]);
  });

  it.each([
    { name: "a question with over 20 options", call: (f: Fixture) => f.coach.mutation(api.eventQuestions.saveQuestion, { eventId: f.ids.event, kind: "singleChoice", prompt: "Lunch?", options: Array.from({ length: 21 }, (_, i) => `Option ${i}`), required: false }), error: "2 to 20 options" },
    { name: "reordering over 25 questions", call: async (f: Fixture) => { const q = await f.coach.mutation(api.eventQuestions.saveQuestion, { eventId: f.ids.event, kind: "yesNo", prompt: "Driving?", required: false }); return f.coach.mutation(api.eventQuestions.reorderQuestions, { eventId: f.ids.event, questionIds: Array(26).fill(q) }); }, error: "Too many questions" },
    { name: "saving over 25 answers", call: async (f: Fixture) => { const q = await f.coach.mutation(api.eventQuestions.saveQuestion, { eventId: f.ids.assigned, kind: "yesNo", prompt: "Driving?", required: false }); return f.student[0].mutation(api.eventQuestions.saveMyAnswers, { eventId: f.ids.assigned, answers: Array(26).fill({ questionId: q, value: true }) }); }, error: "Too many answers" },
    { name: "signing up with over 25 answers", call: async (f: Fixture) => { const q = await f.coach.mutation(api.eventQuestions.saveQuestion, { eventId: f.ids.event, kind: "yesNo", prompt: "Driving?", required: false }); return f.student[0].mutation(api.participation.signUp, { eventId: f.ids.event, answers: Array(26).fill({ questionId: q, value: true }) }); }, error: "Too many answers" },
  ])("rejects $name", async ({ call, error }) => {
    const f = await fixture();
    await expect(call(f)).rejects.toThrow(error);
  });
});

type Fixture = Awaited<ReturnType<typeof fixture>>;
