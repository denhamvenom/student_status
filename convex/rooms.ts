import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { activeSeason, audit, ownStudent, viewer } from "./lib/access";

async function eligible(ctx: MutationCtx, eventId: Id<"events">, studentId: Id<"students">) {
  const event = await ctx.db.get(eventId); const student = await ctx.db.get(studentId);
  const season = await activeSeason(ctx);
  if (!event || !student || !student.active || event.seasonId !== season._id || !event.overnight || !event.roomingEnabled || event.seasonId !== student.seasonId || event.roomDeadline !== undefined && Date.now() > event.roomDeadline) throw new Error("Room selection is unavailable.");
  const p = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).unique();
  if (p?.status !== "confirmed" || !student.roomCategory) throw new Error("Confirmed participation and a rooming category are required.");
  return { event, student };
}

export const mine = query({
  args: { eventId: v.id("events") }, returns: v.any(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); const student = await ownStudent(ctx, user);
    const season = await activeSeason(ctx); const event = await ctx.db.get(args.eventId);
    if (!event || event.seasonId !== season._id || student.seasonId !== season._id) throw new Error("Room selection is unavailable.");
    const membership = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", args.eventId).eq("studentId", student._id)).unique();
    const request = await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", args.eventId).eq("studentId", student._id)).unique();
    const invites = await ctx.db.query("roomInvites").withIndex("by_studentId", q => q.eq("studentId", student._id)).take(100);
    const group = membership ? await ctx.db.get(membership.groupId) : null;
    const members = membership ? await ctx.db.query("roomMemberships").withIndex("by_groupId", q => q.eq("groupId", membership.groupId)).take(5) : [];
    const names = await Promise.all(members.map(async m => ({ studentId: m.studentId, preferredName: (await ctx.db.get(m.studentId))?.preferredName ?? "Student" })));
    return { group: group ? { _id: group._id, name: group.name, finalized: group.finalized, members: names } : null, requestedAssignment: !!request, invites: invites.filter(x => x.eventId === args.eventId && x.status === "pending").map(x => ({ _id: x._id, groupId: x.groupId })) };
  },
});

export const requestAssignment = mutation({
  args: { eventId: v.id("events") }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); const own = await ownStudent(ctx, user); await eligible(ctx, args.eventId, own._id);
    const prior = await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", args.eventId).eq("studentId", own._id)).unique();
    if (!prior) await ctx.db.insert("roomRequests", { eventId: args.eventId, studentId: own._id, requestedAt: Date.now() });
    await audit(ctx, user, "roomRequests", `${args.eventId}:${own._id}`, "requestAssignment", null, true);
    return null;
  },
});

export const createGroup = mutation({
  args: { eventId: v.id("events"), name: v.string() }, returns: v.id("roomGroups"),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); const own = await ownStudent(ctx, user); const { student } = await eligible(ctx, args.eventId, own._id);
    const existing = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", args.eventId).eq("studentId", student._id)).unique();
    if (existing) throw new Error("You are already in a room group.");
    if (!args.name.trim() || args.name.length > 80) throw new Error("Enter a room group name.");
    const groupId = await ctx.db.insert("roomGroups", { eventId: args.eventId, category: student.roomCategory!, name: args.name.trim(), finalized: false, adultFifthException: false, needsReview: false, createdBy: user._id });
    await ctx.db.insert("roomMemberships", { eventId: args.eventId, groupId, studentId: student._id, joinedAt: Date.now() });
    await audit(ctx, user, "roomGroups", groupId, "create", null, { name: args.name.trim(), category: student.roomCategory });
    return groupId;
  },
});

export const invite = mutation({
  args: { groupId: v.id("roomGroups"), studentId: v.id("students") }, returns: v.id("roomInvites"),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); const own = await ownStudent(ctx, user);
    const group = await ctx.db.get(args.groupId);
    if (!group || group.finalized) throw new Error("Room group unavailable.");
    await eligible(ctx, group.eventId, own._id);
    const target = await eligible(ctx, group.eventId, args.studentId);
    if (target.student.roomCategory !== group.category || args.studentId === own._id) throw new Error("Room categories must match.");
    const selfMember = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", group.eventId).eq("studentId", own._id)).unique();
    if (selfMember?.groupId !== group._id) throw new Error("You are not in this group.");
    const members = await ctx.db.query("roomMemberships").withIndex("by_groupId", q => q.eq("groupId", group._id)).take(6);
    if (members.length >= 4) throw new Error("Student-managed groups can hold four people.");
    const targetMember = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", group.eventId).eq("studentId", target.student._id)).unique();
    if (targetMember) throw new Error("This student is already in a room group.");
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
    if (!invite || invite.studentId !== own._id || invite.status !== "pending") throw new Error("Invitation unavailable.");
    const group = await ctx.db.get(invite.groupId);
    if (!group || group.finalized) throw new Error("Room group unavailable.");
    await eligible(ctx, group.eventId, own._id);
    if (!args.accept) { await ctx.db.patch(invite._id, { status: "declined" }); return null; }
    if (own.roomCategory !== group.category) throw new Error("Room categories must match.");
    const existing = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", group.eventId).eq("studentId", own._id)).unique();
    if (existing) {
      const oldGroup = await ctx.db.get(existing.groupId);
      const oldMembers = await ctx.db.query("roomMemberships").withIndex("by_groupId", q => q.eq("groupId", existing.groupId)).take(6);
      if (oldGroup?.finalized || oldMembers.length > 1) throw new Error("Leave your current group first.");
      await ctx.db.delete(existing._id);
      await ctx.db.patch(existing.groupId, { needsReview: true });
    }
    const members = await ctx.db.query("roomMemberships").withIndex("by_groupId", q => q.eq("groupId", group._id)).take(6);
    if (members.length >= 4) throw new Error("Room group is full.");
    await ctx.db.insert("roomMemberships", { eventId: group.eventId, groupId: group._id, studentId: own._id, joinedAt: Date.now() });
    const invites = await ctx.db.query("roomInvites").withIndex("by_studentId", q => q.eq("studentId", own._id)).take(100);
    for (const other of invites.filter(x => x.eventId === group.eventId && x.status === "pending")) await ctx.db.patch(other._id, { status: other._id === invite._id ? "accepted" : "declined" });
    if (members.length + 1 >= 4) {
      const groupInvites = await ctx.db.query("roomInvites").withIndex("by_groupId", q => q.eq("groupId", group._id)).take(100);
      for (const other of groupInvites.filter(x => x.status === "pending")) await ctx.db.patch(other._id, { status: "declined" });
    }
    await audit(ctx, user, "roomGroups", group._id, "join", null, { studentId: own._id });
    return null;
  },
});

export const finalize = mutation({
  args: { groupId: v.id("roomGroups"), allowFifth: v.boolean(), reason: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !user.travelLead) throw new Error("Room finalization denied.");
    const group = await ctx.db.get(args.groupId); if (!group) throw new Error("Room group not found.");
    const season = await activeSeason(ctx); const event = await ctx.db.get(group.eventId);
    if (!event || event.seasonId !== season._id || !event.roomingEnabled) throw new Error("Room group is unavailable.");
    const members = await ctx.db.query("roomMemberships").withIndex("by_groupId", q => q.eq("groupId", group._id)).take(6);
    if (members.length > 5 || members.length === 5 && (!args.allowFifth || !args.reason?.trim())) throw new Error("A fifth occupant requires an adult reason; six are never allowed.");
    for (const member of members) { const student = await ctx.db.get(member.studentId); if (!student || student.roomCategory !== group.category) throw new Error("Room category conflict."); }
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
    if (group?.finalized) throw new Error("Finalized rooms require adult changes.");
    await ctx.db.delete(member._id);
    await ctx.db.patch(member.groupId, { needsReview: true });
    await audit(ctx, user, "roomGroups", member.groupId, "leave", { studentId: student._id }, null);
    return null;
  },
});

export const adultCreateGroup = mutation({
  args: { eventId: v.id("events"), category: v.union(v.literal("Boys"), v.literal("Girls")), name: v.string() }, returns: v.id("roomGroups"),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); if (user.role !== "coach" && !user.travelLead) throw new Error("Room management denied.");
    const season = await activeSeason(ctx); const event = await ctx.db.get(args.eventId);
    if (!event || event.seasonId !== season._id || !event.roomingEnabled || !event.overnight || !args.name.trim()) throw new Error("Room group unavailable.");
    const id = await ctx.db.insert("roomGroups", { eventId: event._id, category: args.category, name: args.name.trim(), finalized: false, adultFifthException: false, needsReview: false, createdBy: user._id });
    await audit(ctx, user, "roomGroups", id, "create", null, { category: args.category, name: args.name.trim() });
    return id;
  },
});

export const adultAssign = mutation({
  args: { groupId: v.id("roomGroups"), studentId: v.id("students"), allowFifth: v.boolean(), reason: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx); if (user.role !== "coach" && !user.travelLead) throw new Error("Room management denied.");
    const group = await ctx.db.get(args.groupId); const season = await activeSeason(ctx);
    const event = group ? await ctx.db.get(group.eventId) : null; const student = await ctx.db.get(args.studentId);
    if (!group || !event || !student || event.seasonId !== season._id || student.seasonId !== season._id || !student.active || student.roomCategory !== group.category) throw new Error("Room category or season conflict.");
    const p = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    if (p?.status !== "confirmed") throw new Error("Only confirmed students may be assigned.");
    const old = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", event._id).eq("studentId", student._id)).unique();
    if (old?.groupId === group._id) return null;
    const members = await ctx.db.query("roomMemberships").withIndex("by_groupId", q => q.eq("groupId", group._id)).take(6);
    if (members.length >= 5 || members.length === 4 && (!args.allowFifth || !args.reason?.trim())) throw new Error("A fifth occupant requires an adult reason; six are never allowed.");
    if (old) { await ctx.db.delete(old._id); await ctx.db.patch(old.groupId, { needsReview: true, finalized: false }); }
    await ctx.db.insert("roomMemberships", { eventId: event._id, groupId: group._id, studentId: student._id, joinedAt: Date.now() });
    await ctx.db.patch(group._id, { finalized: false, needsReview: true, adultFifthException: members.length === 4 });
    await audit(ctx, user, "roomGroups", group._id, "assign", old?.groupId ?? null, { studentId: student._id }, args.reason);
    return null;
  },
});
