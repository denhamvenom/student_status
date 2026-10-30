import { ConvexError, v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type Ctx = QueryCtx | MutationCtx;

export const questionKind = v.union(v.literal("singleChoice"), v.literal("multiChoice"), v.literal("shortText"), v.literal("longText"), v.literal("yesNo"), v.literal("number"));
export const answerValue = v.union(v.string(), v.array(v.string()), v.number(), v.boolean());
export const answerInput = v.object({ questionId: v.id("eventQuestions"), value: answerValue });
export type AnswerValue = Infer<typeof answerValue>;
export type QuestionKind = Infer<typeof questionKind>;

export const MAX_QUESTIONS = 25, MAX_QUESTION_ROWS = 100, MAX_PROMPT = 300, MAX_OPTION = 100, MAX_OPTIONS = 20, MAX_TEXT_ANSWER = 2000;
export const MAX_SHIFTS = 100, MAX_SHIFT_SIGNUPS_PER_EVENT = 2000;
export const choiceKind = (kind: QuestionKind) => kind === "singleChoice" || kind === "multiChoice";

/** Same rule as eventOperations' requireOperations: Coaches and Travel Leads manage event setup. */
export function requireEventStaff(user: Doc<"appUsers">) {
  if (user.role !== "coach" && !user.travelLead) throw new ConvexError("Only a Coach or Travel Lead can manage events.");
}

/** An event in the active season that has not moved to Past events. The schema imports this module, so it stays free of access.ts. */
export async function liveEvent(ctx: Ctx, eventId: Id<"events">) {
  const event = await ctx.db.get(eventId);
  const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
  if (!season) throw new ConvexError("No season is active yet. Ask a Coach to set up the season.");
  if (!event || event.seasonId !== season._id || event.archived) throw new ConvexError("This event is no longer active. It may have moved to Past events. Reload to see current events.");
  return event;
}

/** Rejects oversized argument lists before any database work. */
export function checkListSizes(lists: { shiftIds?: unknown[]; answers?: unknown[]; questionIds?: unknown[]; options?: unknown[] }) {
  if ((lists.shiftIds?.length ?? 0) > MAX_SHIFTS) throw new ConvexError("Too many shifts were sent. Reload and try again.");
  if ((lists.answers?.length ?? 0) > MAX_QUESTIONS) throw new ConvexError("Too many answers were sent. Reload and try again.");
  if ((lists.questionIds?.length ?? 0) > MAX_QUESTIONS) throw new ConvexError("Too many questions were sent. Reload and try again.");
  if ((lists.options?.length ?? 0) > MAX_OPTIONS) throw new ConvexError(`Give a choice question 2 to ${MAX_OPTIONS} options, each up to ${MAX_OPTION} characters.`);
}

/** The active students among those given. Inactive students keep their rows but drop out of shift counts and responses. */
export async function activeStudentIds(ctx: Ctx, studentIds: Iterable<Id<"students">>) {
  const active = new Set<Id<"students">>();
  for (const id of new Set(studentIds)) if ((await ctx.db.get(id))?.active) active.add(id);
  return active;
}

const clip = (text: string) => text.length > 80 ? `${text.slice(0, 77)}...` : text;

// Questions

/** Every question row for the event (archived included) in display order. */
export async function questionRows(ctx: Ctx, eventId: Id<"events">) {
  const rows = await ctx.db.query("eventQuestions").withIndex("by_eventId_and_order", q => q.eq("eventId", eventId)).take(MAX_QUESTION_ROWS + 1);
  if (rows.length > MAX_QUESTION_ROWS) throw new ConvexError("This event has too many questions to show here. Contact a Coach.");
  return rows;
}

export async function activeQuestions(ctx: Ctx, eventId: Id<"events">) {
  return (await questionRows(ctx, eventId)).filter(q => !q.archived);
}

/** Cleans a question's options: 2-20 non-empty unique choices up to 100 characters for choice kinds, none otherwise. */
export function cleanOptions(kind: QuestionKind, options: string[] | undefined) {
  if (!choiceKind(kind)) {
    if (options?.some(o => o.trim())) throw new ConvexError("Only multiple-choice questions have options. Remove the options or change the question type.");
    return undefined;
  }
  const cleaned = (options ?? []).map(o => o.trim());
  if (cleaned.length < 2 || cleaned.length > MAX_OPTIONS || cleaned.some(o => !o || o.length > MAX_OPTION)) throw new ConvexError(`Give a choice question 2 to ${MAX_OPTIONS} options, each up to ${MAX_OPTION} characters.`);
  if (new Set(cleaned.map(o => o.toLowerCase())).size !== cleaned.length) throw new ConvexError("Each option must be different. Remove the repeated option.");
  return cleaned;
}

/** A valid answer, or null when the student left it blank. Throws a plain-language error for an invalid answer. */
export function cleanAnswer(question: Doc<"eventQuestions">, value: AnswerValue): AnswerValue | null {
  const bad = (hint: string) => new ConvexError(`Check your answer to "${clip(question.prompt)}". ${hint}`);
  switch (question.kind) {
    case "singleChoice":
      if (typeof value !== "string") throw bad("Choose one of the listed options.");
      if (!value) return null;
      if (!question.options?.includes(value)) throw bad("Choose one of the listed options.");
      return value;
    case "multiChoice":
      if (!Array.isArray(value)) throw bad("Choose from the listed options.");
      if (!value.length) return null;
      if (new Set(value).size !== value.length || value.some(x => !question.options?.includes(x))) throw bad("Choose from the listed options, each only once.");
      return value;
    case "shortText": case "longText": {
      if (typeof value !== "string") throw bad("Type your answer.");
      const text = value.trim();
      if (text.length > MAX_TEXT_ANSWER) throw bad("Keep it to 2,000 characters or fewer.");
      return text || null;
    }
    case "yesNo":
      if (typeof value !== "boolean") throw bad("Choose Yes or No.");
      return value;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) throw bad("Enter a number.");
      return value;
  }
}

/**
 * Checks a full set of answers for the event's active questions: each must belong to this event and be valid,
 * and every required question must be answered. Reads only; call before any write.
 */
export async function checkAnswers(ctx: Ctx, eventId: Id<"events">, answers: { questionId: Id<"eventQuestions">; value: AnswerValue }[]) {
  const questions = await activeQuestions(ctx, eventId);
  if (answers.length > MAX_QUESTIONS) throw new ConvexError("Too many answers were sent. Reload and try again.");
  const values = new Map<Id<"eventQuestions">, AnswerValue>();
  for (const answer of answers) {
    const question = questions.find(q => q._id === answer.questionId);
    if (!question) throw new ConvexError("One of these questions was changed or removed. Reload to see the event's current questions.");
    if (values.has(question._id)) throw new ConvexError("A question was answered twice. Reload and try again.");
    const value = cleanAnswer(question, answer.value);
    if (value !== null) values.set(question._id, value);
  }
  const missing = questions.find(q => q.required && !values.has(q._id));
  if (missing) throw new ConvexError(`Please answer "${clip(missing.prompt)}". It's required for this event.`);
  return { questions, values };
}

/** Saves checked answers for active questions; blank answers clear a prior one. Answers to archived questions stay. */
export async function saveAnswers(ctx: MutationCtx, eventId: Id<"events">, studentId: Id<"students">, checked: Awaited<ReturnType<typeof checkAnswers>>, answeredBy: Id<"appUsers">) {
  const prior = await ctx.db.query("eventQuestionAnswers").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).take(MAX_QUESTION_ROWS + 1);
  const now = Date.now();
  for (const question of checked.questions) {
    const old = prior.find(a => a.questionId === question._id);
    const value = checked.values.get(question._id);
    if (value === undefined) { if (old) await ctx.db.delete(old._id); continue; }
    if (old && JSON.stringify(old.value) === JSON.stringify(value)) continue;
    if (old) await ctx.db.patch(old._id, { value, answeredBy, updatedAt: now });
    else await ctx.db.insert("eventQuestionAnswers", { eventId, studentId, questionId: question._id, value, answeredBy, updatedAt: now });
  }
  return [...checked.values.keys()];
}

// Shifts

export async function activeShifts(ctx: Ctx, eventId: Id<"events">) {
  const rows = await ctx.db.query("eventShifts").withIndex("by_eventId_and_startsAt", q => q.eq("eventId", eventId)).take(MAX_SHIFTS + 1);
  if (rows.length > MAX_SHIFTS) throw new ConvexError("This event has too many shifts to show here. Contact a Coach.");
  return rows.filter(s => !s.archived);
}

/** Every shift place taken at the event, bounded. */
export async function eventShiftSignups(ctx: Ctx, eventId: Id<"events">) {
  const rows = await ctx.db.query("shiftSignups").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId)).take(MAX_SHIFT_SIGNUPS_PER_EVENT + 1);
  if (rows.length > MAX_SHIFT_SIGNUPS_PER_EVENT) throw new ConvexError("This event has too many shift places to show here. Contact a Coach.");
  return rows;
}

export async function studentShiftSignups(ctx: Ctx, eventId: Id<"events">, studentId: Id<"students">) {
  return await ctx.db.query("shiftSignups").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).take(MAX_SHIFTS + 1);
}

/** Validates optional shift limits: max from 1 to 100, min from 0 to 100 and not above max. */
export function checkShiftSettings(settings: { maxShiftsPerStudent?: number | null; minShiftsPerStudent?: number | null }) {
  const { maxShiftsPerStudent: max, minShiftsPerStudent: min } = settings;
  if (max != null && (!Number.isSafeInteger(max) || max < 1 || max > MAX_SHIFTS)) throw new ConvexError("Set the most shifts per student from 1 to 100, or leave it blank for no limit.");
  if (min != null && (!Number.isSafeInteger(min) || min < 0 || min > MAX_SHIFTS)) throw new ConvexError("Set the fewest shifts per student from 0 to 100.");
  if (max != null && min != null && min > max) throw new ConvexError("The fewest shifts per student can't be more than the most shifts per student.");
}

export const shiftName = (shift: Doc<"eventShifts">) => shift.label ? `The "${clip(shift.label)}" shift` : "A shift you chose";

/**
 * Checks a student's full shift choice for the event before any write: the shifts belong to this event, no repeats,
 * the event's min/max (min never above the number of shifts offered), no overlapping times, and open places
 * (places held by inactive students don't count) unless staff override capacity. allowBelowMin lets staff choose fewer than the minimum, including none.
 */
export async function checkShifts(ctx: Ctx, event: Doc<"events">, studentId: Id<"students">, shiftIds: Id<"eventShifts">[], options: { overrideCapacity?: boolean; allowBelowMin?: boolean } = {}) {
  if (!event.shiftsEnabled) {
    if (shiftIds.length) throw new ConvexError("This event doesn't use shifts. Reload to see the latest.");
    return [];
  }
  if (new Set(shiftIds).size !== shiftIds.length) throw new ConvexError("The same shift was chosen twice. Choose each shift only once.");
  const shifts = await activeShifts(ctx, event._id);
  const picked = shiftIds.map(id => shifts.find(s => s._id === id));
  if (picked.some(s => !s)) throw new ConvexError("One of the shifts you chose was changed or removed. Reload to see current shifts.");
  const chosen = (picked as Doc<"eventShifts">[]).sort((a, b) => a.startsAt - b.startsAt);
  const min = Math.min(event.minShiftsPerStudent ?? 1, shifts.length), max = event.maxShiftsPerStudent;
  if (chosen.length < min && !options.allowBelowMin) throw new ConvexError(`Choose at least ${min} ${min === 1 ? "shift" : "shifts"} for this event.`);
  if (max !== undefined && chosen.length > max) throw new ConvexError(`Choose up to ${max} ${max === 1 ? "shift" : "shifts"} for this event.`);
  for (let i = 1; i < chosen.length; i++) if (chosen[i].startsAt < chosen[i - 1].endsAt) throw new ConvexError("Two of the shifts you chose overlap. Choose shifts at different times.");
  if (!options.overrideCapacity) for (const shift of chosen) {
    if (shift.capacity === undefined) continue;
    const others = (await ctx.db.query("shiftSignups").withIndex("by_shiftId", q => q.eq("shiftId", shift._id)).take(501)).filter(s => s.studentId !== studentId);
    if (others.length >= shift.capacity && (await activeStudentIds(ctx, others.map(s => s.studentId))).size >= shift.capacity) throw new ConvexError(`${shiftName(shift)} is full. Choose another shift.`);
  }
  return chosen;
}

/** Replaces the student's shift places at the event with the checked choice. */
export async function replaceShifts(ctx: MutationCtx, eventId: Id<"events">, studentId: Id<"students">, chosen: Doc<"eventShifts">[]) {
  const prior = await studentShiftSignups(ctx, eventId, studentId);
  for (const row of prior) if (!chosen.some(s => s._id === row.shiftId)) await ctx.db.delete(row._id);
  const now = Date.now();
  for (const shift of chosen) if (!prior.some(row => row.shiftId === shift._id)) await ctx.db.insert("shiftSignups", { eventId, shiftId: shift._id, studentId, createdAt: now });
  return { before: prior.map(row => row.shiftId), after: chosen.map(s => s._id) };
}

/** Frees every shift place a student holds at the event. Call whenever a participant becomes withdrawn or waitlisted. */
export async function clearShifts(ctx: MutationCtx, eventId: Id<"events">, studentId: Id<"students">) {
  const rows = await studentShiftSignups(ctx, eventId, studentId);
  for (const row of rows) await ctx.db.delete(row._id);
  return rows.length;
}
