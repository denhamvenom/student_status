import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { audit, ownStudent, studentAccess, viewer } from "./lib/access";
import { requireEnrollmentComplete } from "./lib/eventEnrollmentState";
import { MAX_SHIFTS, activeShifts, activeStudentIds, checkListSizes, checkShiftSettings, checkShifts, eventShiftSignups, liveEvent, replaceShifts, requireEventStaff } from "./lib/eventSignupExtras";

const studentName = (student: Doc<"students">) => student.legalName || student.preferredName || "Student";
const MAX_REASON = 500;

const shiftCount = v.object({ shiftId: v.id("eventShifts"), label: v.union(v.string(), v.null()), startsAt: v.number(), endsAt: v.number(), capacity: v.union(v.number(), v.null()), taken: v.number(), spotsLeft: v.union(v.number(), v.null()) });

/**
 * Shifts with counts and spots left (places held by inactive students don't count). Students see their own choice;
 * a Parent, Coach or Travel Lead passes studentId for a student they can read. Never returns other students' names.
 */
export const forEvent = query({
  args: { eventId: v.id("events"), studentId: v.optional(v.id("students")) },
  returns: v.object({ shiftsEnabled: v.boolean(), minShiftsPerStudent: v.number(), maxShiftsPerStudent: v.union(v.number(), v.null()), signupClosesAt: v.union(v.number(), v.null()), shifts: v.array(shiftCount), studentId: v.union(v.id("students"), v.null()), selectedShiftIds: v.array(v.id("eventShifts")) }),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    let studentId: Id<"students"> | null = null;
    if (user.role === "student") {
      studentId = (await ownStudent(ctx, user))._id;
      if (args.studentId && args.studentId !== studentId) throw new ConvexError("You can see only your own shifts.");
    } else if (args.studentId) studentId = (await studentAccess(ctx, user, args.studentId))._id;
    else if (user.role === "parent") throw new ConvexError("Choose your student to see their shifts.");
    const event = await liveEvent(ctx, args.eventId);
    const shifts = await activeShifts(ctx, event._id);
    const places = await eventShiftSignups(ctx, event._id);
    const active = await activeStudentIds(ctx, places.map(p => p.studentId));
    const selected = studentId ? places.filter(p => p.studentId === studentId).map(p => p.shiftId).filter(id => shifts.some(s => s._id === id)) : [];
    return {
      shiftsEnabled: event.shiftsEnabled ?? false, minShiftsPerStudent: event.minShiftsPerStudent ?? 1, maxShiftsPerStudent: event.maxShiftsPerStudent ?? null, signupClosesAt: event.signupClosesAt ?? null,
      shifts: shifts.map(s => { const taken = places.filter(p => p.shiftId === s._id && active.has(p.studentId)).length; return { shiftId: s._id, label: s.label ?? null, startsAt: s.startsAt, endsAt: s.endsAt, capacity: s.capacity ?? null, taken, spotsLeft: s.capacity === undefined ? null : Math.max(0, s.capacity - taken) }; }),
      studentId, selectedShiftIds: selected,
    };
  },
});

/**
 * Coach/Travel Lead roster of active students: names per shift, plus current signups with fewer shifts than the event's minimum.
 * outsideEvent flags a shift that no longer fits the event's times, for example after the event moved in Team Calendar.
 */
export const roster = query({
  args: { eventId: v.id("events") },
  returns: v.object({
    shifts: v.array(v.object({ shiftId: v.id("eventShifts"), label: v.union(v.string(), v.null()), startsAt: v.number(), endsAt: v.number(), capacity: v.union(v.number(), v.null()), outsideEvent: v.boolean(), students: v.array(v.object({ studentId: v.id("students"), name: v.string() })) })),
    needsShifts: v.array(v.object({ studentId: v.id("students"), name: v.string(), shiftCount: v.number() })),
  }),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); requireEventStaff(user);
    const event = await liveEvent(ctx, args.eventId);
    const shifts = await activeShifts(ctx, event._id);
    const places = await eventShiftSignups(ctx, event._id);
    const participants = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(501);
    if (participants.length > 500) throw new ConvexError("This event has too many signups to show here. Contact a Coach.");
    // Only active students get a name, so inactive students drop out of the roster and its counts.
    const names = new Map<Id<"students">, string>();
    for (const id of new Set([...places.map(p => p.studentId), ...participants.map(p => p.studentId)])) {
      const student = await ctx.db.get(id);
      if (student?.active) names.set(id, studentName(student));
    }
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    const min = Math.min(event.minShiftsPerStudent ?? 1, shifts.length);
    return {
      shifts: shifts.map(s => ({ shiftId: s._id, label: s.label ?? null, startsAt: s.startsAt, endsAt: s.endsAt, capacity: s.capacity ?? null, outsideEvent: s.startsAt < event.startsAt || s.endsAt > event.endsAt, students: places.filter(p => p.shiftId === s._id && names.has(p.studentId)).map(p => ({ studentId: p.studentId, name: names.get(p.studentId) ?? "Student" })).sort(byName) })),
      needsShifts: !event.shiftsEnabled ? [] : participants.filter(p => (p.status === "confirmed" || p.status === "pending") && names.has(p.studentId)).map(p => ({ studentId: p.studentId, name: names.get(p.studentId) ?? "Student", shiftCount: places.filter(x => x.studentId === p.studentId && shifts.some(s => s._id === x.shiftId)).length })).filter(p => p.shiftCount < min).sort(byName),
    };
  },
});

/** Create (no shiftId) or edit a shift. Times must fall inside the event; times lock once students chose the shift. */
export const saveShift = mutation({
  args: { eventId: v.id("events"), shiftId: v.optional(v.id("eventShifts")), label: v.optional(v.string()), startsAt: v.number(), endsAt: v.number(), capacity: v.optional(v.union(v.number(), v.null())) }, returns: v.id("eventShifts"),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); requireEventStaff(user);
    const event = await liveEvent(ctx, args.eventId);
    if (event.cancelled) throw new ConvexError("This event is canceled, so its shifts can't be changed.");
    requireEnrollmentComplete(event);
    const label = args.label?.trim() || undefined;
    if (label && label.length > 80) throw new ConvexError("Keep the shift name to 80 characters or fewer.");
    if (!Number.isFinite(args.startsAt) || !Number.isFinite(args.endsAt) || args.endsAt <= args.startsAt) throw new ConvexError("A shift must end after it starts.");
    if (args.startsAt < event.startsAt || args.endsAt > event.endsAt) throw new ConvexError("Shifts must fall within the event's start and end times.");
    if (args.capacity != null && (!Number.isSafeInteger(args.capacity) || args.capacity < 1 || args.capacity > 500)) throw new ConvexError("Enter shift places from 1 to 500, or leave it blank for no limit.");
    const values = { label, startsAt: args.startsAt, endsAt: args.endsAt, capacity: args.capacity ?? undefined };
    if (args.shiftId) {
      const prior = await ctx.db.get(args.shiftId);
      if (!prior || prior.eventId !== event._id || prior.archived) throw new ConvexError("This shift was removed. Reload to see current shifts.");
      const taken = await ctx.db.query("shiftSignups").withIndex("by_shiftId", q => q.eq("shiftId", prior._id)).take(501);
      if (taken.length && (prior.startsAt !== args.startsAt || prior.endsAt !== args.endsAt)) throw new ConvexError("Students already chose this shift, so its times can't change. Add a new shift instead, or remove this one.");
      if (values.capacity !== undefined && values.capacity < taken.length) throw new ConvexError("Shift places can't be lower than the places already taken.");
      await ctx.db.patch(prior._id, values);
      await audit(ctx, user, "eventShifts", prior._id, "update", { label: prior.label, startsAt: prior.startsAt, endsAt: prior.endsAt, capacity: prior.capacity }, values);
      return prior._id;
    }
    const existing = await ctx.db.query("eventShifts").withIndex("by_eventId_and_startsAt", q => q.eq("eventId", event._id)).take(MAX_SHIFTS + 1);
    if (existing.length >= MAX_SHIFTS) throw new ConvexError("This event already has 100 shifts. Remove one before adding another.");
    const id = await ctx.db.insert("eventShifts", { eventId: event._id, ...values });
    await audit(ctx, user, "eventShifts", id, "create", null, values);
    return id;
  },
});

/** Removes a shift. If students chose it, pass force to remove it and their places (audited). */
export const removeShift = mutation({
  args: { shiftId: v.id("eventShifts"), force: v.optional(v.boolean()) }, returns: v.object({ removedPlaces: v.number() }),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); requireEventStaff(user);
    const shift = await ctx.db.get(args.shiftId);
    if (!shift) throw new ConvexError("This shift was already removed. Reload to see current shifts.");
    requireEnrollmentComplete(await liveEvent(ctx, shift.eventId));
    const taken = await ctx.db.query("shiftSignups").withIndex("by_shiftId", q => q.eq("shiftId", shift._id)).take(501);
    if (taken.length > 500) throw new ConvexError("This shift has too many places to remove here. Contact a Coach.");
    if (taken.length && !args.force) throw new ConvexError(`${taken.length} ${taken.length === 1 ? "student has" : "students have"} chosen this shift. Confirm to remove the shift and their places.`);
    for (const row of taken) await ctx.db.delete(row._id);
    await ctx.db.delete(shift._id);
    await audit(ctx, user, "eventShifts", shift._id, "remove", { label: shift.label, startsAt: shift.startsAt, endsAt: shift.endsAt, capacity: shift.capacity }, { removedStudentIds: taken.map(row => row.studentId) });
    return { removedPlaces: taken.length };
  },
});

/** Turns shifts on or off and sets per-student limits. null clears a limit (no maximum; minimum back to 1). Turning shifts off keeps chosen places. */
export const updateShiftSettings = mutation({
  args: { eventId: v.id("events"), shiftsEnabled: v.boolean(), maxShiftsPerStudent: v.optional(v.union(v.number(), v.null())), minShiftsPerStudent: v.optional(v.union(v.number(), v.null())) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); requireEventStaff(user);
    const event = await liveEvent(ctx, args.eventId);
    if (event.cancelled) throw new ConvexError("This event is canceled, so its shifts can't be changed.");
    requireEnrollmentComplete(event);
    const max = args.maxShiftsPerStudent === undefined ? event.maxShiftsPerStudent : args.maxShiftsPerStudent ?? undefined;
    const min = args.minShiftsPerStudent === undefined ? event.minShiftsPerStudent : args.minShiftsPerStudent ?? undefined;
    checkShiftSettings({ maxShiftsPerStudent: max, minShiftsPerStudent: min });
    const patch = { shiftsEnabled: args.shiftsEnabled, maxShiftsPerStudent: max, minShiftsPerStudent: min };
    await ctx.db.patch(event._id, patch);
    await audit(ctx, user, "events", event._id, "updateShiftSettings", { shiftsEnabled: event.shiftsEnabled ?? false, maxShiftsPerStudent: event.maxShiftsPerStudent, minShiftsPerStudent: event.minShiftsPerStudent }, patch);
    return null;
  },
});

async function signedUp(ctx: MutationCtx, eventId: Id<"events">, studentId: Id<"students">, message: string) {
  const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).unique();
  if (participant?.status !== "confirmed" && participant?.status !== "pending") throw new ConvexError(message);
}

/** The signed-in Student replaces their shift choice until the event starts. Waitlisted students choose after they get a place. */
export const setMyShifts = mutation({
  args: { eventId: v.id("events"), shiftIds: v.array(v.id("eventShifts")) }, returns: v.null(),
  handler: async (ctx, args) => {
    checkListSizes({ shiftIds: args.shiftIds });
    const user = await viewer(ctx); const student = await ownStudent(ctx, user);
    const event = await liveEvent(ctx, args.eventId);
    if (event.cancelled) throw new ConvexError("This event is canceled, so shifts can't be changed.");
    if (Date.now() >= event.startsAt) throw new ConvexError("This event has started. Ask a Coach to change your shifts.");
    requireEnrollmentComplete(event);
    if (event.signupClosesAt !== undefined && Date.now() > event.signupClosesAt) throw new ConvexError("Signup for this event has closed, so shifts can't be changed. Ask a Coach or Travel Lead if you need a different shift.");
    await signedUp(ctx, event._id, student._id, "Sign up for this event before choosing shifts. If you're Waitlisted, choose shifts once you get a place.");
    const chosen = await checkShifts(ctx, event, student._id, args.shiftIds);
    const change = await replaceShifts(ctx, event._id, student._id, chosen);
    await audit(ctx, user, "shiftSignups", `${event._id}:${student._id}`, "setShifts", change.before, change.after);
    return null;
  },
});

/** Coach/Travel Lead sets a student's shifts. May go over a shift's places and below the minimum (including none), but not over the maximum or into overlapping times. */
export const setStudentShifts = mutation({
  args: { eventId: v.id("events"), studentId: v.id("students"), shiftIds: v.array(v.id("eventShifts")), reason: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    checkListSizes({ shiftIds: args.shiftIds });
    const reason = args.reason?.trim() || undefined;
    if (reason && reason.length > MAX_REASON) throw new ConvexError(`Keep the reason to ${MAX_REASON} characters or fewer.`);
    const user = await viewer(ctx); requireEventStaff(user);
    const event = await liveEvent(ctx, args.eventId);
    if (event.cancelled) throw new ConvexError("This event is canceled, so its shifts can't be changed.");
    requireEnrollmentComplete(event);
    const student = await ctx.db.get(args.studentId);
    if (!student || !student.active || student.seasonId !== event.seasonId) throw new ConvexError("This student is no longer active in the current season. Reload to see the latest.");
    await signedUp(ctx, event._id, student._id, "This student isn't Signed up or Waiting for approval for this event, so they can't have shifts.");
    const chosen = await checkShifts(ctx, event, student._id, args.shiftIds, { overrideCapacity: true, allowBelowMin: true });
    const change = await replaceShifts(ctx, event._id, student._id, chosen);
    await audit(ctx, user, "shiftSignups", `${event._id}:${student._id}`, "setStudentShifts", change.before, change.after, reason);
    return null;
  },
});
