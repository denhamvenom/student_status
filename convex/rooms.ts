import { requireEnrollmentComplete } from "./lib/eventEnrollmentState";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { activeSeason, audit, ownStudent, viewer } from "./lib/access";

async function eligible(ctx: MutationCtx, eventId: Id<"events">, studentId: Id<"students">) {
  const event = await ctx.db.get(eventId); const student = await ctx.db.get(studentId);
  const season = await activeSeason(ctx);
  if (!event || event.archived || !student || !student.active || event.seasonId !== season._id || !event.overnight || !event.roomingEnabled || event.seasonId !== student.seasonId || event.roomDeadline !== undefined && Date.now() > event.roomDeadline) throw new ConvexError("Room selection is unavailable.");
    requireEnrollmentComplete(event);
  const p = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).unique();
  if (p?.status !== "confirmed" || !student.roomCategory) throw new ConvexError("Confirmed participation and a rooming category are required.");
  return { event, student };
}

async function closeEmptyGroupInvites(ctx: MutationCtx, groupId: Id<"roomGroups">) {
  const remaining = await ctx.db.query("roomMemberships").withIndex("by_groupId", q => q.eq("groupId", groupId)).take(1);
  if (remaining.length) return;
  const invites = await ctx.db.query("roomInvites").withIndex("by_groupId", q => q.eq("groupId", groupId)).take(101);
  if (invites.length > 100) throw new ConvexError("Group invitation limit reached; cannot safely close invitations.");
  for (const invite of invites) if (invite.status === "pending") await ctx.db.patch(invite._id, { status: "cancelled" });
}

export const mine = query({
  args: { eventId: v.id("events") }, returns: v.any(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); const student = await ownStudent(ctx, user);
    const season = await activeSeason(ctx); const event = await ctx.db.get(args.eventId);
    if (!event || event.archived || event.seasonId !== season._id || student.seasonId !== season._id) throw new ConvexError("Room selection is unavailable.");
    const membership = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", args.eventId).eq("studentId", student._id)).unique();
    const request = await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", args.eventId).eq("studentId", student._id)).unique();
    const invites = await ctx.db.query("roomInvites").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(101);
    if (invites.length > 100) throw new ConvexError("Invitation limit reached.");
    const group = membership ? await ctx.db.get(membership.groupId) : null;
    const members = membership ? await ctx.db.query("roomMemberships").withIndex("by_groupId", q => q.eq("groupId", membership.groupId)).take(5) : [];
    const names = await Promise.all(members.map(async m => { const member = await ctx.db.get(m.studentId); return { studentId: m.studentId, legalName: member?.legalName || member?.preferredName || "Student", preferredName: member?.preferredName ?? "Student" }; }));
    const sent = membership ? await ctx.db.query("roomInvites").withIndex("by_groupId", q => q.eq("groupId", membership.groupId)).take(101) : [];
    if (sent.length > 100) throw new ConvexError("Group invitation limit reached.");
    const received = await Promise.all(invites.filter(x => x.eventId === args.eventId && x.status === "pending").map(async x => {
      const invitedGroup = await ctx.db.get(x.groupId);
      const inviter = await ctx.db.get(x.invitedBy);
      return { _id: x._id, groupId: x.groupId, groupName: invitedGroup?.name ?? "Room group", invitedBy: inviter?.legalName || inviter?.preferredName || "Teammate" };
    }));
    return { roomDeadline: event.roomDeadline ?? null, group: group ? { _id: group._id, name: group.name, finalized: group.finalized, members: names } : null, requestedAssignment: !!request, invites: received, sentInvites: sent.filter(x => x.status === "pending" && x.invitedBy === student._id).map(x => ({ _id: x._id, studentId: x.studentId })) };
  },
});

export const eligiblePeers = query({
  args: { eventId: v.id("events") }, returns: v.array(v.object({ studentId: v.id("students"), legalName: v.string(), preferredName: v.string() })),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); const own = await ownStudent(ctx, user);
    const event = await ctx.db.get(args.eventId); const season = await activeSeason(ctx);
    if (!event || event.archived || event.seasonId !== season._id || !event.roomingEnabled || !event.overnight || own.seasonId !== season._id || !own.roomCategory) throw new ConvexError("Room selection is unavailable.");
    const self = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", own._id)).unique();
    if (self?.status !== "confirmed") throw new ConvexError("Confirmed participation is required.");
    const rows = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(501);
    if (rows.length > 500) throw new ConvexError("Event roster limit reached.");
    const result: { studentId: Id<"students">; legalName: string; preferredName: string }[] = [];
    for (const row of rows) {
      if (row.status !== "confirmed" || row.studentId === own._id) continue;
      const student = await ctx.db.get(row.studentId);
      if (student?.active && student.roomCategory === own.roomCategory) result.push({ studentId: student._id, legalName: student.legalName || student.preferredName, preferredName: student.preferredName || student.legalName });
    }
    return result.sort((a, b) => a.legalName.localeCompare(b.legalName));
  },
});

export const workspace = query({
  args: { eventId: v.id("events") }, returns: v.any(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !user.travelLead) throw new ConvexError("Room management denied.");
    const season = await activeSeason(ctx); const event = await ctx.db.get(args.eventId);
    if (!event || event.archived || event.seasonId !== season._id || !event.overnight || !event.roomingEnabled) throw new ConvexError("Rooming is unavailable.");
    const groups = await ctx.db.query("roomGroups").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(101);
    const participants = await ctx.db.query("participants").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(501);
    if (groups.length > 100 || participants.length > 500) throw new ConvexError("Room roster limit reached.");
    const students: { studentId: Id<"students">; name: string; category: "Boys" | "Girls" | null; groupId: Id<"roomGroups"> | null; requestedAssignment: boolean }[] = [];
    for (const p of participants) {
      if (p.status !== "confirmed") continue;
      const student = await ctx.db.get(p.studentId);
      if (!student?.active || student.seasonId !== season._id) continue;
      const membership = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
      const request = await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
      students.push({ studentId: student._id, name: student.legalName || student.preferredName, category: student.roomCategory ?? null, groupId: membership?.groupId ?? null, requestedAssignment: !!request });
    }
    return { event: { _id: event._id, name: event.name, roomDeadline: event.roomDeadline ?? null }, groups: groups.map(g => ({ _id: g._id, name: g.name, category: g.category, finalized: g.finalized, needsReview: g.needsReview, adultFifthException: g.adultFifthException, members: students.filter(s => s.groupId === g._id) })), students: students.sort((a, b) => a.name.localeCompare(b.name)) };
  },
});

export const requestAssignment = mutation({
  args: { eventId: v.id("events") }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); const own = await ownStudent(ctx, user); await eligible(ctx, args.eventId, own._id);
    const member = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", args.eventId).eq("studentId", own._id)).unique();
    if (member) throw new ConvexError("Leave your current group before asking for an assignment.");
    const prior = await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", args.eventId).eq("studentId", own._id)).unique();
    if (!prior) await ctx.db.insert("roomRequests", { eventId: args.eventId, studentId: own._id, requestedAt: Date.now() });
    await audit(ctx, user, "roomRequests", `${args.eventId}:${own._id}`, "requestAssignment", null, true);
    return null;
  },
});

export const cancelAssignmentRequest = mutation({
  args: { eventId: v.id("events") }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); const own = await ownStudent(ctx, user); await eligible(ctx, args.eventId, own._id);
    const prior = await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", args.eventId).eq("studentId", own._id)).unique();
    if (prior) { await ctx.db.delete(prior._id); await audit(ctx, user, "roomRequests", prior._id, "cancel", true, false); }
    return null;
  },
});

export const cancelInvite = mutation({
  args: { inviteId: v.id("roomInvites") }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); const own = await ownStudent(ctx, user);
    const invite = await ctx.db.get(args.inviteId);
    if (!invite || invite.invitedBy !== own._id || invite.status !== "pending") throw new ConvexError("Invitation unavailable.");
    await eligible(ctx, invite.eventId, own._id);
    const member = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", invite.eventId).eq("studentId", own._id)).unique();
    if (member?.groupId !== invite.groupId) throw new ConvexError("You are no longer in this group.");
    await ctx.db.patch(invite._id, { status: "cancelled" });
    await audit(ctx, user, "roomInvites", invite._id, "cancel", "pending", "cancelled");
    return null;
  },
});

export const createGroup = mutation({
  args: { eventId: v.id("events"), name: v.string() }, returns: v.id("roomGroups"),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); const own = await ownStudent(ctx, user); const { student } = await eligible(ctx, args.eventId, own._id);
    const existing = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", args.eventId).eq("studentId", student._id)).unique();
    if (existing) throw new ConvexError("You are already in a room group.");
    if (!args.name.trim() || args.name.length > 80) throw new ConvexError("Enter a room group name.");
    const groups = await ctx.db.query("roomGroups").withIndex("by_eventId", q => q.eq("eventId", args.eventId)).take(100);
    if (groups.length >= 100) throw new ConvexError("Room group limit reached.");
    const groupId = await ctx.db.insert("roomGroups", { eventId: args.eventId, category: student.roomCategory!, name: args.name.trim(), finalized: false, adultFifthException: false, needsReview: false, createdBy: user._id });
    await ctx.db.insert("roomMemberships", { eventId: args.eventId, groupId, studentId: student._id, joinedAt: Date.now() });
    const request = await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", args.eventId).eq("studentId", student._id)).unique();
    if (request) await ctx.db.delete(request._id);
    const invites = await ctx.db.query("roomInvites").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(101);
    if (invites.length > 100) throw new ConvexError("Invitation limit reached; cannot safely close invitations.");
    for (const invite of invites) if (invite.eventId === args.eventId && invite.status === "pending") await ctx.db.patch(invite._id, { status: "declined" });
    await audit(ctx, user, "roomGroups", groupId, "create", null, { name: args.name.trim(), category: student.roomCategory });
    return groupId;
  },
});

export const invite = mutation({
  args: { groupId: v.id("roomGroups"), studentId: v.id("students") }, returns: v.id("roomInvites"),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); const own = await ownStudent(ctx, user);
    const group = await ctx.db.get(args.groupId);
    if (!group || group.finalized) throw new ConvexError("Room group unavailable.");
    await eligible(ctx, group.eventId, own._id);
    const target = await eligible(ctx, group.eventId, args.studentId);
    if (target.student.roomCategory !== group.category || args.studentId === own._id) throw new ConvexError("Room categories must match.");
    const selfMember = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", group.eventId).eq("studentId", own._id)).unique();
    if (selfMember?.groupId !== group._id) throw new ConvexError("You are not in this group.");
    const members = await ctx.db.query("roomMemberships").withIndex("by_groupId", q => q.eq("groupId", group._id)).take(6);
    if (members.length >= 4) throw new ConvexError("Student-managed groups can hold four people.");
    const targetMember = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", group.eventId).eq("studentId", target.student._id)).unique();
    if (targetMember) throw new ConvexError("Invitation unavailable for this teammate.");
    const prior = await ctx.db.query("roomInvites").withIndex("by_groupId_and_studentId", q => q.eq("groupId", group._id).eq("studentId", target.student._id)).unique();
    if (prior?.status === "pending") return prior._id;
    if (prior) { await ctx.db.patch(prior._id, { status: "pending", createdAt: Date.now(), invitedBy: own._id }); return prior._id; }
    return await ctx.db.insert("roomInvites", { eventId: group.eventId, groupId: group._id, studentId: target.student._id, invitedBy: own._id, status: "pending", createdAt: Date.now() });
  },
});

export const respond = mutation({
  args: { inviteId: v.id("roomInvites"), accept: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); const own = await ownStudent(ctx, user); const invite = await ctx.db.get(args.inviteId);
    if (!invite || invite.studentId !== own._id || invite.status !== "pending") throw new ConvexError("Invitation unavailable.");
    const group = await ctx.db.get(invite.groupId);
    if (!group || group.finalized) throw new ConvexError("Room group unavailable.");
    await eligible(ctx, group.eventId, own._id);
    if (!args.accept) { await ctx.db.patch(invite._id, { status: "declined" }); await audit(ctx, user, "roomInvites", invite._id, "decline", "pending", "declined"); return null; }
    if (own.roomCategory !== group.category) throw new ConvexError("Room categories must match.");
    const existing = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", group.eventId).eq("studentId", own._id)).unique();
    if (existing) throw new ConvexError("Leave your current group first.");
    const members = await ctx.db.query("roomMemberships").withIndex("by_groupId", q => q.eq("groupId", group._id)).take(6);
    if (members.length >= 4) throw new ConvexError("Room group is full.");
    await ctx.db.insert("roomMemberships", { eventId: group.eventId, groupId: group._id, studentId: own._id, joinedAt: Date.now() });
    const request = await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", group.eventId).eq("studentId", own._id)).unique();
    if (request) await ctx.db.delete(request._id);
    const invites = await ctx.db.query("roomInvites").withIndex("by_studentId", q => q.eq("studentId", own._id)).take(100);
    if (invites.length >= 100) throw new ConvexError("Invitation limit reached; cannot safely close invitations.");
    for (const other of invites.filter(x => x.eventId === group.eventId && x.status === "pending")) await ctx.db.patch(other._id, { status: other._id === invite._id ? "accepted" : "declined" });
    if (members.length + 1 >= 4) {
      const groupInvites = await ctx.db.query("roomInvites").withIndex("by_groupId", q => q.eq("groupId", group._id)).take(100);
      if (groupInvites.length >= 100) throw new ConvexError("Group invitation limit reached; cannot safely close invitations.");
      for (const other of groupInvites.filter(x => x.status === "pending")) await ctx.db.patch(other._id, { status: "declined" });
    }
    await audit(ctx, user, "roomGroups", group._id, "join", null, { studentId: own._id });
    return null;
  },
});

export const finalize = mutation({
  args: { groupId: v.id("roomGroups"), allowFifth: v.boolean(), reason: v.optional(v.string()), expectedMembers: v.optional(v.array(v.id("students"))) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !user.travelLead) throw new ConvexError("Room finalization denied.");
    const group = await ctx.db.get(args.groupId); if (!group) throw new ConvexError("Room group not found.");
    const season = await activeSeason(ctx); const event = await ctx.db.get(group.eventId);
    if (!event || event.archived || event.seasonId !== season._id || !event.overnight || !event.roomingEnabled) throw new ConvexError("Room group is unavailable.");
    requireEnrollmentComplete(event);
    const members = await ctx.db.query("roomMemberships").withIndex("by_groupId", q => q.eq("groupId", group._id)).take(6);
    if (args.expectedMembers && (args.expectedMembers.length !== members.length || new Set(args.expectedMembers).size !== members.length || members.some(member => !args.expectedMembers!.includes(member.studentId)))) throw new ConvexError("Room members changed. Close this confirmation and review the room again.");
    if (!members.length) throw new ConvexError("An empty room cannot be finalized.");
    if (members.length > 5 || members.length === 5 && (!args.allowFifth || !args.reason?.trim())) throw new ConvexError("A fifth occupant requires an adult reason; six are never allowed.");
    if (event.roomDeadline !== undefined && Date.now() > event.roomDeadline && !args.reason?.trim()) throw new ConvexError("A reason is required after the room deadline.");
    for (const member of members) {
      const student = await ctx.db.get(member.studentId);
      const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", member.studentId)).unique();
      if (!student?.active || student.seasonId !== season._id || student.roomCategory !== group.category || participant?.status !== "confirmed") throw new ConvexError("Room member is no longer eligible.");
    }
    await ctx.db.patch(group._id, { finalized: true, adultFifthException: members.length === 5, needsReview: false });
    await audit(ctx, user, "roomGroups", group._id, "finalize", { finalized: group.finalized }, { finalized: true, members: members.length }, args.reason);
    return null;
  },
});

export const leave = mutation({
  args: { eventId: v.id("events") }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); const student = await ownStudent(ctx, user); await eligible(ctx, args.eventId, student._id);
    const member = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", args.eventId).eq("studentId", student._id)).unique();
    if (!member) return null;
    const group = await ctx.db.get(member.groupId);
    if (group?.finalized) throw new ConvexError("Finalized rooms require adult changes.");
    await ctx.db.delete(member._id);
    await ctx.db.patch(member.groupId, { needsReview: true });
    await closeEmptyGroupInvites(ctx, member.groupId);
    await audit(ctx, user, "roomGroups", member.groupId, "leave", { studentId: student._id }, null);
    return null;
  },
});

export const adultCreateGroup = mutation({
  args: { eventId: v.id("events"), category: v.union(v.literal("Boys"), v.literal("Girls")), name: v.string(), reason: v.optional(v.string()) }, returns: v.id("roomGroups"),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); if (user.role !== "coach" && !user.travelLead) throw new ConvexError("Room management denied.");
    const season = await activeSeason(ctx); const event = await ctx.db.get(args.eventId);
    if (!event || event.archived || event.seasonId !== season._id || !event.roomingEnabled || !event.overnight || !args.name.trim() || args.name.length > 80) throw new ConvexError("Room group unavailable.");
    requireEnrollmentComplete(event);
    if (event.roomDeadline !== undefined && Date.now() > event.roomDeadline && !args.reason?.trim()) throw new ConvexError("A reason is required after the room deadline.");
    const groups = await ctx.db.query("roomGroups").withIndex("by_eventId", q => q.eq("eventId", event._id)).take(100);
    if (groups.length >= 100) throw new ConvexError("Room group limit reached.");
    const id = await ctx.db.insert("roomGroups", { eventId: event._id, category: args.category, name: args.name.trim(), finalized: false, adultFifthException: false, needsReview: false, createdBy: user._id });
    await audit(ctx, user, "roomGroups", id, "create", null, { category: args.category, name: args.name.trim() }, args.reason?.trim());
    return id;
  },
});

export const adultAssign = mutation({
  args: { groupId: v.id("roomGroups"), studentId: v.id("students"), allowFifth: v.boolean(), reason: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); if (user.role !== "coach" && !user.travelLead) throw new ConvexError("Room management denied.");
    const group = await ctx.db.get(args.groupId); const season = await activeSeason(ctx);
    const event = group ? await ctx.db.get(group.eventId) : null; const student = await ctx.db.get(args.studentId);
    if (!group || !event || event.archived || !event.overnight || !event.roomingEnabled || !student || event.seasonId !== season._id || student.seasonId !== season._id || !student.active || student.roomCategory !== group.category) throw new ConvexError("Room category or season conflict.");
    requireEnrollmentComplete(event);
    if ((event.roomDeadline !== undefined && Date.now() > event.roomDeadline || group.finalized) && !args.reason?.trim()) throw new ConvexError("A reason is required for this room correction.");
    const p = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    if (p?.status !== "confirmed") throw new ConvexError("Only confirmed students may be assigned.");
    const old = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    if (old?.groupId === group._id) return null;
    const oldGroup = old ? await ctx.db.get(old.groupId) : null;
    if (oldGroup?.finalized && !args.reason?.trim()) throw new ConvexError("A reason is required to move a student from a finalized room.");
    const members = await ctx.db.query("roomMemberships").withIndex("by_groupId", q => q.eq("groupId", group._id)).take(6);
    if (members.length >= 5 || members.length === 4 && (!args.allowFifth || !args.reason?.trim())) throw new ConvexError("A fifth occupant requires an adult reason; six are never allowed.");
    if (old) { await ctx.db.delete(old._id); await ctx.db.patch(old.groupId, { needsReview: true, finalized: false }); await closeEmptyGroupInvites(ctx, old.groupId); }
    await ctx.db.insert("roomMemberships", { eventId: event._id, groupId: group._id, studentId: student._id, joinedAt: Date.now() });
    const request = await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    if (request) await ctx.db.delete(request._id);
    const invites = await ctx.db.query("roomInvites").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(101);
    if (invites.length > 100) throw new ConvexError("Invitation limit reached; cannot safely close invitations.");
    for (const invite of invites) if (invite.eventId === event._id && invite.status === "pending") await ctx.db.patch(invite._id, { status: "declined" });
    await ctx.db.patch(group._id, { finalized: false, needsReview: true, adultFifthException: members.length === 4 });
    await audit(ctx, user, "roomGroups", group._id, "assign", old?.groupId ?? null, { studentId: student._id }, args.reason);
    return null;
  },
});

export const adultUnassign = mutation({
  args: { eventId: v.id("events"), studentId: v.id("students"), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); if (user.role !== "coach" && !user.travelLead) throw new ConvexError("Room management denied.");
    const season = await activeSeason(ctx); const event = await ctx.db.get(args.eventId);
    if (!event || event.archived || event.seasonId !== season._id || !event.overnight || !event.roomingEnabled) throw new ConvexError("Rooming is unavailable.");
    requireEnrollmentComplete(event);
    if (!args.reason.trim()) throw new ConvexError("A reason is required to remove an assignment.");
    const membership = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", args.studentId)).unique();
    if (!membership) return null;
    const group = await ctx.db.get(membership.groupId);
    await ctx.db.delete(membership._id);
    if (group) await ctx.db.patch(group._id, { finalized: false, needsReview: true });
    await closeEmptyGroupInvites(ctx, membership.groupId);
    await audit(ctx, user, "roomGroups", membership.groupId, "unassign", { studentId: args.studentId, finalized: group?.finalized }, null, args.reason.trim());
    return null;
  },
});
