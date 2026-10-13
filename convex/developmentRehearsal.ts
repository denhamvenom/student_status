import { ensureFinancialAccount, recordProjectedEntry } from "./lib/financialSources";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { v } from "convex/values";
import { env, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { audit } from "./lib/access";

const EXPECTED_DEV_URL = "https://third-bandicoot-18.convex.cloud";
const EVENT_NAME = "REHEARSAL ONLY — Overnight Approval Drill";
const MARKER_ENTITY = "developmentRehearsal";
const REASON = "Fictional development rehearsal only; no real student or money";
const PEOPLE = [
  { legalName: "Rehearsal Alex Example", preferredName: "Alex (rehearsal)", email: "rehearsal.alex@example.invalid", subteam: "Mechanical", paymentCents: 4000, fundraiserCents: 3000 },
  { legalName: "Rehearsal Blair Example", preferredName: "Blair (rehearsal)", email: "rehearsal.blair@example.invalid", subteam: "Programming", paymentCents: 2000, fundraiserCents: 1000 },
] as const;

function markerIds(value: string | undefined): { studentIds: [Id<"students">, Id<"students">]; eventId: Id<"events"> } {
  if (!value) throw new Error("Rehearsal marker is incomplete; manual review required.");
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new Error("Rehearsal marker is invalid; manual review required."); }
  if (!parsed || typeof parsed !== "object" || !("studentIds" in parsed) || !("eventId" in parsed)) throw new Error("Rehearsal marker is invalid; manual review required.");
  const ids = parsed.studentIds; const eventId = parsed.eventId;
  if (!Array.isArray(ids) || ids.length !== 2 || ids.some(id => typeof id !== "string") || typeof eventId !== "string") throw new Error("Rehearsal marker is invalid; manual review required.");
  return { studentIds: ids as [Id<"students">, Id<"students">], eventId: eventId as Id<"events"> };
}

/** Owner-invoked, hard-bound fictional fixture for the approved development deployment. */
export const ensure = internalMutation({
  args: { expectedCoachEmail: v.string() },
  returns: v.object({ studentIds: v.array(v.id("students")), eventId: v.id("events"), created: v.boolean() }),
  handler: async (ctx, args) => {
    if (env.CONVEX_CLOUD_URL !== EXPECTED_DEV_URL) throw new Error("Rehearsal fixture is development-only.");
    const email = args.expectedCoachEmail.trim().toLowerCase();
    const coaches = await ctx.db.query("appUsers").withIndex("by_role", q => q.eq("role", "coach")).take(101);
    if (coaches.length > 100) throw new Error("Coach record limit reached.");
    const coach = coaches.find(x => x.active && x.email.toLowerCase() === email);
    if (!coach) throw new Error("Expected active development Coach not found.");
    const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
    if (!season || season.createdBy !== coach._id) throw new Error("Expected Coach-owned active season not found.");

    const markers = await ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", MARKER_ENTITY).eq("entityId", season._id)).take(2);
    if (markers.length > 1) throw new Error("Duplicate rehearsal markers require manual review.");
    if (markers.length === 1) {
      const ids = markerIds(markers[0].afterJson);
      const event = await ctx.db.get(ids.eventId);
      const students = await Promise.all(ids.studentIds.map(id => ctx.db.get(id)));
      if (!event || event.seasonId !== season._id || event.name !== EVENT_NAME || students.some((student, i) => !student || student.seasonId !== season._id || student.email !== PEOPLE[i].email || student.userId !== undefined)) throw new Error("Rehearsal records changed; manual review required.");
      return { ...ids, created: false };
    }

    // If any reserved fixture identity already exists without our marker, do not adopt it.
    for (const person of PEOPLE) {
      const matches = await ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", season._id).eq("email", person.email)).take(2);
      if (matches.length) throw new Error("Rehearsal student identity already exists without marker; no records changed.");
    }
    const events = await ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", season._id)).take(501);
    if (events.length > 500) throw new Error("Event limit reached; fixture will not scan beyond it.");
    if (events.some(event => event.name === EVENT_NAME)) throw new Error("Rehearsal event already exists without marker; no records changed.");

    const now = Date.now();
    const studentIds: [Id<"students">, Id<"students">] = [
      await ctx.db.insert("students", { seasonId: season._id, legalName: PEOPLE[0].legalName, preferredName: PEOPLE[0].preferredName, structuredNameReviewed: false, email: PEOPLE[0].email, subteam: PEOPLE[0].subteam, active: true, travelTeam: true, roomCategory: "Boys", roomCategoryLocked: true, allergies: { state: "unknown" }, medications: { state: "unknown" } }),
      await ctx.db.insert("students", { seasonId: season._id, legalName: PEOPLE[1].legalName, preferredName: PEOPLE[1].preferredName, structuredNameReviewed: false, email: PEOPLE[1].email, subteam: PEOPLE[1].subteam, active: true, travelTeam: true, roomCategory: "Boys", roomCategoryLocked: true, allergies: { state: "unknown" }, medications: { state: "unknown" } }),
    ];
    const eventId = await ctx.db.insert("events", { seasonId: season._id, name: EVENT_NAME, type: "Competition", startsAt: now + 45 * 86_400_000, endsAt: now + 47 * 86_400_000, destination: "Fictional rehearsal venue", travel: "Synthetic transport plan", overnight: true, roomingEnabled: true, roomDeadline: now + 40 * 86_400_000, feeCents: 1500, signupMode: "approval", capacity: 1, signupClosesAt: now + 30 * 86_400_000, allowWithdrawal: true, permissionRequired: false, firstRequired: false, archived: false });
    await ctx.db.insert("participants", { eventId, studentId: studentIds[0], status: "pending", createdAt: now, updatedAt: now });
    await ctx.db.insert("participants", { eventId, studentId: studentIds[1], status: "waitlist", createdAt: now + 1, updatedAt: now + 1 });
    for (const [i, person] of PEOPLE.entries()) {
      const studentId = studentIds[i];
      const projection = await ensureFinancialAccount(ctx, studentId);
      const paymentId = await ctx.db.insert("ledgerEntries", { studentId, kind: "payment", amountCents: person.paymentCents, previousCents: 0, newCents: person.paymentCents, reason: REASON, recordedBy: coach._id, recordedAt: now, idempotencyKey: `dev-rehearsal:${season._id}:${i}:payment` });
      await recordProjectedEntry(ctx, paymentId, projection);
      const fundraisingId = await ctx.db.insert("ledgerEntries", { studentId, kind: "fundraiser", amountCents: person.fundraiserCents, previousCents: person.paymentCents, newCents: person.paymentCents + person.fundraiserCents, reason: REASON, recordedBy: coach._id, recordedAt: now + 1, idempotencyKey: `dev-rehearsal:${season._id}:${i}:fundraiser` });
      await recordProjectedEntry(ctx, fundraisingId, projection);
      await audit(ctx, coach, "ledger", studentId, "seedFictionalRehearsalFunds", null, { paymentCents: person.paymentCents, fundraiserCents: person.fundraiserCents }, REASON);
    }
    await audit(ctx, coach, MARKER_ENTITY, season._id, "create", null, { studentIds, eventId }, REASON);
    for (const studentId of studentIds) await refreshStudentFinance(ctx, studentId);
    return { studentIds, eventId, created: true };
  },
});
