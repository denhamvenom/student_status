import { enrollmentPending } from "./lib/eventEnrollmentState";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { activeSeason, identity, linkedStudents, maybeViewer, mentorEvent, mentorStudent, privateStudent, publicStudent, requireRole, studentAccess, viewer as requireViewer, audit } from "./lib/access";
import { attendanceFor, financeFor, studentReadiness } from "./lib/readModels";
import { transportSummary } from "./travel";

export const viewer = query({
  args: {}, returns: v.any(),
  handler: async ctx => {
    const who = await ctx.auth.getUserIdentity();
    if (!who) return { status: "signedOut", user: null, students: [], season: null };
    const user = await maybeViewer(ctx);
    if (!user) return { status: "pending", user: null, students: [], season: null };
    const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).first();
    return { status: "active", user: { id: user._id, name: user.name, email: user.email, role: user.role, travelLead: user.travelLead, financialEdit: user.financialEdit, theme: user.theme ?? "system" }, students: (await linkedStudents(ctx, user)).map(publicStudent), season: season ? { _id: season._id, name: season.name, year: season.year } : null };
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
  args: {}, returns: v.any(),
  handler: async ctx => {
    const user = await requireViewer(ctx);
    const season = await activeSeason(ctx);
    const events = await ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", season._id)).take(200);
    if (user.role === "mentor" && !user.travelLead) return events.filter(x => !x.archived).map(event => ({ event: mentorEvent(event), participation: null }));
    if (user.role === "coach" || user.travelLead) return events.filter(x => !x.archived).map(event => ({ event, participation: null }));
    const students = await linkedStudents(ctx, user);
    if (user.role === "parent") return events.filter(x => !x.archived).map(event => ({ event, participation: null }));
    const student = students[0];
    if (!student) return [];
    const participations = await ctx.db.query("participants").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(200);
    return events.filter(x => !x.archived && (x.signupMode !== "assigned" || participations.some(p => p.eventId === x._id && p.status !== "withdrawn"))).map(event => ({ event, participation: participations.find(x => x.eventId === event._id)?.status ?? null }));
  },
});

export const eventDetail = query({
  args: { eventId: v.id("events"), studentId: v.optional(v.id("students")) }, returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const event = await ctx.db.get(args.eventId);
    const season = await activeSeason(ctx);
    if (!event || event.seasonId !== season._id || event.archived) throw new Error("Event not found.");
    if (user.role === "mentor" && !user.travelLead) return { event: mentorEvent(event), participation: null, requirements: [], readiness: null };
    const requirements = await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(100);
    if (!args.studentId) return { event, participation: null, requirements, readiness: null };
    const student = await studentAccess(ctx, user, args.studentId);
    const readiness = await studentReadiness(ctx, event, student);
    return { event, participation: readiness.participation, requirements, readiness };
  },
});

export const studentFinances = query({
  args: { studentId: v.id("students") }, returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    if (user.role === "mentor" && !user.travelLead) throw new Error("Finance access denied.");
    const student = await studentAccess(ctx, user, args.studentId);
    const season = await activeSeason(ctx);
    if (student.seasonId !== season._id) throw new Error("Archived finances are unavailable.");
    return await financeFor(ctx, student._id);
  },
});

export const studentDashboard = query({
  args: { studentId: v.id("students") }, returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const student = await studentAccess(ctx, user, args.studentId);
    const season = await activeSeason(ctx);
    if (student.seasonId !== season._id) throw new Error("Archived students are unavailable.");
    const finance = await financeFor(ctx, student._id);
    const events = await ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", season._id)).take(200);
    const participations = await ctx.db.query("participants").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(200);
    const rows = [];
    const todos: { eventId: Doc<"events">["_id"]; eventName: string; label: string; dueAt: number | null }[] = [];
    for (const event of events) {
      const participation = participations.find(x => x.eventId === event._id)?.status ?? null;
      if (event.archived || (!participation && event.signupMode === "assigned")) continue;
      const readiness = await studentReadiness(ctx, event, student);
      rows.push({ event, participation, readiness });
      if (readiness.state === "open") {
        const custom = await ctx.db.query("requirements").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(100);
        for (const label of readiness.open) todos.push({ eventId: event._id, eventName: event.name, label, dueAt: custom.find(x => x.label === label)?.dueAt ?? event.startsAt });
      }
    }
    return { student: publicStudent(student), money: finance.summary, events: rows, attendance: await attendanceFor(ctx, student), todos };
  },
});

export const teamRoster = query({
  args: {}, returns: v.any(),
  handler: async ctx => {
    const user = await requireViewer(ctx);
    if (user.role !== "coach" && !user.travelLead) throw new Error("Roster access denied.");
    const season = await activeSeason(ctx);
    const students = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(500);
    return students.map(user.role === "coach" ? privateStudent : publicStudent);
  },
});

export const mentorReport = query({
  args: {}, returns: v.any(),
  handler: async ctx => {
    const user = await requireViewer(ctx);
    requireRole(user, "coach", "mentor");
    const season = await activeSeason(ctx);
    const students = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(500);
    const events = await ctx.db.query("events").withIndex("by_seasonId_and_startsAt", q => q.eq("seasonId", season._id)).take(200);
    const report = [];
    for (const student of students.filter(x => x.active)) {
      const participation = await ctx.db.query("participants").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(200);
      report.push({ student: mentorStudent(student), attendance: await attendanceFor(ctx, student), events: events.filter(e => participation.some(p => p.eventId === e._id && p.status === "confirmed")).map(e => ({ id: e._id, name: e.name })) });
    }
    return report;
  },
});

export const eventReadiness = query({
  args: { eventId: v.id("events"), studentId: v.optional(v.id("students")) }, returns: v.any(),
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const event = await ctx.db.get(args.eventId);
    const season = await activeSeason(ctx);
    if (!event || event.seasonId !== season._id || event.archived) throw new Error("Event not found.");
    if (user.role === "student" || user.role === "parent") {
      if (!args.studentId) throw new Error("Student selection required.");
      const student = await studentAccess(ctx, user, args.studentId);
      return { event: { _id: event._id, name: event.name }, students: [{ student: publicStudent(student), ...await studentReadiness(ctx, event, student) }], transportation: null, rooming: null, overall: null };
    }
    if (enrollmentPending(event)) return { event: { _id: event._id, name: event.name }, students: [], transportation: null, rooming: null, overall: "open", enrollmentState: event.enrollmentState };
    const participants = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(500);
    const rows = [];
    for (const p of participants.filter(x => x.status === "confirmed")) {
      const student = await ctx.db.get(p.studentId);
      if (student?.active && student.seasonId === season._id) rows.push({ student: publicStudent(student), ...await studentReadiness(ctx, event, student) });
    }
    const openStudents = rows.filter(x => x.state === "open").length;
    const transportation = await transportSummary(ctx, event);
    const groups = await ctx.db.query("roomGroups").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(100);
    const memberships = await Promise.all(rows.map(x => ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", x.student._id)).unique()));
    const roomingCovered = memberships.every(m => m && groups.some(g => g._id === m.groupId && g.finalized && !g.needsReview));
    const rooming = !event.overnight || !event.roomingEnabled ? { state: "notApplicable", open: 0 } : { state: groups.every(x => x.finalized && !x.needsReview) && roomingCovered ? "ready" : "open", open: groups.filter(x => !x.finalized || x.needsReview).length + memberships.filter(x => !x).length };
    const overall = openStudents || transportation.state === "open" || rooming.state === "open" ? "open" : "ready";
    if (user.role === "mentor" && !user.travelLead) return { event: { _id: event._id, name: event.name }, students: [], transportation: null, rooming: null, overall };
    return { event: { _id: event._id, name: event.name }, students: rows.sort((a, b) => (a.state === "open" ? -1 : 1) - (b.state === "open" ? -1 : 1)), transportation, rooming, overall };
  },
});

export const updateStudentProfile = mutation({
  args: { studentId: v.id("students"), preferredName: v.optional(v.string()), shirtSize: v.optional(v.string()), emergencyName: v.optional(v.string()), emergencyRelationship: v.optional(v.string()), emergencyPhone: v.optional(v.string()), allergies: v.optional(v.object({ state: v.union(v.literal("unknown"), v.literal("none"), v.literal("reported")), text: v.optional(v.string()) })), medications: v.optional(v.object({ state: v.union(v.literal("unknown"), v.literal("none"), v.literal("reported")), text: v.optional(v.string()) })), otcAuthorization: v.optional(v.union(v.literal("yes"), v.literal("contact"), v.literal("no"))) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireViewer(ctx);
    const student = await studentAccess(ctx, user, args.studentId);
    const before = privateStudent(student);
    const changes: Partial<Doc<"students">> = {};
    if (args.preferredName !== undefined) {
      if (user.role === "mentor") throw new Error("Preferred name edit denied.");
      const name = args.preferredName.trim();
      if (!name || name.length > 80) throw new Error("Enter a preferred name under 80 characters.");
      changes.preferredName = name;
    }
    if (args.shirtSize !== undefined) {
      if (user.role !== "student" && user.role !== "coach" && user.role !== "parent") throw new Error("Shirt size edit denied.");
      changes.shirtSize = args.shirtSize.trim();
    }
    const privateEdit = args.emergencyName !== undefined || args.emergencyRelationship !== undefined || args.emergencyPhone !== undefined || args.allergies !== undefined || args.medications !== undefined || args.otcAuthorization !== undefined;
    if (privateEdit && user.role !== "coach" && user.role !== "parent") throw new Error("Health and emergency edits require a linked parent or coach.");
    if (args.emergencyName !== undefined) changes.emergencyName = args.emergencyName.trim();
    if (args.emergencyRelationship !== undefined) changes.emergencyRelationship = args.emergencyRelationship.trim();
    if (args.emergencyPhone !== undefined) changes.emergencyPhone = args.emergencyPhone.trim();
    if (args.allergies !== undefined) changes.allergies = args.allergies;
    if (args.medications !== undefined) changes.medications = args.medications;
    if (args.otcAuthorization !== undefined) changes.otcAuthorization = args.otcAuthorization;
    await ctx.db.patch(student._id, changes);
    await audit(ctx, user, "students", student._id, "updateProfile", before, changes);
    return null;
  },
});

export const setTheme = mutation({
  args: { theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")) }, returns: v.null(),
  handler: async (ctx, args) => { const user = await requireViewer(ctx); await ctx.db.patch(user._id, { theme: args.theme }); return null; },
});

export const requestJoin = mutation({
  args: { code: v.string(), firstName: v.string(), lastName: v.string() }, returns: v.union(v.id("joinRequests"), v.null()),
  handler: async (ctx, args) => {
    const who = await identity(ctx);
    if (!who.email) throw new Error("A Google email is required.");
    const existing = await ctx.db.query("joinRequests").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).first();
    if (existing) return existing._id;
    const season = await activeSeason(ctx);
    const now = Date.now();
    const attempts = await ctx.db.query("joinAttempts").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).unique();
    if (attempts && attempts.lockedUntil > now) return null;
    const code = await ctx.db.query("joinCodes").withIndex("by_code", q => q.eq("code", args.code.trim().toUpperCase())).unique();
    if (!code || code.seasonId !== season._id || code.revoked || code.expiresAt < now) {
      const failed = (attempts?.failed ?? 0) + 1;
      if (attempts) await ctx.db.patch(attempts._id, { failed: failed >= 5 ? 0 : failed, lockedUntil: failed >= 5 ? now + 15 * 60_000 : 0 });
      else await ctx.db.insert("joinAttempts", { authUserId: who.authUserId, failed, lockedUntil: failed >= 5 ? now + 15 * 60_000 : 0 });
      return null;
    }
    if (attempts) await ctx.db.patch(attempts._id, { failed: 0, lockedUntil: 0 });
    const firstName = args.firstName.trim(); const lastName = args.lastName.trim();
    if (!firstName || !lastName || firstName.length > 80 || lastName.length > 80) throw new Error("Enter your first and last name.");
    return await ctx.db.insert("joinRequests", { authUserId: who.authUserId, email: who.email.toLowerCase(), firstName, lastName, seasonId: season._id, status: "pending", createdAt: now });
  },
});
