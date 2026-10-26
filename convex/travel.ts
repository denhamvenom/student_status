import { teamTransportEnabled } from "./lib/transportation";
import { normalizeChangedPhone, normalizeChangedEmail } from "./lib/contactValidation";
import { enrollmentPending, requireEnrollmentComplete } from "./lib/eventEnrollmentState";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { activeSeason, audit, studentAccess, viewer } from "./lib/access";

type Ctx = QueryCtx | MutationCtx;
const MAX_DRIVERS = 200;
const MAX_PARTICIPANTS = 500;

function operator(user: Doc<"appUsers">) {
  if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new ConvexError("Only a Coach or Travel Lead can manage transport.");
}

function whole(value: number, label: string, max = 500) {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new ConvexError(`${label} must be a whole number from 0 to ${max}.`);
}

async function currentEvent(ctx: Ctx, eventId: Id<"events">) {
  const [event, season] = await Promise.all([ctx.db.get(eventId), activeSeason(ctx)]);
  if (!event || event.seasonId !== season._id || event.archived) throw new ConvexError("This event has ended or is no longer in the current season. Reload to see current events.");
  if ("scheduler" in ctx) requireEnrollmentComplete(event);
  return event;
}

export async function transportSummary(ctx: Ctx, event: Doc<"events">) {
  if (enrollmentPending(event) && teamTransportEnabled(event)) return { state: "open" as const, seats: 0, demand: 0, ridingStudents: 0, additionalAdults: 0, busSeats: 0, vehicleSeats: 0, open: ["Whole Team enrollment is not complete."] };
  const enabled = teamTransportEnabled(event);
  if (!enabled) return { state: "notApplicable" as const, seats: 0, demand: 0, ridingStudents: 0, additionalAdults: 0, busSeats: 0, vehicleSeats: 0, open: [] as string[] };
  const participants = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(MAX_PARTICIPANTS + 1);
  if (participants.length > MAX_PARTICIPANTS) throw new ConvexError("This event has too many signups to show here. Contact a Coach.");
  const confirmed = participants.filter(p => p.status === "confirmed" && !p.independentTravel);
  const students = await Promise.all(confirmed.map(p => ctx.db.get(p.studentId)));
  const ridingStudents = students.filter(s => !!s && s.active && s.seasonId === event.seasonId).length;
  const additionalAdults = event.additionalAdults ?? 0;
  const busSeats = event.busSeats ?? 0;
  const assignments = await ctx.db.query("eventVehicles").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(MAX_DRIVERS + 1);
  if (assignments.length > MAX_DRIVERS) throw new ConvexError("This event has too many vehicles to show here. Contact a Coach.");
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
    if (drivers.length > MAX_DRIVERS) throw new ConvexError("The driver list is too long to show here. Contact a Coach.");
    return drivers;
  },
});

export const saveDriver = mutation({
  args: { driverId: v.optional(v.id("drivers")), name: v.string(), email: v.string(), phone: v.string(), vehicleName: v.string(), seats: v.number(), approved: v.boolean(), towCapable: v.boolean(), active: v.boolean() }, returns: v.id("drivers"),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); operator(user);
    const season = await activeSeason(ctx);
    const priorContact = args.driverId ? await ctx.db.get(args.driverId) : null;
    const name = args.name.trim(), email = normalizeChangedEmail(args.email, priorContact?.email, "Driver email"), phone = normalizeChangedPhone(args.phone, priorContact?.phone, "Driver phone"), vehicleName = args.vehicleName.trim();
    if (!name || name.length > 100 || !email || email.length > 254 || !email.includes("@") || !phone || phone.length > 50 || vehicleName.length > 100) throw new ConvexError("Enter a valid driver name, email, phone and vehicle name.");
    whole(args.seats, "Passenger seats", 100);
    const patch = { name, email, phone, vehicleName, seats: args.seats, approved: args.approved, towCapable: args.towCapable, active: args.active };
    const existing = await ctx.db.query("drivers").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(MAX_DRIVERS + 1);
    if (existing.length > MAX_DRIVERS) throw new ConvexError("The driver list is too long to change here. Contact a Coach.");
    const emailKey = email.toLowerCase();
    if (existing.some(row => row._id !== args.driverId && row.email.trim().toLowerCase() === emailKey)) throw new ConvexError("A driver this season already uses this email. Edit that driver instead.");
    if (args.driverId) {
      const prior = await ctx.db.get(args.driverId);
      if (!prior || prior.seasonId !== season._id) throw new ConvexError("This driver is no longer in the current season. Reload to see the latest list.");
      if (prior.ownerAppUserId) {
        const owner = await ctx.db.get(prior.ownerAppUserId);
        if (!owner || owner.email.trim().toLowerCase() !== emailKey) throw new ConvexError("This driver is linked to a Mentor account, so the email must match that account. Ask a Coach to review the match.");
      }
      await ctx.db.patch(prior._id, patch);
      await audit(ctx, user, "drivers", prior._id, "update", prior, patch);
      return prior._id;
    }
    if (existing.length >= MAX_DRIVERS) throw new ConvexError("The driver list is full for this season. Contact a Coach.");
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
    if (!teamTransportEnabled(event)) return { event: { _id: event._id, name: event.name, travel: event.travel, transportEnabled: false, busSeats: 0, additionalAdults: 0, trailerRequired: false }, drivers: [], assignments: [], riders: [], summary: await transportSummary(ctx, event) };
    const season = await activeSeason(ctx);
    const drivers = await ctx.db.query("drivers").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(MAX_DRIVERS + 1);
    const assignments = await ctx.db.query("eventVehicles").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(MAX_DRIVERS + 1);
    const participants = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(MAX_PARTICIPANTS + 1);
    if (drivers.length > MAX_DRIVERS || assignments.length > MAX_DRIVERS || participants.length > MAX_PARTICIPANTS) throw new ConvexError("This event has too many transport records to show here. Contact a Coach.");
    const confirmed = participants.filter(p => p.status === "confirmed");
    const students = await Promise.all(confirmed.map(p => ctx.db.get(p.studentId)));
    const riders = confirmed.flatMap((p, i) => {
      const student = students[i];
      return student?.active && student.seasonId === event.seasonId ? [{ studentId: student._id, name: student.legalName || student.preferredName, independentTravel: p.independentTravel ?? false }] : [];
    });
    return { event: { _id: event._id, name: event.name, travel: event.travel, transportEnabled: teamTransportEnabled(event), busSeats: event.busSeats ?? 0, additionalAdults: event.additionalAdults ?? 0, trailerRequired: event.trailerRequired ?? false }, drivers, assignments, riders, summary: await transportSummary(ctx, event) };
  },
});

export const setEventTransport = mutation({
  args: { eventId: v.id("events"), travel: v.optional(v.union(v.literal("Charter Bus"), v.literal("School Bus"), v.literal("Team Carpool"), v.literal("Provide your Own"))), transportEnabled: v.boolean(), busSeats: v.number(), additionalAdults: v.number(), trailerRequired: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); operator(user);
    const event = await currentEvent(ctx, args.eventId);
    whole(args.busSeats, "Bus passenger seats"); whole(args.additionalAdults, "Additional adult passengers");
    if (!args.travel && args.transportEnabled && !teamTransportEnabled({ travel: event.travel })) throw new ConvexError("Choose team transport for this event before managing rides.");
    const patch = { ...(args.travel ? { travel: args.travel } : {}), transportEnabled: args.travel ? teamTransportEnabled({ travel: args.travel }) : args.transportEnabled, busSeats: args.busSeats, additionalAdults: args.additionalAdults, trailerRequired: args.trailerRequired };
    await ctx.db.patch(event._id, patch);
    await audit(ctx, user, "events", event._id, "setTransport", { travel: event.travel, transportEnabled: event.transportEnabled, busSeats: event.busSeats, additionalAdults: event.additionalAdults, trailerRequired: event.trailerRequired }, patch);
    return null;
  },
});

export const assignVehicle = mutation({
  args: { eventId: v.id("events"), driverId: v.id("drivers"), seats: v.number(), notes: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); operator(user);
    const event = await currentEvent(ctx, args.eventId);
    if (!teamTransportEnabled(event)) throw new ConvexError("Drivers and rides aren't managed for this event. Choose team transport in the event's Transport settings to manage them.");
    const driver = await ctx.db.get(args.driverId);
    if (!driver || driver.seasonId !== event.seasonId || !driver.approved || driver.active === false) throw new ConvexError("Choose an approved, active driver from this season.");
    whole(args.seats, "Passenger seats", 100);
    if (args.seats > driver.seats) throw new ConvexError("Passenger seats for this event can't be more than the driver's vehicle seats.");
    const notes = args.notes?.trim();
    if (notes && notes.length > 500) throw new ConvexError("Vehicle notes must be under 500 characters.");
    const prior = await ctx.db.query("eventVehicles").withIndex("by_eventId_and_driverId", q => q.eq("eventId", event._id).eq("driverId", driver._id)).unique();
    const patch = { seats: args.seats, notes };
    if (prior) { await ctx.db.patch(prior._id, patch); await audit(ctx, user, "eventVehicles", prior._id, "update", prior, patch); }
    else {
      const existing = await ctx.db.query("eventVehicles").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(MAX_DRIVERS);
      if (existing.length >= MAX_DRIVERS) throw new ConvexError("This event has the most vehicles it can hold. Remove one before adding another.");
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
    const event = await currentEvent(ctx, args.eventId);
    if (!teamTransportEnabled(event)) throw new ConvexError("Drivers and rides aren't managed for this event. Choose team transport in the event's Transport settings to manage them.");
    const prior = await ctx.db.query("eventVehicles").withIndex("by_eventId_and_driverId", q => q.eq("eventId", args.eventId).eq("driverId", args.driverId)).unique();
    if (!prior) throw new ConvexError("This vehicle is no longer on this event. Reload to see the latest.");
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
    if (student.seasonId !== event.seasonId) throw new ConvexError("This student isn't in this event's season. Reload and choose a current event.");
    const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    return { independentTravel: participant?.independentTravel ?? false, eligible: participant?.status === "confirmed", transportEnabled: teamTransportEnabled(event) };
  },
});

export const setIndependentTravel = mutation({
  args: { eventId: v.id("events"), studentId: v.id("students"), independentTravel: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "parent" && user.role !== "coach") throw new ConvexError("Only the student's parent or a Coach can choose own transport.");
    const event = await currentEvent(ctx, args.eventId);
    const student = await studentAccess(ctx, user, args.studentId);
    if (student.seasonId !== event.seasonId) throw new ConvexError("This student isn't in this event's season. Reload and choose a current event.");
    const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    if (!teamTransportEnabled(event)) throw new ConvexError("Drivers and rides aren't managed for this event. Families arrange their own transport.");
    if (!participant || participant.status !== "confirmed") throw new ConvexError("Own transport can be set only for students confirmed for this event.");
    await ctx.db.patch(participant._id, { independentTravel: args.independentTravel });
    await audit(ctx, user, "participants", participant._id, "setIndependentTravel", { independentTravel: participant.independentTravel ?? false }, { independentTravel: args.independentTravel });
    return null;
  },
});
