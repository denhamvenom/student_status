import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { activeSeason, audit, viewer } from "./lib/access";
import { medicationDefinitionValidator, publicVersion, validateVersion, versionValidator } from "./lib/consentSnapshot";
import { fieldTripApproved } from "../src/lib/field-trip-approved";
import { permissionSigningMode } from "./lib/permissionSigningMode";

export const current = query({
  args: {}, returns: v.union(v.object({...versionValidator.fields, formFormat: v.union(v.literal(1), v.literal(2))}), v.null()),
  handler: async ctx => {
    const actor = await viewer(ctx);
    if (actor.role !== "parent" && actor.role !== "coach" && !actor.travelLead) throw new ConvexError("Permission forms are open to Parents, Coaches and Travel Leads. Ask a Coach if you need access.");
    const season = await activeSeason(ctx);
    const version = season.activePermissionVersionId ? await ctx.db.get(season.activePermissionVersionId) : null;
    return version && version.seasonId === season._id ? {...publicVersion(version), formFormat: version.formFormat === 2 ? 2 as const : 1 as const} : null;
  },
});

export const createVersion = mutation({
  args: { version: v.string(), title: v.string(), wording: v.string(), schoolName: v.string(), teamName: v.string(), medications: v.array(medicationDefinitionValidator), administrationText: v.string(), acknowledgmentText: v.string() }, returns: v.id("permissionVersions"),
  handler: async (ctx, args) => {
    const actor = await viewer(ctx); if (actor.role !== "coach") throw new ConvexError("Only a Coach can change the permission form.");
    const season = await activeSeason(ctx);
    if (season.activePermissionVersionId && (await ctx.db.get(season.activePermissionVersionId))?.formFormat === 2) throw new ConvexError("This season already uses the approved permission form, so older wording can't be added.");
    const fields = { ...args, version: args.version.trim(), title: args.title.trim(), seasonId: season._id, createdBy: actor._id, createdAt: Date.now() };
    validateVersion(fields);
    if (await ctx.db.query("permissionVersions").withIndex("by_seasonId_and_version", q => q.eq("seasonId", season._id).eq("version", fields.version)).unique()) throw new ConvexError("This wording version already exists. Create a new version to change wording.");
    const versionId = await ctx.db.insert("permissionVersions", fields);
    await ctx.db.patch(season._id, { activePermissionVersionId: versionId });
    await audit(ctx, actor, "permissionVersions", versionId, "createDraftVersion", null, { version: fields.version, active: true, realSigningEnabled: false });
    return versionId;
  },
});

/** Retained for old clients; arbitrary PDF wording cannot match the fixed original template. */
export const createVersionV2 = mutation({
  args: {version: v.string(), title: v.string(), wording: v.string(), acknowledgmentText: v.string()}, returns: v.id("permissionVersions"),
  handler: async ctx => {
    const actor = await viewer(ctx); if (actor.role !== "coach") throw new ConvexError("Only a Coach can change the permission form.");
    throw new ConvexError("The permission form wording can't be edited. Use the approved permission form instead.");
  },
});

/** Select the one immutable, fixed original-template wording for the active season. */
export const selectApprovedFieldTripTemplate = mutation({
  args: {}, returns: v.id("permissionVersions"),
  handler: async ctx => {
    const actor = await viewer(ctx); if (actor.role !== "coach") throw new ConvexError("Only a Coach can set up the permission form.");
    const season = await activeSeason(ctx);
    const existing = await ctx.db.query("permissionVersions").withIndex("by_seasonId_and_version", q => q.eq("seasonId", season._id).eq("version", fieldTripApproved.templateVersion)).unique();
    if (existing && (existing.formFormat !== 2 || existing.title !== fieldTripApproved.title || existing.wording !== fieldTripApproved.wording || existing.schoolName !== fieldTripApproved.schoolName || existing.teamName !== fieldTripApproved.teamName || existing.acknowledgmentText !== fieldTripApproved.acknowledgmentText || existing.medications.length !== 0 || existing.administrationText !== "")) throw new ConvexError("This season already has a different form saved under the approved form's name, so nothing was changed. Ask the person who maintains Venom Status for help.");
    const versionId = existing?._id ?? await ctx.db.insert("permissionVersions", {seasonId: season._id, version: fieldTripApproved.templateVersion, title: fieldTripApproved.title, wording: fieldTripApproved.wording, schoolName: fieldTripApproved.schoolName, teamName: fieldTripApproved.teamName, formFormat: 2, medications: [], administrationText: "", acknowledgmentText: fieldTripApproved.acknowledgmentText, createdBy: actor._id, createdAt: Date.now()});
    if (season.activePermissionVersionId !== versionId) {
      await ctx.db.patch(season._id, {activePermissionVersionId: versionId});
      await audit(ctx, actor, "permissionVersions", versionId, "selectApprovedFieldTripTemplate", {previousVersionId: season.activePermissionVersionId ?? null}, {version: fieldTripApproved.templateVersion, format: 2, realSigningEnabled: permissionSigningMode() === "real"});
    }
    return versionId;
  },
});
