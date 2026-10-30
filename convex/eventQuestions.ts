import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { audit, ownStudent, viewer } from "./lib/access";
import { requireEnrollmentComplete } from "./lib/eventEnrollmentState";
import { MAX_PROMPT, MAX_QUESTIONS, MAX_QUESTION_ROWS, activeQuestions, answerInput, answerValue, checkAnswers, checkListSizes, cleanOptions, liveEvent, questionKind, questionRows, requireEventStaff, saveAnswers } from "./lib/eventSignupExtras";

const questionResult = v.object({ questionId: v.id("eventQuestions"), order: v.number(), kind: questionKind, prompt: v.string(), options: v.union(v.array(v.string()), v.null()), required: v.boolean(), archived: v.boolean() });
const answerResult = v.object({ questionId: v.id("eventQuestions"), value: answerValue });
const project = (q: Doc<"eventQuestions">) => ({ questionId: q._id, order: q.order, kind: q.kind, prompt: q.prompt, options: q.options ?? null, required: q.required, archived: q.archived ?? false });

/** Create (no questionId) or edit a signup question. Kind and options lock once a student has answered. */
export const saveQuestion = mutation({
  args: { eventId: v.id("events"), questionId: v.optional(v.id("eventQuestions")), kind: questionKind, prompt: v.string(), options: v.optional(v.array(v.string())), required: v.boolean() }, returns: v.id("eventQuestions"),
  handler: async (ctx, args) => {
    checkListSizes({ options: args.options });
    const user = await viewer(ctx); requireEventStaff(user);
    const event = await liveEvent(ctx, args.eventId);
    requireEnrollmentComplete(event);
    const prompt = args.prompt.trim();
    if (!prompt || prompt.length > MAX_PROMPT) throw new ConvexError("Enter a question of up to 300 characters.");
    const options = cleanOptions(args.kind, args.options);
    const values = { kind: args.kind, prompt, options, required: args.required };
    if (args.questionId) {
      const prior = await ctx.db.get(args.questionId);
      if (!prior || prior.eventId !== event._id || prior.archived) throw new ConvexError("This question was removed. Reload to see the event's current questions.");
      const answered = await ctx.db.query("eventQuestionAnswers").withIndex("by_questionId", q => q.eq("questionId", prior._id)).first();
      if (answered && (prior.kind !== args.kind || JSON.stringify(prior.options ?? null) !== JSON.stringify(options ?? null))) throw new ConvexError("Students have already answered this question, so its type and options can't change. You can still edit the wording or whether it's required, or remove it and add a new question.");
      await ctx.db.patch(prior._id, values);
      await audit(ctx, user, "eventQuestions", prior._id, "update", { kind: prior.kind, prompt: prior.prompt, options: prior.options, required: prior.required }, values);
      return prior._id;
    }
    const rows = await questionRows(ctx, event._id);
    if (rows.filter(q => !q.archived).length >= MAX_QUESTIONS) throw new ConvexError("This event already has 25 questions. Remove one before adding another.");
    if (rows.length >= MAX_QUESTION_ROWS) throw new ConvexError("This event has too many removed questions with answers to add more. Contact a Coach.");
    const id = await ctx.db.insert("eventQuestions", { eventId: event._id, order: (rows.at(-1)?.order ?? -1) + 1, ...values });
    await audit(ctx, user, "eventQuestions", id, "create", null, values);
    return id;
  },
});

/** Deletes an unanswered question; a question with answers is archived so the answers stay in responses. */
export const removeQuestion = mutation({
  args: { questionId: v.id("eventQuestions") }, returns: v.union(v.literal("deleted"), v.literal("archived")),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); requireEventStaff(user);
    const question = await ctx.db.get(args.questionId);
    if (!question || question.archived) throw new ConvexError("This question was already removed. Reload to see the event's current questions.");
    requireEnrollmentComplete(await liveEvent(ctx, question.eventId));
    const answered = await ctx.db.query("eventQuestionAnswers").withIndex("by_questionId", q => q.eq("questionId", question._id)).first();
    if (answered) await ctx.db.patch(question._id, { archived: true });
    else await ctx.db.delete(question._id);
    await audit(ctx, user, "eventQuestions", question._id, answered ? "archive" : "delete", { prompt: question.prompt, kind: question.kind }, null);
    return answered ? "archived" : "deleted";
  },
});

/** questionIds lists every active question of the event in the new order. */
export const reorderQuestions = mutation({
  args: { eventId: v.id("events"), questionIds: v.array(v.id("eventQuestions")) }, returns: v.null(),
  handler: async (ctx, args) => {
    checkListSizes({ questionIds: args.questionIds });
    const user = await viewer(ctx); requireEventStaff(user);
    const event = await liveEvent(ctx, args.eventId);
    requireEnrollmentComplete(event);
    const rows = await questionRows(ctx, event._id), active = rows.filter(q => !q.archived);
    if (args.questionIds.length !== active.length || new Set(args.questionIds).size !== active.length || args.questionIds.some(id => !active.some(q => q._id === id))) throw new ConvexError("The questions changed since you opened them. Reload, then reorder again.");
    // Archived questions keep their slots ahead of the active ones so responses still list them in a stable order.
    const base = (rows.reduce((n, q) => Math.max(n, q.order), -1)) + 1;
    for (const [i, id] of args.questionIds.entries()) await ctx.db.patch(id, { order: base + i });
    await audit(ctx, user, "eventQuestions", event._id, "reorder", active.map(q => q._id), args.questionIds);
    return null;
  },
});

/** The signed-in Student's view: the event's active questions and their own saved answers. */
export const forSignup = query({
  args: { eventId: v.id("events") }, returns: v.object({ questions: v.array(questionResult), answers: v.array(answerResult) }),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); const student = await ownStudent(ctx, user);
    const event = await ctx.db.get(args.eventId);
    if (!event || event.seasonId !== student.seasonId || event.archived) throw new ConvexError("This event is no longer available. Reload to see current events.");
    const questions = await activeQuestions(ctx, event._id);
    const answers = await ctx.db.query("eventQuestionAnswers").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(MAX_QUESTION_ROWS);
    return { questions: questions.map(project), answers: answers.filter(a => questions.some(q => q._id === a.questionId)).map(a => ({ questionId: a.questionId, value: a.value })) };
  },
});

/** Coach/Travel Lead table of answers per current (non-withdrawn) active participant, for the screen and CSV export. Archived questions with answers are included and flagged. */
export const responses = query({
  args: { eventId: v.id("events") },
  returns: v.object({ questions: v.array(questionResult), rows: v.array(v.object({ studentId: v.id("students"), name: v.string(), status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("waitlist")), answers: v.array(answerResult) })) }),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); requireEventStaff(user);
    const event = await liveEvent(ctx, args.eventId);
    const questions = await questionRows(ctx, event._id);
    const participants = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(501);
    if (participants.length > 500) throw new ConvexError("This event has too many signups to show here. Contact a Coach.");
    const rows = [];
    for (const p of participants) {
      if (p.status === "withdrawn") continue;
      const student = await ctx.db.get(p.studentId);
      if (!student?.active) continue;
      const answers = await ctx.db.query("eventQuestionAnswers").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", p.studentId)).take(MAX_QUESTION_ROWS);
      rows.push({ studentId: p.studentId, name: student.legalName || student.preferredName || "Student", status: p.status, answers: answers.map(a => ({ questionId: a.questionId, value: a.value })) });
    }
    return { questions: questions.map(project), rows: rows.sort((a, b) => a.name.localeCompare(b.name)) };
  },
});

/**
 * A signed-up Student (including Coach-assigned events) saves the full set of answers; blanks clear earlier answers.
 * Like signUp, this follows the signup close time rather than the event start, so answers stay editable until signup closes.
 */
export const saveMyAnswers = mutation({
  args: { eventId: v.id("events"), answers: v.array(answerInput) }, returns: v.null(),
  handler: async (ctx, args) => {
    checkListSizes({ answers: args.answers });
    const user = await viewer(ctx); const student = await ownStudent(ctx, user);
    const event = await liveEvent(ctx, args.eventId);
    if (event.cancelled) throw new ConvexError("This event is canceled, so answers can't be changed.");
    if (event.signupClosesAt !== undefined && Date.now() > event.signupClosesAt) throw new ConvexError("Signup for this event has closed, so answers can't be changed. Ask a Coach or Travel Lead if something needs fixing.");
    const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    if (!participant || participant.status === "withdrawn") throw new ConvexError("You're not signed up for this event. Sign up first, then answer its questions.");
    const checked = await checkAnswers(ctx, event._id, args.answers);
    const saved = await saveAnswers(ctx, event._id, student._id, checked, user._id);
    await audit(ctx, user, "eventQuestionAnswers", `${event._id}:${student._id}`, "saveAnswers", null, { answered: saved });
    return null;
  },
});
