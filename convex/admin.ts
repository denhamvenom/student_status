import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { activeSeason, audit, requireRole, viewer } from "./lib/access";
import { addCharge } from "./lib/money";

export const listJoinRequests = query({
  args: {}, returns: v.any(),
  handler: async ctx => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !user.travelLead) throw new Error("Join review denied.");
    return await ctx.db.query("joinRequests").withIndex("by_status", q => q.eq("status", "pending")).take(100);
  },
});

export const createJoinCode = mutation({
  args: { duration: v.union(v.literal("24h"), v.literal("1w"), v.literal("2w")) }, returns: v.object({ code: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); if (user.role !== "coach") throw new Error("Join code management is coach only.");
    const season = await activeSeason(ctx);
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const code = `VENOM-${Array.from(bytes, x => x.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
    const expiresAt = Date.now() + { "24h": 86_400_000, "1w": 604_800_000, "2w": 1_209_600_000 }[args.duration];
    await ctx.db.insert("joinCodes", { seasonId: season._id, code, expiresAt, revoked: false, createdBy: user._id });
    await audit(ctx, user, "joinCodes", code, "create", null, { expiresAt });
    return { code, expiresAt };
  },
});

export const revokeJoinCode = mutation({
  args: { codeId: v.id("joinCodes") }, returns: v.null(),
  handler: async (ctx, args) => { const user = await viewer(ctx); if (user.role !== "coach") throw new Error("Join code management is coach only."); const code = await ctx.db.get(args.codeId); if (!code) throw new Error("Code not found."); await ctx.db.patch(code._id, { revoked: true }); await audit(ctx, user, "joinCodes", code._id, "revoke", false, true); return null; },
});

export const approveJoin = mutation({
  args: { requestId: v.id("joinRequests"), approve: v.boolean(), existingStudentId: v.optional(v.id("students")) }, returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx);
    if (actor.role !== "coach" && !actor.travelLead) throw new Error("Join review denied.");
    const request = await ctx.db.get(args.requestId); const season = await activeSeason(ctx);
    if (!request || request.seasonId !== season._id || request.status !== "pending") throw new Error("Join request is unavailable.");
    if (!args.approve) {
      await ctx.db.patch(request._id, { status: "declined", decidedAt: Date.now(), decidedBy: actor._id });
      await audit(ctx, actor, "joinRequests", request._id, "decline", "pending", "declined");
      return null;
    }
    const userExisting = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", request.authUserId)).unique();
    if (userExisting) throw new Error("Account already exists.");
    const sameEmail = await ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", season._id).eq("email", request.email)).take(2);
    if (sameEmail.length && !args.existingStudentId) throw new Error("Existing email match requires an explicit student choice.");
    const userId = await ctx.db.insert("appUsers", { authUserId: request.authUserId, email: request.email, name: `${request.firstName} ${request.lastName}`, role: "student", travelLead: false, financialEdit: false, active: true });
    if (args.existingStudentId) {
      const student = await ctx.db.get(args.existingStudentId);
      if (!student || student.seasonId !== season._id || student.userId || student.email !== request.email) throw new Error("Cannot link to the selected student.");
      await ctx.db.patch(student._id, { userId, active: true });
    } else {
      await ctx.db.insert("students", { seasonId: season._id, userId, legalName: `${request.firstName} ${request.lastName}`, preferredName: request.firstName, firstName: request.firstName, lastName: request.lastName, structuredNameReviewed: false, email: request.email, subteam: "", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    }
    await ctx.db.patch(request._id, { status: "approved", decidedAt: Date.now(), decidedBy: actor._id });
    await audit(ctx, actor, "joinRequests", request._id, "approve", "pending", "approved");
    return null;
  },
});

export const createEvent = mutation({
  args: { name: v.string(), type: v.union(v.literal("Competition"), v.literal("Outreach"), v.literal("Team")), startsAt: v.number(), endsAt: v.number(), destination: v.string(), travel: v.string(), overnight: v.boolean(), roomingEnabled: v.boolean(), roomDeadline: v.optional(v.number()), feeCents: v.number(), signupMode: v.union(v.literal("assigned"), v.literal("open"), v.literal("approval")), assignmentScope: v.optional(v.union(v.literal("selected"), v.literal("travelTeam"))), assignedStudentIds: v.optional(v.array(v.id("students"))), capacity: v.optional(v.number()), signupClosesAt: v.optional(v.number()), allowWithdrawal: v.boolean(), permissionRequired: v.boolean(), firstRequired: v.boolean(), requirements: v.array(v.object({ key: v.string(), label: v.string(), instructions: v.optional(v.string()), url: v.optional(v.string()), dueAt: v.optional(v.number()) })) }, returns: v.id("events"),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !user.travelLead) throw new Error("Event creation denied.");
    const season = await activeSeason(ctx);
    if (!args.name.trim() || args.endsAt < args.startsAt || !Number.isSafeInteger(args.feeCents) || args.feeCents < 0 || args.capacity !== undefined && (!Number.isSafeInteger(args.capacity) || args.capacity < 1)) throw new Error("Invalid event details.");
    if (args.signupMode !== "assigned" && (args.assignmentScope || args.assignedStudentIds?.length)) throw new Error("Only assigned events may preselect students.");
    if (args.assignmentScope === "travelTeam" && user.role !== "coach") throw new Error("Travel Team assignment is coach only.");
    const { requirements, assignedStudentIds, ...eventFields } = args;
    let assigned = [...new Set(assignedStudentIds ?? [])];
    if (args.assignmentScope === "travelTeam") {
      const students = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(501);
      if (students.length > 500) throw new Error("Roster is too large for automatic assignment.");
      assigned = students.filter(x => x.active && x.travelTeam).map(x => x._id);
    }
    if (assigned.length > 100) throw new Error("Assign at most 100 students when creating an event.");
    if (args.capacity !== undefined && assigned.length > args.capacity) throw new Error("Assigned students exceed event capacity.");
    for (const studentId of assigned) { const student = await ctx.db.get(studentId); if (!student || !student.active || student.seasonId !== season._id) throw new Error("Assigned student is unavailable."); }
    const id = await ctx.db.insert("events", { ...eventFields, name: args.name.trim(), seasonId: season._id, archived: false });
    const keys = new Set<string>();
    for (const requirement of requirements) {
      if (!requirement.key.trim() || keys.has(requirement.key) || ["pay", "perm", "first", "room"].includes(requirement.key)) throw new Error("Duplicate or reserved requirement key.");
      keys.add(requirement.key);
      await ctx.db.insert("requirements", { ...requirement, eventId: id });
    }
    for (const studentId of assigned) {
      const now = Date.now();
      await ctx.db.insert("participants", { eventId: id, studentId, status: "confirmed", createdAt: now, updatedAt: now });
      if (args.feeCents > 0) await addCharge(ctx, user, studentId, args.name.trim(), args.feeCents, args.startsAt, `eventFee:${id}:${studentId}`, id);
    }
    await audit(ctx, user, "events", id, "create", null, eventFields);
    return id;
  },
});

export const updateRoster = mutation({
  args: { studentId: v.id("students"), legalName: v.optional(v.string()), preferredName: v.optional(v.string()), subteam: v.optional(v.string()), travelTeam: v.optional(v.boolean()), active: v.optional(v.boolean()), roomCategory: v.optional(v.union(v.literal("Boys"), v.literal("Girls"))) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); requireRole(user, "coach");
    const student = await ctx.db.get(args.studentId); const season = await activeSeason(ctx);
    if (!student || student.seasonId !== season._id) throw new Error("Student not found.");
    const { studentId: _studentId, ...changes } = args;
    if (args.legalName !== undefined && !args.legalName.trim()) throw new Error("Legal name is required.");
    if (args.roomCategory !== undefined && args.roomCategory !== student.roomCategory) {
      // Category changes leave existing placements in place for adult review.
      const events = await ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", season._id)).take(200);
      for (const event of events) {
        const member = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
        if (member) await ctx.db.patch(member.groupId, { needsReview: true });
      }
    }
    await ctx.db.patch(student._id, changes);
    await audit(ctx, user, "students", student._id, "updateRoster", student, changes);
    return null;
  },
});

export const recordAttendance = mutation({
  args: { meetingId: v.id("attendanceMeetings"), studentId: v.id("students"), present: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach") throw new Error("Attendance recording is Coach-only.");
    const meeting = await ctx.db.get(args.meetingId); const student = await ctx.db.get(args.studentId);
    const season = await activeSeason(ctx);
    if (!meeting || !student || !student.active || meeting.seasonId !== season._id || meeting.seasonId !== student.seasonId || meeting.cancelled) throw new Error("Meeting unavailable.");
    const old = await ctx.db.query("attendanceRecords").withIndex("by_meetingId_and_studentId", q => q.eq("meetingId", meeting._id).eq("studentId", student._id)).unique();
    if (old) await ctx.db.patch(old._id, { present: args.present, recordedBy: user._id });
    else await ctx.db.insert("attendanceRecords", { meetingId: meeting._id, studentId: student._id, present: args.present, recordedBy: user._id });
    await audit(ctx, user, "attendanceRecords", `${meeting._id}:${student._id}`, "record", old?.present ?? null, args.present);
    return null;
  },
});

export const createMeeting = mutation({
  args: { kind: v.union(v.literal("Tuesday"), v.literal("Thursday"), v.literal("Outreach")), startsAt: v.number(), eventId: v.optional(v.id("events")) }, returns: v.id("attendanceMeetings"),
  handler: async (ctx, args) => { const user = await viewer(ctx); requireRole(user, "coach"); const season = await activeSeason(ctx); return await ctx.db.insert("attendanceMeetings", { ...args, seasonId: season._id, cancelled: false }); },
});

export const setMeetingCancelled = mutation({
  args: { meetingId: v.id("attendanceMeetings"), cancelled: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => { const user = await viewer(ctx); requireRole(user, "coach"); const meeting = await ctx.db.get(args.meetingId); const season = await activeSeason(ctx); if (!meeting || meeting.seasonId !== season._id) throw new Error("Meeting not found."); await ctx.db.patch(meeting._id, { cancelled: args.cancelled }); await audit(ctx, user, "attendanceMeetings", meeting._id, "setCancelled", meeting.cancelled, args.cancelled); return null; },
});

export const createDriver = mutation({
  args: { name: v.string(), phone: v.string(), email: v.string(), seats: v.number(), approved: v.boolean() }, returns: v.id("drivers"),
  handler: async (ctx, args) => { const user = await viewer(ctx); if (user.role !== "coach" && !user.travelLead) throw new Error("Driver management denied."); if (!Number.isSafeInteger(args.seats) || args.seats < 0) throw new Error("Seats must exclude the driver."); const season = await activeSeason(ctx); return await ctx.db.insert("drivers", { ...args, seasonId: season._id }); },
});

export const assignDriver = mutation({
  args: { eventId: v.id("events"), driverId: v.id("drivers"), seats: v.number(), notes: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => { const user = await viewer(ctx); if (user.role !== "coach" && !user.travelLead) throw new Error("Transport management denied."); const event = await ctx.db.get(args.eventId); const driver = await ctx.db.get(args.driverId); const season = await activeSeason(ctx); if (!event || !driver || event.seasonId !== season._id || event.seasonId !== driver.seasonId || !driver.approved || !Number.isSafeInteger(args.seats) || args.seats < 0 || args.seats > driver.seats) throw new Error("Invalid driver assignment."); const prior = await ctx.db.query("eventVehicles").withIndex("by_eventId_and_driverId", q => q.eq("eventId", event._id).eq("driverId", driver._id)).unique(); if (prior) await ctx.db.patch(prior._id, { seats: args.seats, notes: args.notes }); else await ctx.db.insert("eventVehicles", args); return null; },
});
