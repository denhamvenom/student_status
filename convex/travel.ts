import { enrollmentPending, requireEnrollmentComplete } from "./lib/eventEnrollmentState";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { activeSeason, audit, studentAccess, viewer } from "./lib/access";

type Ctx = QueryCtx | MutationCtx;
const MAX_DRIVERS = 200;
const MAX_PARTICIPANTS = 500;

function operator(user: Doc<"appUsers">) {
  if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new Error("Travel operations require Coach or Travel Lead access.");
}

function whole(value: number, label: string, max = 500) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new Error(`${label} must be a whole number from 0 to ${max}.`);
}

async function currentEvent(ctx: Ctx, eventId: Id<"events">) {
  const [event, season] = await Promise.all([ctx.db.get(eventId), activeSeason(ctx)]);
  if (!event || event.seasonId !== season._id || event.archived) throw new Error("Event is unavailable in the active season.");
  if ("scheduler" in ctx) requireEnrollmentComplete(event);
  return event;
}

export async function transportSummary(ctx: Ctx, event: Doc<"events">) {
  if (enrollmentPending(event)) return { state: "open" as const, seats: 0, demand: 0, ridingStudents: 0, additionalAdults: 0, busSeats: 0, vehicleSeats: 0, open: ["Whole Team enrollment is not complete."] };
  const enabled = event.transportEnabled ?? event.travel !== "Families provide transportation";
  if (!enabled) return { state: "notApplicable" as const, seats: 0, demand: 0, ridingStudents: 0, additionalAdults: 0, busSeats: 0, vehicleSeats: 0, open: [] as string[] };
  const participants = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(MAX_PARTICIPANTS + 1);
  if (participants.length > MAX_PARTICIPANTS) throw new Error("Event participant limit reached.");
  const confirmed = participants.filter(p => p.status === "confirmed" && !p.independentTravel);
  const students = await Promise.all(confirmed.map(p => ctx.db.get(p.studentId)));
  const ridingStudents = students.filter(s => !!s && s.active && s.seasonId === event.seasonId).length;
  const additionalAdults = event.additionalAdults ?? 0;
  const busSeats = event.busSeats ?? 0;
  const assignments = await ctx.db.query("eventVehicles").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(MAX_DRIVERS + 1);
  if (assignments.length > MAX_DRIVERS) throw new Error("Event vehicle limit reached.");
  const drivers = await Promise.all(assignments.map(a => ctx.db.get(a.driverId)));
  const valid = assignments.map((a, i) => ({ assignment: a, driver: drivers[i] })).filter((x): x is { assignment: Doc<"eventVehicles">; driver: Doc<"drivers"> } => !!x.driver && x.driver.seasonId === event.seasonId && x.driver.approved && x.driver.active !== false);
  const vehicleSeats = valid.reduce((sum, x) => sum + Math.min(x.assignment.seats, x.driver.seats), 0);
  const seats = busSeats + vehicleSeats;
  const demand = ridingStudents + additionalAdults;
  const open: string[] = [];
  if (valid.some(x => x.assignment.seats > x.driver.seats)) open.push("An assigned vehicle's event seats exceed its current passenger seats.");
  if (seats < demand) open.push(`${demand - seats} more passenger ${demand - seats === 1 ? "seat is" : "seats are"} needed.`);
  if (event.trailerRequired && !valid.some(x => x.driver.towCapable)) open.push("Assign an approved, active tow-capable driver for the trailer.");
  return { state: open.length ? "open" as const : "ready" as const, seats, demand, ridingStudents, additionalAdults, busSeats, vehicleSeats, open };
}

export const listDrivers = query({
  args: {}, returns: v.any(),
  handler: async ctx => {
    operator(await viewer(ctx));
    const season = await activeSeason(ctx);
    const drivers = await ctx.db.query("drivers").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(MAX_DRIVERS + 1);
    if (drivers.length > MAX_DRIVERS) throw new Error("Driver list limit reached.");
    return drivers;
  },
});

export const saveDriver = mutation({
  args: { driverId: v.optional(v.id("drivers")), name: v.string(), email: v.string(), phone: v.string(), vehicleName: v.string(), seats: v.number(), approved: v.boolean(), towCapable: v.boolean(), active: v.boolean() }, returns: v.id("drivers"),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); operator(user);
    const season = await activeSeason(ctx);
    const name = args.name.trim(), email = args.email.trim(), phone = args.phone.trim(), vehicleName = args.vehicleName.trim();
    if (!name || name.length > 100 || !email || email.length > 200 || !email.includes("@") || !phone || phone.length > 50 || vehicleName.length > 100) throw new Error("Enter a valid driver name, email, phone and vehicle name.");
    whole(args.seats, "Passenger seats", 100);
    const patch = { name, email, phone, vehicleName, seats: args.seats, approved: args.approved, towCapable: args.towCapable, active: args.active };
    const existing = await ctx.db.query("drivers").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(MAX_DRIVERS + 1);
    if (existing.length > MAX_DRIVERS) throw new Error("Driver list needs Coach review before changes.");
    const emailKey = email.toLowerCase();
    if (existing.some(row => row._id !== args.driverId && row.email.trim().toLowerCase() === emailKey)) throw new Error("A driver already uses this email in the active season. Reconcile the existing record.");
    if (args.driverId) {
      const prior = await ctx.db.get(args.driverId);
      if (!prior || prior.seasonId !== season._id) throw new Error("Driver is unavailable in the active season.");
      if (prior.ownerAppUserId) {
        const owner = await ctx.db.get(prior.ownerAppUserId);
        if (!owner || owner.email.trim().toLowerCase() !== emailKey) throw new Error("Owned driver email must match its Mentor account. Coach reconciliation is required.");
      }
      await ctx.db.patch(prior._id, patch);
      await audit(ctx, user, "drivers", prior._id, "update", prior, patch);
      return prior._id;
    }
    if (existing.length >= MAX_DRIVERS) throw new Error("Driver limit reached for this season.");
    const id = await ctx.db.insert("drivers", { seasonId: season._id, ...patch });
    await audit(ctx, user, "drivers", id, "create", null, patch);
    return id;
  },
});

export const eventTransport = query({
  args: { eventId: v.id("events") }, returns: v.any(),
  handler: async (ctx, args) => {
    operator(await viewer(ctx));
    const event = await currentEvent(ctx, args.eventId);
    const season = await activeSeason(ctx);
    const drivers = await ctx.db.query("drivers").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(MAX_DRIVERS + 1);
    const assignments = await ctx.db.query("eventVehicles").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(MAX_DRIVERS + 1);
    const participants = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(MAX_PARTICIPANTS + 1);
    if (drivers.length > MAX_DRIVERS || assignments.length > MAX_DRIVERS || participants.length > MAX_PARTICIPANTS) throw new Error("Travel record limit reached.");
    const confirmed = participants.filter(p => p.status === "confirmed");
    const students = await Promise.all(confirmed.map(p => ctx.db.get(p.studentId)));
    const riders = confirmed.flatMap((p, i) => {
      const student = students[i];
      return student?.active && student.seasonId === event.seasonId ? [{ studentId: student._id, name: student.preferredName || student.legalName, independentTravel: p.independentTravel ?? false }] : [];
    });
    return { event: { _id: event._id, name: event.name, transportEnabled: event.transportEnabled ?? event.travel !== "Families provide transportation", busSeats: event.busSeats ?? 0, additionalAdults: event.additionalAdults ?? 0, trailerRequired: event.trailerRequired ?? false }, drivers, assignments, riders, summary: await transportSummary(ctx, event) };
  },
});

export const setEventTransport = mutation({
  args: { eventId: v.id("events"), transportEnabled: v.boolean(), busSeats: v.number(), additionalAdults: v.number(), trailerRequired: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); operator(user);
    const event = await currentEvent(ctx, args.eventId);
    whole(args.busSeats, "Bus passenger seats"); whole(args.additionalAdults, "Additional adult passengers");
    const patch = { transportEnabled: args.transportEnabled, busSeats: args.busSeats, additionalAdults: args.additionalAdults, trailerRequired: args.trailerRequired };
    await ctx.db.patch(event._id, patch);
    await audit(ctx, user, "events", event._id, "setTransport", { transportEnabled: event.transportEnabled, busSeats: event.busSeats, additionalAdults: event.additionalAdults, trailerRequired: event.trailerRequired }, patch);
    return null;
  },
});

export const assignVehicle = mutation({
  args: { eventId: v.id("events"), driverId: v.id("drivers"), seats: v.number(), notes: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); operator(user);
    const event = await currentEvent(ctx, args.eventId);
    const driver = await ctx.db.get(args.driverId);
    if (!driver || driver.seasonId !== event.seasonId || !driver.approved || driver.active === false) throw new Error("Choose an approved, active driver from this season.");
    whole(args.seats, "Passenger seats", 100);
    if (args.seats > driver.seats) throw new Error("Event passenger seats cannot exceed the driver's available seats.");
    const notes = args.notes?.trim();
    if (notes && notes.length > 500) throw new Error("Vehicle notes must be under 500 characters.");
    const prior = await ctx.db.query("eventVehicles").withIndex("by_eventId_and_driverId", q => q.eq("eventId", event._id).eq("driverId", driver._id)).unique();
    const patch = { seats: args.seats, notes };
    if (prior) { await ctx.db.patch(prior._id, patch); await audit(ctx, user, "eventVehicles", prior._id, "update", prior, patch); }
    else {
      const existing = await ctx.db.query("eventVehicles").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(MAX_DRIVERS);
      if (existing.length >= MAX_DRIVERS) throw new Error("Vehicle assignment limit reached for this event.");
      const id = await ctx.db.insert("eventVehicles", { eventId: event._id, driverId: driver._id, ...patch });
      await audit(ctx, user, "eventVehicles", id, "assign", null, patch);
    }
    return null;
  },
});

export const removeVehicle = mutation({
  args: { eventId: v.id("events"), driverId: v.id("drivers") }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); operator(user);
    await currentEvent(ctx, args.eventId);
    const prior = await ctx.db.query("eventVehicles").withIndex("by_eventId_and_driverId", q => q.eq("eventId", args.eventId).eq("driverId", args.driverId)).unique();
    if (!prior) throw new Error("Vehicle is not assigned to this event.");
    await ctx.db.delete(prior._id);
    await audit(ctx, user, "eventVehicles", prior._id, "remove", prior, null);
    return null;
  },
});

export const ownTravel = query({
  args: { eventId: v.id("events"), studentId: v.id("students") }, returns: v.object({ independentTravel: v.boolean(), eligible: v.boolean(), transportEnabled: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    const event = await currentEvent(ctx, args.eventId);
    const student = await studentAccess(ctx, user, args.studentId);
    if (student.seasonId !== event.seasonId) throw new Error("Student and event seasons do not match.");
    const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    return { independentTravel: participant?.independentTravel ?? false, eligible: participant?.status === "confirmed", transportEnabled: event.transportEnabled ?? event.travel !== "Families provide transportation" };
  },
});

export const setIndependentTravel = mutation({
  args: { eventId: v.id("events"), studentId: v.id("students"), independentTravel: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    const event = await currentEvent(ctx, args.eventId);
    const student = await studentAccess(ctx, user, args.studentId);
    if (user.role === "mentor" && !user.travelLead) throw new Error("Travel setting access denied.");
    if (student.seasonId !== event.seasonId) throw new Error("Student and event seasons do not match.");
    const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    if (!participant || participant.status !== "confirmed") throw new Error("Only confirmed participants can set independent travel.");
    await ctx.db.patch(participant._id, { independentTravel: args.independentTravel });
    await audit(ctx, user, "participants", participant._id, "setIndependentTravel", { independentTravel: participant.independentTravel ?? false }, { independentTravel: args.independentTravel });
    return null;
  },
});
