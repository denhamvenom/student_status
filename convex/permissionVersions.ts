import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { activeSeason, audit, viewer } from "./lib/access";
import { medicationDefinitionValidator, publicVersion, validateVersion, versionValidator } from "./lib/consentSnapshot";

export const current = query({
  args: {}, returns: v.union(v.object({...versionValidator.fields, formFormat: v.union(v.literal(1), v.literal(2))}), v.null()),
  handler: async ctx => {
    const actor = await viewer(ctx);
    if (actor.role !== "parent" && actor.role !== "coach" && !actor.travelLead) throw new Error("Permission version access denied.");
    const season = await activeSeason(ctx);
    const version = season.activePermissionVersionId ? await ctx.db.get(season.activePermissionVersionId) : null;
    return version && version.seasonId === season._id ? {...publicVersion(version), formFormat: version.formFormat === 2 ? 2 as const : 1 as const} : null;
  },
});

export const createVersion = mutation({
  args: { version: v.string(), title: v.string(), wording: v.string(), schoolName: v.string(), teamName: v.string(), medications: v.array(medicationDefinitionValidator), administrationText: v.string(), acknowledgmentText: v.string() }, returns: v.id("permissionVersions"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); if (actor.role !== "coach") throw new Error("Only a Coach may create permission wording.");
    const season = await activeSeason(ctx);
    if (season.activePermissionVersionId && (await ctx.db.get(season.activePermissionVersionId))?.formFormat === 2) throw new Error("This season has moved to the PDF permission form and cannot return to legacy wording.");
    const fields = { ...args, version: args.version.trim(), title: args.title.trim(), seasonId: season._id, createdBy: actor._id, createdAt: Date.now() };
    validateVersion(fields);
    if (await ctx.db.query("permissionVersions").withIndex("by_seasonId_and_version", q => q.eq("seasonId", season._id).eq("version", fields.version)).unique()) throw new Error("This wording version already exists. Create a new version to change wording.");
    const versionId = await ctx.db.insert("permissionVersions", fields);
    await ctx.db.patch(season._id, { activePermissionVersionId: versionId });
    await audit(ctx, actor, "permissionVersions", versionId, "createDraftVersion", null, { version: fields.version, active: true, realSigningEnabled: false });
    return versionId;
  },
});

/** New PDF forms use a separate immutable wording version without OTC choices. */
export const createVersionV2 = mutation({
  args: {version: v.string(), title: v.string(), wording: v.string(), acknowledgmentText: v.string()}, returns: v.id("permissionVersions"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); if (actor.role !== "coach") throw new Error("Only a Coach may create permission wording.");
    const season = await activeSeason(ctx);
    const version = args.version.trim(), title = args.title.trim(), wording = args.wording.trim(), acknowledgmentText = args.acknowledgmentText.trim();
    if (!version || version.length > 80 || !title || title.length > 160 || !wording || wording.length > 20_000 || !acknowledgmentText || acknowledgmentText.length > 2000 || !wording.toLowerCase().includes("minor first aid") || /medication choices|pain medication|cold medication|allergy medication/i.test(wording)) throw new Error("Provide complete PDF wording with minor first aid and without OTC choices.");
    if (await ctx.db.query("permissionVersions").withIndex("by_seasonId_and_version", q => q.eq("seasonId", season._id).eq("version", version)).unique()) throw new Error("This wording version already exists.");
    const versionId = await ctx.db.insert("permissionVersions", {seasonId: season._id, version, title, wording, schoolName: "Denham Springs High School", teamName: "FIRST Team 8044, Denham Venom", formFormat: 2, medications: [], administrationText: "", acknowledgmentText, createdBy: actor._id, createdAt: Date.now()});
    await ctx.db.patch(season._id, {activePermissionVersionId: versionId});
    await audit(ctx, actor, "permissionVersions", versionId, "createPdfDraftVersion", null, {version, format: 2, active: true, realSigningEnabled: false});
    return versionId;
  },
});
