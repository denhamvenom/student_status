import { ConvexError } from 'convex/values';
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getAuthUserId, getAuthSessionId } from "@convex-dev/auth/server";
import { timeclockTransitionLocked } from "./timeclockTransition";
import { requireMaintenanceAccess } from "./maintenanceAccess";
import { isDeveloperEmail, requireDeveloperAccountAllowed, developerSignInEnabled } from "./developerSignIn";

type Ctx = QueryCtx | MutationCtx;
export type AppUser = Doc<"appUsers">;

export type OperatingRole = "parent" | "mentor" | "travelLead";
export function availableRoles(user: AppUser): OperatingRole[] {
  if (user.role !== "parent") return [];
  return user.parentStaffAccess === "travelLead" ? ["parent", "mentor", "travelLead"] : user.parentStaffAccess === "mentor" ? ["parent", "mentor"] : ["parent"];
}

export async function operatingRole(ctx: Ctx, user: AppUser) {
  const roles = availableRoles(user);
  const sessionId = await getAuthSessionId(ctx);
  const selection = user.role === "parent" && user.parentStaffAccess && sessionId
    ? await ctx.db.query("operatingRoles").withIndex("by_sessionId", q => q.eq("sessionId", sessionId)).unique() : null;
  const valid = selection?.userId === user._id && selection.accessRevision === (user.accessRevision ?? 0) && roles.includes(selection.role);
  return { roles, selected: !!valid, role: valid ? selection.role : "parent" as OperatingRole };
}

async function effectiveViewer(ctx: Ctx, user: AppUser): Promise<AppUser> {
  if (user.role !== "parent") return user;
  const selection = await operatingRole(ctx, user);
  // Keep stored Parent identity and family links. Resolve only the role in this
  // authenticated session; current Coach grants are checked on every request.
  return { ...user, role: selection.role === "parent" ? "parent" : "mentor", travelLead: selection.role === "travelLead", financialEdit: false, healthExport: false };
}

export async function identity(ctx: Ctx) {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) throw new ConvexError("You are not signed in. Sign in to continue.");
  const authUser = await ctx.db.get(authUserId as Id<"users">);
  if (!authUser?.email || authUser.isAnonymous) throw new ConvexError("This sign-in has no email address. Sign in with a Google account that has an email.");
  requireMaintenanceAccess(authUser.email);
  requireDeveloperAccountAllowed(authUser.email);
  return { authUserId: authUser._id, email: authUser.email, name: authUser.name ?? authUser.email };
}

export async function viewer(ctx: Ctx): Promise<AppUser> {
  const who = await identity(ctx);
  const user = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).unique();
  if (!user || !user.active) throw new ConvexError("Your account is waiting for approval or is inactive. Ask a Coach if you need access.");
  const parentEmailIdentity = await ctx.db.query("parentEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).unique();
  if (parentEmailIdentity && (user.role !== "parent" || parentEmailIdentity.email !== user.email.trim().toLowerCase())) throw new ConvexError("This email sign-in works only for its Parent account. Sign out, then sign in with the right account.");
  const adultMarker = await ctx.db.query("adultEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).unique();
  if (adultMarker && (!["coach", "mentor"].includes(user.role) || adultMarker.email !== user.email.trim().toLowerCase())) throw new ConvexError("This email sign-in works only for its Coach or Mentor account. Sign out, then sign in with the right account.");
  return effectiveViewer(ctx, user);
}

export async function maybeViewer(ctx: Ctx): Promise<AppUser | null> {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) return null;
  const user = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", authUserId as Id<"users">)).unique();
  if (user) requireMaintenanceAccess(user.email);
  if (user && isDeveloperEmail(user.email) && !developerSignInEnabled()) return null;
  const marker = user && await ctx.db.query("parentEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", authUserId as Id<"users">)).unique();
  if (marker && (user.role !== "parent" || marker.email !== user.email.trim().toLowerCase())) return null;
  const adultMarker = user && await ctx.db.query("adultEmailIdentities").withIndex("by_authUserId", q => q.eq("authUserId", authUserId as Id<"users">)).unique();
  if (adultMarker && (!["coach", "mentor"].includes(user.role) || adultMarker.email !== user.email.trim().toLowerCase())) return null;
  return user?.active ? effectiveViewer(ctx, user) : null;
}

export function requireRole(user: AppUser, ...roles: AppUser["role"][]) {
  if (!roles.includes(user.role)) throw new ConvexError("You do not have permission for this action. Ask a Coach if you need access.");
}

export async function activeSeason(ctx: Ctx) {
  const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).unique();
  if (!season) throw new ConvexError("No season is active yet. Ask a Coach to set up the season.");
  return season;
}

export async function requireSeasonProfileWritable(ctx: Ctx, seasonId: Id<"seasons">) {
  if (await timeclockTransitionLocked(ctx, seasonId)) throw new ConvexError("The team is moving to a new season. Profile and roster changes are paused until that finishes. Try again later.");
}

export async function studentAccess(ctx: Ctx, user: AppUser, studentId: Id<"students">): Promise<Doc<"students">> {
  const student = await ctx.db.get(studentId);
  if (!student) throw new ConvexError("This student was not found. Reload to see the current roster.");
  const season = await activeSeason(ctx);
  if (!student.active || student.seasonId !== season._id) throw new ConvexError("This student is unavailable in the active season. Reload to see the current roster.");
  if ("scheduler" in ctx) await requireSeasonProfileWritable(ctx, season._id);
  if (user.role === "coach" || (user.role !== "parent" && user.travelLead)) return student;
  if (user.role === "student" && student.userId === user._id) return student;
  if (user.role === "parent") {
    const link = await ctx.db.query("familyLinks").withIndex("by_parentUserId_and_studentId", q => q.eq("parentUserId", user._id).eq("studentId", studentId)).unique();
    if (link?.active) return student;
  }
  throw new ConvexError("You don't have permission for this student's record. Ask a Coach if this is wrong.");
}

export async function ownStudent(ctx: Ctx, user: AppUser): Promise<Doc<"students">> {
  requireRole(user, "student");
  const season = await activeSeason(ctx);
  const student = await ctx.db.query("students").withIndex("by_seasonId_and_userId", q => q.eq("seasonId", season._id).eq("userId", user._id)).unique();
  if ("scheduler" in ctx) await requireSeasonProfileWritable(ctx, season._id);
  if (!student || !student.active) throw new ConvexError("No student on this season's roster is linked to your account. Ask a Coach for help.");
  return student;
}

export async function linkedStudents(ctx: Ctx, user: AppUser) {
  if (user.role === "student") return [await ownStudent(ctx, user)];
  if (user.role === "parent") throw new ConvexError("Parent students must be read through season-scoped roster pages.");
  return [];
}

export function publicStudent(student: Doc<"students">) {
  return { _id: student._id, legalName: student.legalName, preferredName: student.preferredName, subteam: student.subteam, travelTeam: student.travelTeam, active: student.active, roomCategory: student.roomCategory ?? null };
}

export function mentorStudent(student: Doc<"students">) {
  return { _id: student._id, legalName: student.legalName, preferredName: student.preferredName, subteam: student.subteam, active: student.active };
}

export function mentorEvent(event: Doc<"events">) {
  return { _id: event._id, name: event.name, type: event.type, startsAt: event.startsAt, endsAt: event.endsAt, destination: event.destination, cancelled: event.cancelled ?? false, mediaSupportRequested: event.mediaSupportRequested ?? false, enrollmentState: event.enrollmentState ?? "complete" };
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
