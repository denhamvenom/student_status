/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");
const url = "https://www.zeffy.com/en-US/fundraising/synthetic?ref=student";
async function fixture() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async ctx => {
    const users = await Promise.all((["coach", "mentor", "student", "parent"] as const).map(async role => {
      const auth = await ctx.db.insert("users", { email: `${role}@example.invalid` });
      const app = await ctx.db.insert("appUsers", { authUserId: auth, name: role, email: `${role}@example.invalid`, role, active: true, travelLead: role === "mentor", financialEdit: role === "mentor" });
      return { auth, app };
    }));
    const [coach, mentor, student, parent] = users;
    const season = await ctx.db.insert("seasons", { name: "Synthetic", year: 2026, status: "active", startsAt: 0, permissionVersion: "draft", createdBy: coach.app });
    const oldSeason = await ctx.db.insert("seasons", { name: "Old", year: 2025, status: "archived", startsAt: 0, permissionVersion: "draft", createdBy: coach.app });
    const fields = { seasonId: season, legalName: "Synthetic Student", preferredName: "Synthetic", email: "student@example.invalid", subteam: "Build", active: true, travelTeam: false, roomCategoryLocked: false, allergies: { state: "unknown" as const }, medications: { state: "unknown" as const }, profileRevision: 5 };
    const own = await ctx.db.insert("students", { ...fields, userId: student.app });
    const other = await ctx.db.insert("students", fields);
    const archived = await ctx.db.insert("students", { ...fields, active: false });
    const historic = await ctx.db.insert("students", { ...fields, seasonId: oldSeason });
    const link = await ctx.db.insert("familyLinks", { parentUserId: parent.app, studentId: own, seasonId: season, active: true, createdBy: coach.app });
    return { coach, mentor, student, parent, own, other, archived, historic, link };
  });
  const as = (user: typeof ids.coach) => t.withIdentity({ subject: `${user.auth}|session` });
  return { t, ids, coach: as(ids.coach), mentor: as(ids.mentor), student: as(ids.student), parent: as(ids.parent) };
}

describe("individual fundraiser links", () => {
  it("sets, updates and clears a shared family link without profile or financial effects", async () => {
    const f = await fixture();
    expect(await f.student.query(api.fundraiserLinks.forStudent, { studentId: f.ids.own })).toBeNull();
    const before = await f.t.run(ctx => ctx.db.get(f.ids.own));
    expect(await f.coach.mutation(api.fundraiserLinks.save, { studentId: f.ids.own, url, expectedRevision: 0 })).toEqual({ revision: 1 });
    for (const client of [f.student, f.parent]) expect(await client.query(api.fundraiserLinks.forStudent, { studentId: f.ids.own })).toBe(url);
    await expect(f.coach.mutation(api.fundraiserLinks.save, { studentId: f.ids.own, url: "", expectedRevision: 0 })).rejects.toThrow("changed");
    await f.coach.mutation(api.fundraiserLinks.save, { studentId: f.ids.own, url: " https://zeffy.com/another ", expectedRevision: 1 });
    await f.coach.mutation(api.fundraiserLinks.save, { studentId: f.ids.own, url: " ", expectedRevision: 2 });
    expect(await f.parent.query(api.fundraiserLinks.forStudent, { studentId: f.ids.own })).toBeNull();
    expect(await f.t.run(ctx => ctx.db.get(f.ids.own))).toEqual({ ...before, fundraiserLinkRevision: 3 });
    expect(await f.t.run(ctx => ctx.db.query("ledgerEntries").take(1))).toEqual([]);
    expect(await f.t.run(ctx => ctx.db.query("charges").take(1))).toEqual([]);
    const audit = await f.t.run(ctx => ctx.db.query("audit").take(10));
    expect(JSON.stringify(audit)).not.toContain("ref=student");
  });

  it("denies unrelated students, revoked parents, non-Coach editors and inactive users", async () => {
    const f = await fixture();
    for (const client of [f.parent, f.student]) await expect(client.query(api.fundraiserLinks.forStudent, { studentId: f.ids.other })).rejects.toThrow("permission");
    for (const client of [f.t, f.student, f.parent, f.mentor]) {
      await expect(client.mutation(api.fundraiserLinks.save, { studentId: f.ids.own, url, expectedRevision: 0 })).rejects.toThrow();
      await expect(client.query(api.fundraiserLinks.list, { paginationOpts: { cursor: null, numItems: 20 } })).rejects.toThrow();
    }
    await expect(f.mentor.query(api.fundraiserLinks.forStudent, { studentId: f.ids.own })).rejects.toThrow("permission");
    await f.t.run(ctx => ctx.db.patch(f.ids.link, { active: false }));
    await expect(f.parent.query(api.fundraiserLinks.forStudent, { studentId: f.ids.own })).rejects.toThrow("permission");
    await f.t.run(ctx => ctx.db.patch(f.ids.student.app, { active: false }));
    await expect(f.student.query(api.fundraiserLinks.forStudent, { studentId: f.ids.own })).rejects.toThrow("inactive");
  });

  it("pages current active students only and rejects archived or cross-season access", async () => {
    const f = await fixture();
    const page1 = await f.coach.query(api.fundraiserLinks.list, { paginationOpts: { cursor: null, numItems: 1 } });
    const page2 = await f.coach.query(api.fundraiserLinks.list, { paginationOpts: { cursor: page1.continueCursor, numItems: 1 } });
    expect([...page1.page, ...page2.page].map(row => row.studentId)).toEqual([f.ids.own, f.ids.other]);
    expect(page1.page[0]).toEqual({ studentId: f.ids.own, name: "Synthetic Student", url: null, revision: 0 });
    for (const studentId of [f.ids.archived, f.ids.historic]) {
      await expect(f.coach.mutation(api.fundraiserLinks.save, { studentId, url, expectedRevision: 0 })).rejects.toThrow("active season");
      await expect(f.parent.query(api.fundraiserLinks.forStudent, { studentId })).rejects.toThrow("active season");
    }
    await expect(f.coach.query(api.fundraiserLinks.list, { paginationOpts: { cursor: null, numItems: 101 } })).rejects.toThrow("page size");
  });

  it("rejects unsafe schemes, lookalike hosts, credentials, ports, fragments and oversized URLs", async () => {
    const f = await fixture();
    for (const unsafe of ["http://zeffy.com/x", "javascript:alert(1)", "https://zeffy.com.evil.invalid/x", "https://evilzeffy.com", "https://sub.zeffy.com", "https://user@zeffy.com/x", "https://zeffy.com:443/x", "https://zeffy.com:8443/x", "https://zeffy.com/x#fragment", "https://zeffy.com\\@evil.invalid", "https://zeffy.com/x\nfoo", `https://zeffy.com/${"x".repeat(2048)}`]) {
      await expect(f.coach.mutation(api.fundraiserLinks.save, { studentId: f.ids.own, url: unsafe, expectedRevision: 0 })).rejects.toThrow();
    }
    await expect(f.coach.mutation(api.fundraiserLinks.save, { studentId: f.ids.own, url, expectedRevision: 0.5 })).rejects.toThrow("changed");
    expect(await f.t.run(ctx => ctx.db.get(f.ids.own))).not.toHaveProperty("fundraiserUrl");
  });
});

describe("fundraiser CSV import", () => {
  it("previews canonical names then applies connects and clears atomically without financial changes", async () => {
    const f = await fixture();
    await f.coach.mutation(api.fundraiserLinks.save, { studentId: f.ids.other, url, expectedRevision: 0 });
    const rows = [{ studentId: f.ids.own, url, expectedRevision: 0 }, { studentId: f.ids.other, url: "", expectedRevision: 1 }];
    const preview = await f.coach.query(api.fundraiserLinks.previewImport, { rows });
    expect(preview).toEqual([{ studentId: f.ids.own, name: "Synthetic Student", before: null, after: url, changed: true }, { studentId: f.ids.other, name: "Synthetic Student", before: url, after: null, changed: true }]);
    expect(await f.student.query(api.fundraiserLinks.forStudent, { studentId: f.ids.own })).toBeNull();
    expect(await f.coach.mutation(api.fundraiserLinks.importLinks, { rows })).toEqual({ updated: 2, unchanged: 0 });
    expect(await f.parent.query(api.fundraiserLinks.forStudent, { studentId: f.ids.own })).toBe(url);
    expect(await f.t.run(ctx => ctx.db.get(f.ids.other))).not.toHaveProperty("fundraiserUrl");
    expect(await f.coach.mutation(api.fundraiserLinks.importLinks, { rows: [{ studentId: f.ids.own, url, expectedRevision: 1 }] })).toEqual({ updated: 0, unchanged: 1 });
    expect(await f.t.run(ctx => ctx.db.query("ledgerEntries").take(1))).toEqual([]);
  });
  it("rejects stale, duplicate, unsafe, unavailable and unauthorized batches without partial writes", async () => {
    const f = await fixture();
    const first = { studentId: f.ids.own, url, expectedRevision: 0 };
    for (const second of [{ ...first }, { studentId: f.ids.other, url, expectedRevision: 1 }, { studentId: f.ids.other, url: "https://evil.invalid", expectedRevision: 0 }, { studentId: f.ids.historic, url, expectedRevision: 0 }, { studentId: f.ids.archived, url, expectedRevision: 0 }]) {
      await expect(f.coach.mutation(api.fundraiserLinks.importLinks, { rows: [first, second] })).rejects.toThrow();
      expect(await f.student.query(api.fundraiserLinks.forStudent, { studentId: f.ids.own })).toBeNull();
    }
    for (const client of [f.t, f.mentor, f.student, f.parent]) {
      await expect(client.query(api.fundraiserLinks.previewImport, { rows: [first] })).rejects.toThrow();
      await expect(client.mutation(api.fundraiserLinks.importLinks, { rows: [first] })).rejects.toThrow();
    }
    await expect(f.coach.mutation(api.fundraiserLinks.importLinks, { rows: [] })).rejects.toThrow('500');
    await expect(f.coach.mutation(api.fundraiserLinks.importLinks, { rows: Array.from({ length: 501 }, () => first) })).rejects.toThrow('500');
  });
});
