import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { activeSeason, audit, ownStudent, studentAccess, viewer } from "./lib/access";
import { allocateUnapplied, allocationSourceId, effectiveChargeCents, financialEntries, sourceBalances } from "./lib/money";

type Context = MutationCtx | QueryCtx;
const decision = v.union(v.literal("full"), v.literal("retain"), v.literal("partial"), v.literal("deny"));
const previewResult = v.object({ eventName: v.string(), studentName: v.string(), allowWithdrawal: v.boolean(), revision: v.string(), status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("waitlist"), v.literal("withdrawn")), requestId: v.union(v.id("withdrawalRequests"), v.null()), requestStatus: v.union(v.literal("pending"), v.literal("approved"), v.literal("denied"), v.null()), charges: v.array(v.object({ id: v.id("charges"), label: v.string(), category: v.union(v.literal("main"), v.literal("extra")), chargedCents: v.number(), paidCents: v.number(), unpaidCents: v.number(), cancelledCents: v.number() })), paidMainCents: v.number(), paidExtraCents: v.number(), unpaidMainCents: v.number(), unpaidExtraCents: v.number() });

async function details(ctx: Context, eventId: Id<"events">, studentId: Id<"students">) {
  const event = await ctx.db.get(eventId), student = await ctx.db.get(studentId), season = await activeSeason(ctx);
  if (!event || !student || !student.active || event.seasonId !== season._id || student.seasonId !== season._id) throw new Error("Student or event not found.");
  const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).unique();
  if (!participant) throw new Error("Student is not participating in this event.");
  const charges = await ctx.db.query("charges").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).take(101);
  if (charges.length > 100) throw new Error("Event charge limit reached; review cannot proceed safely.");
  const requests = await ctx.db.query("withdrawalRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).take(101);
  if (requests.length > 100) throw new Error("Withdrawal request limit reached; review cannot proceed safely.");
  return { event, student, participant, charges, requests };
}

function summary(data: Awaited<ReturnType<typeof details>>) {
  const charges = data.charges.map(c => ({ id: c._id, label: c.label, category: c.category ?? "main" as const, chargedCents: c.amountCents, paidCents: c.appliedCents, unpaidCents: effectiveChargeCents(c) - c.appliedCents, cancelledCents: c.cancelledCents ?? 0 }));
  const pending = data.requests.find(r => r.status === "pending") ?? data.requests.at(-1);
  return { eventName: data.event.name, studentName: data.student.preferredName || data.student.legalName, allowWithdrawal: data.event.allowWithdrawal && !data.event.archived, revision: revision(data), status: data.participant.status, requestId: pending?._id ?? null, requestStatus: pending?.status ?? null, charges, paidMainCents: charges.filter(c => c.category === "main").reduce((n, c) => n + c.paidCents, 0), paidExtraCents: charges.filter(c => c.category === "extra").reduce((n, c) => n + c.paidCents, 0), unpaidMainCents: charges.filter(c => c.category === "main").reduce((n, c) => n + c.unpaidCents, 0), unpaidExtraCents: charges.filter(c => c.category === "extra").reduce((n, c) => n + c.unpaidCents, 0) };
}

function revision(data: Awaited<ReturnType<typeof details>>) {
  return JSON.stringify([data.event._id, data.event.archived, data.participant.status, data.participant.updatedAt, ...data.charges.map(c => [c._id, c.amountCents, c.appliedCents, c.cancelledCents ?? 0, c.category ?? "main"])]);
}

export const withdrawalPreview = query({
  args: { eventId: v.id("events"), studentId: v.id("students") }, returns: previewResult,
  handler: async (ctx, args) => { const user = await viewer(ctx); await studentAccess(ctx, user, args.studentId); return summary(await details(ctx, args.eventId, args.studentId)); },
});

export const pendingWithdrawals = query({
  args: {}, returns: v.array(v.object({ requestId: v.id("withdrawalRequests"), eventId: v.id("events"), studentId: v.id("students"), eventName: v.string(), studentName: v.string(), requestedAt: v.number() })),
  handler: async ctx => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new Error("Withdrawal review denied.");
    const season = await activeSeason(ctx);
    const rows = await ctx.db.query("withdrawalRequests").withIndex("by_status", q => q.eq("status", "pending")).take(101);
    if (rows.length > 100) throw new Error("Withdrawal queue limit reached.");
    const result = [];
    for (const row of rows) {
      const event = await ctx.db.get(row.eventId), student = await ctx.db.get(row.studentId);
      if (event?.seasonId === season._id && student?.seasonId === season._id) result.push({ requestId: row._id, eventId: row.eventId, studentId: row.studentId, eventName: event.name, studentName: student.preferredName || student.legalName, requestedAt: row.requestedAt });
    }
    return result;
  },
});

export const requestWithdrawal = mutation({
  args: { eventId: v.id("events"), idempotencyKey: v.string() }, returns: v.id("withdrawalRequests"),
  handler: async (ctx, args) => {
    const user = await viewer(ctx), student = await ownStudent(ctx, user);
    const data = await details(ctx, args.eventId, student._id);
    if (data.event.archived || !data.event.allowWithdrawal || data.participant.status === "withdrawn") throw new Error("Withdrawal is unavailable for this event.");
    if (args.idempotencyKey.length < 8 || args.idempotencyKey.length > 120) throw new Error("Invalid request key.");
    const duplicate = await ctx.db.query("withdrawalRequests").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", args.idempotencyKey)).unique();
    if (duplicate) { if (duplicate.eventId !== args.eventId || duplicate.studentId !== student._id) throw new Error("Request key is already used."); return duplicate._id; }
    const pending = data.requests.find(r => r.status === "pending");
    if (pending) return pending._id;
    if (data.requests.some(r => r.status === "approved")) throw new Error("An approved withdrawal is already recorded.");
    const id = await ctx.db.insert("withdrawalRequests", { eventId: args.eventId, studentId: student._id, participantId: data.participant._id, status: "pending", requestedBy: user._id, requestedAt: Date.now(), idempotencyKey: args.idempotencyKey });
    await audit(ctx, user, "withdrawalRequests", id, "request", null, { eventId: args.eventId, studentId: student._id, participation: data.participant.status });
    return id;
  },
});

async function removeRoomState(ctx: MutationCtx, eventId: Id<"events">, studentId: Id<"students">, actor: Doc<"appUsers">) {
  const member = await ctx.db.query("roomMemberships").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).unique();
  if (member) {
    await ctx.db.delete(member._id);
    const group = await ctx.db.get(member.groupId);
    if (group) { await ctx.db.patch(group._id, { needsReview: true, finalized: false }); await audit(ctx, actor, "roomGroups", group._id, "withdrawalReview", { needsReview: group.needsReview, finalized: group.finalized }, { needsReview: true, finalized: false }); }
  }
  const request = await ctx.db.query("roomRequests").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", studentId)).unique();
  if (request) await ctx.db.delete(request._id);
  const invites = await ctx.db.query("roomInvites").withIndex("by_studentId", q => q.eq("studentId", studentId)).take(101);
  if (invites.length > 100) throw new Error("Room invitation limit reached.");
  for (const invite of invites) if (invite.eventId === eventId && invite.status === "pending") await ctx.db.patch(invite._id, { status: "declined" });
  const groups = await ctx.db.query("roomGroups").withIndex("by_eventId", q => q.eq("eventId", eventId)).take(101);
  if (groups.length > 100) throw new Error("Room group limit reached.");
  for (const group of groups) {
    const groupInvites = await ctx.db.query("roomInvites").withIndex("by_groupId", q => q.eq("groupId", group._id)).take(101);
    if (groupInvites.length > 100) throw new Error("Room invitation limit reached.");
    for (const invite of groupInvites) if (invite.invitedBy === studentId && invite.status === "pending") await ctx.db.patch(invite._id, { status: "declined" });
  }
}

export const reviewWithdrawal = mutation({
  args: { requestId: v.id("withdrawalRequests"), decision, returnCents: v.optional(v.number()), cancelUnpaidMain: v.boolean(), reason: v.string(), expectedRevision: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const user = await viewer(ctx);
    if (user.role !== "coach" && !(user.role === "mentor" && user.travelLead)) throw new Error("Withdrawal review denied.");
    if (args.reason.trim().length < 8 || args.reason.length > 1000) throw new Error("Provide an explanation of at least eight characters.");
    const request = await ctx.db.get(args.requestId);
    if (!request) throw new Error("Withdrawal request not found.");
    if (request.status !== "pending") {
      if (request.decision === args.decision && request.cancelUnpaidMain === args.cancelUnpaidMain && request.reason === args.reason.trim() && (args.decision !== "partial" || request.returnCents === args.returnCents)) return null;
      throw new Error("This withdrawal request was already decided differently.");
    }
    const data = await details(ctx, request.eventId, request.studentId);
    if (data.event.archived) throw new Error("This event was archived; withdrawal review is unavailable.");
    if (args.expectedRevision !== revision(data)) throw new Error("Participation or charges changed. Review the updated amounts before deciding.");
    if (data.participant._id !== request.participantId || data.participant.status === "withdrawn") throw new Error("Participation changed; review the request again.");
    if (args.decision === "deny") {
      if (args.returnCents !== undefined || args.cancelUnpaidMain) throw new Error("Denial cannot change finances.");
      await ctx.db.patch(request._id, { status: "denied", decision: "deny", decidedBy: user._id, decidedAt: Date.now(), reason: args.reason.trim(), cancelUnpaidMain: false, returnCents: 0, retainedCents: 0 });
      await audit(ctx, user, "withdrawalRequests", request._id, "deny", { status: "pending" }, { status: "denied", participation: data.participant.status }, args.reason.trim());
      return null;
    }
    const totalPaid = data.charges.reduce((n, c) => n + c.appliedCents, 0);
    const returned = args.decision === "full" ? totalPaid : args.decision === "retain" ? 0 : args.returnCents;
    if (!Number.isSafeInteger(returned) || returned === undefined || returned < 0 || returned > totalPaid || args.decision === "partial" && returned === 0) throw new Error("Return must be between one cent and the eligible paid amount.");
    if (args.decision !== "partial" && args.returnCents !== undefined) throw new Error("Custom return is only for a partial decision.");
    const entries = await financialEntries(ctx, request.studentId);
    if (returned > 0) sourceBalances(entries);
    let remaining = returned;
    const ordered = [...data.charges].sort((a, b) => (a.category ?? "main") === (b.category ?? "main") ? a.createdAt - b.createdAt : (a.category ?? "main") === "main" ? -1 : 1);
    const changes: { chargeId: Id<"charges">; category: string; returnCents: number; cancelUnpaidCents: number; retainedCents: number }[] = [];
    for (const charge of ordered) {
      const refund = Math.min(remaining, charge.appliedCents);
      remaining -= refund;
      const unpaid = effectiveChargeCents(charge) - charge.appliedCents;
      const cancelUnpaid = charge.category === "extra" ? unpaid : args.cancelUnpaidMain ? unpaid : 0;
      const allocations = refund > 0 ? entries.filter(e => e.chargeId === charge._id && (e.kind === "allocation" || e.kind === "deallocation")) : [];
      const sources = refund > 0 ? entries.filter((e): e is typeof e & { kind: "payment" | "fundraiser" } => e.kind === "payment" || e.kind === "fundraiser") : [];
      const net = new Map<Id<"ledgerEntries">, number>();
      for (const entry of allocations) {
        const sourceId = allocationSourceId(entry, sources);
        net.set(sourceId, (net.get(sourceId) ?? 0) + (entry.kind === "allocation" ? entry.amountCents : -entry.amountCents));
      }
      let toReverse = refund;
      let applied = charge.appliedCents;
      for (const [sourceId, amount] of net) {
        const reverse = Math.min(toReverse, amount);
        if (reverse <= 0) continue;
        const source = sources.find(s => s._id === sourceId)!;
        const next = applied - reverse;
        await ctx.db.insert("ledgerEntries", { studentId: request.studentId, chargeId: charge._id, eventId: request.eventId, kind: "deallocation", amountCents: reverse, previousCents: applied, newCents: next, sourceEntryId: sourceId, sourceKind: source.kind as "payment" | "fundraiser", reason: args.reason.trim(), recordedBy: user._id, recordedAt: Date.now(), idempotencyKey: `withdraw:${request._id}:return:${charge._id}:${sourceId}` });
        applied = next;
        toReverse -= reverse;
        if (toReverse === 0) break;
      }
      if (toReverse !== 0) throw new Error("Paid charge source history is inconsistent.");
      const cancelled = refund + cancelUnpaid;
      if (refund > 0 || cancelUnpaid > 0) {
        await ctx.db.patch(charge._id, { appliedCents: applied, cancelledCents: (charge.cancelledCents ?? 0) + cancelled });
        await ctx.db.insert("ledgerEntries", { studentId: request.studentId, chargeId: charge._id, eventId: request.eventId, kind: "cancellation", amountCents: cancelled, previousCents: charge.amountCents - (charge.cancelledCents ?? 0), newCents: charge.amountCents - (charge.cancelledCents ?? 0) - cancelled, reason: args.reason.trim(), recordedBy: user._id, recordedAt: Date.now(), idempotencyKey: `withdraw:${request._id}:cancel:${charge._id}` });
      }
      if (refund || cancelUnpaid) await audit(ctx, user, "charges", charge._id, "withdrawalDisposition", { appliedCents: charge.appliedCents, cancelledCents: charge.cancelledCents ?? 0 }, { appliedCents: applied, cancelledCents: (charge.cancelledCents ?? 0) + cancelled, returnedCents: refund, source: "preserved" }, args.reason.trim());
      changes.push({ chargeId: charge._id, category: charge.category ?? "main", returnCents: refund, cancelUnpaidCents: cancelUnpaid, retainedCents: applied });
    }
    await ctx.db.patch(data.participant._id, { status: "withdrawn", updatedAt: Date.now() });
    await removeRoomState(ctx, request.eventId, request.studentId, user);
    await ctx.db.patch(request._id, { status: "approved", decision: args.decision, returnCents: returned, retainedCents: totalPaid - returned, cancelUnpaidMain: args.cancelUnpaidMain, reason: args.reason.trim(), decidedBy: user._id, decidedAt: Date.now() });
    await audit(ctx, user, "withdrawalRequests", request._id, "approve", { status: "pending", participation: data.participant.status }, { status: "approved", participation: "withdrawn", returnedCents: returned, retainedCents: totalPaid - returned, charges: changes }, args.reason.trim());
    if (returned > 0) await allocateUnapplied(ctx, user, request.studentId, `withdraw:${request._id}:reallocate`, request.eventId);
    await financialEntries(ctx, request.studentId);
    return null;
  },
});
