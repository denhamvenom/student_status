import { env } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export const SYNTHETIC_CONSENT_CLOUD_URL = "https://third-bandicoot-18.convex.cloud";
export type PermissionSigningMode = "synthetic" | "real" | "closed";

export function resolvePermissionSigningMode(config: {
  cloudUrl?: string;
  realEnabled?: string;
  realCloudUrl?: string;
}): PermissionSigningMode {
  if (config.cloudUrl === SYNTHETIC_CONSENT_CLOUD_URL) return "synthetic";
  if (config.realEnabled !== "true" || !config.realCloudUrl || config.cloudUrl !== config.realCloudUrl) return "closed";
  if (!/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(config.realCloudUrl)) return "closed";
  return "real";
}

export function permissionSigningMode(): PermissionSigningMode {
  return resolvePermissionSigningMode({
    cloudUrl: env.CONVEX_CLOUD_URL,
    realEnabled: env.PERMISSION_REAL_SIGNING_ENABLED,
    realCloudUrl: env.PERMISSION_REAL_SIGNING_CLOUD_URL,
  });
}

type Ctx = QueryCtx | MutationCtx;
export async function v2SigningAllowed(ctx: Ctx, studentId: Id<"students">, parentId?: Id<"appUsers">) {
  const mode = permissionSigningMode();
  if (mode === "real") return true;
  if (mode !== "synthetic") return false;
  const row = await ctx.db.query("syntheticConsentSubjects").withIndex("by_studentId_and_parentId", q => q.eq("studentId", studentId).eq("parentId", parentId)).unique();
  return row?.enabled === true;
}

export async function requireV2Signing(ctx: Ctx, studentId: Id<"students">, parentId?: Id<"appUsers">) {
  const mode = permissionSigningMode();
  if (!await v2SigningAllowed(ctx, studentId, parentId)) throw new Error(mode === "synthetic" ? "Only registered fictional development subjects may use consent." : "You cannot sign for this student right now.");
  return mode;
}
