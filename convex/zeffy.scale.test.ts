/// <reference types="vite/client" />
import { describe, expect, it, vi } from "vitest";
import { makeFunctionReference } from "convex/server";
import { createTest } from "../testUtils";
import schema from "./schema";
import { createFinancialAccount } from "./lib/financialSources";

const modules = import.meta.glob("./**/*.ts");
const run = makeFunctionReference<"action">("zeffyActions:run");
const preview = makeFunctionReference<"action">("zeffyActions:preview");
const campaign = { id: "camp-scale", url: "https://www.zeffy.com/fundraising/scale-page", title: "Synthetic", category: "PeerToPeerCampaign", currency: "usd" };
const newPayment = { id: "pay-new", created: 1_800_000_000, amount: 2500, currency: "usd", status: "succeeded", type: "online", refund_status: "none", campaign_id: campaign.id, campaign_type: "donation_form", campaign_category: "peer_to_peer", items: [{ type: "donation", amount: 2500, currency: "usd" }], refunds: [], dispute: null };

async function fixture(existingPayments: number) {
  const t = createTest(schema, modules);
  const ids = await t.run(async ctx => {
    const auth = await ctx.db.insert("users", { email: "scale-coach@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: auth, email: "scale-coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 1_790_000_000_000, permissionVersion: "DRAFT", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, legalName: "Synthetic Student", preferredName: "Synthetic", email: "student@example.invalid", subteam: "A", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" }, fundraiserUrl: campaign.url });
    await createFinancialAccount(ctx, student, "ready");
    await ctx.db.insert("zeffySettings", { key: "team", enabled: true, actorId: coach, updatedAt: Date.now() });
    const entry = await ctx.db.insert("ledgerEntries", { zeffyPaymentId: "pay-old-0", studentId: student, kind: "fundraiser", amountCents: 100, previousCents: 0, newCents: 100, reason: "Zeffy donation", recordedBy: coach, recordedAt: 1, idempotencyKey: "zeffy:pay-old-0" });
    for (let i = 0; i < existingPayments; i++) await ctx.db.insert("zeffyPayments", { paymentId: `pay-old-${i}`, campaignId: campaign.id, studentId: student, seasonId: season, amountCents: 100, occurredAt: 1, ledgerEntryId: entry, postedAt: 1 });
    return { auth, student };
  });
  return { t, ids };
}

function stubZeffy(pages: Array<{ campaigns: unknown[]; payments: unknown[] }>) {
  vi.stubEnv("ZEFFY_API_KEY", "synthetic-local-key");
  const calls = { campaigns: 0, payments: 0 };
  vi.stubGlobal("fetch", vi.fn(async (input: URL | string) => {
    const url = new URL(input.toString()); const kind = url.pathname.endsWith("/campaigns") ? "campaigns" : "payments";
    const index = calls[kind]++; const page = pages[Math.min(index, pages.length - 1)];
    return { ok: true, json: async () => ({ object: "list", data: page[kind], has_more: index < pages.length - 1, next_cursor: index < pages.length - 1 ? `cursor-${kind}-${index}` : null }) };
  }));
}

async function lastRun(t: ReturnType<typeof createTest>) {
  return t.run(async ctx => ({ run: (await ctx.db.query("zeffyRuns").order("desc").first()), settings: await ctx.db.query("zeffySettings").withIndex("by_key", q => q.eq("key", "team")).unique() }));
}

describe("Zeffy check with a long payment history", () => {
  it("still completes and credits a new donation when more than 5000 payments are already recorded", async () => {
    const f = await fixture(5001);
    stubZeffy([{ campaigns: [campaign], payments: [newPayment] }]);
    try {
      expect(await f.t.withIdentity({ subject: `${f.ids.auth}|session` }).action(run, {})).toEqual({ started: true, reason: undefined });
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
    const state = await lastRun(f.t);
    expect(state.run).toMatchObject({ state: "complete", credited: 1 });
    expect(state.settings).toMatchObject({ lastRunStatus: "complete" });
    expect(state.settings?.runningRunId).toBeUndefined();
    expect(await f.t.run(ctx => ctx.db.query("zeffyPayments").withIndex("by_paymentId", q => q.eq("paymentId", "pay-new")).unique())).toMatchObject({ amountCents: 2500 });
  });

  it("previews against a long history and marks already-recorded payments unchanged", async () => {
    const f = await fixture(5001);
    stubZeffy([{ campaigns: [campaign], payments: [{ ...newPayment, id: "pay-old-4999", amount: 100, items: [{ type: "donation", amount: 100, currency: "usd" }] }, newPayment] }]);
    try {
      const result = await f.t.withIdentity({ subject: `${f.ids.auth}|session` }).action(preview, {});
      expect(result.rows.map((r: { outcome: string }) => r.outcome)).toEqual(["unchanged", "eligible"]);
    } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
  });

  it("ends as failed, never complete, when Zeffy has more records than one check can read", async () => {
    const f = await fixture(0);
    const many = Array.from({ length: 100 }, (_, i) => ({ ...newPayment, id: `pay-cap-${i}` }));
    vi.stubEnv("ZEFFY_API_KEY", "synthetic-local-key");
    // Endless pages of 100 payments: the item limit is reached while Zeffy still reports more.
    const fetchMock = vi.fn(async (input: URL | string) => {
      const url = new URL(input.toString());
      if (url.pathname.endsWith("/campaigns")) return { ok: true, json: async () => ({ object: "list", data: [campaign], has_more: false, next_cursor: null }) };
      const n = Number(url.searchParams.get("starting_after")?.split("-")[1] ?? -1) + 1;
      return { ok: true, json: async () => ({ object: "list", data: many.map(p => ({ ...p, id: `${p.id}-${n}` })), has_more: true, next_cursor: `c-${n}` }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    let outcome;
    try { outcome = await f.t.withIdentity({ subject: `${f.ids.auth}|session` }).action(run, {}); } finally { vi.unstubAllGlobals(); vi.unstubAllEnvs(); }
    expect(outcome).toMatchObject({ started: true, reason: "Zeffy has more records than one check can handle. Nothing was added. Ask whoever manages the app for help." });
    const state = await lastRun(f.t);
    expect(state.run).toMatchObject({ state: "failed", credited: 0 });
    expect(state.settings).toMatchObject({ lastRunStatus: "failed" });
    expect(state.settings?.runningRunId).toBeUndefined();
    expect(await f.t.run(ctx => ctx.db.query("zeffyPayments").take(1))).toHaveLength(0);
  });
});
