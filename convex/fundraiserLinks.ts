import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { activeSeason, audit, requireRole, studentAccess, viewer } from "./lib/access";

function validatedUrl(value: string): string | undefined {
  const url = value.trim();
  if (!url) return undefined;
  if (url.length > 2048 || /[\s\\]/.test(url) || !/^https:\/\/(?:www\.)?zeffy\.com(?:[/?]|$)/i.test(url)) {
    throw new ConvexError("Use an HTTPS Zeffy link from zeffy.com or www.zeffy.com, up to 2048 characters.");
  }
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new ConvexError("Enter a valid Zeffy link."); }
  if (parsed.protocol !== "https:" || !["zeffy.com", "www.zeffy.com"].includes(parsed.hostname) || parsed.username || parsed.password || parsed.port || url.includes("#")) {
    throw new ConvexError("Zeffy links cannot include credentials, ports, or fragments.");
  }
  return parsed.href;
}

/** Only the student's own account and active linked parents can read this family link. */
export const forStudent = query({
  args: { studentId: v.id("students") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx);
    requireRole(actor, "student", "parent");
    const student = await studentAccess(ctx, actor, args.studentId);
    return student.fundraiserUrl ?? null;
  },
});

export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(v.object({ studentId: v.id("students"), name: v.string(), url: v.union(v.string(), v.null()), revision: v.number() })),
  handler: async (ctx, args) => {
    requireRole(await viewer(ctx), "coach");
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100) throw new ConvexError("Choose a page size from 1 to 100.");
    const season = await activeSeason(ctx);
    const page = await ctx.db.query("students").withIndex("by_seasonId_and_active", q => q.eq("seasonId", season._id).eq("active", true)).paginate(args.paginationOpts);
    return { ...page, page: page.page.map(student => ({ studentId: student._id, name: student.legalName || student.preferredName, url: student.fundraiserUrl ?? null, revision: student.fundraiserLinkRevision ?? 0 })) };
  },
});

export const save = mutation({
  args: { studentId: v.id("students"), url: v.string(), expectedRevision: v.number() },
  returns: v.object({ revision: v.number() }),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx);
    requireRole(actor, "coach");
    const student = await studentAccess(ctx, actor, args.studentId);
    const beforeRevision = student.fundraiserLinkRevision ?? 0;
    if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0 || args.expectedRevision !== beforeRevision) throw new ConvexError("This fundraiser link changed. Reload before saving.");
    const url = validatedUrl(args.url);
    const revision = beforeRevision + 1;
    await ctx.db.patch(student._id, { fundraiserUrl: url, fundraiserLinkRevision: revision });
    // Keep link query parameters out of audit history; record presence and revision only.
    await audit(ctx, actor, "students", student._id, "saveFundraiserLink", { hasLink: !!student.fundraiserUrl, revision: beforeRevision }, { hasLink: !!url, revision });
    return { revision };
  },
});

const importRow = v.object({ studentId: v.id("students"), url: v.string(), expectedRevision: v.number() });
const importArgs = { rows: v.array(importRow) };
async function prepareImport(ctx: import("./_generated/server").QueryCtx | import("./_generated/server").MutationCtx, rows: Array<{ studentId: import("./_generated/dataModel").Id<"students">; url: string; expectedRevision: number }>) {
  const actor = await viewer(ctx);
  requireRole(actor, "coach");
  if (!rows.length || rows.length > 500) throw new ConvexError("Import 1 to 500 students at a time.");
  const seen = new Set<string>();
  const prepared = [];
  for (const row of rows) {
    if (seen.has(row.studentId)) throw new ConvexError("The CSV repeats a Student ID.");
    seen.add(row.studentId);
    const student = await studentAccess(ctx, actor, row.studentId);
    const revision = student.fundraiserLinkRevision ?? 0;
    if (!Number.isSafeInteger(row.expectedRevision) || row.expectedRevision < 0 || row.expectedRevision !== revision) throw new ConvexError("A fundraiser link changed since export. Download a fresh CSV and review again.");
    const url = validatedUrl(row.url);
    prepared.push({ student, url, revision });
  }
  return { actor, prepared };
}

export const previewImport = query({
  args: importArgs,
  returns: v.array(v.object({ studentId: v.id("students"), name: v.string(), before: v.union(v.string(), v.null()), after: v.union(v.string(), v.null()), changed: v.boolean() })),
  handler: async (ctx, args) => {
    const { prepared } = await prepareImport(ctx, args.rows);
    return prepared.map(({ student, url }) => ({ studentId: student._id, name: student.legalName || student.preferredName, before: student.fundraiserUrl ?? null, after: url ?? null, changed: student.fundraiserUrl !== url }));
  },
});

export const importLinks = mutation({
  args: importArgs,
  returns: v.object({ updated: v.number(), unchanged: v.number() }),
  handler: async (ctx, args) => {
    // Validate every row before writing; the entire import is one transaction.
    const { actor, prepared } = await prepareImport(ctx, args.rows);
    let updated = 0;
    for (const { student, url, revision } of prepared) {
      if (student.fundraiserUrl === url) continue;
      await ctx.db.patch(student._id, { fundraiserUrl: url, fundraiserLinkRevision: revision + 1 });
      await audit(ctx, actor, "students", student._id, "importFundraiserLink", { hasLink: !!student.fundraiserUrl, revision }, { hasLink: !!url, revision: revision + 1 });
      updated++;
    }
    return { updated, unchanged: prepared.length - updated };
  },
});
