import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { activeSeason, privateStudent, requireRole, viewer } from "./lib/access";
import { boundedFinancePage } from "./financeAdmin";
import { rosterRow, upcomingEvents } from "./lib/rosterReadiness";

const nullableMoney = v.union(v.number(), v.null());
const balanceValidator = v.object({ state: v.union(v.literal("ready"), v.literal("updating"), v.literal("failed"), v.literal("uninitialized")), dueCents: nullableMoney, personalAvailableCents: nullableMoney, fundraisingAvailableCents: nullableMoney, updatedAt: nullableMoney });
const accountValidator = v.object({ linkage: v.union(v.literal("linked"), v.literal("unlinked"), v.literal("unavailable")), access: v.union(v.literal("active"), v.literal("inactive"), v.literal("unknown")) });
const eventValidator = v.union(v.null(), v.object({ eventId: v.id("events"), name: v.string(), startsAt: v.number(), participation: v.union(v.literal("confirmed"), v.literal("pending"), v.literal("waitlist"), v.literal("withdrawn"), v.null()), state: v.union(v.literal("ready"), v.literal("open"), v.literal("unknown")), open: v.array(v.string()) }));
/** Permission form for the next event that has one, shown only while Parent signing is on. */
const permissionValidator = v.object({ state: v.union(v.literal("closed"), v.literal("noForm"), v.literal("signed"), v.literal("review"), v.literal("notSigned")), eventName: v.union(v.string(), v.null()) });
const rowValidator = v.object({ studentId: v.id("students"), name: v.string(), subteam: v.string(), travelTeam: v.boolean(), active: v.boolean(), profileRevision: v.number(), fundraiserConnected: v.boolean(), firstRegistrationState: v.union(v.literal("needsCompletion"),v.literal("awaitingVerification"),v.literal("verified")), account: accountValidator, balance: balanceValidator, nextEvent: eventValidator, readinessCoverage: v.union(v.literal("complete"), v.literal("unknown"), v.literal("notApplicable")), missingSummary: v.array(v.string()), permission: permissionValidator });
const directoryRowValidator = v.object({studentId:v.id("students"), name:v.string(), lastName:v.string(), subteam:v.string(), travelTeam:v.boolean(), active:v.boolean(), connected:v.boolean(), grade:v.union(v.string(),v.null()), secondarySubteam:v.union(v.string(),v.null()), leadership:v.boolean()});

/** A bounded page of minimal roster data; the client completes these pages before sorting. */
export const directory = query({
  args:{paginationOpts:paginationOptsValidator,active:v.optional(v.boolean())},
  returns:paginationResultValidator(directoryRowValidator),
  handler:async(ctx,args)=>{
    requireRole(await viewer(ctx),"coach");
    if(args.paginationOpts.numItems<1||args.paginationOpts.numItems>100) throw new ConvexError("The student list could not load. Reload the page and try again.");
    const season=await activeSeason(ctx);
    const page=await ctx.db.query("students").withIndex("by_seasonId_and_active",q=>q.eq("seasonId",season._id).eq("active",args.active??true)).paginate(args.paginationOpts);
    return {...page,page:await Promise.all(page.page.map(async student=>{
      const draft=await ctx.db.query("setupDrafts").withIndex("by_studentId",q=>q.eq("studentId",student._id)).unique();
      const name=student.legalName||student.preferredName;
      // Older records have no structured surname; skip a common suffix and use the final family token.
      const tokens=name.trim().split(/\s+/);
      const final=tokens.at(-1)?.replace(/\.$/,"")??"";
      const fallback=/^(jr|sr|ii|iii|iv|v)$/i.test(final)&&tokens.length>1?tokens.at(-2)??final:tokens.at(-1)??"";
      const lastName=student.lastName?.trim()||fallback;
      return {studentId:student._id,name,lastName,subteam:student.subteam,travelTeam:student.travelTeam,active:student.active,connected:student.userId!==undefined,grade:draft?.grade??student.consentProfileV2?.grade??null,
        // Group fields so the CAD and Leadership filters work from these pages (no capped teamRoster read).
        secondarySubteam:student.secondarySubteam??null,leadership:student.leadership??false};
    }))};
  },
});

export const rowsByIds=query({
  args:{studentIds:v.array(v.id("students")),asOf:v.number()},returns:v.array(rowValidator),
  handler:async(ctx,args)=>{
    requireRole(await viewer(ctx),"coach");
    if(!Number.isFinite(args.asOf)) throw new ConvexError("The roster could not load. Reload the page and try again.");
    if(args.studentIds.length>20) throw new ConvexError("Too many students requested at once. Reload the roster and try again.");
    const season=await activeSeason(ctx);
    const students=await Promise.all(args.studentIds.map(id=>ctx.db.get(id)));
    if(students.some(student=>!student||student.seasonId!==season._id)) throw new ConvexError("This student is no longer in the current season. Reload to see the current roster.");
    const upcoming=await upcomingEvents(ctx,season,args.asOf);
    return await Promise.all((students as Doc<"students">[]).map(student=>rosterRow(ctx,student,upcoming)));
  },
});

/** Earliest time the indexed upcoming-event window can change. */
export const nextTransition = query({
  args: { asOf: v.number() }, returns: v.union(v.number(), v.null()),
  handler: async (ctx, args) => {
    requireRole(await viewer(ctx), "coach");
    if (!Number.isFinite(args.asOf)) throw new ConvexError("The roster could not load. Reload the page and try again.");
    const season = await activeSeason(ctx);
    const event = await ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", season._id).gte("startsAt", args.asOf)).first();
    return event ? event.startsAt + 1 : null;
  },
});

export const list = query({
  args: { paginationOpts: paginationOptsValidator, active: v.optional(v.boolean()), connection: v.optional(v.union(v.literal("all"), v.literal("connected"), v.literal("unconnected"))), asOf: v.number() },
  returns: paginationResultValidator(rowValidator).extend({ seasonId: v.id("seasons") }),
  handler: async (ctx, args) => {
    requireRole(await viewer(ctx), "coach");
    if (!Number.isFinite(args.asOf)) throw new ConvexError("The roster could not load. Reload the page and try again.");
    const season = await activeSeason(ctx);
    const students = args.connection === "unconnected"
      ? ctx.db.query("students").withIndex("by_seasonId_and_active_and_userId", q => q.eq("seasonId", season._id).eq("active", args.active ?? true).eq("userId", undefined))
      : args.connection === "connected"
        ? ctx.db.query("students").withIndex("by_seasonId_and_active_and_userId", q => q.eq("seasonId", season._id).eq("active", args.active ?? true).gt("userId", undefined))
        : ctx.db.query("students").withIndex("by_seasonId_and_active", q => q.eq("seasonId", season._id).eq("active", args.active ?? true));
    const page = await students.paginate(boundedFinancePage(args.paginationOpts));
    const upcoming = await upcomingEvents(ctx, season, args.asOf);
    return { ...page, page: await Promise.all(page.page.map(student => rosterRow(ctx, student, upcoming))), seasonId: season._id };
  },
});

const detailValidator = v.object({ ...rowValidator.fields, legalName: v.string(), preferredName: v.string(), email: v.string(), shirtSize: v.union(v.string(), v.null()), roomCategory: v.union(v.string(), v.null()), guardianName: v.union(v.string(), v.null()), guardianRelationship: v.union(v.string(), v.null()), guardianPhone: v.union(v.string(), v.null()), emergencyName: v.union(v.string(), v.null()), emergencyRelationship: v.union(v.string(), v.null()), emergencyPhone: v.union(v.string(), v.null()), allergies: v.object({ state: v.string(), text: v.optional(v.string()) }), medications: v.object({ state: v.string(), text: v.optional(v.string()) }), otcAuthorization: v.union(v.string(), v.null()), structuredConsentProfileComplete: v.boolean(), profileSetupRequired: v.boolean(), secondarySubteam: v.union(v.string(), v.null()), leadership: v.boolean(), parents: v.array(v.object({name:v.string(),linked:v.boolean(),access:v.union(v.literal("active"),v.literal("inactive"),v.literal("unknown"))})), parentCoverage:v.union(v.literal("complete"),v.literal("unknown")) });
export const detail = query({
  args: { studentId: v.id("students"), asOf: v.number() }, returns: detailValidator,
  handler: async (ctx, args) => {
    requireRole(await viewer(ctx), "coach");
    if (!Number.isFinite(args.asOf)) throw new ConvexError("The roster could not load. Reload the page and try again.");
    const season = await activeSeason(ctx);
    const student = await ctx.db.get(args.studentId);
    if (!student || student.seasonId !== season._id) throw new ConvexError("This student is no longer in the current season. Reload to see the current roster.");
    const row = await rosterRow(ctx, student, await upcomingEvents(ctx, season, args.asOf));
    const links = await ctx.db.query("familyLinks").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(21);
    const parents = await Promise.all(links.slice(0,20).filter(link => !link.seasonId || link.seasonId === season._id).map(async link => {
      const parent = await ctx.db.get(link.parentUserId);
      return { name: parent?.name ?? "Parent account unavailable", linked: link.active, access: !parent || parent.role !== "parent" ? "unknown" as const : parent.active ? "active" as const : "inactive" as const };
    }));
    const projected = privateStudent(student);
    const confirmedProfile = projected.structuredConsentProfileComplete ? student.consentProfileV2 : null;
    return { ...row, legalName: student.legalName, preferredName: student.preferredName, email: student.email, shirtSize: student.shirtSize ?? null, roomCategory: student.roomCategory ?? null, guardianName: confirmedProfile?.guardian.name ?? student.guardianName ?? null, guardianRelationship: confirmedProfile?.guardian.relationship ?? student.guardianRelationship ?? null, guardianPhone: confirmedProfile?.guardian.phone ?? student.guardianPhone ?? null, emergencyName: projected.emergencyName, emergencyRelationship: projected.emergencyRelationship, emergencyPhone: projected.emergencyPhone, allergies: projected.allergies, medications: projected.medications, otcAuthorization: projected.otcAuthorization, structuredConsentProfileComplete: projected.structuredConsentProfileComplete, profileSetupRequired: student.profileCompletedAt === undefined, secondarySubteam: projected.secondarySubteam, leadership: projected.leadership, parents, parentCoverage:links.length>20?"unknown" as const:"complete" as const };
  },
});
