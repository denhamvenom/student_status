import { v } from "convex/values";
import { env, internalMutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { audit } from "./lib/access";
import { ensureFinancialAccount, recordProjectedEntry } from "./lib/financialSources";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { addCharge } from "./lib/money";
import { syncWholeTeamMembership } from "./lib/wholeTeam";

const DEV = "https://third-bandicoot-18.convex.cloud";
const MARKER = "reviewer-rehearsal-2026-10-18-v1";
const PREFIX = "REVIEW 2026-10-18";
const REASON = "Owner-authorized fictional development review; no real money, attendance, medical claim or signature.";
const PEOPLE = ["Avery Partial", "Blake Unpaid", "Casey Credit", "Drew Pending", "Ellis Waitlist", "Finley Inactive"] as const;
const result = v.object({ created: v.boolean(), studentIds: v.array(v.id("students")), eventIds: v.array(v.id("events")) });

/** Additive fixture only. Existing accounts, family links, receipts and history are never adopted or rewritten. */
export const ensure = internalMutation({
  args: { expectedCoachEmail: v.string() }, returns: result,
  handler: async (ctx, args) => {
    if (env.CONVEX_CLOUD_URL !== DEV) throw new Error("Reviewer fixture is development-only.");
    const coach = await ctx.db.query("appUsers").withIndex("by_email", q => q.eq("email", args.expectedCoachEmail.trim().toLowerCase())).unique();
    if (!coach?.active || coach.role !== "coach") throw new Error("Expected active development Coach required.");
    const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
    if (!season || season.createdBy !== coach._id) throw new Error("Expected Coach-owned active season required.");
    const marker = await ctx.db.query("audit").withIndex("by_entity_and_entityId", q => q.eq("entity", MARKER).eq("entityId", season._id)).unique();
    if (marker) {
      const data: unknown = JSON.parse(marker.afterJson ?? "null");
      if (!data || typeof data !== "object" || !("studentIds" in data) || !("eventIds" in data) || !Array.isArray(data.studentIds) || !Array.isArray(data.eventIds) || data.studentIds.length !== 6 || data.eventIds.length !== 2) throw new Error("Fixture marker requires manual review.");
      const studentIds: Id<"students">[] = [], eventIds: Id<"events">[] = [];
      for (const [i, value] of data.studentIds.entries()) {
        const id = typeof value === "string" ? ctx.db.normalizeId("students", value) : null;
        const row = id ? await ctx.db.get(id) : null;
        if (!row || row.seasonId !== season._id || row.email !== `review.20261018.${i}@example.invalid` || row.userId) throw new Error("Fixture identity changed; manual review required.");
        studentIds.push(row._id);
      }
      for (const value of data.eventIds) {
        const id = typeof value === "string" ? ctx.db.normalizeId("events", value) : null;
        const row = id ? await ctx.db.get(id) : null;
        if (!row || row.seasonId !== season._id || !row.name.startsWith(PREFIX)) throw new Error("Fixture event changed; manual review required.");
        eventIds.push(row._id);
      }
      return { created: false, studentIds, eventIds };
    }
    for (let i = 0; i < PEOPLE.length; i++) {
      const collision = await ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", season._id).eq("email", `review.20261018.${i}@example.invalid`)).first();
      if (collision) throw new Error("Reserved fixture exists without provenance; no records changed.");
    }
    const priorEvents = await ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", season._id)).take(501);
    if (priorEvents.length > 500 || priorEvents.some(e => e.name.startsWith(PREFIX))) throw new Error("Event collision or review limit; no records changed.");
    // Existing future Whole Team events must also receive new active members through the real helper.
    // Avoid unexpectedly charging new fixtures for an unrelated existing event.
    const now = Date.now(), day = 86_400_000;
    const eventBase = Math.max(now, season.startsAt);
    if (season.endsAt !== undefined && eventBase + 23 * day > season.endsAt) throw new Error("Season dates cannot contain the review trip; no records committed.");
    if (priorEvents.some(e => e.startsAt > now && !e.archived && e.assignmentScope === "wholeTeam" && e.feeCents !== 0)) throw new Error("Review existing Whole Team fees before adding fixtures.");
    const studentIds: Id<"students">[] = [];
    for (const [i, name] of PEOPLE.entries()) {
      const complete = i < 3, active = i !== 5;
      const studentId = await ctx.db.insert("students", {
        seasonId: season._id, legalName: `${PREFIX} ${name}`, preferredName: name,
        email: `review.20261018.${i}@example.invalid`, subteam: i % 2 ? "Programming" : "Build",
        active, travelTeam: i < 3, roomCategory: i < 2 ? "Boys" : i < 5 ? "Girls" : undefined,
        roomCategoryLocked: complete, profileCompletedAt: complete ? now : undefined, profileRevision: 1,
        firstName: name.split(" ")[0], lastName: name.split(" ")[1], structuredNameReviewed: complete,
        shirtSize: complete ? "M" : undefined, archivedAt: active ? undefined : now,
        allergies: { state: i === 1 ? "reported" : complete ? "none" : "unknown", ...(i === 1 ? { text: "FICTIONAL TEST ONLY: example allergy entry" } : {}) },
        medications: { state: complete ? "none" : "unknown" },
        // Fictional structured health/contact example remains UNCONFIRMED: no parent attestation is invented.
        ...(i === 1 ? { consentProfileV2: {
          grade: "10", dateOfBirth: "2011-01-15",
          guardian: { name: "Fictional Review Guardian", relationship: "Parent", phone: "202-555-0143", email: "review.guardian@example.invalid" },
          emergency: { name: "Fictional Review Contact", relationship: "Test contact", phone: "202-555-0144" },
          allergies: { state: "reported" as const, entries: [{ allergen: "FICTIONAL TEST ALLERGEN", severity: "Test entry", reaction: "Fictional reaction", response: "TEST ONLY - not medical instructions" }] },
          prescriptions: { state: "reported" as const, entries: [{ name: "FICTIONAL TEST MEDICATION", dose: "TEST ONLY", timing: "TEST ONLY", reason: "Display review", carriedBy: "Fictional guardian" }] },
          insurance: { state: "provided" as const, provider: "FICTIONAL TEST INSURANCE", policy: "TEST-NOT-A-REAL-POLICY" },
          physician: { state: "unavailable" as const, name: null, phone: null },
        } } : {}),
      });
      studentIds.push(studentId);
      if (i === 0 || i === 2) await ctx.db.insert("setupDrafts", { studentId, seasonId: season._id, grade: "10", dateOfBirth: "2011-01-15", updatedBy: coach._id, updatedAt: now });
      const student = await ctx.db.get(studentId); if (!student) throw new Error("Fixture student unavailable.");
      await syncWholeTeamMembership(ctx, coach, student);
      await refreshStudentFinance(ctx, studentId);
    }
    const eventId = await ctx.db.insert("events", { seasonId: season._id, name: `${PREFIX} Overnight Review Trip`, type: "Competition", startsAt: eventBase + 21 * day, endsAt: eventBase + 23 * day, destination: "Fictional review venue", travel: "TEST ONLY: shared vehicle or independent travel", transportEnabled: true, busSeats: 0, additionalAdults: 1, trailerRequired: true, overnight: true, roomingEnabled: true, roomDeadline: eventBase + 18 * day, feeCents: 0, signupMode: "approval", capacity: 4, signupClosesAt: eventBase + 14 * day, allowWithdrawal: true, permissionRequired: false, firstRequired: true, archived: false });
    const outreachEventId = await ctx.db.insert("events", { seasonId: season._id, name: `${PREFIX} Outreach Review`, type: "Outreach", startsAt: eventBase + 7 * day, endsAt: eventBase + 7 * day + 3_600_000, destination: "Fictional outreach venue", travel: "Not applicable", transportEnabled: false, overnight: false, roomingEnabled: false, feeCents: 0, signupMode: "open", allowWithdrawal: false, permissionRequired: false, firstRequired: false, archived: false });
    for (let i = 0; i < 5; i++) await ctx.db.insert("participants", { eventId, studentId: studentIds[i], status: i < 3 ? "confirmed" : i === 3 ? "pending" : "waitlist", independentTravel: i === 2, createdAt: now + i, updatedAt: now });
    await ctx.db.insert("participants", { eventId: outreachEventId, studentId: studentIds[0], status: "confirmed", createdAt: now, updatedAt: now });
    const roomId = await ctx.db.insert("roomGroups", { eventId, category: "Boys", name: `${PREFIX} Boys Assigned`, finalized: true, adultFifthException: false, needsReview: false, createdBy: coach._id });
    for (const studentId of studentIds.slice(0, 2)) await ctx.db.insert("roomMemberships", { eventId, groupId: roomId, studentId, joinedAt: now });
    await ctx.db.insert("roomRequests", { eventId, studentId: studentIds[2], requestedAt: now });
    const driverId = await ctx.db.insert("drivers", { seasonId: season._id, name: `${PREFIX} Fictional Driver`, phone: "202-555-0142", email: "review.driver@example.invalid", seats: 4, approved: true, vehicleName: "TEST ONLY Review Van", towCapable: true, active: true });
    await ctx.db.insert("eventVehicles", { eventId, driverId, seats: 4, notes: "Fictional review only; do not contact or arrange travel." });
    await ctx.db.insert("requirements", { eventId, key: "reviewPacking", label: "TEST ONLY packing checklist", instructions: "Fictional readiness contrast; no real action required.", dueAt: eventBase + 15 * day });
    await ctx.db.insert("requirementCompletions", { eventId, studentId: studentIds[0], key: "reviewPacking", completedBy: coach._id, completedAt: now });
    for (const [i, status] of (["verified", "needsCompletion", "awaitingVerification"] as const).entries()) await ctx.db.insert("firstRegistrationStates", { studentId: studentIds[i], seasonId: season._id, status, revision: 1, teamAccepted: i === 0, consentRelease: i === 0, ...(i === 0 ? { verifiedBy: coach._id, verifiedAt: now } : {}), ...(i === 2 ? { reportedBy: coach._id, reportedAt: now } : {}) });
    for (const [i, payment, fundraising] of [[0, 4000, 2000], [2, 2500, 1500]]) {
      const studentId = studentIds[i], account = await ensureFinancialAccount(ctx, studentId);
      for (const [kind, amount] of [["payment", payment], ["fundraiser", fundraising]] as const) {
        const amountCents = amount as number;
        const previousCents = account.personalAvailableCents + account.fundraisingAvailableCents;
        const entryId = await ctx.db.insert("ledgerEntries", { studentId, kind, amountCents, previousCents, newCents: previousCents + amountCents, reason: REASON, recordedBy: coach._id, recordedAt: now, idempotencyKey: `${MARKER}:${season._id}:${i}:${kind}` });
        await recordProjectedEntry(ctx, entryId, account);
      }
      await refreshStudentFinance(ctx, studentId);
    }
    for (const i of [0, 1]) await addCharge(ctx, coach, studentIds[i], `${PREFIX} Review charge (separate from zero-fee trip)`, 10000, 0, `${MARKER}:${season._id}:${i}:charge`);
    // Reuse existing attendance history; never fabricate past activity before this future test season.
    const eventIds = [eventId, outreachEventId];
    await audit(ctx, coach, MARKER, season._id, "createFictionalReviewFixtures", null, { studentIds, eventIds, roomId, driverId }, REASON);
    return { created: true, studentIds, eventIds };
  },
});
