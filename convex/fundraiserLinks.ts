import { paginationOptsValidator, paginationResultValidator } from "convex/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { activeSeason, audit, requireRole, studentAccess, viewer } from "./lib/access";

function validatedUrl(value: string): string | undefined {
  const url = value.trim();
  if (!url) return undefined;
  if (url.length > 2048 || /[\s\\]/.test(url) || !/^https:\/\/(?:www\.)?zeffy\.com(?:[/?]|$)/i.test(url)) {
    throw new Error("Use an HTTPS Zeffy link from zeffy.com or www.zeffy.com, up to 2048 characters.");
  }
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new Error("Enter a valid Zeffy link."); }
  if (parsed.protocol !== "https:" || !["zeffy.com", "www.zeffy.com"].includes(parsed.hostname) || parsed.username || parsed.password || parsed.port || url.includes("#")) {
    throw new Error("Zeffy links cannot include credentials, ports, or fragments.");
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
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 100) throw new Error("Choose a page size from 1 to 100.");
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
    if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0 || args.expectedRevision !== beforeRevision) throw new Error("This fundraiser link changed. Reload before saving.");
    const url = validatedUrl(args.url);
    const revision = beforeRevision + 1;
    await ctx.db.patch(student._id, { fundraiserUrl: url, fundraiserLinkRevision: revision });
    // Keep link query parameters out of audit history; record presence and revision only.
    await audit(ctx, actor, "students", student._id, "saveFundraiserLink", { hasLink: !!student.fundraiserUrl, revision: beforeRevision }, { hasLink: !!url, revision });
    return { revision };
  },
});
