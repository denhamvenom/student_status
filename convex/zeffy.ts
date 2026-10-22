import { ConvexError, v } from "convex/values";
import { makeFunctionReference, paginationOptsValidator, paginationResultValidator } from "convex/server";
import { env, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { activeSeason, audit, requireRole, viewer } from "./lib/access";
import { ensureFinancialAccount, recordProjectedEntry } from "./lib/financialSources";
import { allocateUnapplied } from "./lib/money";
import { canonicalZeffyUrl, paymentSafety, type ZeffyCampaign, type ZeffyPayment } from "./lib/zeffy";

const summary = v.object({ credited: v.number(), unchanged: v.number(), review: v.number() });
const exception = v.object({ _id: v.id("zeffyExceptions"), code: v.string(), message: v.string(), campaignId: v.optional(v.string()), paymentId: v.optional(v.string()), studentId: v.optional(v.id("students")), createdAt: v.number() });
const expireRef = makeFunctionReference<"mutation">("zeffy:expire");

export const status = query({ args: {}, returns: v.object({ enabled: v.boolean(), configured: v.boolean(), running: v.boolean(), lastRunAt: v.union(v.number(), v.null()), lastSuccessfulAt: v.union(v.number(), v.null()), lastRunStatus: v.union(v.literal("complete"), v.literal("failed"), v.null()), lastError: v.union(v.string(), v.null()), lastSummary: v.union(summary, v.null()), hasMoreExceptions: v.boolean(), exceptions: v.array(exception) }), handler: async ctx => {
  requireRole(await viewer(ctx), "coach");
  const settings = await ctx.db.query("zeffySettings").withIndex("by_key", q => q.eq("key", "team")).unique();
  const rows = await ctx.db.query("zeffyExceptions").withIndex("by_lastSeenAt").order("desc").take(51);
  return { enabled: settings?.enabled ?? false, configured: !!env.ZEFFY_API_KEY, running: !!settings?.runningRunId, lastRunAt: settings?.lastRunAt ?? null, lastSuccessfulAt: settings?.lastSuccessfulAt ?? null, lastRunStatus: settings?.lastRunStatus ?? null, lastError: settings?.lastError ?? null, lastSummary: settings?.lastSummary ?? null, hasMoreExceptions: rows.length > 50, exceptions: rows.slice(0, 50).map(row => ({ _id: row._id, code: row.code, message: row.message, campaignId: row.campaignId, paymentId: row.paymentId, studentId: row.studentId, createdAt: row.firstSeenAt })) };
} });

export const exceptionsPage = query({ args: { paginationOpts: paginationOptsValidator }, returns: paginationResultValidator(exception), handler: async (ctx, args) => {
  requireRole(await viewer(ctx), "coach");
  if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) throw new ConvexError("Request 1 to 50 exceptions per page.");
  const page = await ctx.db.query("zeffyExceptions").withIndex("by_lastSeenAt").order("desc").paginate(args.paginationOpts);
  return { ...page, page: page.page.map(row => ({ _id: row._id, code: row.code, message: row.message, campaignId: row.campaignId, paymentId: row.paymentId, studentId: row.studentId, createdAt: row.firstSeenAt })) };
} });

export const setEnabled = mutation({ args: { enabled: v.boolean(), reason: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const actor = await viewer(ctx); requireRole(actor, "coach");
  if (args.reason.trim().length < 8 || args.reason.length > 1000) throw new ConvexError("Provide a reason of at least eight characters.");
  if (args.enabled && !env.ZEFFY_API_KEY) throw new ConvexError("Zeffy API key is not configured.");
  const prior = await ctx.db.query("zeffySettings").withIndex("by_key", q => q.eq("key", "team")).unique();
  if (prior?.runningRunId) throw new ConvexError("A Zeffy sync is running.");
  if (prior) await ctx.db.patch(prior._id, { enabled: args.enabled, actorId: actor._id, updatedAt: Date.now() });
  else await ctx.db.insert("zeffySettings", { key: "team", enabled: args.enabled, actorId: actor._id, updatedAt: Date.now() });
  await audit(ctx, actor, "zeffySettings", "team", "setEnabled", { enabled: prior?.enabled ?? false }, { enabled: args.enabled }, args.reason.trim());
  return null;
} });

export const requireCoach = internalQuery({ args: {}, returns: v.id("appUsers"), handler: async ctx => {
  const actor = await viewer(ctx); requireRole(actor, "coach"); return actor._id;
} });

export const scheduledActor = internalQuery({ args: {}, returns: v.union(v.id("appUsers"), v.null()), handler: async ctx => {
  const settings = await ctx.db.query("zeffySettings").withIndex("by_key", q => q.eq("key", "team")).unique();
  if (!settings?.enabled || !env.ZEFFY_API_KEY) return null;
  const actor = await ctx.db.get(settings.actorId);
  return actor?.active && actor.role === "coach" ? actor._id : null;
} });

export const snapshot = internalQuery({ args: {}, returns: v.object({ activeSeasonId: v.id("seasons"), seasonStartsAt: v.number(), students: v.array(v.object({ id: v.id("students"), seasonId: v.id("seasons"), name: v.string(), url: v.union(v.string(), v.null()), revision: v.number(), active: v.boolean() })), mappings: v.array(v.object({ campaignId: v.string(), canonicalUrl: v.string(), studentId: v.id("students"), seasonId: v.id("seasons") })), payments: v.array(v.object({ paymentId: v.string(), amountCents: v.number(), campaignId: v.string() })) }), handler: async ctx => {
  const season = await activeSeason(ctx);
  const students = await ctx.db.query("students").take(5001);
  const mappings = await ctx.db.query("zeffyCampaignMappings").take(5001);
  const payments = await ctx.db.query("zeffyPayments").take(5001);
  if (students.length > 5000 || mappings.length > 5000 || payments.length > 5000) throw new Error("Zeffy preview exceeds its safe record limit; review is required.");
  return { activeSeasonId: season._id, seasonStartsAt: season.startsAt, students: students.map(s => ({ id: s._id, seasonId: s.seasonId, name: s.legalName || s.preferredName, url: s.fundraiserUrl ?? null, revision: s.fundraiserLinkRevision ?? 0, active: s.active })), mappings: mappings.map(m => ({ campaignId: m.campaignId, canonicalUrl: m.canonicalUrl, studentId: m.studentId, seasonId: m.seasonId })), payments: payments.map(p => ({ paymentId: p.paymentId, amountCents: p.amountCents, campaignId: p.campaignId })) };
} });

export const begin = internalMutation({ args: { actorId: v.id("appUsers") }, returns: v.union(v.id("zeffyRuns"), v.null()), handler: async (ctx, args) => {
  const settings = await ctx.db.query("zeffySettings").withIndex("by_key", q => q.eq("key", "team")).unique();
  const actor = await ctx.db.get(args.actorId);
  if (!settings?.enabled || !actor?.active || actor.role !== "coach" || !env.ZEFFY_API_KEY) return null;
  if (settings.runningRunId) {
    const prior = await ctx.db.get(settings.runningRunId);
    if (prior?.state === "running" && Date.now() - prior.startedAt < 30 * 60_000) return null;
    if (prior?.state === "running") await ctx.db.patch(prior._id, { state: "failed", completedAt: Date.now(), error: "Zeffy sync was interrupted; retry is safe." });
    await ctx.db.patch(settings._id, { runningRunId: undefined, lastRunStatus: "failed", lastError: "Zeffy sync was interrupted; retry is safe." });
  }
  const runId = await ctx.db.insert("zeffyRuns", { actorId: actor._id, state: "running", startedAt: Date.now(), credited: 0, unchanged: 0, review: 0 });
  await ctx.db.patch(settings._id, { runningRunId: runId, lastRunAt: Date.now() });
  await ctx.scheduler.runAfter(30 * 60_000, expireRef, { runId });
  return runId;
} });

export const expire = internalMutation({ args: { runId: v.id("zeffyRuns") }, returns: v.null(), handler: async (ctx, args) => {
  const settings = await ctx.db.query("zeffySettings").withIndex("by_key", q => q.eq("key", "team")).unique();
  const run = await ctx.db.get(args.runId);
  if (settings?.runningRunId !== args.runId || run?.state !== "running") return null;
  const message = "Zeffy sync was interrupted; use Check now to retry.";
  await ctx.db.patch(run._id, { state: "failed", completedAt: Date.now(), error: message });
  await ctx.db.patch(settings._id, { runningRunId: undefined, lastRunStatus: "failed", lastError: message });
  return null;
} });

export const finish = internalMutation({ args: { runId: v.id("zeffyRuns"), credited: v.number(), unchanged: v.number(), review: v.number(), error: v.optional(v.string()) }, returns: v.null(), handler: async (ctx, args) => {
  const settings = await ctx.db.query("zeffySettings").withIndex("by_key", q => q.eq("key", "team")).unique();
  if (!settings || settings.runningRunId !== args.runId) return null;
  const now = Date.now(); const state = args.error ? "failed" as const : "complete" as const;
  await ctx.db.patch(args.runId, { state, completedAt: now, credited: args.credited, unchanged: args.unchanged, review: args.review, error: args.error });
  await ctx.db.patch(settings._id, { runningRunId: undefined, lastRunAt: now, lastSuccessfulAt: args.error ? settings.lastSuccessfulAt : now, lastRunStatus: state, lastError: args.error, lastSummary: { credited: args.credited, unchanged: args.unchanged, review: args.review } });
  return null;
} });

async function saveException(ctx: import("./_generated/server").MutationCtx, key: string, code: string, message: string, campaignId?: string, paymentId?: string, studentId?: Id<"students">) {
  const prior = await ctx.db.query("zeffyExceptions").withIndex("by_key", q => q.eq("key", key)).unique();
  if (prior) await ctx.db.patch(prior._id, { code, message, lastSeenAt: Date.now(), occurrences: prior.occurrences + 1 });
  else await ctx.db.insert("zeffyExceptions", { key, code, message, campaignId, paymentId, studentId, firstSeenAt: Date.now(), lastSeenAt: Date.now(), occurrences: 1 });
}

async function clearExceptionKey(ctx: import("./_generated/server").MutationCtx, key: string) {
  const prior = await ctx.db.query("zeffyExceptions").withIndex("by_key", q => q.eq("key", key)).unique();
  if (prior) await ctx.db.delete(prior._id);
}

export const captureCampaign = internalMutation({ args: { runId: v.id("zeffyRuns"), campaign: v.object({ id: v.string(), url: v.string(), title: v.string(), category: v.string(), currency: v.string() }) }, returns: v.null(), handler: async (ctx, args) => {
  const settings = await ctx.db.query("zeffySettings").withIndex("by_key", q => q.eq("key", "team")).unique();
  if (settings?.runningRunId !== args.runId || !settings.enabled) throw new Error("Zeffy run is unavailable.");
  const canonical = canonicalZeffyUrl(args.campaign.url);
  if (!canonical || args.campaign.category !== "PeerToPeerCampaign" || args.campaign.currency.toLowerCase() !== "usd") return null;
  const students = await ctx.db.query("students").take(5001);
  if (students.length > 5000) throw new Error("Student matching exceeds the safe record limit.");
  const matching = students.filter(s => canonicalZeffyUrl(s.fundraiserUrl ?? "") === canonical);
  if (!matching.length) return null;
  const season = await activeSeason(ctx);
  const mapping = await ctx.db.query("zeffyCampaignMappings").withIndex("by_campaignId", q => q.eq("campaignId", args.campaign.id)).unique();
  const conflicting = await ctx.db.query("zeffyCampaignMappings").withIndex("by_canonicalUrl", q => q.eq("canonicalUrl", canonical)).take(2);
  if (matching.length !== 1 || !matching[0].active || matching[0].seasonId !== season._id || conflicting.some(m => m.campaignId !== args.campaign.id) || mapping && (mapping.canonicalUrl !== canonical || mapping.studentId !== matching[0]._id || mapping.seasonId !== season._id)) {
    await saveException(ctx, `campaign:${args.campaign.id}`, "linkConflict", "Campaign page has duplicate or conflicting student links; review manually.", args.campaign.id);
    return null;
  }
  if (mapping) await ctx.db.patch(mapping._id, { lastSeenAt: Date.now() });
  else await ctx.db.insert("zeffyCampaignMappings", { campaignId: args.campaign.id, canonicalUrl: canonical, studentId: matching[0]._id, seasonId: season._id, linkRevision: matching[0].fundraiserLinkRevision ?? 0, firstSeenAt: Date.now(), lastSeenAt: Date.now() });
  await clearExceptionKey(ctx, `campaign:${args.campaign.id}`);
  return null;
} });

export const missingCampaign = internalMutation({ args: { runId: v.id("zeffyRuns"), campaignId: v.string(), paymentId: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const settings = await ctx.db.query("zeffySettings").withIndex("by_key", q => q.eq("key", "team")).unique();
  if (settings?.runningRunId !== args.runId) throw new Error("Zeffy run is unavailable.");
  await saveException(ctx, `payment:${args.paymentId}`, "campaignMissing", "Payment campaign is absent from Zeffy campaign list; review manually.", args.campaignId, args.paymentId);
  return null;
} });

export const paymentFailure = internalMutation({ args: { runId: v.id("zeffyRuns"), campaignId: v.string(), paymentId: v.string() }, returns: v.null(), handler: async (ctx, args) => {
  const settings = await ctx.db.query("zeffySettings").withIndex("by_key", q => q.eq("key", "team")).unique();
  if (settings?.runningRunId !== args.runId) throw new Error("Zeffy run is unavailable.");
  await saveException(ctx, `payment:${args.paymentId}`, "processingFailed", "This payment could not be safely posted; Coach financial review is required.", args.campaignId, args.paymentId);
  return null;
} });

export const applyPayment = internalMutation({ args: { runId: v.id("zeffyRuns"), campaign: v.object({ id: v.string(), url: v.string(), title: v.string(), category: v.string(), currency: v.string() }), payment: v.object({ id: v.string(), created: v.number(), amount: v.number(), currency: v.string(), status: v.string(), type: v.string(), refund_status: v.string(), refund_count: v.number(), has_dispute: v.boolean(), campaign_id: v.string(), campaign_type: v.string(), campaign_category: v.string(), items: v.array(v.object({ type: v.string(), amount: v.number(), currency: v.string() })) }) }, returns: v.union(v.literal("credited"), v.literal("unchanged"), v.literal("review")), handler: async (ctx, args) => {
  const run = await ctx.db.get(args.runId); const settings = await ctx.db.query("zeffySettings").withIndex("by_key", q => q.eq("key", "team")).unique();
  if (!run || run.state !== "running" || settings?.runningRunId !== run._id || !settings.enabled) throw new Error("Zeffy run is unavailable.");
  const campaign: ZeffyCampaign = args.campaign; const payment: ZeffyPayment = args.payment;
  const existing = await ctx.db.query("zeffyPayments").withIndex("by_paymentId", q => q.eq("paymentId", payment.id)).unique();
  const safety = paymentSafety(payment);
  if (existing) {
    if (safety) { await saveException(ctx, `payment:${payment.id}`, safety, "Previously credited donation needs Zeffy review.", campaign.id, payment.id, existing.studentId); return "review"; }
    if (existing.amountCents === payment.amount && existing.campaignId === payment.campaign_id) { await clearExceptionKey(ctx, `payment:${payment.id}`); return "unchanged"; }
    await saveException(ctx, `payment:${payment.id}`, "paymentChanged", "Previously credited payment details changed; review manually.", campaign.id, payment.id, existing.studentId); return "review";
  }
  if (safety) { if (safety !== "notSucceeded") await saveException(ctx, `payment:${payment.id}`, safety, "Payment is not safe to credit; review in Zeffy.", campaign.id, payment.id); return safety === "notSucceeded" ? "unchanged" : "review"; }
  const canonical = canonicalZeffyUrl(campaign.url);
  if (!canonical || campaign.currency.toLowerCase() !== "usd" || campaign.category !== "PeerToPeerCampaign" || campaign.id !== payment.campaign_id) { await saveException(ctx, `payment:${payment.id}`, "campaignInvalid", "Campaign details do not identify a supported fundraising page.", campaign.id, payment.id); return "review"; }
  const season = await activeSeason(ctx);
  const allStudents = await ctx.db.query("students").take(5001);
  if (allStudents.length > 5000) throw new Error("Student matching exceeds the safe record limit.");
  const matching = allStudents.filter(s => canonicalZeffyUrl(s.fundraiserUrl ?? "") === canonical);
  const mapping = await ctx.db.query("zeffyCampaignMappings").withIndex("by_campaignId", q => q.eq("campaignId", campaign.id)).unique();
  const conflicting = await ctx.db.query("zeffyCampaignMappings").withIndex("by_canonicalUrl", q => q.eq("canonicalUrl", canonical)).take(2);
  if (matching.length !== 1 || conflicting.some(m => m.campaignId !== campaign.id) || mapping && (mapping.canonicalUrl !== canonical || mapping.studentId !== matching[0]?._id || mapping.seasonId !== season._id)) { await saveException(ctx, `payment:${payment.id}`, "linkConflict", "Saved student link or historical campaign assignment conflicts; review manually.", campaign.id, payment.id); return "review"; }
  const student = matching[0];
  if (!student.active || student.seasonId !== season._id) { await saveException(ctx, `payment:${payment.id}`, "oldSeason", "Donation belongs to an inactive or prior-season page; review manually.", campaign.id, payment.id, student._id); return "review"; }
  const actor = await ctx.db.get(run.actorId);
  if (!actor?.active || actor.role !== "coach") throw new Error("The recorded Coach is unavailable.");
  const account = await ensureFinancialAccount(ctx, student._id);
  if (account.state !== "ready" || account.allocationSourceVersion !== 1) { await saveException(ctx, `payment:${payment.id}`, "financialUnavailable", "Student financial projection needs Coach review.", campaign.id, payment.id, student._id); return "review"; }
  const funds = account.paidCents + account.personalAvailableCents + account.fundraisingAvailableCents;
  if (!Number.isSafeInteger(funds + payment.amount)) { await saveException(ctx, `payment:${payment.id}`, "amountOverflow", "Student balance exceeds the safe exact-cent range.", campaign.id, payment.id, student._id); return "review"; }
  const existingLedger = await ctx.db.query("ledgerEntries").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", `zeffy:${payment.id}`)).unique();
  if (existingLedger) { await saveException(ctx, `payment:${payment.id}`, "partialPosting", "An earlier ledger credit lacks its Zeffy payment record; review manually.", campaign.id, payment.id, student._id); return "review"; }
  if (!mapping) await ctx.db.insert("zeffyCampaignMappings", { campaignId: campaign.id, canonicalUrl: canonical, studentId: student._id, seasonId: season._id, linkRevision: student.fundraiserLinkRevision ?? 0, firstSeenAt: Date.now(), lastSeenAt: Date.now() });
  else await ctx.db.patch(mapping._id, { lastSeenAt: Date.now() });
  const entryId = await ctx.db.insert("ledgerEntries", { zeffyPaymentId: payment.id, studentId: student._id, kind: "fundraiser", amountCents: payment.amount, previousCents: funds, newCents: funds + payment.amount, reason: "Zeffy donation", recordedBy: actor._id, recordedAt: Date.now(), occurredAt: payment.created * 1000, idempotencyKey: `zeffy:${payment.id}` });
  await ctx.db.insert("zeffyPayments", { paymentId: payment.id, campaignId: campaign.id, studentId: student._id, seasonId: season._id, amountCents: payment.amount, occurredAt: payment.created * 1000, ledgerEntryId: entryId, postedAt: Date.now() });
  await recordProjectedEntry(ctx, entryId, account);
  await audit(ctx, actor, "zeffyPayments", payment.id, "creditDonation", null, { studentId: student._id, amountCents: payment.amount, campaignId: campaign.id });
  await allocateUnapplied(ctx, actor, student._id, `zeffy:${payment.id}:allocate`);
  await clearExceptionKey(ctx, `payment:${payment.id}`);
  return "credited";
} });
