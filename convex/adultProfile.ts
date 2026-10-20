import { normalizeChangedPhone } from "../shared/contact-format";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { activeSeason, audit, requireRole, viewer } from "./lib/access";

const shirtSize = v.union(v.literal("XS"), v.literal("S"), v.literal("M"), v.literal("L"), v.literal("XL"), v.literal("2XL"), v.literal("3XL"));
const staffRole = v.union(v.literal("coach"), v.literal("mentor"));
const basicFields = {
  name: v.string(), email: v.string(), phone: v.string(), shirtSize: v.union(v.string(), v.null()),
  emergencyName: v.string(), emergencyRelationship: v.string(), emergencyPhone: v.string(),
  role: staffRole, profileRevision: v.number(),
};
const driverState = v.union(v.literal("owned"), v.literal("none"), v.literal("coachReviewRequired"), v.literal("capacityReview"), v.literal("seasonUnavailable"));
const drivingFields = {
  driverState, driverFingerprint: v.union(v.string(), v.null()), canDrive: v.boolean(),
  vehicleName: v.string(), passengerSeats: v.union(v.number(), v.null()), towCapable: v.boolean(), approved: v.boolean(),
};
const profile = v.object({ ...basicFields, ...drivingFields, travelLead: v.boolean() });
const drivingInput = v.object({ expectedDriverFingerprint: v.union(v.string(), v.null()), canDrive: v.boolean(), vehicleName: v.string(), passengerSeats: v.union(v.number(), v.null()), towCapable: v.boolean() });
type Ctx = QueryCtx | MutationCtx;
type DriverState = "owned" | "none" | "coachReviewRequired" | "capacityReview" | "seasonUnavailable";
const MAX_DRIVERS = 200;

function fingerprint(driver: Doc<"drivers"> | null) {
  return driver ? JSON.stringify([driver._id, driver.name, driver.phone, driver.email, driver.vehicleName ?? "", driver.seats, driver.towCapable ?? false, driver.active !== false, driver.approved]) : null;
}
const emailKey = (email: string) => email.trim().toLowerCase();

async function reconciliationSource(ctx: Ctx, driverId: Doc<"drivers">["_id"], mentorId: Doc<"appUsers">["_id"]) {
  const season = await activeSeason(ctx);
  const [driver, mentor] = await Promise.all([ctx.db.get(driverId), ctx.db.get(mentorId)]);
  if (!driver || driver.seasonId !== season._id || driver.ownerAppUserId) throw new Error("The unowned driver is unavailable for reconciliation.");
  if (!mentor || !mentor.active || mentor.role !== "mentor") throw new Error("An active Mentor account is required.");
  const authUser = await ctx.db.get(mentor.authUserId);
  if (!authUser?.email || authUser.isAnonymous || emailKey(authUser.email) !== emailKey(mentor.email)) throw new Error("Mentor Google identity needs Coach review.");
  if (emailKey(driver.email) !== emailKey(mentor.email)) throw new Error("Driver and Mentor Google emails must match.");
  const mentors = await ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", "mentor")).take(201);
  if (mentors.length > 200 || mentors.some(other => other._id !== mentor._id && other.active && emailKey(other.email) === emailKey(mentor.email))) throw new Error("Duplicate Mentor identity needs Coach review before linking.");
  const owned = await ctx.db.query("drivers").withIndex("by_seasonId_and_ownerAppUserId", q => q.eq("seasonId", season._id).eq("ownerAppUserId", mentor._id)).unique();
  if (owned) throw new Error("Mentor already has a driver record in this season.");
  const drivers = await ctx.db.query("drivers").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(MAX_DRIVERS + 1);
  if (drivers.length > MAX_DRIVERS || drivers.some(row => row._id !== driver._id && emailKey(row.email) === emailKey(mentor.email))) throw new Error("Duplicate driver email needs Coach review before linking.");
  return { driver, mentor };
}

/** A bounded, Coach-only queue of exact email matches; linking still rechecks all facts atomically. */
export const ownerReconciliationCandidates = query({
  args: {},
  returns: v.array(v.object({ driverId: v.id("drivers"), driverName: v.string(), email: v.string(), driverFingerprint: v.string(), mentorId: v.id("appUsers"), mentorName: v.string(), profileRevision: v.number() })),
  handler: async ctx => {
    requireRole(await viewer(ctx), "coach");
    const season = await activeSeason(ctx);
    const [drivers, mentors] = await Promise.all([
      ctx.db.query("drivers").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(MAX_DRIVERS + 1),
      ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", "mentor")).take(201),
    ]);
    if (drivers.length > MAX_DRIVERS || mentors.length > 200) throw new Error("Driver or Mentor list needs Coach review before reconciliation.");
    const unowned = drivers.filter(driver => !driver.ownerAppUserId);
    const candidates = await Promise.all(unowned.map(async driver => {
      const matches = mentors.filter(mentor => mentor.active && emailKey(mentor.email) === emailKey(driver.email));
      if (matches.length !== 1 || drivers.some(other => other._id !== driver._id && emailKey(other.email) === emailKey(driver.email))) return null;
      const mentor = matches[0];
      const authUser = await ctx.db.get(mentor.authUserId);
      if (!authUser?.email || authUser.isAnonymous || emailKey(authUser.email) !== emailKey(mentor.email)) return null;
      if (drivers.some(other => other.ownerAppUserId === mentor._id)) return null;
      return { driverId: driver._id, driverName: driver.name, email: driver.email, driverFingerprint: fingerprint(driver)!, mentorId: mentor._id, mentorName: mentor.name, profileRevision: mentor.profileRevision ?? 0 };
    }));
    return candidates.filter((item): item is NonNullable<typeof item> => item !== null);
  },
});

export const linkDriverOwner = mutation({
  args: { driverId: v.id("drivers"), mentorId: v.id("appUsers"), expectedDriverFingerprint: v.string(), expectedProfileRevision: v.number(), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach");
    if (!Number.isSafeInteger(args.expectedProfileRevision) || args.expectedProfileRevision < 0) throw new Error("Invalid profile revision.");
    const reason = clean(args.reason, "Reconciliation reason", 500, true);
    if (reason.length < 10) throw new Error("Reconciliation reason must be at least 10 characters.");
    const { driver, mentor } = await reconciliationSource(ctx, args.driverId, args.mentorId);
    if (args.expectedDriverFingerprint !== fingerprint(driver) || args.expectedProfileRevision !== (mentor.profileRevision ?? 0)) throw new Error("Driver or Mentor changed. Review again before linking.");
    await ctx.db.patch(driver._id, { ownerAppUserId: mentor._id, approved: false });
    await audit(ctx, actor, "drivers", driver._id, "linkDriverOwner", driver, { ...driver, ownerAppUserId: mentor._id, approved: false }, reason);
    return null;
  },
});

async function driverContext(ctx: Ctx, actor: Doc<"appUsers">) {
  const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
  if (!season) return { season: null, driver: null, state: "seasonUnavailable" as DriverState };
  const driver = await ctx.db.query("drivers").withIndex("by_seasonId_and_ownerAppUserId", q => q.eq("seasonId", season._id).eq("ownerAppUserId", actor._id)).unique();
  if (driver) return { season, driver, state: "owned" as DriverState };
  const seasonDrivers = await ctx.db.query("drivers").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(MAX_DRIVERS + 1);
  if (seasonDrivers.length > MAX_DRIVERS) return { season, driver: null, state: "capacityReview" as DriverState };
  const email = actor.email.trim().toLowerCase();
  if (seasonDrivers.some(row => row.email.trim().toLowerCase() === email && row.ownerAppUserId !== actor._id)) return { season, driver: null, state: "coachReviewRequired" as DriverState };
  return { season, driver: null, state: seasonDrivers.length === MAX_DRIVERS ? "capacityReview" as DriverState : "none" as DriverState };
}


function drivingDetails({ driver, state }: Awaited<ReturnType<typeof driverContext>>) {
  return { driverState: state, driverFingerprint: fingerprint(driver), canDrive: driver?.active !== false && !!driver, vehicleName: driver?.vehicleName ?? "", passengerSeats: driver?.seats ?? null, towCapable: driver?.towCapable ?? false, approved: driver?.approved ?? false };
}

async function saveDriving(ctx: MutationCtx, actor: Doc<"appUsers">, context: Awaited<ReturnType<typeof driverContext>>, name: string, phone: string, args: { expectedDriverFingerprint: string | null; canDrive: boolean; vehicleName: string; passengerSeats: number | null; towCapable: boolean }) {
    const vehicleName = clean(args.vehicleName, "Vehicle", 100);
    if (args.canDrive) {
      if (!phone) throw new Error("Drivers need a phone number.");
      if (!vehicleName) throw new Error("Describe your vehicle.");
      if (!Number.isSafeInteger(args.passengerSeats) || args.passengerSeats === null || args.passengerSeats < 1 || args.passengerSeats > 100) throw new Error("Passenger seats must be a whole number from 1 to 100.");
    }
    if (args.expectedDriverFingerprint !== fingerprint(context.driver)) throw new Error("Driving details changed. Reload before saving.");
    let state = context.state;
    if (context.driver) {
      const driver = context.driver;
      if (args.canDrive) {
        const changed = driver.name !== name || driver.phone !== phone || driver.email !== actor.email || (driver.vehicleName ?? "") !== vehicleName || driver.seats !== args.passengerSeats || (driver.towCapable ?? false) !== args.towCapable || driver.active === false;
        if (changed) {
          const patch = { name, phone, email: actor.email, vehicleName, seats: args.passengerSeats!, towCapable: args.towCapable, active: true, approved: false };
          await ctx.db.patch(driver._id, patch);
          await audit(ctx, actor, "drivers", driver._id, "selfUpdate", driver, { ...driver, ...patch });
        }
      } else if (driver.active !== false || driver.approved) {
        await ctx.db.patch(driver._id, { active: false, approved: false });
        await audit(ctx, actor, "drivers", driver._id, "selfDisable", driver, { ...driver, active: false, approved: false });
      }
    } else if (args.canDrive && context.season && context.state === "none") {
      const created = { seasonId: context.season._id, ownerAppUserId: actor._id, name, email: actor.email, phone, vehicleName, seats: args.passengerSeats!, approved: false, towCapable: args.towCapable, active: true };
      const driverId = await ctx.db.insert("drivers", created);
      await audit(ctx, actor, "drivers", driverId, "selfCreate", null, created);
      state = "owned";
    }
    return state;
}

function clean(value: string, label: string, max: number, required = false) {
  const result = value.trim();
  if (result.length > max || required && !result) throw new Error(`${label} must be ${required ? "provided and " : ""}under ${max} characters.`);
  return result;
}

function basics(actor: Doc<"appUsers">) {
  requireRole(actor, "coach", "mentor");
  return {
    name: actor.name, email: actor.email, phone: actor.phone ?? "", shirtSize: actor.shirtSize ?? null,
    emergencyName: actor.emergencyName ?? "", emergencyRelationship: actor.emergencyRelationship ?? "", emergencyPhone: actor.emergencyPhone ?? "",
    role: actor.role as "coach" | "mentor", profileRevision: actor.profileRevision ?? 0,
  };
}

/** Existing complete profiles are ready without a migration or a separate completion flag. */
export const ownBasics = query({
  args: {}, returns: v.object({ ...basicFields, ...drivingFields, needsSetup: v.boolean(), dismissed: v.boolean() }),
  handler: async ctx => {
    const actor = await viewer(ctx);
    const basic = basics(actor);
    const complete = [basic.name, basic.phone, basic.emergencyName, basic.emergencyRelationship, basic.emergencyPhone].every(value => value.trim().length > 0)
      && ["XS", "S", "M", "L", "XL", "2XL", "3XL"].includes(basic.shirtSize ?? "");
    const dismissed = actor.staffSetupDismissedAt !== undefined;
    return { ...basic, ...drivingDetails(await driverContext(ctx, actor)), needsSetup: !complete && !dismissed && actor.staffSetupCompletedAt === undefined, dismissed };
  },
});

export const dismissSetup = mutation({
  args: { expectedProfileRevision: v.number() },
  returns: v.object({ profileRevision: v.number() }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach", "mentor");
    if (!Number.isSafeInteger(args.expectedProfileRevision) || args.expectedProfileRevision < 0 || args.expectedProfileRevision !== (actor.profileRevision ?? 0)) throw new Error("Profile changed. Reload before saving.");
    const profileRevision = (actor.profileRevision ?? 0) + 1;
    await ctx.db.patch(actor._id, { staffSetupDismissedAt: actor.staffSetupDismissedAt ?? Date.now(), profileRevision });
    await audit(ctx, actor, "appUsers", actor._id, "dismissStaffSetup", { profileRevision: actor.profileRevision ?? 0 }, { profileRevision });
    return { profileRevision };
  },
});

/** Omitted driving information leaves existing driver records and approvals untouched. */
export const saveBasics = mutation({
  args: { expectedProfileRevision: v.number(), name: v.string(), phone: v.string(), shirtSize: v.union(shirtSize, v.null()), emergencyName: v.string(), emergencyRelationship: v.string(), emergencyPhone: v.string(), driving: v.optional(drivingInput) },
  returns: v.object({ profileRevision: v.number(), driverState: v.union(driverState, v.null()) }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach", "mentor");
    if (!Number.isSafeInteger(args.expectedProfileRevision) || args.expectedProfileRevision < 0 || args.expectedProfileRevision !== (actor.profileRevision ?? 0)) throw new Error("Profile changed. Reload before saving.");
    const profileRevision = (actor.profileRevision ?? 0) + 1;
    const patch = {
      name: clean(args.name, "Name", 100) || actor.name, phone: normalizeChangedPhone(args.phone, actor.phone, "Phone") || actor.phone, shirtSize: args.shirtSize ?? actor.shirtSize,
      emergencyName: clean(args.emergencyName, "Emergency contact name", 100) || actor.emergencyName,
      emergencyRelationship: clean(args.emergencyRelationship, "Emergency contact relationship", 100) || actor.emergencyRelationship,
      emergencyPhone: normalizeChangedPhone(args.emergencyPhone, actor.emergencyPhone, "Emergency contact phone") || actor.emergencyPhone, profileRevision, staffSetupCompletedAt: Date.now(),
    };
    let state: DriverState | null = null;
    if (args.driving) {
      const context = await driverContext(ctx, actor);
      if (context.state !== "none" && context.state !== "owned") throw new Error("Driving details need Coach review or an active season. Skip this step to save your personal information.");
      state = await saveDriving(ctx, actor, context, patch.name, patch.phone ?? "", args.driving);
    }
    await ctx.db.patch(actor._id, patch);
    await audit(ctx, actor, "appUsers", actor._id, "saveOwnBasics", { profileRevision: actor.profileRevision ?? 0 }, { profileRevision });
    return { profileRevision, driverState: state };
  },
});

export const own = query({
  args: {}, returns: profile,
  handler: async ctx => {
    const actor = await viewer(ctx); requireRole(actor, "coach", "mentor");
    return { ...basics(actor), travelLead: actor.travelLead, ...drivingDetails(await driverContext(ctx, actor)) };
  },
});

export const saveOwn = mutation({
  args: { expectedProfileRevision: v.number(), expectedDriverFingerprint: v.union(v.string(), v.null()), name: v.string(), phone: v.string(), shirtSize, emergencyName: v.string(), emergencyRelationship: v.string(), emergencyPhone: v.string(), canDrive: v.boolean(), vehicleName: v.string(), passengerSeats: v.union(v.number(), v.null()), towCapable: v.boolean() },
  returns: v.object({ profileRevision: v.number(), driverState }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); requireRole(actor, "coach", "mentor");
    if (!Number.isSafeInteger(args.expectedProfileRevision) || args.expectedProfileRevision < 0 || args.expectedProfileRevision !== (actor.profileRevision ?? 0)) throw new Error("Profile changed. Reload before saving.");
    const name = clean(args.name, "Name", 100, true);
    const phone = normalizeChangedPhone(args.phone, actor.phone, "Phone");
    const emergencyName = clean(args.emergencyName, "Emergency contact name", 100);
    const emergencyRelationship = clean(args.emergencyRelationship, "Emergency contact relationship", 100);
    const emergencyPhone = normalizeChangedPhone(args.emergencyPhone, actor.emergencyPhone, "Emergency contact phone");
    const profileRevision = (actor.profileRevision ?? 0) + 1;
    await ctx.db.patch(actor._id, { name, phone, shirtSize: args.shirtSize, emergencyName, emergencyRelationship, emergencyPhone, profileRevision });
    const state = await saveDriving(ctx, actor, await driverContext(ctx, actor), name, phone, args);
    await audit(ctx, actor, "appUsers", actor._id, "saveOwnProfile", { profileRevision: actor.profileRevision ?? 0 }, { profileRevision, driverState: state });
    return { profileRevision, driverState: state };
  },
});
