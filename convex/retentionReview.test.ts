/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";
import { fiveCalendarYearsAfter } from "./lib/retention";
import { checkHydrationCount } from "./retentionReview";

const modules = import.meta.glob("./**/*.ts");
const page = { cursor: null, numItems: 1 };
const archive = Date.UTC(2020, 1, 29, 12);

async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const coachAuth = await ctx.db.insert("users", { email: "coach@example.invalid" });
    const mentorAuth = await ctx.db.insert("users", { email: "mentor@example.invalid" });
    const studentAuth = await ctx.db.insert("users", { email: "student@example.invalid" });
    const coach = await ctx.db.insert("appUsers", { authUserId: coachAuth, email: "coach@example.invalid", name: "Coach", role: "coach", active: true, travelLead: false, financialEdit: false });
    const mentor = await ctx.db.insert("appUsers", { authUserId: mentorAuth, email: "mentor@example.invalid", name: "Mentor", role: "mentor", active: true, travelLead: true, financialEdit: true });
    const linked = await ctx.db.insert("appUsers", { authUserId: studentAuth, email: "student@example.invalid", name: "Student login", role: "student", active: false, archivedAt: archive, travelLead: false, financialEdit: false });
    const season = await ctx.db.insert("seasons", { name: "Synthetic season", year: 2020, status: "archived", startsAt: 0, permissionVersion: "draft", createdBy: coach });
    const student = await ctx.db.insert("students", { seasonId: season, userId: linked, legalName: "Synthetic Student", preferredName: "Synthetic", email: "student@example.invalid", subteam: "A", active: false, archivedAt: archive, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" }, medications: { state: "unknown" } });
    return { coachAuth, mentorAuth, coach, mentor, student, linked };
  });
  return { t, ids, coach: t.withIdentity({ subject: `${ids.coachAuth}|session` }), mentor: t.withIdentity({ subject: `${ids.mentorAuth}|session` }) };
}

describe("retention review", () => {
  it("uses five calendar years and waits until Mar 1 for a Feb 29 archive", () => {
    expect(fiveCalendarYearsAfter(archive)).toBe(Date.UTC(2025, 2, 1, 12));
  });

  it("enforces Coach access, native pagination, and minimizes candidate projection", async () => {
    const f = await fixture();
    await expect(f.mentor.query(api.retentionReview.students, { paginationOpts: page, asOf: Date.UTC(2026, 0, 1) })).rejects.toThrow("permission");
    await expect(f.mentor.mutation(api.retentionReview.setHold, { subject: { kind: "student", id: f.ids.student }, expectedArchiveFingerprint: "bad", expectedLatestHoldEventId: null, action: "hold", reason: "Review" })).rejects.toThrow("permission");
    const list = await f.coach.query(api.retentionReview.students, { paginationOpts: page, asOf: Date.UTC(2025, 1, 28) });
    expect(list.page).toHaveLength(1);
    expect(list.page[0]).toMatchObject({ label: "Synthetic Student", status: "waiting", held: false });
    expect(list.page[0]).not.toHaveProperty("email");
    expect(list.page[0]).not.toHaveProperty("allergies");
    expect(list.page[0]).not.toHaveProperty("guardianName");
    const later = await f.coach.query(api.retentionReview.students, { paginationOpts: page, asOf: Date.UTC(2025, 2, 1, 12) });
    expect(later.page[0].status).toBe("review");
    const preview = await f.coach.query(api.retentionReview.preview, { subject: { kind: "student", id: f.ids.student }, asOf: Date.UTC(2026, 0, 1) });
    expect(preview).toMatchObject({ deletionEnabled: false, coverage: "unresolved", backupsAndExports: "unresolved" });
    expect(preview.affectedRecordClasses).toContain("Financial sources, charges, allocations and audit evidence");
  });

  it("keeps append-only hold/release evidence and rejects repeated or stale actions", async () => {
    const f = await fixture();
    const subject = { kind: "student" as const, id: f.ids.student };
    const before = await f.coach.query(api.retentionReview.preview, { subject, asOf: Date.UTC(2026, 0, 1) });
    const fingerprint = before.candidate.archiveFingerprint!;
    await expect(f.coach.mutation(api.retentionReview.setHold, { subject, expectedArchiveFingerprint: fingerprint, expectedLatestHoldEventId: null, action: "hold", reason: "   " })).rejects.toThrow("reason");
    const hold = await f.coach.mutation(api.retentionReview.setHold, { subject, expectedArchiveFingerprint: fingerprint, expectedLatestHoldEventId: null, action: "hold", reason: " Preserve pending evidence " });
    await expect(f.coach.mutation(api.retentionReview.setHold, { subject, expectedArchiveFingerprint: fingerprint, expectedLatestHoldEventId: null, action: "release", reason: "Stale tab" })).rejects.toThrow("Hold decisions for this record changed");
    await expect(f.coach.mutation(api.retentionReview.setHold, { subject, expectedArchiveFingerprint: fingerprint, expectedLatestHoldEventId: hold, action: "hold", reason: "Repeat" })).rejects.toThrow("already on hold");
    const released = await f.coach.mutation(api.retentionReview.setHold, { subject, expectedArchiveFingerprint: fingerprint, expectedLatestHoldEventId: hold, action: "release", reason: "Review complete" });
    const history = await f.coach.query(api.retentionReview.history, { subject, paginationOpts: { cursor: null, numItems: 10 } });
    expect(history.page.map(event => event.id)).toEqual([released, hold]);
    expect(history.page.map(event => event.action)).toEqual(["release", "hold"]);
    expect(history.page[1]).toMatchObject({ reason: "Preserve pending evidence", actorName: "Coach" });
    expect(await f.t.run(ctx => ctx.db.get(hold))).toMatchObject({ action: "hold", reason: "Preserve pending evidence" });
    await expect(f.coach.mutation(api.retentionReview.setHold, { subject, expectedArchiveFingerprint: fingerprint, expectedLatestHoldEventId: released, action: "release", reason: "Repeat" })).rejects.toThrow("is not on hold");
  });

  it("invalidates old student and linked-account archive instances after reactivation and rearchive", async () => {
    const f = await fixture();
    const subject = { kind: "student" as const, id: f.ids.student };
    const initial = (await f.coach.query(api.retentionReview.preview, { subject, asOf: Date.UTC(2026, 0, 1) })).candidate;
    const hold = await f.coach.mutation(api.retentionReview.setHold, { subject, expectedArchiveFingerprint: initial.archiveFingerprint!, expectedLatestHoldEventId: null, action: "hold", reason: "Original hold" });
    await f.t.run(ctx => ctx.db.patch(f.ids.linked, { active: true }));
    const reactivated = (await f.coach.query(api.retentionReview.preview, { subject, asOf: Date.UTC(2026, 0, 1) })).candidate;
    expect(reactivated.status).toBe("linkedAccountActive");
    expect(reactivated.held).toBe(true);
    await expect(f.coach.mutation(api.retentionReview.setHold, { subject, expectedArchiveFingerprint: initial.archiveFingerprint!, expectedLatestHoldEventId: null, action: "hold", reason: "Stale" })).rejects.toThrow("This record changed since you opened it");
    await f.t.run(ctx => ctx.db.patch(f.ids.linked, { active: false, archivedAt: Date.UTC(2024, 0, 1) }));
    const rearchived = (await f.coach.query(api.retentionReview.preview, { subject, asOf: Date.UTC(2026, 0, 1) })).candidate;
    expect(rearchived.held).toBe(true);
    expect(rearchived.latestRelevantArchiveAt).toBe(Date.UTC(2024, 0, 1));
    expect(rearchived.reviewAfter).toBe(Date.UTC(2029, 0, 1));
    await f.t.run(ctx => ctx.db.patch(f.ids.student, { active: true }));
    const active = (await f.coach.query(api.retentionReview.preview, { subject, asOf: Date.UTC(2026, 0, 1) })).candidate;
    expect(active).toMatchObject({ status: "active", held: true, latestHoldEventId: hold, reviewAfter: null });
    expect(active.archiveFingerprint).not.toBe(rearchived.archiveFingerprint);
    await expect(f.coach.mutation(api.retentionReview.setHold, { subject, expectedArchiveFingerprint: rearchived.archiveFingerprint!, expectedLatestHoldEventId: hold, action: "release", reason: "Stale before reactivation" })).rejects.toThrow("This record changed since you opened it");
    await f.coach.mutation(api.retentionReview.setHold, { subject, expectedArchiveFingerprint: active.archiveFingerprint!, expectedLatestHoldEventId: hold, action: "release", reason: "Explicit release after reactivation" });
  });

  it("reviews inactive application accounts and preserves old hold history across rearchive", async () => {
    const f = await fixture();
    const subject = { kind: "account" as const, id: f.ids.linked };
    const result = await f.coach.query(api.retentionReview.accounts, { paginationOpts: page, asOf: Date.UTC(2026, 0, 1) });
    expect(result.page[0]).toMatchObject({ kind: "account", role: "student", status: "review" });
    const initial = (await f.coach.query(api.retentionReview.preview, { subject, asOf: Date.UTC(2026, 0, 1) })).candidate;
    const hold = await f.coach.mutation(api.retentionReview.setHold, { subject, expectedArchiveFingerprint: initial.archiveFingerprint!, expectedLatestHoldEventId: null, action: "hold", reason: "Legal review" });
    await f.t.run(ctx => ctx.db.patch(f.ids.linked, { active: true }));
    const active = (await f.coach.query(api.retentionReview.preview, { subject, asOf: Date.UTC(2026, 0, 1) })).candidate;
    expect(active).toMatchObject({ status: "active", held: true, reviewAfter: null });
    expect(active.archiveFingerprint).not.toBe(initial.archiveFingerprint);
    await expect(f.coach.mutation(api.retentionReview.setHold, { subject, expectedArchiveFingerprint: initial.archiveFingerprint!, expectedLatestHoldEventId: hold, action: "release", reason: "Stale active release" })).rejects.toThrow("This record changed since you opened it");
    await f.t.run(ctx => ctx.db.patch(f.ids.linked, { active: false, archivedAt: Date.UTC(2025, 0, 1) }));
    const next = (await f.coach.query(api.retentionReview.preview, { subject, asOf: Date.UTC(2026, 0, 1) })).candidate;
    expect(next.held).toBe(true);
    expect(next.reviewAfter).toBe(Date.UTC(2030, 0, 1));
    const history = await f.coach.query(api.retentionReview.history, { subject, paginationOpts: { cursor: null, numItems: 10 } });
    expect(history.page).toHaveLength(1);
    expect(history.page[0]).toMatchObject({ action: "hold", archivedAt: archive });
    await expect(f.coach.mutation(api.retentionReview.setHold, { subject, expectedArchiveFingerprint: next.archiveFingerprint!, expectedLatestHoldEventId: hold, action: "hold", reason: "Duplicate after rearchive" })).rejects.toThrow("already on hold");
    const release = await f.coach.mutation(api.retentionReview.setHold, { subject, expectedArchiveFingerprint: next.archiveFingerprint!, expectedLatestHoldEventId: hold, action: "release", reason: "Explicitly release prior hold" });
    const after = await f.coach.query(api.retentionReview.history, { subject, paginationOpts: { cursor: null, numItems: 10 } });
    expect(after.page.map(event => event.id)).toEqual([release, hold]);
  });

  it("includes adult accounts, rejects missing archive dates, and resets a changed student archive timestamp", async () => {
    const f = await fixture();
    await f.t.run(ctx => ctx.db.patch(f.ids.mentor, { active: false, archivedAt: archive }));
    const account = { kind: "account" as const, id: f.ids.mentor };
    const firstPage = await f.coach.query(api.retentionReview.accounts, { paginationOpts: page, asOf: Date.UTC(2026, 0, 1) });
    expect(firstPage).toMatchObject({ isDone: false });
    expect(firstPage.page[0].id).toBe(f.ids.mentor);
    const secondPage = await f.coach.query(api.retentionReview.accounts, { paginationOpts: { cursor: firstPage.continueCursor, numItems: 1 }, asOf: Date.UTC(2026, 0, 1) });
    expect(secondPage.page[0].id).toBe(f.ids.linked);
    const accountPreview = await f.coach.query(api.retentionReview.preview, { subject: account, asOf: Date.UTC(2026, 0, 1) });
    expect(accountPreview.candidate).toMatchObject({ role: "mentor", status: "review" });
    await f.coach.mutation(api.retentionReview.setHold, { subject: account, expectedArchiveFingerprint: accountPreview.candidate.archiveFingerprint!, expectedLatestHoldEventId: null, action: "hold", reason: "Adult evidence" });
    await expect(f.mentor.query(api.retentionReview.accounts, { paginationOpts: page, asOf: Date.UTC(2026, 0, 1) })).rejects.toThrow("inactive");

    const student = { kind: "student" as const, id: f.ids.student };
    const initial = (await f.coach.query(api.retentionReview.preview, { subject: student, asOf: Date.UTC(2026, 0, 1) })).candidate;
    await f.t.run(ctx => ctx.db.patch(f.ids.student, { archivedAt: Date.UTC(2023, 0, 1) }));
    const changed = (await f.coach.query(api.retentionReview.preview, { subject: student, asOf: Date.UTC(2026, 0, 1) })).candidate;
    expect(changed.reviewAfter).toBe(Date.UTC(2028, 0, 1));
    await expect(f.coach.mutation(api.retentionReview.setHold, { subject: student, expectedArchiveFingerprint: initial.archiveFingerprint!, expectedLatestHoldEventId: null, action: "hold", reason: "Stale date" })).rejects.toThrow("This record changed since you opened it");
    await f.t.run(ctx => ctx.db.patch(f.ids.student, { archivedAt: undefined }));
    const missing = (await f.coach.query(api.retentionReview.preview, { subject: student, asOf: Date.UTC(2026, 0, 1) })).candidate;
    expect(missing).toMatchObject({ status: "archiveDateMissing", reviewAfter: null });
    await expect(f.coach.mutation(api.retentionReview.setHold, { subject: student, expectedArchiveFingerprint: changed.archiveFingerprint!, expectedLatestHoldEventId: null, action: "hold", reason: "No date" })).rejects.toThrow("no archive date");
  });

  it("rejects invalid review times and changed linked-account identity with the same archive values", async () => {
    const f = await fixture();
    const subject = { kind: "student" as const, id: f.ids.student };
    await expect(f.coach.query(api.retentionReview.students, { paginationOpts: page, asOf: -1 })).rejects.toThrow("Record review could not load");
    await expect(f.coach.query(api.retentionReview.preview, { subject, asOf: 1.5 })).rejects.toThrow("Record review could not load");
    const before = (await f.coach.query(api.retentionReview.preview, { subject, asOf: Date.UTC(2026, 0, 1) })).candidate;
    const replacement = await f.t.run(ctx => ctx.db.insert("appUsers", { authUserId: f.ids.mentorAuth, email: "replacement@example.invalid", name: "Replacement login", role: "student", active: false, archivedAt: archive, travelLead: false, financialEdit: false }));
    await f.t.run(ctx => ctx.db.patch(f.ids.student, { userId: replacement }));
    const after = (await f.coach.query(api.retentionReview.preview, { subject, asOf: Date.UTC(2026, 0, 1) })).candidate;
    expect(after.archiveFingerprint).not.toBe(before.archiveFingerprint);
    await expect(f.coach.mutation(api.retentionReview.setHold, { subject, expectedArchiveFingerprint: before.archiveFingerprint!, expectedLatestHoldEventId: null, action: "hold", reason: "Old linked account" })).rejects.toThrow("This record changed since you opened it");
  });

  it("caps expanded native account pages before hydration", async () => {
    const f = await fixture();
    await f.t.run(async ctx => {
      for (let index = 0; index < 55; index++) await ctx.db.insert("appUsers", { authUserId: f.ids.mentorAuth, email: `archived-${index}@example.invalid`, name: `Archived adult ${index}`, role: "mentor", active: false, archivedAt: archive + index, travelLead: false, financialEdit: false });
    });
    const first = await f.coach.query(api.retentionReview.accounts, { paginationOpts: { cursor: null, numItems: 50 }, asOf: Date.UTC(2026, 0, 1) });
    expect(first.page).toHaveLength(50);
    expect(first.isDone).toBe(false);
    const expanded = await f.coach.query(api.retentionReview.accounts, { paginationOpts: { cursor: null, endCursor: first.continueCursor, numItems: 1, maximumRowsRead: 1000 }, asOf: Date.UTC(2026, 0, 1) });
    expect(expanded.page).toHaveLength(50);
    expect(expanded.pageStatus).toBe("SplitRecommended");
    expect(expanded.splitCursor).toBeTypeOf("string");
    expect(() => checkHydrationCount(50)).not.toThrow();
    expect(() => checkHydrationCount(51)).toThrow("Too many records to show at once");
  });

  it("rejects malformed native row budgets before clamping", async () => {
    const f = await fixture();
    const subject = { kind: "student" as const, id: f.ids.student };
    for (const maximumRowsRead of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(f.coach.query(api.retentionReview.students, { paginationOpts: { cursor: null, numItems: 1, maximumRowsRead }, asOf: Date.UTC(2026, 0, 1) })).rejects.toThrow("Record review could not load");
      await expect(f.coach.query(api.retentionReview.accounts, { paginationOpts: { cursor: null, numItems: 1, maximumRowsRead }, asOf: Date.UTC(2026, 0, 1) })).rejects.toThrow("Record review could not load");
      await expect(f.coach.query(api.retentionReview.history, { subject, paginationOpts: { cursor: null, numItems: 1, maximumRowsRead } })).rejects.toThrow("Record review could not load");
    }
    await expect(f.coach.query(api.retentionReview.students, { paginationOpts: { cursor: null, numItems: 1, maximumRowsRead: Number.NaN }, asOf: Date.UTC(2026, 0, 1) })).rejects.toThrow();
  });
});

