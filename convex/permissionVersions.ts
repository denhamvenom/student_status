import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { activeSeason, audit, viewer } from "./lib/access";
import { medicationDefinitionValidator, publicVersion, validateVersion, versionValidator } from "./lib/consentSnapshot";

export const current = query({
  args: {}, returns: v.union(versionValidator, v.null()),
  handler: async ctx => {
    const actor = await viewer(ctx);
    if (actor.role !== "parent" && actor.role !== "coach" && !actor.travelLead) throw new Error("Permission version access denied.");
    const season = await activeSeason(ctx);
    const version = season.activePermissionVersionId ? await ctx.db.get(season.activePermissionVersionId) : null;
    return version && version.seasonId === season._id ? publicVersion(version) : null;
  },
});

export const createVersion = mutation({
  args: { version: v.string(), title: v.string(), wording: v.string(), schoolName: v.string(), teamName: v.string(), medications: v.array(medicationDefinitionValidator), administrationText: v.string(), acknowledgmentText: v.string() }, returns: v.id("permissionVersions"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); if (actor.role !== "coach") throw new Error("Only a Coach may create permission wording.");
    const season = await activeSeason(ctx);
    const fields = { ...args, version: args.version.trim(), title: args.title.trim(), seasonId: season._id, createdBy: actor._id, createdAt: Date.now() };
    validateVersion(fields);
    if (await ctx.db.query("permissionVersions").withIndex("by_seasonId_and_version", q => q.eq("seasonId", season._id).eq("version", fields.version)).unique()) throw new Error("This wording version already exists. Create a new version to change wording.");
    const versionId = await ctx.db.insert("permissionVersions", fields);
    await ctx.db.patch(season._id, { activePermissionVersionId: versionId });
    await audit(ctx, actor, "permissionVersions", versionId, "createDraftVersion", null, { version: fields.version, active: true, realSigningEnabled: false });
    return versionId;
  },
});
