import { onsiteLocation, teamTransportEnabled } from "./lib/transportation";
import { requireSeasonFinanceReady } from "./lib/seasonFinance";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { activeSeason, audit, requireRole, viewer } from "./lib/access";
import { refreshStudentFinance } from "./lib/financeSummaries";
import { markRoomCategoryReview } from "./lib/profileCorrections";
import { syncWholeTeamMembership } from "./lib/wholeTeam";
import { subteamOptions } from "../src/lib/subteams";
import { allocateInvitationCode } from "./lib/invitationCodes";
import { notifyJoinApproved } from "./lib/notificationTriggers";
import { MAX_AUDIENCE_STUDENTS, MAX_MENTOR_INVITES, createEventCore, prepareEventAudience } from "./lib/createEventCore";
import { studentInAudience } from "./lib/eventAudienceRules";
import { syncSubteamMembership } from "./lib/subteamEnrollment";
import { MAX_QUESTIONS, MAX_SHIFTS, checkListSizes, checkRequirementFields, checkShiftSettings, cleanQuestion, cleanShift, questionInput, shiftInput } from "./lib/eventSignupExtras";

const MAX_REQUIREMENTS = 100;

export const listJoinRequests = query({
  args: {}, returns: v.any(),
  handler: async ctx => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new ConvexError("Only a Coach or Travel Lead can review Join requests.");
    return await ctx.db.query("joinRequests").withIndex("by_status", q => q.eq("status", "pending")).take(100);
  },
});

const coachOnlyCodes = "Only a Coach can create or revoke invitation codes. Ask a Coach for a code.";

export const createJoinCode = mutation({
  args: { duration: v.union(v.literal("24h"), v.literal("1w"), v.literal("2w")) }, returns: v.object({ code: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); if (user.role !== "coach") throw new ConvexError(coachOnlyCodes);
    const season = await activeSeason(ctx);
    // Shared six-digit namespace: never equal to any team code or individual invitation ever issued.
    const code = await allocateInvitationCode(ctx);
    if (!code) throw new ConvexError("A new invitation code couldn't be created. Try again.");
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
    if (user.role !== "coach") throw new ConvexError(coachOnlyCodes);
    if (!Number.isSafeInteger(args.asOf)) throw new ConvexError("This page is out of date. Reload, then try again.");
    const season = await activeSeason(ctx);
    const page = await ctx.db.query("joinCodes").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).order("desc").take(101);
    return { items: page.slice(0, 100).filter(code => !code.revoked && code.expiresAt > args.asOf).map(code => ({ codeId: code._id, code: code.code, expiresAt: code.expiresAt })), truncated: page.length > 100 };
  },
});

export const revokeJoinCode = mutation({
  args: { codeId: v.id("joinCodes") }, returns: v.null(),
  handler: async (ctx, args) => { const user = await viewer(ctx); if (user.role !== "coach") throw new ConvexError(coachOnlyCodes); const code = await ctx.db.get(args.codeId); if (!code) throw new ConvexError("This invitation code is no longer available. Reload to see the latest."); await ctx.db.patch(code._id, { revoked: true }); await audit(ctx, user, "joinCodes", code._id, "revoke", false, true); return null; },
});

export const approveJoin = mutation({
  args: { requestId: v.id("joinRequests"), approve: v.boolean(), existingStudentId: v.optional(v.id("students")) }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const actor = await viewer(ctx);
    if (actor.role !== "coach" && !(actor.role === "mentor" && actor.travelLead)) throw new ConvexError("Only a Coach or Travel Lead can review Join requests.");
    const request = await ctx.db.get(args.requestId); const season = await activeSeason(ctx);
    if (!request || request.seasonId !== season._id || request.status !== "pending") throw new ConvexError("This join request was already reviewed or is from an earlier season. Reload Join requests.");
    if (!args.approve) {
      await ctx.db.patch(request._id, { status: "declined", decidedAt: Date.now(), decidedBy: actor._id });
      await audit(ctx, actor, "joinRequests", request._id, "decline", "pending", "declined");
      return null;
    }
    const adultEmailIdentity = await ctx.db.query("adultEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", request.authUserId)).unique();
    const parentEmailIdentity = await ctx.db.query("parentEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", request.authUserId)).unique();
    if (adultEmailIdentity || parentEmailIdentity) throw new ConvexError("This person signed in with an email code, which is only for adults. Decline this request; students sign in with Google.");
    const userExisting = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", request.authUserId)).unique();
    if (userExisting) throw new ConvexError("This person already has an account. Decline this request and reload Join requests.");
    const sameEmail = await ctx.db.query("students").withIndex("by_seasonId_and_email", q => q.eq("seasonId", season._id).eq("email", request.email)).take(2);
    if (sameEmail.length && !args.existingStudentId) throw new ConvexError("A student on the roster has this email. Choose that student to connect, then approve.");
    const userId = await ctx.db.insert("appUsers", { authUserId: request.authUserId, email: request.email, name: `${request.firstName} ${request.lastName}`, role: "student", travelLead: false, financialEdit: false, active: true });
    if (args.existingStudentId) {
      const student = await ctx.db.get(args.existingStudentId);
      if (!student || student.seasonId !== season._id || student.userId || student.email !== request.email) throw new ConvexError("This student is already connected to an account or has a different email. Reload and choose another student.");
      await ctx.db.patch(student._id, { userId, active: true });
      await syncWholeTeamMembership(ctx, actor, { ...student, userId, active: true });
      await syncSubteamMembership(ctx, actor, { ...student, userId, active: true });
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
    await notifyJoinApproved(ctx, { userId, requestId: request._id });
    return null;
  },
});

export const createEvent = mutation({
  args: { isOutreach: v.optional(v.boolean()), onsite: v.optional(v.boolean()), name: v.string(), type: v.union(v.literal("Competition"), v.literal("Outreach"), v.literal("Team"), v.literal("Fundraiser")), startsAt: v.number(), endsAt: v.number(), destination: v.string(), travel: v.string(), overnight: v.boolean(), roomingEnabled: v.boolean(), roomDeadline: v.optional(v.number()), feeCents: v.number(), signupMode: v.union(v.literal("assigned"), v.literal("open"), v.literal("approval")), assignmentScope: v.optional(v.union(v.literal("selected"), v.literal("travelTeam"), v.literal("wholeTeam"))), assignedStudentIds: v.optional(v.array(v.id("students"))), capacity: v.optional(v.number()), signupClosesAt: v.optional(v.number()), allowWithdrawal: v.boolean(), permissionRequired: v.boolean(), firstRequired: v.boolean(), mediaSupportRequested: v.optional(v.boolean()), shiftsEnabled: v.optional(v.boolean()), maxShiftsPerStudent: v.optional(v.number()), minShiftsPerStudent: v.optional(v.number()), calendarChoice: v.optional(v.union(v.object({ kind: v.literal("create") }), v.object({ kind: v.literal("link"), eventId: v.string() }), v.object({ kind: v.literal("none") }))), requirements: v.array(v.object({ key: v.string(), label: v.string(), instructions: v.optional(v.string()), url: v.optional(v.string()), dueAt: v.optional(v.number()) })), shifts: v.optional(v.array(shiftInput)), questions: v.optional(v.array(questionInput)), audienceKind: v.optional(v.union(v.literal("everyone"), v.literal("subteams"), v.literal("students"), v.literal("mentorsOnly"))), audienceSubteams: v.optional(v.array(v.string())), mandatory: v.optional(v.boolean()), audienceStudentIds: v.optional(v.array(v.id("students"))), mentorInviteUserIds: v.optional(v.array(v.id("appUsers"))), inviteSubteamMentors: v.optional(v.boolean()), locationType: v.optional(v.union(v.literal("inPerson"), v.literal("virtual"))) }, returns: v.id("events"),
  handler: async (ctx, raw) => {
    // Oversized lists are rejected before any database read.
    if ((raw.shifts?.length ?? 0) > MAX_SHIFTS) throw new ConvexError("An event can have up to 100 shifts. Remove some shifts.");
    if ((raw.questions?.length ?? 0) > MAX_QUESTIONS) throw new ConvexError("An event can have up to 25 questions. Remove some questions.");
    if (raw.requirements.length > MAX_REQUIREMENTS) throw new ConvexError("An event can have up to 100 requirements. Remove some requirements.");
    if ((raw.mentorInviteUserIds?.length ?? 0) > MAX_MENTOR_INVITES || (raw.audienceStudentIds?.length ?? 0) > MAX_AUDIENCE_STUDENTS) throw new ConvexError("Choose up to 200 Mentors and up to 200 students.");
    for (const question of raw.questions ?? []) checkListSizes({ options: question.options });
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx);
    if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new ConvexError("Only a Coach or Travel Lead can create events.");
    const season = await activeSeason(ctx);
    const prepared = await prepareEventAudience(ctx, user, season, raw);
    const args = prepared.args;
    if (!args.name.trim() || args.endsAt < args.startsAt || !Number.isSafeInteger(args.feeCents) || args.feeCents < 0 || args.capacity !== undefined && (!Number.isSafeInteger(args.capacity) || args.capacity < 1)) throw new ConvexError("Check the event: it needs a name, an end after the start, a fee of $0 or more, and a capacity of at least 1 if set.");
    if (args.signupMode !== "assigned" && (args.assignmentScope || args.assignedStudentIds?.length)) throw new ConvexError("Students can be chosen in advance only for assigned events. Change the signup type or clear the chosen students.");
    if ((args.assignmentScope === "travelTeam" || args.assignmentScope === "wholeTeam") && user.role !== "coach") throw new ConvexError("Only a Coach can assign the Travel Team or Whole Team automatically.");
    if (args.assignmentScope === "wholeTeam" && (args.capacity !== undefined || args.assignedStudentIds?.length)) throw new ConvexError("Whole Team events include every active member. Leave capacity blank and don't choose students.");
    checkShiftSettings(args);
    if (args.onsite && (args.overnight || args.roomingEnabled || teamTransportEnabled({ travel: args.travel }))) throw new ConvexError("On-site events happen at the DSHS STEM Center, so they can't be overnight or use team transport. Turn off overnight and choose no transportation.");
    if (args.onsite && args.roomDeadline !== undefined) throw new ConvexError("On-site events have no rooms, so they can't have a room deadline. Clear the room deadline.");
    if (args.calendarChoice?.kind === "link" && (!args.calendarChoice.eventId || args.calendarChoice.eventId.length > 512)) throw new ConvexError("Choose a Calendar entry from the list, then try again.");
    // Shifts and questions are checked with saveShift's and saveQuestion's rules before anything is written, so a bad one rejects the whole create.
    const shiftRows = args.shifts ?? [], questionRows = args.questions ?? [];
    if (shiftRows.length && !args.shiftsEnabled) throw new ConvexError("Shifts can be added only when students pick shifts. Turn on shifts or remove the shifts.");
    if (shiftRows.length > MAX_SHIFTS) throw new ConvexError("An event can have up to 100 shifts. Remove some shifts.");
    if (questionRows.length > MAX_QUESTIONS) throw new ConvexError("An event can have up to 25 questions. Remove some questions.");
    const cleanShifts = shiftRows.map(shift => cleanShift(shift, args));
    const cleanQuestions = questionRows.map(question => cleanQuestion(question));
    args.requirements.forEach(checkRequirementFields);
    // { kind: "none" } ("Don't add to Team Calendar") stores no Calendar link and schedules no push, same as omitting the choice.
    // A Coach or Travel Lead can connect the event later with eventCalendar.connect.
    const { requirements, assignedStudentIds, calendarChoice: rawCalendarChoice, onsite, shifts: _shifts, questions: _questions, audienceStudentIds: _audienceStudentIds, mentorInviteUserIds: _mentorInviteUserIds, inviteSubteamMentors: _inviteSubteamMentors, ...fields } = args;
    // A Fundraiser counts as Outreach only when the flag is set, so the title-based Outreach fallback never applies.
    const eventFields = { ...fields, createdBy: user._id, ...(onsite ? { onsite: true, destination: onsiteLocation, travel: onsiteLocation } : {}), ...(args.type === "Fundraiser" ? { isOutreach: args.isOutreach ?? false } : {}) };
    let assigned = [...new Set(assignedStudentIds ?? [])];
    if (args.assignmentScope === "travelTeam" || args.assignmentScope === "wholeTeam") {
      const students = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(501);
      if (students.length > 500) throw new ConvexError("The roster is too large to assign automatically. Choose students instead.");
      assigned = students.filter(x => x.active && (args.assignmentScope === "wholeTeam" || x.travelTeam)).map(x => x._id);
    }
    const subteamMandatory = args.audienceKind === "subteams" && args.mandatory === true;
    if (subteamMandatory) {
      const students = await ctx.db.query("students").withIndex("by_seasonId", q => q.eq("seasonId", season._id)).take(501);
      if (students.length > 500) throw new ConvexError("The roster is too large to assign automatically. Choose students instead.");
      assigned = students.filter(x => studentInAudience({ signupMode: "assigned", audienceKind: "subteams", audienceSubteams: args.audienceSubteams, mandatory: true }, x, false)).map(x => x._id);
    }
    if (assigned.length > (args.assignmentScope === "wholeTeam" || subteamMandatory ? 500 : 100)) throw new ConvexError("Choose up to 100 students when creating an event. Add more after it is created.");
    if (args.capacity !== undefined && assigned.length > args.capacity) throw new ConvexError("More students are chosen than the event's capacity. Choose fewer students or raise the capacity.");
    for (const studentId of assigned) { const student = await ctx.db.get(studentId); if (!student || !student.active || student.seasonId !== season._id) throw new ConvexError("A chosen student is no longer on the current roster. Reload and choose again."); }
    const calendarChoice = rawCalendarChoice?.kind === "none" ? undefined : rawCalendarChoice;
    return await createEventCore(ctx, user, season, { eventFields, requirements, shifts: cleanShifts, questions: cleanQuestions, calendarChoice, assigned, audienceStudentIds: prepared.audienceStudentIds, mentorInvites: prepared.mentorInvites });
  },
});

export const updateRoster = mutation({
  args: { studentId: v.id("students"), expectedRevision: v.optional(v.number()), reason: v.optional(v.string()), legalName: v.optional(v.string()), preferredName: v.optional(v.string()), subteam: v.optional(v.string()), travelTeam: v.optional(v.boolean()), active: v.optional(v.boolean()), roomCategory: v.optional(v.union(v.literal("Boys"), v.literal("Girls"))) }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireSeasonFinanceReady(ctx, (await activeSeason(ctx))._id);
    const user = await viewer(ctx); requireRole(user, "coach");
    const student = await ctx.db.get(args.studentId); const season = await activeSeason(ctx);
    if (!student || student.seasonId !== season._id) throw new ConvexError("This student is not on the current season's roster. Reload to see the current roster.");
    const { studentId: _studentId, expectedRevision, reason, ...fields } = args;
    const identityCorrection = args.legalName !== undefined || args.preferredName !== undefined || args.roomCategory !== undefined || args.active !== undefined && args.active !== student.active;
    if (identityCorrection && (expectedRevision === undefined || !reason?.trim() || reason.trim().length > 1000)) throw new ConvexError("Changing a name, Room type or active status needs a reason (up to 1,000 characters). Reload, then try again with a reason.");
    if (expectedRevision !== undefined && expectedRevision !== (student.profileRevision ?? 0)) throw new ConvexError("Profile changed since you opened it. Reload to see the latest, then try again.");
    if (args.legalName !== undefined && (!args.legalName.trim() || args.legalName.trim().length > 160)) throw new ConvexError("Enter a legal name (up to 160 characters).");
    if (args.preferredName !== undefined && (!args.preferredName.trim() || args.preferredName.trim().length > 80)) throw new ConvexError("Enter a preferred name (up to 80 characters).");
    const proposedSubteam = args.subteam?.trim();
    if (proposedSubteam !== undefined && proposedSubteam !== student.subteam && !subteamOptions.some(value => value === proposedSubteam)) throw new ConvexError("Choose a listed subteam.");
    if (args.roomCategory !== undefined && args.roomCategory !== student.roomCategory) await markRoomCategoryReview(ctx, student._id, student.seasonId, true);
    const changes = { ...fields, ...(proposedSubteam !== undefined ? { subteam: proposedSubteam } : {}), ...(args.legalName !== undefined ? { legalName: args.legalName.trim() } : {}), ...(args.preferredName !== undefined ? { preferredName: args.preferredName.trim() } : {}), ...(args.roomCategory !== undefined ? { roomCategoryLocked: true } : {}), ...(args.active === false && student.active ? { archivedAt: Date.now() } : {}), profileRevision: (student.profileRevision ?? 0) + 1 };
    await ctx.db.patch(student._id, changes);
    if (args.active === true && !student.active) await syncWholeTeamMembership(ctx, user, { ...student, ...changes });
    if ((args.active === true && !student.active) || (proposedSubteam !== undefined && proposedSubteam !== student.subteam)) await syncSubteamMembership(ctx, user, { ...student, ...changes });
    await audit(ctx, user, "students", student._id, "updateRoster", { profileRevision: student.profileRevision ?? 0, active: student.active, roomCategory: student.roomCategory, legalName: student.legalName, archivedAt: student.archivedAt ?? null }, { ...changes, archivedAt: changes.archivedAt ?? student.archivedAt ?? null }, reason?.trim());
    return null;
  },
});
