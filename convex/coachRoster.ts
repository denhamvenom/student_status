import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { activeSeason, privateStudent, requireRole, viewer } from "./lib/access";
import { studentReadiness } from "./lib/readModels";
import { financeRow } from "./lib/financeRow";
import { boundedFinancePage } from "./financeAdmin";
import { enrollmentPending } from "./lib/eventEnrollmentState";
import { firstStatus } from "./firstRegistration";

const nullableMoney = v.union(v.number(), v.null());
const balanceValidator = v.object({ state: v.union(v.literal("ready"), v.literal("updating"), v.literal("failed"), v.literal("uninitialized")), dueCents: nullableMoney, personalAvailableCents: nullableMoney, fundraisingAvailableCents: nullableMoney, updatedAt: nullableMoney });
const accountValidator = v.object({ linkage: v.union(v.literal("linked"), v.literal("unlinked"), v.literal("unavailable")), access: v.union(v.literal("active"), v.literal("inactive"), v.literal("unknown")) });
const eventValidator = v.union(v.null(), v.object({ eventId: v.id("events"), name: v.string(), startsAt: v.number(), participation: v.union(v.literal("confirmed"), v.literal("pending"), v.literal("waitlist"), v.literal("withdrawn"), v.null()), state: v.union(v.literal("ready"), v.literal("open"), v.literal("unknown")), open: v.array(v.string()) }));
const rowValidator = v.object({ studentId: v.id("students"), name: v.string(), subteam: v.string(), travelTeam: v.boolean(), active: v.boolean(), profileRevision: v.number(), fundraiserConnected: v.boolean(), firstRegistrationState: v.union(v.literal("needsCompletion"),v.literal("awaitingVerification"),v.literal("verified")), account: accountValidator, balance: balanceValidator, nextEvent: eventValidator, readinessCoverage: v.union(v.literal("complete"), v.literal("unknown"), v.literal("notApplicable")), missingSummary: v.array(v.string()) });
const directoryRowValidator = v.object({studentId:v.id("students"), name:v.string(), lastName:v.string(), subteam:v.string(), travelTeam:v.boolean(), active:v.boolean(), connected:v.boolean(), grade:v.union(v.string(),v.null())});

/** A bounded page of minimal roster data; the client completes these pages before sorting. */
export const directory = query({
  args:{paginationOpts:paginationOptsValidator,active:v.optional(v.boolean())},
  returns:paginationResultValidator(directoryRowValidator),
  handler:async(ctx,args)=>{
    requireRole(await viewer(ctx),"coach");
    if(args.paginationOpts.numItems<1||args.paginationOpts.numItems>100) throw new Error("Directory page size must be between 1 and 100.");
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
      return {studentId:student._id,name,lastName,subteam:student.subteam,travelTeam:student.travelTeam,active:student.active,connected:student.userId!==undefined,grade:draft?.grade??student.consentProfileV2?.grade??null};
    }))};
  },
});

export const rowsByIds=query({
  args:{studentIds:v.array(v.id("students")),asOf:v.number()},returns:v.array(rowValidator),
  handler:async(ctx,args)=>{
    requireRole(await viewer(ctx),"coach");
    if(!Number.isFinite(args.asOf)) throw new Error("A valid current time is required.");
    if(args.studentIds.length>20) throw new Error("At most 20 roster rows may be requested.");
    const season=await activeSeason(ctx);
    const students=await Promise.all(args.studentIds.map(id=>ctx.db.get(id)));
    if(students.some(student=>!student||student.seasonId!==season._id)) throw new Error("Student is unavailable in the current season.");
    const upcoming=await upcomingEvents(ctx,season._id,args.asOf);
    return await Promise.all((students as Doc<"students">[]).map(student=>rosterRow(ctx,student,upcoming)));
  },
});

function missingInformation(student: Doc<"students">) {
  const missing: string[] = [];
  const confirmed = student.consentProfileV2CompletedAt !== undefined && student.consentProfileV2ConfirmedBy !== undefined && student.consentProfileV2 !== undefined;
  const profile = confirmed ? student.consentProfileV2 : null;
  if (student.profileCompletedAt === undefined) missing.push("Profile setup");
  if (!student.shirtSize?.trim()) missing.push("Shirt size");
  if (!student.roomCategory) missing.push("Room category");
  if (!(profile?.guardian.name ?? student.guardianName)?.trim() || !(profile?.guardian.phone ?? student.guardianPhone)?.trim()) missing.push("Guardian contact");
  if (!(profile?.emergency.name ?? student.emergencyName)?.trim() || !(profile?.emergency.phone ?? student.emergencyPhone)?.trim()) missing.push("Emergency contact");
  if (!confirmed) missing.push("Health information");
  return missing;
}

async function accountStatus(ctx: QueryCtx, student: Doc<"students">) {
  if (!student.userId) return { linkage: "unlinked" as const, access: "unknown" as const };
  const account = await ctx.db.get(student.userId);
  if (!account || account.role !== "student") return { linkage: "unavailable" as const, access: "unknown" as const };
  return { linkage: "linked" as const, access: account.active ? "active" as const : "inactive" as const };
}

type Upcoming = { events: Doc<"events">[]; truncated: boolean };
async function upcomingEvents(ctx: QueryCtx, seasonId: Doc<"seasons">["_id"], asOf: number): Promise<Upcoming> {
  const page = await ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", seasonId).gte("startsAt", asOf)).take(11);
  return { events: page.slice(0, 10).filter(event => !event.archived), truncated: page.length > 10 };
}

async function nextEvent(ctx: QueryCtx, student: Doc<"students">, upcoming: Upcoming, financeState: string) {
  if (!student.active) return { nextEvent: null, readinessCoverage: "notApplicable" as const };
  for (const event of upcoming.events) {
    const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    if (enrollmentPending(event) && event.assignmentScope === "wholeTeam") return { nextEvent: { eventId: event._id, name: event.name, startsAt: event.startsAt, participation: participant?.status ?? null, state: "unknown" as const, open: ["Whole Team enrollment is not complete"] }, readinessCoverage: "unknown" as const };
    if (!participant || participant.status === "withdrawn") continue;
    if (participant.status !== "confirmed") return { nextEvent: { eventId: event._id, name: event.name, startsAt: event.startsAt, participation: participant.status, state: "open" as const, open: ["Participation is not confirmed"] }, readinessCoverage: "complete" as const };
    const readiness = await studentReadiness(ctx, event, student);
    const state = financeState !== "ready" || readiness.open.includes("Event financial records require review") || readiness.open.includes("Event requirements require review") ? "unknown" as const : readiness.state === "ready" ? "ready" as const : "open" as const;
    return { nextEvent: { eventId: event._id, name: event.name, startsAt: event.startsAt, participation: participant.status, state, open: readiness.open }, readinessCoverage: "complete" as const };
  }
  return { nextEvent: null, readinessCoverage: upcoming.truncated ? "unknown" as const : "complete" as const };
}

async function rosterRow(ctx: QueryCtx, student: Doc<"students">, upcoming: Upcoming) {
  const [finance, account, firstRegistrationState] = await Promise.all([financeRow(ctx, student._id), accountStatus(ctx, student), firstStatus(ctx, student._id)]);
  const event = await nextEvent(ctx, student, upcoming, finance.state);
  return { studentId: student._id, name: student.legalName || student.preferredName, subteam: student.subteam, travelTeam: student.travelTeam, active: student.active, profileRevision: student.profileRevision ?? 0, fundraiserConnected: !!student.fundraiserUrl, firstRegistrationState, account, balance: { state: finance.state, dueCents: finance.dueCents, personalAvailableCents: finance.personalAvailableCents, fundraisingAvailableCents: finance.fundraisingAvailableCents, updatedAt: finance.updatedAt }, ...event, missingSummary: missingInformation(student) };
}

export const list = query({
  args: { paginationOpts: paginationOptsValidator, active: v.optional(v.boolean()), connection: v.optional(v.union(v.literal("all"), v.literal("connected"), v.literal("unconnected"))), asOf: v.number() },
  returns: paginationResultValidator(rowValidator).extend({ seasonId: v.id("seasons") }),
  handler: async (ctx, args) => {
    requireRole(await viewer(ctx), "coach");
    if (!Number.isFinite(args.asOf)) throw new Error("A valid current time is required.");
    const season = await activeSeason(ctx);
    const students = args.connection === "unconnected"
      ? ctx.db.query("students").withIndex("by_seasonId_and_active_and_userId", q => q.eq("seasonId", season._id).eq("active", args.active ?? true).eq("userId", undefined))
      : args.connection === "connected"
        ? ctx.db.query("students").withIndex("by_seasonId_and_active_and_userId", q => q.eq("seasonId", season._id).eq("active", args.active ?? true).gt("userId", undefined))
        : ctx.db.query("students").withIndex("by_seasonId_and_active", q => q.eq("seasonId", season._id).eq("active", args.active ?? true));
    const page = await students.paginate(boundedFinancePage(args.paginationOpts));
    const upcoming = await upcomingEvents(ctx, season._id, args.asOf);
    return { ...page, page: await Promise.all(page.page.map(student => rosterRow(ctx, student, upcoming))), seasonId: season._id };
  },
});

const detailValidator = v.object({ ...rowValidator.fields, legalName: v.string(), preferredName: v.string(), email: v.string(), shirtSize: v.union(v.string(), v.null()), roomCategory: v.union(v.string(), v.null()), guardianName: v.union(v.string(), v.null()), guardianRelationship: v.union(v.string(), v.null()), guardianPhone: v.union(v.string(), v.null()), emergencyName: v.union(v.string(), v.null()), emergencyRelationship: v.union(v.string(), v.null()), emergencyPhone: v.union(v.string(), v.null()), allergies: v.object({ state: v.string(), text: v.optional(v.string()) }), medications: v.object({ state: v.string(), text: v.optional(v.string()) }), otcAuthorization: v.union(v.string(), v.null()), structuredConsentProfileComplete: v.boolean(), profileSetupRequired: v.boolean(), parents: v.array(v.object({name:v.string(),linked:v.boolean(),access:v.union(v.literal("active"),v.literal("inactive"),v.literal("unknown"))})), parentCoverage:v.union(v.literal("complete"),v.literal("unknown")) });
export const detail = query({
  args: { studentId: v.id("students"), asOf: v.number() }, returns: detailValidator,
  handler: async (ctx, args) => {
    requireRole(await viewer(ctx), "coach");
    if (!Number.isFinite(args.asOf)) throw new Error("A valid current time is required.");
    const season = await activeSeason(ctx);
    const student = await ctx.db.get(args.studentId);
    if (!student || student.seasonId !== season._id) throw new Error("Student is unavailable in the current season.");
    const row = await rosterRow(ctx, student, await upcomingEvents(ctx, season._id, args.asOf));
    const links = await ctx.db.query("familyLinks").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(21);
    const parents = await Promise.all(links.slice(0,20).filter(link => !link.seasonId || link.seasonId === season._id).map(async link => {
      const parent = await ctx.db.get(link.parentUserId);
      return { name: parent?.name ?? "Parent account unavailable", linked: link.active, access: !parent || parent.role !== "parent" ? "unknown" as const : parent.active ? "active" as const : "inactive" as const };
    }));
    const projected = privateStudent(student);
    const confirmedProfile = projected.structuredConsentProfileComplete ? student.consentProfileV2 : null;
    return { ...row, legalName: student.legalName, preferredName: student.preferredName, email: student.email, shirtSize: student.shirtSize ?? null, roomCategory: student.roomCategory ?? null, guardianName: confirmedProfile?.guardian.name ?? student.guardianName ?? null, guardianRelationship: confirmedProfile?.guardian.relationship ?? student.guardianRelationship ?? null, guardianPhone: confirmedProfile?.guardian.phone ?? student.guardianPhone ?? null, emergencyName: projected.emergencyName, emergencyRelationship: projected.emergencyRelationship, emergencyPhone: projected.emergencyPhone, allergies: projected.allergies, medications: projected.medications, otcAuthorization: projected.otcAuthorization, structuredConsentProfileComplete: projected.structuredConsentProfileComplete, profileSetupRequired: student.profileCompletedAt === undefined, parents, parentCoverage:links.length>20?"unknown" as const:"complete" as const };
  },
});
