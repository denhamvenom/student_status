import { makeFunctionReference } from "convex/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { audit } from "./access";
import { effectiveChargeCents } from "./chargeObligation";
import { cents, ensureFinancialAccount, readyFinancialAccount, financialAccount, saveFinancialAccount, recordChargeChange, recordProjectedEntry } from "./financialSources";
import { allocateUnapplied } from "./money";
import { requireSeasonFinancialContinuation } from "./seasonFinance";
import { refreshStudentFinance } from "./financeSummaries";

type Ctx = MutationCtx | QueryCtx;
type Plan = Doc<"seasonTransitionPlans">;
type SourceDecision = Doc<"seasonTransitionSourceDecisions">;
type ChargeDecision = Doc<"seasonTransitionChargeDecisions">;

async function sourceState(ctx: Ctx, plan: Plan, decision: SourceDecision, snapshot: boolean) {
  const account = await readyFinancialAccount(ctx, decision.sourceStudentId);
  const source = await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_sourceEntryId", q => q.eq("studentId", decision.sourceStudentId).eq("generation", account.generation).eq("sourceEntryId", decision.sourceEntryId)).unique();
  if (decision.planId !== plan._id || account.seasonId !== plan.sourceSeasonId || account.generation !== decision.financialGeneration || snapshot && account.revision !== decision.financialRevision || !source || source.revision !== decision.sourceRevision || source.availableCents !== decision.amountCents || source.kind !== decision.kind || cents(decision.amountCents) === 0) throw new Error("Financial source decision changed. Review it again.");
  if (decision.choice !== "carry" && decision.reason.trim().length < 8) throw new Error("Hold and team movements need the Coach's reason.");
  const roster = await ctx.db.query("seasonTransitionRosterDecisions").withIndex("by_planId_and_sourceStudentId", q => q.eq("planId", plan._id).eq("sourceStudentId", decision.sourceStudentId)).unique();
  if (!roster || decision.choice === "carry" && roster.choice !== "return" || decision.choice === "team" && roster.choice !== "depart") throw new Error("Financial source choice conflicts with the roster decision.");
  return { account, source };
}
async function chargeState(ctx: Ctx, plan: Plan, decision: ChargeDecision, snapshot: boolean) {
  const account = await readyFinancialAccount(ctx, decision.sourceStudentId);
  const charge = await ctx.db.get(decision.chargeId);
  if (decision.planId !== plan._id || account.seasonId !== plan.sourceSeasonId || account.generation !== decision.financialGeneration || snapshot && account.revision !== decision.financialRevision || !charge || charge.studentId !== decision.sourceStudentId || (charge.revision ?? 0) !== decision.chargeRevision || effectiveChargeCents(charge) - charge.appliedCents !== decision.outstandingCents || cents(decision.outstandingCents) === 0) throw new Error("Debt decision changed. Review it again.");
  const roster = await ctx.db.query("seasonTransitionRosterDecisions").withIndex("by_planId_and_sourceStudentId", q => q.eq("planId", plan._id).eq("sourceStudentId", decision.sourceStudentId)).unique();
  if (!roster || decision.choice === "carry" && roster.choice !== "return") throw new Error("Only returning students may carry debt.");
  if (decision.choice === "writeOff" && decision.reason.trim().length < 8) throw new Error("A debt write-off needs the Coach's reason.");
  return { account, charge };
}
export async function validateSeasonSourceDecision(ctx: Ctx, plan: Plan, decision: SourceDecision) { await sourceState(ctx, plan, decision, true); }
export async function validateSeasonChargeDecision(ctx: Ctx, plan: Plan, decision: ChargeDecision) { await chargeState(ctx, plan, decision, true); }

async function applying(ctx: MutationCtx, planId: Id<"seasonTransitionPlans">, sourceStudentId: Id<"students">, targetStudentId?: Id<"students">) {
  const plan = await ctx.db.get(planId);
  if (!plan || !plan.open || plan.state !== "applying" || !plan.targetSeasonId) throw new Error("Season financial continuation is unavailable.");
  const actor = await ctx.db.get(plan.updatedBy);
  const season = await ctx.db.get(plan.sourceSeasonId);
  if (!actor?.active || actor.role !== "coach" || season?.status !== "active") throw new Error("An active Coach and source season are required.");
  if (targetStudentId) {
    const target = await ctx.db.get(targetStudentId);
    const roster = await ctx.db.query("seasonTransitionRosterDecisions").withIndex("by_planId_and_sourceStudentId", q => q.eq("planId", planId).eq("sourceStudentId", sourceStudentId)).unique();
    if (!target || target.seasonId !== plan.targetSeasonId || roster?.choice !== "return" || roster.targetStudentId !== targetStudentId) throw new Error("Financial target lost its reviewed student mapping.");
  }
  return { plan, actor };
}

/** Both sides and the replay marker commit in the caller's single transaction. */
export async function applySeasonSourceDecision(ctx: MutationCtx, planId: Id<"seasonTransitionPlans">, decisionId: Id<"seasonTransitionSourceDecisions">, targetStudentId?: Id<"students">) {
  const decision = await ctx.db.get(decisionId);
  if (!decision || decision.planId !== planId) throw new Error("Source decision is unavailable.");
  const { plan, actor } = await applying(ctx, planId, decision.sourceStudentId, targetStudentId);
  if (decision.appliedAt !== undefined) return null;
  const { account, source } = await sourceState(ctx, plan, decision, false);
  const now = Date.now(); const reason = decision.reason || "Reviewed season carryover";
  if (decision.choice === "hold") {
    await ctx.db.patch(decisionId, { appliedAt: now });
    await audit(ctx, actor, "seasonTransitionSourceDecisions", decisionId, "hold", null, { sourceEntryId: source.sourceEntryId, kind: source.kind, amountCents: decision.amountCents, rootOriginEntryId: source.rootOriginEntryId }, reason);
    return null;
  }
  if (decision.choice === "carry" && !targetStudentId) throw new Error("Carryover requires the new seasonal student profile.");
  const outgoingEntryId = await ctx.db.insert("ledgerEntries", { studentId: account.studentId, kind: "transferOut", sourceEntryId: source.sourceEntryId, sourceKind: source.kind, originEntryId: source.rootOriginEntryId, destination: decision.choice === "team" ? "team" : undefined, counterpartyStudentId: targetStudentId, amountCents: decision.amountCents, previousCents: source.availableCents, newCents: 0, recordedBy: actor._id, recordedAt: now, occurredAt: now, reason, idempotencyKey: `season:${decisionId}:out`, seasonTransitionPlanId: planId });
  await recordProjectedEntry(ctx, outgoingEntryId, account);
  let incomingEntryId: Id<"ledgerEntries"> | undefined;
  if (decision.choice === "carry") {
    const target = await ensureFinancialAccount(ctx, targetStudentId!);
    incomingEntryId = await ctx.db.insert("ledgerEntries", { studentId: targetStudentId!, kind: source.kind, originEntryId: source.rootOriginEntryId, counterpartyStudentId: account.studentId, amountCents: decision.amountCents, previousCents: 0, newCents: decision.amountCents, recordedBy: actor._id, recordedAt: now, reason, idempotencyKey: `season:${decisionId}:in`, seasonTransitionPlanId: planId });
    await recordProjectedEntry(ctx, incomingEntryId, target);
    await refreshStudentFinance(ctx, targetStudentId!);
  }
  await ctx.db.patch(decisionId, { appliedAt: now, outgoingEntryId, incomingEntryId });
  await refreshStudentFinance(ctx, account.studentId);
  await audit(ctx, actor, "seasonTransitionSourceDecisions", decisionId, decision.choice, null, { outgoingEntryId, incomingEntryId, sourceEntryId: source.sourceEntryId, rootOriginEntryId: source.rootOriginEntryId, kind: source.kind, amountCents: decision.amountCents }, reason);
  return null;
}

export async function applySeasonChargeDecision(ctx: MutationCtx, planId: Id<"seasonTransitionPlans">, decisionId: Id<"seasonTransitionChargeDecisions">, targetStudentId?: Id<"students">) {
  const decision = await ctx.db.get(decisionId);
  if (!decision || decision.planId !== planId) throw new Error("Debt decision is unavailable.");
  const { plan, actor } = await applying(ctx, planId, decision.sourceStudentId, targetStudentId);
  if (decision.appliedAt !== undefined) return null;
  const { account, charge } = await chargeState(ctx, plan, decision, false);
  if (decision.choice === "carry" && !targetStudentId) throw new Error("Debt carry requires the new seasonal student profile.");
  const now = Date.now(); const reason = decision.reason || "Reviewed season debt carryover";
  const before = effectiveChargeCents(charge);
  charge.cancelledCents = cents((charge.cancelledCents ?? 0) + decision.outstandingCents);
  await ctx.db.patch(charge._id, { cancelledCents: charge.cancelledCents });
  const outgoingEntryId = await ctx.db.insert("ledgerEntries", { studentId: account.studentId, chargeId: charge._id, kind: "cancellation", amountCents: decision.outstandingCents, previousCents: before, newCents: charge.appliedCents, reason, recordedBy: actor._id, recordedAt: now, idempotencyKey: `season:${decisionId}:out`, seasonTransitionPlanId: planId });
  await recordProjectedEntry(ctx, outgoingEntryId, account);
  await recordChargeChange(ctx, account, charge, before, charge.appliedCents);
  let targetChargeId: Id<"charges"> | undefined; let incomingEntryId: Id<"ledgerEntries"> | undefined;
  if (decision.choice === "carry") {
    const target = await ensureFinancialAccount(ctx, targetStudentId!);
    targetChargeId = await ctx.db.insert("charges", { studentId: targetStudentId!, label: charge.label, category: charge.category, amountCents: decision.outstandingCents, appliedCents: 0, priority: charge.priority, outstanding: true, createdBy: actor._id, createdAt: now, originChargeId: charge.originChargeId ?? charge._id, seasonTransitionPlanId: planId });
    incomingEntryId = await ctx.db.insert("ledgerEntries", { studentId: targetStudentId!, chargeId: targetChargeId, kind: "charge", amountCents: decision.outstandingCents, previousCents: 0, newCents: decision.outstandingCents, reason, recordedBy: actor._id, recordedAt: now, idempotencyKey: `season:${decisionId}:in`, seasonTransitionPlanId: planId });
    await recordProjectedEntry(ctx, incomingEntryId, target);
    const targetCharge = await ctx.db.get(targetChargeId);
    if (!targetCharge) throw new Error("Opening debt is unavailable.");
    await recordChargeChange(ctx, target, targetCharge, 0, 0, true);
    await refreshStudentFinance(ctx, targetStudentId!);
  }
  await ctx.db.patch(decisionId, { appliedAt: now, outgoingEntryId, targetChargeId, incomingEntryId });
  await refreshStudentFinance(ctx, account.studentId);
  await audit(ctx, actor, "seasonTransitionChargeDecisions", decisionId, decision.choice, null, { outgoingEntryId, targetChargeId, incomingEntryId, amountCents: decision.outstandingCents }, reason);
  return null;
}

/** Recheck persisted pairs before activation; never infer completion from scheduling. */
export async function verifySeasonSourceDecision(ctx: Ctx, plan: Plan, decision: SourceDecision) {
  if (decision.planId !== plan._id || decision.appliedAt === undefined) throw new Error("Source transition is incomplete.");
  const account = await readyFinancialAccount(ctx, decision.sourceStudentId);
  const source = await ctx.db.query("financialSources").withIndex("by_studentId_and_generation_and_sourceEntryId", q => q.eq("studentId", decision.sourceStudentId).eq("generation", account.generation).eq("sourceEntryId", decision.sourceEntryId)).unique();
  if (!source || source.kind !== decision.kind || source.availableCents !== (decision.choice === "hold" ? decision.amountCents : 0)) throw new Error("Source transition conservation failed.");
  if (decision.choice === "hold") return;
  const out = decision.outgoingEntryId ? await ctx.db.get(decision.outgoingEntryId) : null;
  if (!out || out.kind !== "transferOut" || out.studentId !== decision.sourceStudentId || out.sourceEntryId !== decision.sourceEntryId || out.sourceKind !== decision.kind || out.originEntryId !== source.rootOriginEntryId || out.amountCents !== decision.amountCents || out.seasonTransitionPlanId !== plan._id) throw new Error("Source outgoing evidence is inconsistent.");
  if (decision.choice === "team") { if (out.destination !== "team" || decision.incomingEntryId) throw new Error("Team transfer destination is inconsistent."); return; }
  const incoming = decision.incomingEntryId ? await ctx.db.get(decision.incomingEntryId) : null;
  const target = incoming ? await ctx.db.get(incoming.studentId) : null;
  if (!incoming || !target || target.seasonId !== plan.targetSeasonId || incoming.studentId !== out.counterpartyStudentId || incoming.kind !== decision.kind || incoming.amountCents !== out.amountCents || incoming.originEntryId !== source.rootOriginEntryId || incoming.seasonTransitionPlanId !== plan._id) throw new Error("Paired source carryover is inconsistent.");
}
export async function verifySeasonChargeDecision(ctx: Ctx, plan: Plan, decision: ChargeDecision) {
  if (decision.planId !== plan._id || decision.appliedAt === undefined) throw new Error("Debt transition is incomplete.");
  const old = await ctx.db.get(decision.chargeId);
  const out = decision.outgoingEntryId ? await ctx.db.get(decision.outgoingEntryId) : null;
  if (!old || old.studentId !== decision.sourceStudentId || effectiveChargeCents(old) !== old.appliedCents || !out || out.kind !== "cancellation" || out.chargeId !== old._id || out.amountCents !== decision.outstandingCents || out.seasonTransitionPlanId !== plan._id) throw new Error("Debt closing evidence is inconsistent.");
  if (decision.choice === "writeOff") { if (decision.targetChargeId || decision.incomingEntryId) throw new Error("Written-off debt has an unexpected new obligation."); return; }
  const charge = decision.targetChargeId ? await ctx.db.get(decision.targetChargeId) : null;
  const incoming = decision.incomingEntryId ? await ctx.db.get(decision.incomingEntryId) : null;
  const target = charge ? await ctx.db.get(charge.studentId) : null;
  if (!charge || !incoming || !target || target.seasonId !== plan.targetSeasonId || charge.originChargeId !== (old.originChargeId ?? old._id) || charge.amountCents !== decision.outstandingCents || effectiveChargeCents(charge) !== decision.outstandingCents || incoming.chargeId !== charge._id || incoming.studentId !== charge.studentId || incoming.amountCents !== decision.outstandingCents || incoming.kind !== "charge" || incoming.seasonTransitionPlanId !== plan._id) throw new Error("Paired opening debt is inconsistent.");
}

/** Start/resume only this plan's existing allocator; pending work keeps activation fenced. */
export async function continueSeasonTargetAllocation(ctx: MutationCtx, planId: Id<"seasonTransitionPlans">, targetStudentId: Id<"students">) {
  const target = await ctx.db.get(targetStudentId);
  const plan = await ctx.db.get(planId);
  if (!plan || !target || target.seasonId !== plan.targetSeasonId) throw new Error("Season allocation target changed.");
  await requireSeasonFinancialContinuation(ctx, target.seasonId, planId);
  const actor = await ctx.db.get(plan.updatedBy);
  if (!actor?.active || actor.role !== "coach") throw new Error("An active Coach is required for season allocation.");
  let account = await financialAccount(ctx, targetStudentId);
  if (account?.state === "allocating" || account?.state === "failed") {
    const job = account.allocationJobId ? await ctx.db.get(account.allocationJobId) : null;
    if (!job || job.maintenanceOriginId !== planId || job.generation !== account.generation) throw new Error("Target financial preparation requires Coach resolution.");
    if (account.state === "failed") {
      await ctx.db.patch(job._id, { state: "running", actorId: actor._id, lastError: undefined, updatedAt: Date.now() });
      account.state = "allocating"; account.lastError = undefined;
      await saveFinancialAccount(ctx, account);
      await ctx.scheduler.runAfter(0, makeFunctionReference<"mutation">("financialAllocation:run"), { jobId: job._id });
    }
    return false;
  }
  account = await ensureFinancialAccount(ctx, targetStudentId, planId);
  if (account.chargedCents === account.paidCents || account.personalAvailableCents + account.fundraisingAvailableCents === 0) return true;
  await allocateUnapplied(ctx, actor, targetStudentId, `season:${planId}:allocate:${targetStudentId}`, undefined, planId);
  return (await financialAccount(ctx, targetStudentId))?.state === "ready";
}
