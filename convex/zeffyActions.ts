import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { action, env, internalAction, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { canonicalZeffyUrl, isZeffySlot, paymentSafety, type ZeffyCampaign, type ZeffyPayment } from "./lib/zeffy";

const API = "https://api.zeffy.com/api/v1";
const MAX_PAGES = 100;
const MAX_ITEMS = 10_000;
const requireCoachRef = makeFunctionReference<"query">("zeffy:requireCoach");
const snapshotRef = makeFunctionReference<"query">("zeffy:snapshot");
const beginRef = makeFunctionReference<"mutation">("zeffy:begin");
const finishRef = makeFunctionReference<"mutation">("zeffy:finish");
const applyRef = makeFunctionReference<"mutation">("zeffy:applyPayment");
const missingRef = makeFunctionReference<"mutation">("zeffy:missingCampaign");
const paymentFailureRef = makeFunctionReference<"mutation">("zeffy:paymentFailure");
const captureCampaignRef = makeFunctionReference<"mutation">("zeffy:captureCampaign");
const scheduledActorRef = makeFunctionReference<"query">("zeffy:scheduledActor");
type Snapshot = { activeSeasonId: Id<"seasons">; seasonStartsAt: number; students: Array<{ id: Id<"students">; seasonId: Id<"seasons">; name: string; url: string | null; revision: number; active: boolean }>; mappings: Array<{ campaignId: string; canonicalUrl: string; studentId: Id<"students">; seasonId: Id<"seasons"> }>; payments: Array<{ paymentId: string; amountCents: number; campaignId: string }> };

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Zeffy response was invalid.");
  return value as Record<string, unknown>;
}

function parseCampaign(value: unknown): ZeffyCampaign {
  const raw = object(value);
  if (typeof raw.id !== "string" || typeof raw.url !== "string" || typeof raw.title !== "string" || typeof raw.category !== "string" || typeof raw.currency !== "string") throw new Error("Zeffy campaign was invalid.");
  return { id: raw.id, url: raw.url, title: raw.title, category: raw.category, currency: raw.currency };
}

function parsePayment(value: unknown): ZeffyPayment {
  const raw = object(value);
  if (typeof raw.id !== "string" || typeof raw.created !== "number" || typeof raw.amount !== "number" || typeof raw.currency !== "string" || typeof raw.status !== "string" || typeof raw.type !== "string" || typeof raw.refund_status !== "string" || !Array.isArray(raw.refunds) || typeof raw.campaign_id !== "string" || typeof raw.campaign_type !== "string" || typeof raw.campaign_category !== "string" || !Array.isArray(raw.items)) throw new Error("Zeffy payment was invalid.");
  const items = raw.items.map(value => { const item = object(value); if (typeof item.type !== "string" || typeof item.amount !== "number" || typeof item.currency !== "string") throw new Error("Zeffy donation item was invalid."); return { type: item.type, amount: item.amount, currency: item.currency }; });
  return { id: raw.id, created: raw.created, amount: raw.amount, currency: raw.currency, status: raw.status, type: raw.type, refund_status: raw.refund_status, refund_count: raw.refunds.length, has_dispute: raw.dispute !== null, campaign_id: raw.campaign_id, campaign_type: raw.campaign_type, campaign_category: raw.campaign_category, items };
}

async function listAll(path: "campaigns" | "payments"): Promise<unknown[]> {
  const key = env.ZEFFY_API_KEY;
  if (!key) throw new Error("Zeffy API key is not configured.");
  const all: unknown[] = []; let cursor: string | null = null; const seen = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${API}/${path}`); url.searchParams.set("limit", "100"); if (cursor) url.searchParams.set("starting_after", cursor);
    const response = await fetch(url, { headers: { authorization: `Bearer ${key}`, accept: "application/json" } });
    if (!response.ok) throw new Error(`Zeffy ${path} request failed (${response.status}).`);
    const body = object(await response.json());
    if (body.object !== "list" || !Array.isArray(body.data) || typeof body.has_more !== "boolean" || !(body.next_cursor === null || typeof body.next_cursor === "string")) throw new Error(`Zeffy ${path} pagination was invalid.`);
    if (all.length + body.data.length > MAX_ITEMS) throw new Error(`Zeffy ${path} exceeds its safe page limit; no truncated import was posted.`);
    all.push(...body.data);
    if (!body.has_more) { if (body.next_cursor !== null) throw new Error(`Zeffy ${path} pagination was inconsistent.`); return all; }
    if (!body.next_cursor || seen.has(body.next_cursor)) throw new Error(`Zeffy ${path} pagination did not advance.`);
    seen.add(body.next_cursor); cursor = body.next_cursor;
  }
  throw new Error(`Zeffy ${path} exceeds its safe page limit; no truncated import was posted.`);
}

async function fetchData() {
  const campaigns = (await listAll("campaigns")).map(parseCampaign);
  const payments = (await listAll("payments")).map(parsePayment);
  const ids = new Set<string>();
  for (const campaign of campaigns) { if (ids.has(campaign.id)) throw new Error("Zeffy returned a duplicate campaign ID."); ids.add(campaign.id); }
  const paymentIds = new Set<string>();
  for (const payment of payments) { if (paymentIds.has(payment.id)) throw new Error("Zeffy returned a duplicate payment ID."); paymentIds.add(payment.id); }
  return { campaigns, payments };
}

export const preview = action({ args: {}, returns: v.object({ safeToRun: v.boolean(), campaigns: v.array(v.object({ campaignId: v.string(), url: v.string(), title: v.string(), studentId: v.optional(v.id("students")), studentName: v.optional(v.string()), seasonName: v.optional(v.string()), status: v.string() })), paymentCount: v.number(), eligibleCount: v.number(), reviewCount: v.number(), exceptions: v.array(v.object({ code: v.string(), message: v.string(), campaignId: v.optional(v.string()), paymentId: v.optional(v.string()) })), rows: v.array(v.object({ paymentId: v.string(), studentName: v.optional(v.string()), amountCents: v.number(), outcome: v.union(v.literal("eligible"), v.literal("unchanged"), v.literal("review")), message: v.optional(v.string()) })) }), handler: async ctx => {
  await ctx.runQuery(requireCoachRef, {});
  const { campaigns, payments } = await fetchData();
  const snapshot: Snapshot = await ctx.runQuery(snapshotRef, {}) as Snapshot;
  const byId = new Map(campaigns.map(campaign => [campaign.id, campaign]));
  const byPayment = new Map(snapshot.payments.map(payment => [payment.paymentId, payment]));
  const paymentCampaigns = new Set(payments.map(payment => payment.campaign_id));
  const exceptions: Array<{ code: string; message: string; campaignId?: string; paymentId?: string }> = [];
  const resolved = new Map<string, { status: string; studentId?: typeof snapshot.students[number]["id"]; studentName?: string }>();
  for (const campaign of campaigns) {
    const canonical = canonicalZeffyUrl(campaign.url);
    const matches = snapshot.students.filter(s => canonical && canonicalZeffyUrl(s.url ?? "") === canonical);
    const mapping = snapshot.mappings.find(m => m.campaignId === campaign.id);
    const conflict = snapshot.mappings.some(m => m.canonicalUrl === canonical && m.campaignId !== campaign.id);
    const valid = canonical && campaign.category === "PeerToPeerCampaign" && campaign.currency.toLowerCase() === "usd" && matches.length === 1 && matches[0].active && matches[0].seasonId === snapshot.activeSeasonId && !conflict && (!mapping || mapping.studentId === matches[0].id && mapping.seasonId === matches[0].seasonId && mapping.canonicalUrl === canonical);
    const status = valid ? "matched" : "review";
    resolved.set(campaign.id, { status, studentId: valid ? matches[0].id : undefined, studentName: valid ? matches[0].name : undefined });
    if (!valid && (matches.length || mapping || paymentCampaigns.has(campaign.id))) exceptions.push({ code: "linkConflict", message: "Campaign has no unique current-season student link or conflicts with saved history.", campaignId: campaign.id });
  }
  const rows = payments.map(payment => {
    const campaign = byId.get(payment.campaign_id); const match = resolved.get(payment.campaign_id); const safety = paymentSafety(payment);
    const oldSeason = !!snapshot.mappings.find(m => m.campaignId === payment.campaign_id && m.seasonId !== snapshot.activeSeasonId);
    const posted = byPayment.get(payment.id);
    const changed = !!posted && (posted.amountCents !== payment.amount || posted.campaignId !== payment.campaign_id);
    const outcome = posted ? safety || changed ? "review" as const : "unchanged" as const : safety === "notSucceeded" ? "unchanged" as const : !campaign || match?.status !== "matched" || safety || oldSeason ? "review" as const : "eligible" as const;
    const message = outcome === "review" ? changed ? "Previously credited payment changed; review manually." : oldSeason ? "Prior-season donation needs review." : safety ? "Payment needs review in Zeffy." : "Campaign link needs review." : safety === "notSucceeded" ? "Payment has not succeeded; no credit will be posted." : undefined;
    if (outcome === "review") exceptions.push({ code: changed ? "paymentChanged" : oldSeason ? "oldSeason" : safety ?? "linkConflict", message: message!, campaignId: payment.campaign_id, paymentId: payment.id });
    return { paymentId: payment.id, studentName: match?.studentName, amountCents: payment.amount, outcome, message };
  });
  return { safeToRun: true, campaigns: campaigns.map(c => ({ campaignId: c.id, url: c.url, title: c.title, studentId: resolved.get(c.id)?.studentId, studentName: resolved.get(c.id)?.studentName, status: resolved.get(c.id)?.status ?? "review" })), paymentCount: payments.length, eligibleCount: rows.filter(r => r.outcome === "eligible").length, reviewCount: rows.filter(r => r.outcome === "review").length, exceptions, rows };
} });

async function sync(ctx: ActionCtx, actorId: Id<"appUsers">): Promise<{ started: boolean; reason?: string }> {
  const runId = await ctx.runMutation(beginRef, { actorId }) as Id<"zeffyRuns"> | null;
  if (!runId) return { started: false, reason: "Zeffy sync is disabled, unconfigured, or already running." };
  const totals = { credited: 0, unchanged: 0, review: 0 };
  try {
    const { campaigns, payments } = await fetchData();
    const snapshot: Snapshot = await ctx.runQuery(snapshotRef, {}) as Snapshot;
    const currentLinks = new Set(snapshot.students.filter(s => s.active && s.seasonId === snapshot.activeSeasonId).map(s => canonicalZeffyUrl(s.url ?? "")).filter((url): url is string => !!url));
    for (const campaign of campaigns) if (currentLinks.has(canonicalZeffyUrl(campaign.url) ?? "")) await ctx.runMutation(captureCampaignRef, { runId, campaign });
    const byId = new Map(campaigns.map(c => [c.id, c]));
    for (const payment of payments) {
      const campaign = byId.get(payment.campaign_id);
      if (!campaign) { await ctx.runMutation(missingRef, { runId, campaignId: payment.campaign_id, paymentId: payment.id }); totals.review++; continue; }
      try {
        const result = await ctx.runMutation(applyRef, { runId, campaign, payment }) as keyof typeof totals;
        totals[result]++;
      } catch {
        await ctx.runMutation(paymentFailureRef, { runId, campaignId: campaign.id, paymentId: payment.id });
        totals.review++;
      }
    }
    await ctx.runMutation(finishRef, { runId, ...totals });
    return { started: true, reason: undefined };
  } catch (error) {
    const message = error instanceof Error && /^Zeffy /.test(error.message) ? error.message : "Zeffy sync failed; Coach review is required.";
    await ctx.runMutation(finishRef, { runId, ...totals, error: message });
    return { started: true, reason: message };
  }
}

async function actorForRun(ctx: ActionCtx): Promise<Id<"appUsers">> { return ctx.runQuery(requireCoachRef, {}) as Promise<Id<"appUsers">>; }

export const run = action({ args: {}, returns: v.object({ started: v.boolean(), reason: v.optional(v.string()) }), handler: async ctx => sync(ctx, await actorForRun(ctx)) });

export const scheduledRun = internalAction({ args: {}, returns: v.null(), handler: async ctx => {
  if (!isZeffySlot(Date.now())) return null;
  const actor = await ctx.runQuery(scheduledActorRef, {}) as Id<"appUsers"> | null;
  if (actor) await sync(ctx, actor);
  return null;
} });
