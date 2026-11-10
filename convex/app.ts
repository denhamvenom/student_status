import { normalizeChangedPhone } from "./lib/contactValidation";
import { enrollmentPending } from "./lib/eventEnrollmentState";
import { ConvexError, v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { seriesProgress } from "./lib/seriesGenerate";
import { eventVisibleFor, parentLinkedStudentsFallback, parentLinkedStudentsOrNull, participationOn, requireStudentOrParentCanSeeEvent } from "./lib/eventVisibility";
import { resolveAudience } from "./lib/eventAudienceRules";
import { eventDetailReturns, familyEvent, listEventsReturns } from "./lib/eventProjection";
import { creatorCaches, eventCreatorFor } from "./lib/eventCreator";
import { seriesOf } from "./lib/mentorMeetings";
import { activeSeason, identity, linkedStudents, maybeViewer, mentorEvent, mentorStudent, privateStudent, publicStudent, studentGroups, requireRole, studentAccess, viewer as requireViewer, audit, isCoachOrTravelLead } from "./lib/access";
import { attendanceFor, financeFor, roomSelectionState, studentReadiness } from "./lib/readModels";
import { effectiveChargeCents } from "./lib/chargeObligation";
import { activeShifts, eventShiftSignups } from "./lib/eventSignupExtras";
import { chargeCurrency } from "../src/lib/charge-money";
import { coverageFor } from "./lib/permissionCoverage";
import { fieldTripApproved } from "../src/lib/field-trip-approved";
import { v2SigningAllowed } from "./lib/permissionSigningMode";
import { permissionSigningPaused } from "./lib/permissionSigningMode";
import { transportSummary } from "./travel";
import { age18, firstStatus } from "./firstRegistration";
import { studentSetupCompleteFor } from "./setupWizard";
import { operatingRole } from "./lib/access";
import { queueJoinRequestDigest } from "./lib/notificationTriggers";
import { clearJoinAttempts, codeLimiter, googleRequiredForStudents, joinAttemptsLocked, recordFailedJoinAttempt, usableTeamCode } from "./lib/invitationCodes";

export const viewer = query({
  args: {}, returns: v.any(),
  handler: async ctx => {
    const who = await ctx.auth.getUserIdentity();
    if (!who) return { status: "signedOut", user: null, students: [], season: null };
    const user = await maybeViewer(ctx);
    if (!user) return { status: "pending", user: null, students: [], season: null };
    const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).first();
    const storedUser = await ctx.db.get(user._id);
    const selection = await operatingRole(ctx, storedUser!);
    return { status: "active", availableRoles: selection.roles, operatingRole: selection.role, roleSelectionRequired: selection.roles.length > 1 && !selection.selected, user: { id: user._id, name: user.name, email: user.email, role: user.role, travelLead: user.travelLead, financialEdit: user.financialEdit, healthExport: user.healthExport ?? false, accessRevision: user.accessRevision ?? 0, theme: user.theme ?? "system" }, students: (user.role === "student" ? await linkedStudents(ctx, user) : []).map(student => ({ ...publicStudent(student), profileSetupRequired: student.profileCompletedAt === undefined, profileRevision: student.profileRevision ?? 0 })), season: season ? { _id: season._id, name: season.name, year: season.year } : null };
  },
});

export const studentProfile = query({
  args: { studentId: v.id("students") }, returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    return privateStudent(await studentAccess(ctx, user, args.studentId));
  },
});

export const listEvents = query({
  args: {}, returns: listEventsReturns,
  handler: async ctx => {
    const user = await requireViewer(ctx);
    const season = await activeSeason(ctx);
    const events = await ctx.db.query("events").withIndex("by_seasonId_and_archived_and_endsAt", q => q.eq("seasonId", season._id).eq("archived", false)).take(200).then(rows => rows.sort((a, b) => a.startsAt - b.startsAt));
    if (user.role === "mentor" && !user.travelLead) return events.filter(x => !x.archived).map(event => ({ event: mentorEvent(event), participation: null }));
    if (isCoachOrTravelLead(user)) {
      // Coach and Travel Lead also see who created each event (name and role label only), read once per creator and series.
      const caches = creatorCaches();
      const rows = [];
      for (const event of events) if (!event.archived) rows.push({ event, participation: null, createdBy: await eventCreatorFor(ctx, event, caches) });
      return rows;
    }
    // Students and Parents see only events for them: legacy events, events a student is on, or whose audience includes a student.
    // Participation is a point lookup per candidate event (by_eventId_and_studentId), so a long signup history can't hide events.
    if (user.role === "parent") {
      const linked = await parentLinkedStudentsOrNull(ctx);
      if (!linked) {
        // Fail closed while Family links are being prepared or need review: only legacy events and events a linked student is
        // actually on. Targeted, subteam and Mentors-only events are never shown on audience alone.
        const fallback = await parentLinkedStudentsFallback(ctx, user._id, season._id);
        const visible = [];
        for (const event of events) {
          if (event.archived) continue;
          if (resolveAudience(event).legacy) { visible.push({ event: familyEvent(event), participation: null }); continue; }
          for (const student of fallback) {
            const row = await participationOn(ctx, event._id, student._id);
            if (row && row.status !== "withdrawn") { visible.push({ event: familyEvent(event), participation: null }); break; }
          }
        }
        return visible;
      }
      const visible = [];
      for (const event of events) if (!event.archived && await eventVisibleFor(ctx, event, linked, true)) visible.push({ event: familyEvent(event), participation: null });
      return visible;
    }
    const students = await linkedStudents(ctx, user);
    const student = students[0];
    if (!student) return [];
    const visible = [];
    for (const x of events) {
      if (x.archived) continue;
      const participation = await participationOn(ctx, x._id, student._id);
      if (x.signupMode === "assigned" && !(participation && participation.status !== "withdrawn")) continue;
      if (participation || await eventVisibleFor(ctx, x, [student], true)) visible.push({ event: familyEvent(x), participation: participation?.status ?? null });
    }
    return visible;
  },
});

export const eventDetail = query({
  args: { eventId: v.id("events"), studentId: v.optional(v.id("students")) }, returns: eventDetailReturns,
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const event = await ctx.db.get(args.eventId);
    const season = await activeSeason(ctx);
    if (!event || event.seasonId !== season._id) throw new ConvexError("This event is no longer available. It may have moved to Past events. Reload to see current events.");
    if (event.archived) {
      if (!isCoachOrTravelLead(user)) throw new ConvexError("This event has ended and moved to Past events. Any balance due for it stays in Money.");
      return { event, participation: null, requirements: [], readiness: null };
    }
    if (user.role === "mentor" && !user.travelLead) return { event: mentorEvent(event), participation: null, requirements: [], readiness: null };
    // Staff (Coach, Travel Lead) also get where a series meeting sits: meetings exist through a rolling window and more are
    // added automatically. `series` is null for a single event and absent for Students and Parents. `createdBy` (the creator's
    // name and role label) is staff only too.
    const staff = isCoachOrTravelLead(user);
    // The series is read once through the creator caches, so eventCreatorFor reuses it.
    const caches = creatorCaches();
    const seriesDoc = staff && event.seriesId ? await seriesOf(ctx, event.seriesId, caches.series) : null;
    const staffSeries = staff ? { series: seriesDoc ? { seriesId: seriesDoc._id, name: seriesDoc.name, status: seriesDoc.status, ...seriesProgress(seriesDoc) } : null, createdBy: await eventCreatorFor(ctx, event, caches) } : {};
    const student = args.studentId ? await studentAccess(ctx, user, args.studentId) : null;
    // Students and Parents never get a Mentors-only event, nor a targeted event outside their students' audience that none
    // of them is on; while a Parent's Family links are still being prepared, only events a linked student is on (same rule as
    // listEvents). Same message as a missing event, so ids reveal nothing.
    await requireStudentOrParentCanSeeEvent(ctx, user, event, student);
    // Students and Parents get the family projection (no Calendar sync state, Media Support or staff settings).
    const shown = user.role === "student" || user.role === "parent" ? familyEvent(event) : event;
    const requirements = await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(100);
    if (!student) return { event: shown, participation: null, requirements, readiness: null, ...staffSeries };
    const readiness = await studentReadiness(ctx, event, student);
    const visibleReadiness = user.role === "parent" && await permissionSigningPaused(ctx) && readiness.state === "open" ? {...readiness, open: readiness.open.filter(item => item !== "Permission accepted"), state: readiness.open.every(item => item === "Permission accepted") ? "notApplicable" as const : readiness.state} : readiness;
    return { event: shown, participation: readiness.participation, requirements, readiness: visibleReadiness, ...staffSeries };
  },
});

export const studentFinances = query({
  args: { studentId: v.id("students") }, returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    if (user.role === "mentor" && !user.travelLead) throw new ConvexError("Mentors can't see Money. Ask a Coach or Travel Lead for help.");
    const student = await studentAccess(ctx, user, args.studentId);
    const season = await activeSeason(ctx);
    if (student.seasonId !== season._id) throw new ConvexError("This student's account is from an earlier season. Ask a Coach for past Money records.");
    return await financeFor(ctx, student._id);
  },
});

export const studentDashboard = query({
  args: { studentId: v.id("students"), asOf: v.optional(v.number()) }, returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const student = await studentAccess(ctx, user, args.studentId);
    const season = await activeSeason(ctx);
    if (student.seasonId !== season._id) throw new ConvexError("This student is from an earlier season. Reload to see the current roster.");
    const finance = await financeFor(ctx, student._id);
    const events = await ctx.db.query("events").withIndex("by_seasonId_and_archived_and_endsAt", q => q.eq("seasonId", season._id).eq("archived", false)).take(200).then(rows => rows.sort((a, b) => a.startsAt - b.startsAt));
    const participations = await ctx.db.query("participants").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(200);
    const rows = [];
    const todos: { eventId: Doc<"events">["_id"] | null; eventName: string; label: string; dueAt: number | null; href: string | null; responsible: "student" | "parent" | "coach"; blocked: boolean }[] = [];
    const studentSetupComplete = await studentSetupCompleteFor(ctx, student);
    const parentProfileComplete = !!student.consentProfileV2CompletedAt;
    const activeVersion = season.activePermissionVersionId ? await ctx.db.get(season.activePermissionVersionId) : null;
    const signingAvailable = user.role === "parent" && activeVersion?.formFormat === 2 && activeVersion.version === fieldTripApproved.templateVersion && await v2SigningAllowed(ctx, student._id, user._id);
    const signingPaused = await permissionSigningPaused(ctx);
    if (!studentSetupComplete) todos.push({eventId: null, eventName: "Student setup", label: user.role === "student" ? "Finish your student setup" : "Student setup needs to be finished by the student", dueAt: null, href: user.role === "student" ? "/setup" : null, responsible: "student", blocked: user.role !== "student"});
    if (!parentProfileComplete) todos.push({eventId: null, eventName: "Health information", label: user.role === "parent" ? "Finish health information" : "A parent needs to finish health information", dueAt: null, href: user.role === "parent" ? "/setup" : null, responsible: "parent", blocked: user.role !== "parent"});
    const firstRegistrationState = await firstStatus(ctx, student._id);
    const adultStudent = user.role === "student" && args.asOf !== undefined && Number.isFinite(args.asOf) && age18((await ctx.db.query("setupDrafts").withIndex("by_studentId",q=>q.eq("studentId",student._id)).unique())?.dateOfBirth ?? student.consentProfileV2?.dateOfBirth, args.asOf);
    if (firstRegistrationState !== "verified") {
      const waiting=firstRegistrationState==="awaitingVerification";
      todos.push({eventId:null,eventName:"FIRST registration and Consent & Release",label:waiting?"FIRST registration awaits Coach verification":user.role==="parent"||adultStudent?"Complete FIRST registration and Consent & Release":"Your parent completes FIRST registration.",dueAt:null,href:waiting||user.role==="student"&&!adultStudent?null:"/setup",responsible:waiting?"coach":adultStudent?"student":"parent",blocked:waiting||user.role==="student"&&!adultStudent});
    }
    for (const event of events) {
      const participation = participations.find(x => x.eventId === event._id)?.status ?? null;
      if (event.archived || event.cancelled || (!participation && event.signupMode === "assigned")) continue;
      const readiness = await studentReadiness(ctx, event, student);
      const visibleReadiness = user.role === "parent" && await permissionSigningPaused(ctx) && readiness.state === "open" ? {...readiness, open: readiness.open.filter(item => item !== "Permission accepted"), state: readiness.open.every(item => item === "Permission accepted") ? "notApplicable" as const : readiness.state} : readiness;
      rows.push({ event: user.role === "student" || user.role === "parent" ? familyEvent(event) : event, participation, readiness: visibleReadiness });
      if (participation === "confirmed" && readiness.state === "open") {
        const custom = await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(100);
        for (const item of readiness.open) {
          if (event.type === "Competition" && item === "FIRST registration and Consent & Release") continue;
          if (item === "Permission accepted") {
            if (signingPaused && user.role === "parent") continue;
            const coverage = await coverageFor(ctx, student._id, event._id);
            const waiting = coverage?.state === "pending" && coverage.signatureRequestedAt === undefined;
            const readyToPrepare = studentSetupComplete && parentProfileComplete && !waiting && signingAvailable;
            const label = waiting ? "Permission form submitted; waiting for Coach review" : !studentSetupComplete ? "Permission form waits for student setup" : !parentProfileComplete ? "Permission form waits for the health and contact profile" : user.role === "parent" && !signingAvailable ? "Permission signing is not available yet; ask a Coach" : user.role === "parent" ? "Review and sign the permission form" : "A parent or legal guardian needs to complete the permission form when available";
            todos.push({eventId: event._id, eventName: event.name, label, dueAt: event.startsAt, href: user.role === "parent" && readyToPrepare ? "/forms" : null, responsible: waiting || user.role === "parent" && !signingAvailable ? "coach" : "parent", blocked: !readyToPrepare || user.role !== "parent"});
            continue;
          }
          const staff = item === "Season fee maintenance is not complete" || item === "Financial records require review or are updating" || item === "Event financial records require review" || item === "Event requirements require review";
          const studentOnly = item === "FIRST registration" || item === "Room selection";
          const responsible = staff ? "coach" as const : studentOnly ? "student" as const : item === "Required payment" ? "parent" as const : "student" as const;
          const blocked = staff || user.role !== responsible;
          const label = item === "FIRST registration" && user.role === "parent" ? "Student needs to finish FIRST registration" : item === "Room selection" && user.role === "parent" ? "Student needs to choose room preferences" : item === "Required payment" && user.role === "student" ? "Parent or guardian needs to review the payment due" : item;
          const href = blocked ? null : item === "Required payment" ? "/finances" : item === "Room selection" ? `/events/${event._id}/rooming` : `/events/${event._id}`;
          todos.push({eventId: event._id, eventName: event.name, label, dueAt: custom.find(x => x.label === item)?.dueAt ?? event.startsAt, href, responsible, blocked});
        }
      }
    }
    return { student: publicStudent(student), money: finance.summary, events: rows, attendance: await attendanceFor(ctx, student), todos };
  },
});

export const teamRoster = query({
  args: {}, returns: v.any(),
  handler: async ctx => {
    const user = await requireViewer(ctx);
    if (!isCoachOrTravelLead(user)) throw new ConvexError("Only a Coach or Travel Lead can open the team roster.");
    const season = await activeSeason(ctx);
    const students = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(500);
    // Travel Lead gets the public fields plus groups and profileRevision (to call setStudentSecondaryAndLeadership); no health or contact data.
    return students.map(student => ({ ...(user.role === "coach" ? privateStudent(student) : { ...publicStudent(student), ...studentGroups(student), profileRevision: student.profileRevision ?? 0 }), fundraiserConnected: !!student.fundraiserUrl }));
  },
});

export const mentorReport = query({
  args: {}, returns: v.any(),
  handler: async ctx => {
    const user = await requireViewer(ctx);
    requireRole(user, "coach", "mentor");
    const season = await activeSeason(ctx);
    const students = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(500);
    const events = await ctx.db.query("events").withIndex("by_seasonId_and_archived_and_endsAt", q => q.eq("seasonId", season._id).eq("archived", false)).take(200).then(rows => rows.sort((a, b) => a.startsAt - b.startsAt));
    const meetings = await ctx.db.query("attendanceMeetings").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", season._id)).take(500);
    const report = [];
    for (const student of students.filter(x => x.active)) {
      const participation = await ctx.db.query("participants").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(200);
      report.push({ student: mentorStudent(student), attendance: await attendanceFor(ctx, student, meetings), events: events.filter(e => participation.some(p => p.eventId === e._id && p.status === "confirmed")).map(e => ({ id: e._id, name: e.name })) });
    }
    return report;
  },
});

export type ReadinessColumn = { key: string; label: string };
type ReadinessEventFields = Pick<Doc<"events">, "feeCents" | "permissionRequired" | "firstRequired" | "type" | "overnight" | "roomingEnabled" | "shiftsEnabled">;

/**
 * The requirement columns that apply to one event, in display order. A requirement an event does not have gets no column.
 * The permission form column appears only while permission signing is open for the team.
 */
export function readinessColumns(event: ReadinessEventFields, options: { signingOpen: boolean; requirements: { key: string; label: string }[] }): ReadinessColumn[] {
  return [
    ...(event.feeCents > 0 ? [{ key: "payment", label: "Payment" }] : []),
    ...(event.permissionRequired && options.signingOpen ? [{ key: "permission", label: "Permission form" }] : []),
    ...(event.type === "Competition" || event.firstRequired ? [{ key: "first", label: "FIRST registration" }] : []),
    ...options.requirements.map(requirement => ({ key: `custom:${requirement.key}`, label: requirement.label })),
    ...(event.overnight && event.roomingEnabled ? [{ key: "room", label: "Room choice" }] : []),
  ];
}

/**
 * The Event readiness list reads at most READINESS_LIST_EVENTS events. Per event it reads at most READINESS_LIST_REQUIREMENTS
 * requirements and, only when nothing else lists the event, READINESS_LIST_CHARGES charges: 100 x (25 + 25) + 100 events = 5,100
 * documents, well under Convex's 32,000-document limit (the old 200 x (100 + 50) approached it at 30,200).
 */
const READINESS_LIST_EVENTS = 100;
const READINESS_LIST_REQUIREMENTS = 25;
const READINESS_LIST_CHARGES = 25;

/** Whether any of the event's charges (first 25) still has a balance due. Bounded per event. */
async function eventHasOpenCharge(ctx: QueryCtx, eventId: Id<"events">) {
  const charges = await ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId)).take(READINESS_LIST_CHARGES);
  return charges.some(charge => effectiveChargeCents(charge) - charge.appliedCents > 0);
}

/** Events a Coach or Travel Lead has something to complete for: only those with at least one requirement or team transport. */
export const readinessEvents = query({
  args: { asOf: v.number() },
  returns: v.array(v.object({ _id: v.id("events"), name: v.string(), type: v.string(), startsAt: v.number(), endsAt: v.number(), requirements: v.array(v.string()), isPast: v.boolean() })),
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    if (!isCoachOrTravelLead(user)) throw new ConvexError("Only a Coach or Travel Lead can see event readiness.");
    const season = await activeSeason(ctx);
    const signingOpen = !(await permissionSigningPaused(ctx));
    // Newest-ending first so a long season keeps its upcoming and recent events; the list is re-sorted oldest-first below.
    const events = await ctx.db.query("events").withIndex("by_seasonId_and_archived_and_endsAt", q => q.eq("seasonId", season._id).eq("archived", false)).order("desc").take(READINESS_LIST_EVENTS);
    const listed = [];
    for (const event of events) {
      if (event.cancelled) continue;
      const requirements = await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(READINESS_LIST_REQUIREMENTS);
      const columns = readinessColumns(event, { signingOpen, requirements });
      // A free event still shows Payment (as its page does) while someone owes an event charge. Only events that would otherwise be skipped pay for this read.
      if (!columns.some(column => column.key === "payment") && await eventHasOpenCharge(ctx, event._id)) columns.unshift({ key: "payment", label: "Payment" });
      // While signing is paused the form column is hidden, but the page still counts an unsigned form against readiness, so the list keeps the event too.
      const formsNotOpen = event.permissionRequired && !signingOpen;
      if (!columns.length && !event.transportEnabled && !formsNotOpen) continue;
      listed.push({ _id: event._id, name: event.name, type: event.type, startsAt: event.startsAt, endsAt: event.endsAt, requirements: [...columns.map(column => column.label), ...(formsNotOpen ? ["Permission form (not open yet)"] : []), ...(event.transportEnabled ? ["Transport"] : [])], isPast: event.endsAt < args.asOf });
    }
    return listed.sort((a, b) => a.startsAt - b.startsAt);
  },
});

const leftoverHidden = new Set(["Required payment", "Permission accepted", "FIRST registration and Consent & Release", "FIRST registration", "Room selection", "This event is canceled."]);

export const eventReadiness = query({
  args: { eventId: v.id("events"), studentId: v.optional(v.id("students")) }, returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const event = await ctx.db.get(args.eventId);
    const season = await activeSeason(ctx);
    if (!event || event.seasonId !== season._id || event.archived) throw new ConvexError("This event is no longer available. It may have moved to Past events. Reload to see current events.");
    if (user.role === "student" || user.role === "parent") {
      if (!args.studentId) throw new ConvexError("Choose a student to see what's left for this event.");
      const student = await studentAccess(ctx, user, args.studentId);
      return { event: { _id: event._id, name: event.name }, students: [{ student: publicStudent(student), ...await studentReadiness(ctx, event, student) }], transportation: null, rooming: null, overall: null };
    }
    if (enrollmentPending(event)) return { event: { _id: event._id, name: event.name }, columns: [], counts: { students: 0, ready: 0, open: 0, openItems: 0 }, students: [], transportation: null, rooming: null, overall: "open", enrollmentState: event.enrollmentState, coverage: { participantsComplete: false, roomingComplete: false } };
    const participantPage = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(501);
    const participantsComplete = participantPage.length <= 500;
    const participants = participantPage.slice(0, 500);
    const signingOpen = !(await permissionSigningPaused(ctx));
    const custom = await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(100);
    const shifts = event.shiftsEnabled ? await activeShifts(ctx, event._id) : [];
    const shiftPlaces = event.shiftsEnabled ? await eventShiftSignups(ctx, event._id) : [];
    const minShifts = Math.min(event.minShiftsPerStudent ?? 1, shifts.length);
    const base = readinessColumns(event, { signingOpen, requirements: custom });
    const built = [];
    for (const p of participants.filter(x => x.status === "confirmed")) {
      const student = await ctx.db.get(p.studentId);
      if (!student?.active || student.seasonId !== season._id) continue;
      const readiness = await studentReadiness(ctx, event, student);
      const charges = await ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).take(101);
      const dueCents = charges.reduce((sum, charge) => sum + Math.max(0, effectiveChargeCents(charge) - charge.appliedCents), 0);
      const room = event.overnight && event.roomingEnabled ? await roomSelectionState(ctx, event._id, student._id) : null;
      const shiftCount = shiftPlaces.filter(x => x.studentId === student._id && shifts.some(s => s._id === x.shiftId)).length;
      built.push({ student, readiness, dueCents, room, shiftCount });
    }
    // Payment shows for a free event too when a student still owes an event charge.
    const columns: ReadinessColumn[] = [...base];
    if (!columns.some(c => c.key === "payment") && built.some(b => b.readiness.open.includes("Required payment"))) columns.unshift({ key: "payment", label: "Payment" });
    const leftovers = (open: string[]) => open.filter(item => !leftoverHidden.has(item) && !custom.some(r => r.label === item));
    if (built.some(b => leftovers(b.readiness.open).length)) columns.push({ key: "review", label: "Needs review" });
    const rowsBuilt = built.map(({ student, readiness, dueCents, room, shiftCount }) => {
      const cells = columns.map(column => {
        const cell = (done: boolean, doneText: string, openText: string) => ({ key: column.key, state: done ? "done" as const : "open" as const, text: done ? doneText : openText });
        if (column.key === "payment") return cell(!readiness.open.includes("Required payment"), "Paid", dueCents > 0 ? `Owes ${chargeCurrency(dueCents)}` : "Payment not complete");
        if (column.key === "permission") return cell(readiness.permissionStatus !== "missing", "Signed", "Not signed yet");
        if (column.key === "first") {
          if (event.type === "Competition") return cell(readiness.firstRegistrationState === "verified", "Verified", readiness.firstRegistrationState === "awaitingVerification" ? "Waiting for Coach approval" : "Not finished");
          return cell(!readiness.open.includes("FIRST registration"), "Done", "Not marked done");
        }
        if (column.key === "room") return cell(!readiness.open.includes("Room selection"), "Chosen", room?.membership ? "Room group not final yet" : "No room choice yet");
        if (column.key === "review") { const items = leftovers(readiness.open); return cell(items.length === 0, "Nothing to review", items.join("; ")); }
        return cell(!readiness.open.includes(column.label), "Done", "Not done");
      });
      const openCells = cells.filter(item => item.state === "open");
      // While signing is paused the Permission form column is hidden, but a required unsigned form still keeps the student from being ready.
      // The per-student reason stays server-side while paused: rows carry only the combined state and count, the page gets an event-level count.
      const awaitingForm = event.permissionRequired && !signingOpen && readiness.permissionStatus === "missing";
      const openCount = openCells.length + (awaitingForm ? 1 : 0);
      return { awaitingForm, shiftCount, row: { student: publicStudent(student), state: openCount ? "open" as const : "ready" as const, open: openCells.map(item => columns.find(c => c.key === item.key)!.label), cells, openCount, participation: readiness.participation, ...(signingOpen ? { permissionStatus: readiness.permissionStatus } : {}), firstRegistrationState: readiness.firstRegistrationState } };
    });
    const studentsAwaitingForms = rowsBuilt.filter(item => item.awaitingForm).length;
    const permissionFormsClosed = studentsAwaitingForms > 0;
    const rows = rowsBuilt.map(item => ({ ...item.row, ...(event.shiftsEnabled ? { shiftCount: item.shiftCount } : {}) }));
    const counts = { students: rows.length, ready: rows.filter(x => x.state === "ready").length, open: rows.filter(x => x.state === "open").length, openItems: rows.reduce((sum, row) => sum + row.openCount, 0) };
    const transportation = participantsComplete ? await transportSummary(ctx, event) : null;
    const roomGroupPage = await ctx.db.query("roomGroups").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(101);
    const roomingComplete = roomGroupPage.length <= 100;
    const groups = roomGroupPage.slice(0, 100);
    const memberships = await Promise.all(rows.map(x => ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", x.student._id)).unique()));
    const roomingCovered = memberships.every(m => m && groups.some(g => g._id === m.groupId && g.finalized && !g.needsReview));
    const rooming = !event.overnight || !event.roomingEnabled ? { state: "notApplicable", open: 0 } : { state: roomingComplete && participantsComplete && groups.every(x => x.finalized && !x.needsReview) && roomingCovered ? "ready" : "open", open: groups.filter(x => !x.finalized || x.needsReview).length + memberships.filter(x => !x).length };
    const overall = event.cancelled || !participantsComplete || !roomingComplete || counts.open || transportation?.state === "open" || rooming.state === "open" ? "open" : "ready";
    if (user.role === "mentor" && !user.travelLead) return { event: { _id: event._id, name: event.name }, columns: [], counts: null, students: [], transportation: null, rooming: null, overall };
    return { event: { _id: event._id, name: event.name }, columns, counts, students: rows.sort((a, b) => (a.state === "open" ? -1 : 1) - (b.state === "open" ? -1 : 1)), transportation, rooming, overall, permissionFormsClosed, studentsAwaitingForms, shifts: event.shiftsEnabled ? { minimum: minShifts } : null, coverage: { participantsComplete, roomingComplete } };
  },
});

export const updateStudentProfile = mutation({
  args: { studentId: v.id("students"), expectedRevision: v.number(), preferredName: v.optional(v.string()), shirtSize: v.optional(v.string()), emergencyName: v.optional(v.string()), emergencyRelationship: v.optional(v.string()), emergencyPhone: v.optional(v.string()), allergies: v.optional(v.object({ state: v.union(v.literal("unknown"), v.literal("none"), v.literal("reported")), text: v.optional(v.string()) })), medications: v.optional(v.object({ state: v.union(v.literal("unknown"), v.literal("none"), v.literal("reported")), text: v.optional(v.string()) })), otcAuthorization: v.optional(v.union(v.literal("yes"), v.literal("contact"), v.literal("no"))) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const student = await studentAccess(ctx, user, args.studentId);
    if ((student.profileRevision ?? 0) !== args.expectedRevision) throw new ConvexError("Profile changed since you opened it. Reload to see the latest, then try again.");
    const before = privateStudent(student);
    const changes: Partial<Doc<"students">> = {};
    if (args.preferredName !== undefined) {
      if (user.role === "mentor") throw new ConvexError("Mentors can't change a preferred name. Ask a Coach.");
      const name = args.preferredName.trim();
      if (!name || name.length > 80) throw new ConvexError("Enter a preferred name (up to 80 characters).");
      changes.preferredName = name;
    }
    if (args.shirtSize !== undefined) {
      if (user.role !== "student" && user.role !== "coach" && user.role !== "parent") throw new ConvexError("Only the student, a parent or a Coach can change shirt size.");
      if (!["XS", "S", "M", "L", "XL", "2XL", "3XL"].includes(args.shirtSize.trim())) throw new ConvexError("Choose a valid shirt size.");
      changes.shirtSize = args.shirtSize.trim();
    }
    const privateEdit = args.emergencyName !== undefined || args.emergencyRelationship !== undefined || args.emergencyPhone !== undefined || args.allergies !== undefined || args.medications !== undefined || args.otcAuthorization !== undefined;
    if (privateEdit && user.role !== "coach" && user.role !== "parent") throw new ConvexError("Only a parent or a Coach can change Health information and emergency contacts.");
    if (args.otcAuthorization !== undefined) throw new ConvexError("Over-the-counter medication choices are no longer on this profile. Reload the page, then save again.");
    if (args.emergencyName !== undefined) changes.emergencyName = args.emergencyName.trim();
    if (args.emergencyRelationship !== undefined) changes.emergencyRelationship = args.emergencyRelationship.trim();
    if (args.emergencyPhone !== undefined) changes.emergencyPhone = normalizeChangedPhone(args.emergencyPhone, student.emergencyPhone, "Emergency contact phone");
    if (args.allergies !== undefined) changes.allergies = args.allergies;
    if (args.medications !== undefined) changes.medications = args.medications;
    if (privateEdit && student.consentProfileV2CompletedAt !== undefined) changes.consentProfileV2CompletedAt = undefined;
    changes.profileRevision = (student.profileRevision ?? 0) + 1;
    if (privateEdit) {
      const setupDraft = await ctx.db.query("setupDrafts").withIndex("by_studentId", q => q.eq("studentId", student._id)).unique();
      if (setupDraft) await ctx.db.delete(setupDraft._id);
    }
    await ctx.db.patch(student._id, changes);
    await audit(ctx, user, "students", student._id, "updateProfile", before, changes);
    return null;
  },
});

export const setTheme = mutation({
  args: { theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")) }, returns: v.null(),
  handler: async (ctx, args) => { const user = await requireViewer(ctx); await ctx.db.patch(user._id, { theme: args.theme }); return null; },
});

/** The signed-in applicant sees only their current-season request. */
export const joinStatus = query({
  args: {},
  returns: v.object({ status: v.union(v.literal("none"), v.literal("pending"), v.literal("declined"), v.literal("approved")) }),
  handler: async ctx => {
    const who = await identity(ctx);
    const season = await activeSeason(ctx);
    const latest = await ctx.db.query("joinRequests").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).order("desc").first();
    return { status: latest?.seasonId === season._id ? latest.status : "none" as const };
  },
});

export const requestJoin = mutation({
  args: { code: v.string(), firstName: v.string(), lastName: v.string() }, returns: v.union(v.id("joinRequests"), v.null()),
  handler: async (ctx, args) => {
    const who = await identity(ctx);
    if (await ctx.db.query("adultEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).unique()) throw new ConvexError(googleRequiredForStudents);
    if (await ctx.db.query("parentEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).unique()) throw new ConvexError(googleRequiredForStudents);
    const season = await activeSeason(ctx);
    const latest = await ctx.db.query("joinRequests").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).order("desc").first();
    const existing = latest?.seasonId === season._id ? latest : null;
    if (existing?.status === "pending") return existing._id;
    if (existing?.status === "approved") return null;
    const now = Date.now();
    if (await joinAttemptsLocked(ctx, who.authUserId, now)) return null;
    // Same per-account limits as checkInvitationCode, so team codes cannot be guessed faster here.
    if (!(await codeLimiter.limit(ctx, "studentCodeAttempts", { key: who.authUserId })).ok || !(await codeLimiter.limit(ctx, "studentCodeDailyAttempts", { key: who.authUserId })).ok) return null;
    if (!(await usableTeamCode(ctx, args.code, season._id, now))) {
      await recordFailedJoinAttempt(ctx, who.authUserId, now);
      return null;
    }
    await clearJoinAttempts(ctx, who.authUserId);
    const firstName = args.firstName.trim(); const lastName = args.lastName.trim();
    if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80) throw new ConvexError("Enter your first and last name, each under 80 characters.");
    if (existing) {
      await ctx.db.patch(existing._id, { email: who.email.toLowerCase(), firstName, lastName, status: "pending", createdAt: now, decidedAt: undefined, decidedBy: undefined });
      await queueJoinRequestDigest(ctx);
      return existing._id;
    }
    const requestId = await ctx.db.insert("joinRequests", { authUserId: who.authUserId, email: who.email.toLowerCase(), firstName, lastName, seasonId: season._id, status: "pending", createdAt: now });
    await queueJoinRequestDigest(ctx);
    return requestId;
  },
});
