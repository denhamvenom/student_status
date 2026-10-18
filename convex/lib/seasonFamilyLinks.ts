import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { paginationOptsValidator } from "convex/server";
import { activeSeason, requireRole, viewer } from "./access";

type PageOptions = typeof paginationOptsValidator.type;

/** The old all-season parent-link lookup must not be used once this paged lookup is integrated. */
export async function currentSeasonLinkedStudentsPage(ctx: QueryCtx, options: PageOptions) {
  const actor = await viewer(ctx);
  requireRole(actor, "parent");
  const season = await activeSeason(ctx);
  const readiness = await ctx.db.query("familyLinkSeasonBackfill").withIndex("by_key", q => q.eq("key", "team")).unique();
  if (readiness?.state !== "complete") throw new Error("Family links are being prepared for the active season. Ask a Coach to finish the review.");
  if (!Number.isSafeInteger(options.numItems) || options.numItems < 1 || options.numItems > 50) throw new Error("Choose a page size from 1 to 50.");
  if (options.maximumRowsRead !== undefined && (!Number.isSafeInteger(options.maximumRowsRead) || options.maximumRowsRead < 1)) throw new Error("Maximum rows read must be a positive whole number.");
  const bounded = { ...options, maximumRowsRead: Math.min(options.maximumRowsRead ?? 51, 51) };
  const links = await ctx.db.query("familyLinks")
    .withIndex("by_parentUserId_and_seasonId_and_active", q => q.eq("parentUserId", actor._id).eq("seasonId", season._id).eq("active", true))
    .paginate(bounded);
  if (links.page.length > 50) throw new Error("Family link page exceeded its review limit.");
  const students = await Promise.all(links.page.map(link => ctx.db.get(link.studentId)));
  const page: Doc<"students">[] = [];
  for (let i = 0; i < links.page.length; i++) {
    const student = students[i];
    if (!student || student.seasonId !== season._id) throw new Error("A family link requires Coach reconciliation before it can be shown.");
    if (student.active) page.push(student);
  }
  return { ...links, page };
}
