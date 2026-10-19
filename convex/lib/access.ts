import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { timeclockTransitionLocked } from "./timeclockTransition";
import { requireMaintenanceAccess } from "./maintenanceAccess";

type Ctx = QueryCtx | MutationCtx;
export type AppUser = Doc<"appUsers">;

export async function identity(ctx: Ctx) {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) throw new Error("Sign in with Google to continue.");
  const authUser = await ctx.db.get(authUserId as Id<"users">);
  if (!authUser?.email || authUser.isAnonymous) throw new Error("A Google account with an email is required.");
  requireMaintenanceAccess(authUser.email);
  return { authUserId: authUser._id, email: authUser.email, name: authUser.name ?? authUser.email };
}

export async function viewer(ctx: Ctx): Promise<AppUser> {
  const who = await identity(ctx);
  const user = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).unique();
  if (!user || !user.active) throw new Error("Your account is waiting for approval or is inactive.");
  const parentEmailIdentity = await ctx.db.query("parentEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).unique();
  if (parentEmailIdentity && (user.role !== "parent" || parentEmailIdentity.email !== user.email.trim().toLowerCase())) throw new Error("Parent email sign-in is limited to its parent account.");
  return user;
}

export async function maybeViewer(ctx: Ctx): Promise<AppUser | null> {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) return null;
  const user = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", authUserId as Id<"users">)).unique();
  if (user) requireMaintenanceAccess(user.email);
  const marker = user && await ctx.db.query("parentEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", authUserId as Id<"users">)).unique();
  if (marker && (user.role !== "parent" || marker.email !== user.email.trim().toLowerCase())) return null;
  return user?.active ? user : null;
}

export function requireRole(user: AppUser, ...roles: AppUser["role"][]) {
  if (!roles.includes(user.role)) throw new Error("You do not have permission for this action.");
}

export async function activeSeason(ctx: Ctx) {
  const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
  if (!season) throw new Error("No active season is configured.");
  return season;
}

export async function requireSeasonProfileWritable(ctx: Ctx, seasonId: Id<"seasons">) {
  if (await timeclockTransitionLocked(ctx, seasonId)) throw new Error("Season transition is in progress. Profile and roster changes are paused until it finishes.");
}

export async function studentAccess(ctx: Ctx, user: AppUser, studentId: Id<"students">): Promise<Doc<"students">> {
  const student = await ctx.db.get(studentId);
  if (!student) throw new Error("Student not found.");
  const season = await activeSeason(ctx);
  if (!student.active || student.seasonId !== season._id) throw new Error("Student is unavailable in the active season.");
  if ("scheduler" in ctx) await requireSeasonProfileWritable(ctx, season._id);
  if (user.role === "coach" || user.travelLead) return student;
  if (user.role === "student" && student.userId === user._id) return student;
  if (user.role === "parent") {
    const link = await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", user._id).eq("studentId", studentId)).unique();
    if (link?.active) return student;
  }
  throw new Error("You do not have permission for this student.");
}

export async function ownStudent(ctx: Ctx, user: AppUser): Promise<Doc<"students">> {
  requireRole(user, "student");
  const season = await activeSeason(ctx);
  const student = await ctx.db.query("students").withIndex("by_seasonId_and_userId", q => q.eq("seasonId", season._id).eq("userId", user._id)).unique();
  if ("scheduler" in ctx) await requireSeasonProfileWritable(ctx, season._id);
  if (!student || !student.active) throw new Error("No active student profile is linked to this account.");
  return student;
}

export async function linkedStudents(ctx: Ctx, user: AppUser) {
  if (user.role === "student") return [await ownStudent(ctx, user)];
  if (user.role === "parent") throw new Error("Parent students must be read through season-scoped roster pages.");
  return [];
}

export function publicStudent(student: Doc<"students">) {
  return { _id: student._id, legalName: student.legalName, preferredName: student.preferredName, subteam: student.subteam, travelTeam: student.travelTeam, active: student.active, roomCategory: student.roomCategory ?? null };
}

export function mentorStudent(student: Doc<"students">) {
  return { _id: student._id, legalName: student.legalName, preferredName: student.preferredName, subteam: student.subteam, active: student.active };
}

export function mentorEvent(event: Doc<"events">) {
  return { _id: event._id, name: event.name, type: event.type, startsAt: event.startsAt, endsAt: event.endsAt, destination: event.destination, enrollmentState: event.enrollmentState ?? "complete" };
}

export function privateStudent(student: Doc<"students">) {
  const confirmed = student.consentProfileV2CompletedAt !== undefined && student.consentProfileV2ConfirmedBy !== undefined && student.consentProfileV2 !== undefined;
  const profile = confirmed ? student.consentProfileV2! : null;
  const allergies = profile ? profile.allergies.state === "none" ? {state: "none" as const} : {state: "reported" as const, text: profile.allergies.entries.map(item => `${item.allergen}: ${item.severity}; ${item.reaction}; response: ${item.response}`).join("\n")} : student.allergies;
  const medications = profile ? profile.prescriptions.state === "none" ? {state: "none" as const} : {state: "reported" as const, text: profile.prescriptions.entries.map(item => `${item.name} ${item.dose}; ${item.timing}; ${item.reason}; carried by ${item.carriedBy}`).join("\n")} : student.medications;
  return { ...publicStudent(student), profileRevision: student.profileRevision ?? 0, profileSetupRequired: student.profileCompletedAt === undefined, structuredConsentProfileComplete: confirmed, email: student.email, shirtSize: student.shirtSize ?? null, emergencyName: profile?.emergency.name ?? student.emergencyName ?? null, emergencyRelationship: profile?.emergency.relationship ?? student.emergencyRelationship ?? null, emergencyPhone: profile?.emergency.phone ?? student.emergencyPhone ?? null, allergies, medications, otcAuthorization: profile ? null : student.otcAuthorization ?? null };
}

export async function audit(ctx: MutationCtx, actor: AppUser, entity: string, entityId: string, action: string, before: unknown, after: unknown, reason?: string) {
  await ctx.db.insert("audit", { actorId: actor._id, entity, entityId, action, beforeJson: before === null ? undefined : JSON.stringify(before), afterJson: after === null ? undefined : JSON.stringify(after), reason, at: Date.now() });
}
