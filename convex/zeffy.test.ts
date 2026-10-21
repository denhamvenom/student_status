/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import schema from "./schema";
import { canonicalZeffyUrl, isZeffySlot, paymentSafety } from "./lib/zeffy";
import { createFinancialAccount } from "./lib/financialSources";

const modules = import.meta.glob("./**/*.ts");
const apply = makeFunctionReference<"mutation">("zeffy:applyPayment");
const status = makeFunctionReference<"query">("zeffy:status");
const createCharge = makeFunctionReference<"mutation">("finance:createCharge");
const expire = makeFunctionReference<"mutation">("zeffy:expire");
const setEnabled = makeFunctionReference<"mutation">("zeffy:setEnabled");
const captureCampaign = makeFunctionReference<"mutation">("zeffy:captureCampaign");
const run = makeFunctionReference<"action">("zeffyActions:run");
const campaign = { id: "camp-synthetic", url: "https://www.zeffy.com/fundraising/synthetic-page", title: "Synthetic", category: "PeerToPeerCampaign", currency: "usd" };
const payment = { id: "pay-synthetic", created: 1_800_000_000, amount: 2500, currency: "usd", status: "succeeded", type: "online", refund_status: "none", refund_count: 0, has_dispute: false, campaign_id: campaign.id, campaign_type: "donation_form", campaign_category: "peer_to_peer", items: [{ type: "donation", amount: 2500, currency: "usd" }] };

async function fixture() {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "zeffy-coach@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "zeffy-coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const studentAuth = await ctx.db.insert("users", { email: "zeffy-student@example.invalid" });
    await ctx.db.insert("appUsers", { authUserId: studentAuth, email: "zeffy-student@example.invalid", name: "Student", role: "student", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 1_790_000_000_000, permissionVersion: "DRAFT", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Synthetic Student", preferredName: "Synthetic", email: "student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" }, fundraiserUrl: "https://www.zeffy.com/en-US/fundraising/synthetic-page?noFundraise=True" });
    await createFinancialAccount(ctx, student, "ready");
    await ctx.db.insert("zeffySettings", { key: "team", enabled: true, actorId: coach, updatedAt: Date.now() });
    const run = await ctx.db.insert("zeffyRuns", { actorId: coach, state: "running", startedAt: Date.now(), credited: 0, unchanged: 0, review: 0 });
    const settings = await ctx.db.query("zeffySettings").withIndex("by_key", q => q.eq("key", "team")).unique(); if (!settings) throw new Error("Missing settings");
    await ctx.db.patch(settings._id, { runningRunId: run });
    return { auth, studentAuth, coach, student, season, run };
  });
  return { t, ids };
}

describe("Zeffy donation safety", () => {
  it("normalizes saved locale/tracking links and gates Chicago DST slots", () => {
    expect(canonicalZeffyUrl("https://www.zeffy.com/en-US/fundraising/synthetic-page?noFundraise=True")).toBe(campaign.url);
    expect(canonicalZeffyUrl("https://evil.test/fundraising/synthetic-page")).toBeNull();
    expect(isZeffySlot(Date.UTC(2026, 0, 15, 13))).toBe(true);
    expect(isZeffySlot(Date.UTC(2026, 6, 15, 12))).toBe(true);
    expect(isZeffySlot(Date.UTC(2026, 0, 15, 12))).toBe(false);
  });

  it("ignores unsettled payments and routes refunds or disputes to review", () => {
    expect(paymentSafety({ ...payment, status: "pending" })).toBe("notSucceeded");
    expect(paymentSafety({ ...payment, status: "failed" })).toBe("notSucceeded");
    expect(paymentSafety({ ...payment, has_dispute: true })).toBe("refundOrDispute");
    expect(paymentSafety({ ...payment, refund_count: 1 })).toBe("refundOrDispute");
  });

  it.each([1000, 2500])("credits exactly once against %i cents due and conserves source cents", async due => {
    const f = await fixture();
    const chargeId = await f.t.withIdentity({ subject: `${f.ids.auth}|session` }).mutation(createCharge, { studentId: f.ids.student, label: "Synthetic travel", amountCents: due, priority: 1, idempotencyKey: `synthetic-charge-${due}` });
    if (!chargeId) throw new Error("Charge was not created");
    expect(await f.t.mutation(apply, { runId: f.ids.run, campaign, payment })).toBe("credited");
    expect(await f.t.mutation(apply, { runId: f.ids.run, campaign, payment })).toBe("unchanged");
    const data = await f.t.run(async ctx => ({ entries: await ctx.db.query("ledgerEntries").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", "zeffy:pay-synthetic")).take(2), account: await ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", f.ids.student)).unique(), charge: await ctx.db.get(chargeId) }));
    expect(data.entries).toHaveLength(1);
    expect(data.account).toMatchObject({ travelShareCents: 2500, knownRaisedCents: 2500, unknownGrossSourceCount: 0 });
    expect(data.charge).toMatchObject({ appliedCents: due, outstanding: false });
    expect(data.account?.fundraisingAppliedCents).toBe(due);
    expect(data.account?.fundraisingAvailableCents).toBe(2500 - due);
    expect((data.account?.fundraisingAvailableCents ?? 0) + (data.account?.fundraisingAppliedCents ?? 0)).toBe(2500);
    expect(await f.t.mutation(apply, { runId: f.ids.run, campaign, payment: { ...payment, refund_status: "partial" } })).toBe("review");
    expect(await f.t.run(ctx => ctx.db.query("zeffyExceptions").withIndex("by_key", q => q.eq("key", "payment:pay-synthetic")).unique())).toMatchObject({ code: "refundOrDispute" });
  });

  it("holds duplicate or changed links, allows current-campaign preseason donations, and denies student status access", async () => {
    const f = await fixture();
    const second = await f.t.run(ctx => ctx.db.insert("students", { seasonId: f.ids.season, legalName: "Second Synthetic", preferredName: "Second", email: "second@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" }, fundraiserUrl: campaign.url }));
    expect(await f.t.mutation(apply, { runId: f.ids.run, campaign, payment })).toBe("review");
    await f.t.run(ctx => ctx.db.patch(second, { fundraiserUrl: undefined }));
    expect(await f.t.mutation(apply, { runId: f.ids.run, campaign, payment })).toBe("credited");
    await f.t.run(ctx => ctx.db.patch(f.ids.student, { fundraiserUrl: "https://www.zeffy.com/fundraising/another-page" }));
    expect(await f.t.mutation(apply, { runId: f.ids.run, campaign, payment: { ...payment, id: "late-new" } })).toBe("review");
    await f.t.run(ctx => ctx.db.patch(f.ids.student, { fundraiserUrl: campaign.url }));
    expect(await f.t.mutation(apply, { runId: f.ids.run, campaign, payment: { ...payment, id: "pre-season", created: 1_780_000_000 } })).toBe("credited");
    await expect(f.t.withIdentity({ subject: `${f.ids.studentAuth}|session` }).query(status, {})).rejects.toThrow();
  });

  it("preserves a prior-season campaign assignment and holds late donations for review", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      const priorSeason = await ctx.db.insert("seasons", { name: "Earlier Synthetic", year: 2025, status: "archived", startsAt: 1_700_000_000_000, permissionVersion: "DRAFT", createdBy: f.ids.coach });
      const priorStudent = await ctx.db.insert("students", { seasonId: priorSeason, legalName: "Earlier Synthetic", preferredName: "Earlier", email: "earlier@example.invalid", subteam: "A", active: false, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
      await ctx.db.insert("zeffyCampaignMappings", { campaignId: campaign.id, canonicalUrl: campaign.url, studentId: priorStudent, seasonId: priorSeason, linkRevision: 1, firstSeenAt: 1_750_000_000_000, lastSeenAt: 1_750_000_000_000 });
    });
    expect(await f.t.mutation(apply, { runId: f.ids.run, campaign, payment })).toBe("review");
    expect(await f.t.run(ctx => ctx.db.query("zeffyPayments").withIndex("by_paymentId", q => q.eq("paymentId", payment.id)).unique())).toBeNull();
  });

  it("records page ownership before any donation and preserves it after a link change", async () => {
    const f = await fixture();
    await f.t.mutation(captureCampaign, { runId: f.ids.run, campaign });
    expect(await f.t.run(ctx => ctx.db.query("zeffyCampaignMappings").withIndex("by_campaignId", q => q.eq("campaignId", campaign.id)).unique())).toMatchObject({ studentId: f.ids.student, seasonId: f.ids.season });
    await f.t.run(ctx => ctx.db.patch(f.ids.student, { fundraiserUrl: "https://www.zeffy.com/fundraising/changed" }));
    expect(await f.t.mutation(apply, { runId: f.ids.run, campaign, payment })).toBe("review");
    expect(await f.t.run(ctx => ctx.db.query("zeffyPayments").withIndex("by_paymentId", q => q.eq("paymentId", payment.id)).unique())).toBeNull();
  });

  it("expires an interrupted run and requires a Coach for the explicit enable setting", async () => {
    const f = await fixture();
    await expect(f.t.withIdentity({ subject: `${f.ids.studentAuth}|session` }).mutation(setEnabled, { enabled: false, reason: "Synthetic access check" })).rejects.toThrow();
    await f.t.mutation(expire, { runId: f.ids.run });
    const state = await f.t.withIdentity({ subject: `${f.ids.auth}|session` }).query(status, {});
    expect(state).toMatchObject({ running: false, lastRunStatus: "failed", lastError: "Zeffy sync was interrupted; use Check now to retry." });
    await f.t.withIdentity({ subject: `${f.ids.auth}|session` }).mutation(setEnabled, { enabled: false, reason: "Synthetic disable check" });
    expect((await f.t.withIdentity({ subject: `${f.ids.auth}|session` }).query(status, {})).enabled).toBe(false);
  });

  it("rolls back a failed payment and continues to a later student's valid donation", async () => {
    const f = await fixture();
    const secondCampaign = { ...campaign, id: "camp-second", url: "https://www.zeffy.com/fundraising/second-synthetic" };
    const secondPayment = { ...payment, id: "pay-second", campaign_id: secondCampaign.id };
    const secondStudent = await f.t.run(async ctx => {
      const id = await ctx.db.insert("students", { seasonId: f.ids.season, legalName: "Second Synthetic", preferredName: "Second", email: "second@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" }, fundraiserUrl: secondCampaign.url });
      await createFinancialAccount(ctx, id, "ready");
      const firstAccount = await ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", f.ids.student)).unique();
      if (!firstAccount) throw new Error("Missing first account");
      await ctx.db.patch(firstAccount._id, { knownRaisedCents: Number.MAX_SAFE_INTEGER });
      return id;
    });
    await f.t.mutation(expire, { runId: f.ids.run });
    vi.stubEnv("ZEFFY_API_KEY", "synthetic-local-key");
    vi.stubGlobal("fetch", vi.fn(async (input: URL | string) => {
      const kind = new URL(input.toString()).pathname.endsWith("/campaigns") ? "campaigns" : "payments";
      return { ok: true, json: async () => ({ object: "list", data: kind === "campaigns" ? [campaign, secondCampaign] : [payment, secondPayment].map(p => ({ ...p, refunds: [], dispute: null })), has_more: false, next_cursor: null }) };
    }));
    try {
      expect(await f.t.withIdentity({ subject: `${f.ids.auth}|session` }).action(run, {})).toMatchObject({ started: true });
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
    const result = await f.t.run(async ctx => ({ first: await ctx.db.query("zeffyPayments").withIndex("by_paymentId", q => q.eq("paymentId", payment.id)).unique(), second: await ctx.db.query("zeffyPayments").withIndex("by_paymentId", q => q.eq("paymentId", secondPayment.id)).unique(), firstLedger: await ctx.db.query("ledgerEntries").withIndex("by_idempotencyKey", q => q.eq("idempotencyKey", `zeffy:${payment.id}`)).unique(), exception: await ctx.db.query("zeffyExceptions").withIndex("by_key", q => q.eq("key", `payment:${payment.id}`)).unique(), secondAccount: await ctx.db.query("financialAccounts").withIndex("by_studentId", q => q.eq("studentId", secondStudent)).unique() }));
    expect(result.first).toBeNull();
    expect(result.firstLedger).toBeNull();
    expect(result.exception).toMatchObject({ code: "processingFailed" });
    expect(result.second).toMatchObject({ studentId: secondStudent, amountCents: 2500 });
    expect(result.secondAccount).toMatchObject({ travelShareCents: 2500, knownRaisedCents: 2500 });
  });
});
