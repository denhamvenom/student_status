import { teamTransportEnabled } from "./lib/transportation";
import { normalizeEmail, normalizePhone } from "./lib/contactValidation";
import { requireSeasonFinanceReady } from "./lib/seasonFinance";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { activeSeason, audit, requireRole, requireSeasonProfileWritable, viewer } from "./lib/access";
import { addCharge } from "./lib/money";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { requireEnrollmentComplete } from "./lib/eventEnrollmentState";
import { markRoomCategoryReview } from "./lib/profileCorrections";
import { syncWholeTeamMembership } from "./lib/wholeTeam";
import { subteamOptions } from "../src/lib/subteams";

export const listJoinRequests = query({
  args: {}, returns: v.any(),
  handler: async ctx => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !user.travelLead) throw new ConvexError("Join review denied.");
    return await ctx.db.query("joinRequests").withIndex("by_status", q => q.eq("status", "pending")).take(100);
  },
});

export const createJoinCode = mutation({
  args: { duration: v.union(v.literal("24h"), v.literal("1w"), v.literal("2w")) }, returns: v.object({ code: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); if (user.role !== "coach") throw new ConvexError("Join code management is coach only.");
    const season = await activeSeason(ctx);
    let code = "";
    for (let attempt = 0; attempt < 100; attempt++) {
      const value = crypto.getRandomValues(new Uint32Array(1))[0];
      if (value >= 4_294_800_000) continue;
      const candidate = String(100_000 + value % 900_000);
      const existing = await ctx.db.query("joinCodes").withIndex("by_code", q => q.eq("code", candidate)).first();
      if (!existing) { code = candidate; break; }
    }
    if (!code) throw new ConvexError("Could not allocate an unused team code. Try again.");
    const expiresAt = Date.now() + { "24h": 86_400_000, "1w": 604_800_000, "2w": 1_209_600_000 }[args.duration];
    await ctx.db.insert("joinCodes", { seasonId: season._id, code, expiresAt, revoked: false, createdBy: user._id });
    await audit(ctx, user, "joinCodes", code, "create", null, { expiresAt });
    return { code, expiresAt };
  },
});

export const activeJoinCodes = query({
  args: { asOf: v.number() },
  returns: v.object({ items: v.array(v.object({ codeId: v.id("joinCodes"), code: v.string(), expiresAt: v.number() })), truncated: v.boolean() }),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach") throw new ConvexError("Join code management is coach only.");
    if (!Number.isSafeInteger(args.asOf)) throw new ConvexError("A valid review time is required.");
    const season = await activeSeason(ctx);
    const page = await ctx.db.query("joinCodes").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).order("desc").take(101);
    return { items: page.slice(0, 100).filter(code => !code.revoked && code.expiresAt > args.asOf).map(code => ({ codeId: code._id, code: code.code, expiresAt: code.expiresAt })), truncated: page.length > 100 };
  },
});

export const revokeJoinCode = mutation({
  args: { codeId: v.id("joinCodes") }, returns: v.null(),
  handler: async (ctx, args) => { const user = await viewer(ctx); if (user.role !== "coach") throw new ConvexError("Join code management is coach only."); const code = await ctx.db.get(args.codeId); if (!code) throw new ConvexError("Code not found."); await ctx.db.patch(code._id, { revoked: true }); await audit(ctx, user, "joinCodes", code._id, "revoke", false, true); return null; },
});

export const approveJoin = mutation({
  args: { requestId: v.id("joinRequests"), approve: v.boolean(), existingStudentId: v.optional(v.id("students")) }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const actor = await viewer(ctx);
    if (actor.role !== "coach" && !actor.travelLead) throw new ConvexError("Join review denied.");
    const request = await ctx.db.get(args.requestId); const season = await activeSeason(ctx);
    if (!request || request.seasonId !== season._id || request.status !== "pending") throw new ConvexError("Join request is unavailable.");
    if (!args.approve) {
      await ctx.db.patch(request._id, { status: "declined", decidedAt: Date.now(), decidedBy: actor._id });
      await audit(ctx, actor, "joinRequests", request._id, "decline", "pending", "declined");
      return null;
    }
    const adultEmailIdentity = await ctx.db.query("adultEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", request.authUserId)).unique();
    const parentEmailIdentity = await ctx.db.query("parentEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", request.authUserId)).unique();
    if (adultEmailIdentity || parentEmailIdentity) throw new ConvexError("Email sign-in identities cannot be approved as student accounts. Ask a Coach to review the adult invitation instead.");
    const userExisting = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", request.authUserId)).unique();
    if (userExisting) throw new ConvexError("Account already exists.");
    const sameEmail = await ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", season._id).eq("email", request.email)).take(2);
    if (sameEmail.length && !args.existingStudentId) throw new ConvexError("Existing email match requires an explicit student choice.");
    const userId = await ctx.db.insert("appUsers", { authUserId: request.authUserId, email: request.email, name: `${request.firstName} ${request.lastName}`, role: "student", travelLead: false, financialEdit: false, active: true });
    if (args.existingStudentId) {
      const student = await ctx.db.get(args.existingStudentId);
      if (!student || student.seasonId !== season._id || student.userId || student.email !== request.email) throw new ConvexError("Cannot link to the selected student.");
      await ctx.db.patch(student._id, { userId, active: true });
      await syncWholeTeamMembership(ctx, actor, { ...student, userId, active: true });
    } else {
      const studentId = await ctx.db.insert("students", { seasonId: season._id, userId, legalName: `${request.firstName} ${request.lastName}`, preferredName: request.firstName, firstName: request.firstName, lastName: request.lastName, structuredNameReviewed: false, email: request.email, subteam: "", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      const student = await ctx.db.get(studentId);
      if (student) {
        await syncWholeTeamMembership(ctx, actor, student);
        const summary = await ctx.db.query("studentFinanceSummaries").withIndex("by_studentId", q => q.eq("studentId", student._id)).unique();
        if (!summary) await refreshStudentFinance(ctx, student._id);
      }
    }
    await ctx.db.patch(request._id, { status: "approved", decidedAt: Date.now(), decidedBy: actor._id });
    await audit(ctx, actor, "joinRequests", request._id, "approve", "pending", "approved");
    return null;
  },
});

export const createEvent = mutation({
  args: { name: v.string(), type: v.union(v.literal("Competition"), v.literal("Outreach"), v.literal("Team")), startsAt: v.number(), endsAt: v.number(), destination: v.string(), travel: v.string(), overnight: v.boolean(), roomingEnabled: v.boolean(), roomDeadline: v.optional(v.number()), feeCents: v.number(), signupMode: v.union(v.literal("assigned"), v.literal("open"), v.literal("approval")), assignmentScope: v.optional(v.union(v.literal("selected"), v.literal("travelTeam"), v.literal("wholeTeam"))), assignedStudentIds: v.optional(v.array(v.id("students"))), capacity: v.optional(v.number()), signupClosesAt: v.optional(v.number()), allowWithdrawal: v.boolean(), permissionRequired: v.boolean(), firstRequired: v.boolean(), mediaSupportRequested: v.optional(v.boolean()), calendarChoice: v.optional(v.union(v.object({ kind: v.literal("create") }), v.object({ kind: v.literal("link"), eventId: v.string() }))), requirements: v.array(v.object({ key: v.string(), label: v.string(), instructions: v.optional(v.string()), url: v.optional(v.string()), dueAt: v.optional(v.number()) })) }, returns: v.id("events"),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx);
    if (user.role !== "coach" && !user.travelLead) throw new ConvexError("Event creation denied.");
    const season = await activeSeason(ctx);
    if (!args.name.trim() || args.endsAt < args.startsAt || !Number.isSafeInteger(args.feeCents) || args.feeCents < 0 || args.capacity !== undefined && (!Number.isSafeInteger(args.capacity) || args.capacity < 1)) throw new ConvexError("Invalid event details.");
    if (args.signupMode !== "assigned" && (args.assignmentScope || args.assignedStudentIds?.length)) throw new ConvexError("Only assigned events may preselect students.");
    if ((args.assignmentScope === "travelTeam" || args.assignmentScope === "wholeTeam") && user.role !== "coach") throw new ConvexError("Automatic team assignment is coach only.");
    if (args.assignmentScope === "wholeTeam" && (args.capacity !== undefined || args.assignedStudentIds?.length)) throw new ConvexError("Whole Team events include all active members and cannot use capacity or selected students.");
    if (args.calendarChoice?.kind === "link" && (!args.calendarChoice.eventId || args.calendarChoice.eventId.length > 512)) throw new ConvexError("Invalid Calendar event selection.");
    const { requirements, assignedStudentIds, calendarChoice, ...eventFields } = args;
    let assigned = [...new Set(assignedStudentIds ?? [])];
    if (args.assignmentScope === "travelTeam" || args.assignmentScope === "wholeTeam") {
      const students = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(501);
      if (students.length > 500) throw new ConvexError("Roster is too large for automatic assignment.");
      assigned = students.filter(x => x.active && (args.assignmentScope === "wholeTeam" || x.travelTeam)).map(x => x._id);
    }
    if (assigned.length > (args.assignmentScope === "wholeTeam" ? 500 : 100)) throw new ConvexError("Assign at most 100 students when creating an event.");
    if (args.capacity !== undefined && assigned.length > args.capacity) throw new ConvexError("Assigned students exceed event capacity.");
    for (const studentId of assigned) { const student = await ctx.db.get(studentId); if (!student || !student.active || student.seasonId !== season._id) throw new ConvexError("Assigned student is unavailable."); }
    const id = await ctx.db.insert("events", { ...eventFields, transportEnabled: teamTransportEnabled(args), name: args.name.trim(), seasonId: season._id, archived: false, ...(calendarChoice ? { calendarChoice: calendarChoice.kind, calendarEventId: calendarChoice.kind === "link" ? calendarChoice.eventId : undefined, calendarSyncState: "pending" as const, calendarRevision: 1, calendarActorId: user._id } : {}), ...(args.assignmentScope === "wholeTeam" ? { wholeTeamParticipantCount: 0, enrollmentState: "running" as const } : {}) });
    if (calendarChoice?.kind === "link") {
      const claim = await ctx.db.query("eventCalendarClaims").withIndex("by_calendarEventId", q => q.eq("calendarEventId", calendarChoice.eventId)).unique();
      if (claim) throw new ConvexError("This Calendar event is already linked to another Student Status event.");
      await ctx.db.insert("eventCalendarClaims", { calendarEventId: calendarChoice.eventId, eventId: id });
    }
    const keys = new Set<string>();
    for (const requirement of requirements) {
      if (!requirement.key.trim() || keys.has(requirement.key) || ["pay", "perm", "first", "room"].includes(requirement.key)) throw new ConvexError("Duplicate or reserved requirement key.");
      keys.add(requirement.key);
      await ctx.db.insert("requirements", { ...requirement, eventId: id });
    }
    for (const studentId of args.assignmentScope === "wholeTeam" ? [] : assigned) {
      const now = Date.now();
      await ctx.db.insert("participants", { eventId: id, studentId, status: "confirmed", createdAt: now, updatedAt: now });
      if (args.feeCents > 0) await addCharge(ctx, user, studentId, args.name.trim(), args.feeCents, args.startsAt, `eventFee:${id}:${studentId}`, id);
    }
    if (args.assignmentScope === "wholeTeam") {
      const now = Date.now();
      const jobId = await ctx.db.insert("eventEnrollmentJobs", { requiredFinancialProjectionVersion: 4, eventId: id, actorId: user._id, state: "running", cursor: null, processed: 0, startedAt: now, updatedAt: now });
      for (const studentId of assigned) await ctx.db.insert("eventEnrollmentMembers", { jobId, studentId });
      await ctx.db.patch(id, { enrollmentJobId: jobId });
      await ctx.scheduler.runAfter(0, internal.eventEnrollment.run, { jobId });
    }
    if (calendarChoice) await ctx.scheduler.runAfter(0, internal.eventCalendar.push, { eventId: id, revision: 1 });
    await audit(ctx, user, "events", id, "create", null, eventFields);
    return id;
  },
});

export const updateRoster = mutation({
  args: { studentId: v.id("students"), expectedRevision: v.optional(v.number()), reason: v.optional(v.string()), legalName: v.optional(v.string()), preferredName: v.optional(v.string()), subteam: v.optional(v.string()), travelTeam: v.optional(v.boolean()), active: v.optional(v.boolean()), roomCategory: v.optional(v.union(v.literal("Boys"), v.literal("Girls"))) }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx); requireRole(user, "coach");
    const student = await ctx.db.get(args.studentId); const season = await activeSeason(ctx);
    if (!student || student.seasonId !== season._id) throw new ConvexError("Student not found.");
    const { studentId: _studentId, expectedRevision, reason, ...fields } = args;
    const identityCorrection = args.legalName !== undefined || args.preferredName !== undefined || args.roomCategory !== undefined || args.active !== undefined && args.active !== student.active;
    if (identityCorrection && (expectedRevision === undefined || !reason?.trim() || reason.trim().length > 1000)) throw new ConvexError("Identity, room-category and active-status changes require a current profile revision and reason.");
    if (expectedRevision !== undefined && expectedRevision !== (student.profileRevision ?? 0)) throw new ConvexError("Profile changed. Reload before saving.");
    if (args.legalName !== undefined && (!args.legalName.trim() || args.legalName.trim().length > 160)) throw new ConvexError("Legal name under 160 characters is required.");
    if (args.preferredName !== undefined && (!args.preferredName.trim() || args.preferredName.trim().length > 80)) throw new ConvexError("Preferred name under 80 characters is required.");
    const proposedSubteam = args.subteam?.trim();
    if (proposedSubteam !== undefined && proposedSubteam !== student.subteam && !subteamOptions.some(value => value === proposedSubteam)) throw new ConvexError("Choose a listed subteam.");
    if (args.roomCategory !== undefined && args.roomCategory !== student.roomCategory) await markRoomCategoryReview(ctx, student._id, student.seasonId);
    const changes = { ...fields, ...(proposedSubteam !== undefined ? { subteam: proposedSubteam } : {}), ...(args.legalName !== undefined ? { legalName: args.legalName.trim() } : {}), ...(args.preferredName !== undefined ? { preferredName: args.preferredName.trim() } : {}), ...(args.roomCategory !== undefined ? { roomCategoryLocked: true } : {}), ...(args.active === false && student.active ? { archivedAt: Date.now() } : {}), profileRevision: (student.profileRevision ?? 0) + 1 };
    await ctx.db.patch(student._id, changes);
    if (args.active === true && !student.active) await syncWholeTeamMembership(ctx, user, { ...student, ...changes });
    await audit(ctx, user, "students", student._id, "updateRoster", { profileRevision: student.profileRevision ?? 0, active: student.active, roomCategory: student.roomCategory, legalName: student.legalName, archivedAt: student.archivedAt ?? null }, { ...changes, archivedAt: changes.archivedAt ?? student.archivedAt ?? null }, reason?.trim());
    return null;
  },
});

export const recordAttendance = mutation({
  args: { meetingId: v.id("attendanceMeetings"), studentId: v.id("students"), present: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach") throw new ConvexError("Attendance recording is Coach-only.");
    const meeting = await ctx.db.get(args.meetingId); const student = await ctx.db.get(args.studentId);
    const season = await activeSeason(ctx); await requireSeasonProfileWritable(ctx, season._id);
    if (!meeting || !student || !student.active || meeting.seasonId !== season._id || meeting.seasonId !== student.seasonId || meeting.cancelled) throw new ConvexError("Meeting unavailable.");
    const old = await ctx.db.query("attendanceRecords").withIndex("by_meetingId_and_studentId", q => q.eq("meetingId", meeting._id).eq("studentId", student._id)).unique();
    if (old) await ctx.db.patch(old._id, { present: args.present, recordedBy: user._id });
    else await ctx.db.insert("attendanceRecords", { meetingId: meeting._id, studentId: student._id, present: args.present, recordedBy: user._id });
    await audit(ctx, user, "attendanceRecords", `${meeting._id}:${student._id}`, "record", old?.present ?? null, args.present);
    return null;
  },
});

export const createMeeting = mutation({
  args: { kind: v.union(v.literal("Tuesday"), v.literal("Thursday"), v.literal("Outreach")), startsAt: v.number(), eventId: v.optional(v.id("events")) }, returns: v.id("attendanceMeetings"),
  handler: async (ctx, args) => { const user = await viewer(ctx); requireRole(user, "coach"); const season = await activeSeason(ctx); await requireSeasonProfileWritable(ctx, season._id); return await ctx.db.insert("attendanceMeetings", { ...args, seasonId: season._id, cancelled: false }); },
});

export const setMeetingCancelled = mutation({
  args: { meetingId: v.id("attendanceMeetings"), cancelled: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => { const user = await viewer(ctx); requireRole(user, "coach"); const meeting = await ctx.db.get(args.meetingId); const season = await activeSeason(ctx); await requireSeasonProfileWritable(ctx, season._id); if (!meeting || meeting.seasonId !== season._id) throw new ConvexError("Meeting not found."); await ctx.db.patch(meeting._id, { cancelled: args.cancelled }); await audit(ctx, user, "attendanceMeetings", meeting._id, "setCancelled", meeting.cancelled, args.cancelled); return null; },
});

export const createDriver = mutation({
  args: { name: v.string(), phone: v.string(), email: v.string(), seats: v.number(), approved: v.boolean() }, returns: v.id("drivers"),
  handler: async (ctx, args) => { const user = await viewer(ctx); if (user.role !== "coach" && !user.travelLead) throw new ConvexError("Driver management denied."); if (!Number.isSafeInteger(args.seats) || args.seats < 0) throw new ConvexError("Seats must exclude the driver."); const season = await activeSeason(ctx); return await ctx.db.insert("drivers", { ...args, email: normalizeEmail(args.email, "Driver email"), phone: normalizePhone(args.phone, "Driver phone"), seasonId: season._id }); },
});

export const assignDriver = mutation({
  args: { eventId: v.id("events"), driverId: v.id("drivers"), seats: v.number(), notes: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => { const user = await viewer(ctx); if (user.role !== "coach" && !user.travelLead) throw new ConvexError("Transport management denied."); const event = await ctx.db.get(args.eventId); const driver = await ctx.db.get(args.driverId); const season = await activeSeason(ctx); if (!event || !driver || event.seasonId !== season._id || event.seasonId !== driver.seasonId || !driver.approved || !Number.isSafeInteger(args.seats) || args.seats < 0 || args.seats > driver.seats) throw new ConvexError("Invalid driver assignment."); requireEnrollmentComplete(event); if (!teamTransportEnabled(event)) throw new ConvexError("This event does not manage drivers or student rides."); const prior = await ctx.db.query("eventVehicles").withIndex("by_eventId_and_driverId", q => q.eq("eventId", event._id).eq("driverId", driver._id)).unique(); if (prior) await ctx.db.patch(prior._id, { seats: args.seats, notes: args.notes }); else await ctx.db.insert("eventVehicles", args); return null; },
});
