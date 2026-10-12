import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

type Ctx = QueryCtx | MutationCtx;
export type AppUser = Doc<"appUsers">;

export async function identity(ctx: Ctx) {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) throw new Error("Sign in with Google to continue.");
  const authUser = await ctx.db.get(authUserId as Id<"users">);
  if (!authUser?.email || authUser.isAnonymous) throw new Error("A Google account with an email is required.");
  return { authUserId: authUser._id, email: authUser.email, name: authUser.name ?? authUser.email };
}

export async function viewer(ctx: Ctx): Promise<AppUser> {
  const who = await identity(ctx);
  const user = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", who.authUserId)).unique();
  if (!user || !user.active) throw new Error("Your account is waiting for approval or is inactive.");
  return user;
}

export async function maybeViewer(ctx: Ctx): Promise<AppUser | null> {
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) return null;
  const user = await ctx.db.query("appUsers").withIndex("by_authUserId", q => q.eq("authUserId", authUserId as Id<"users">)).unique();
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

export async function studentAccess(ctx: Ctx, user: AppUser, studentId: Id<"students">): Promise<Doc<"students">> {
  const student = await ctx.db.get(studentId);
  if (!student) throw new Error("Student not found.");
  const season = await activeSeason(ctx);
  if (!student.active || student.seasonId !== season._id) throw new Error("Student is unavailable in the active season.");
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
  const student = await ctx.db.query("students").withIndex("by_userId", q => q.eq("userId", user._id)).unique();
  if (!student || !student.active) throw new Error("No active student profile is linked to this account.");
  return student;
}

export async function linkedStudents(ctx: Ctx, user: AppUser) {
  if (user.role === "student") return [await ownStudent(ctx, user)];
  if (user.role === "parent") {
    const season = await ctx.db.query("seasons").withIndex("by_status", q => q.eq("status", "active")).first();
    if (!season) return [];
    const links = await ctx.db.query("familyLinks").withIndex("by_parentUserId", q => q.eq("parentUserId", user._id)).take(100);
    const students = await Promise.all(links.filter(x => x.active).map(x => ctx.db.get(x.studentId)));
    return students.filter((x): x is Doc<"students"> => !!x && x.active && x.seasonId === season._id);
  }
  return [];
}

export function publicStudent(student: Doc<"students">) {
  return { _id: student._id, legalName: student.legalName, preferredName: student.preferredName, subteam: student.subteam, travelTeam: student.travelTeam, active: student.active, roomCategory: student.roomCategory ?? null };
}

export function mentorStudent(student: Doc<"students">) {
  return { _id: student._id, preferredName: student.preferredName, subteam: student.subteam, active: student.active };
}

export function mentorEvent(event: Doc<"events">) {
  return { _id: event._id, name: event.name, type: event.type, startsAt: event.startsAt, endsAt: event.endsAt, destination: event.destination };
}

export function privateStudent(student: Doc<"students">) {
  return { ...publicStudent(student), email: student.email, shirtSize: student.shirtSize ?? null, emergencyName: student.emergencyName ?? null, emergencyRelationship: student.emergencyRelationship ?? null, emergencyPhone: student.emergencyPhone ?? null, allergies: student.allergies, medications: student.medications, otcAuthorization: student.otcAuthorization ?? null };
}

export async function audit(ctx: MutationCtx, actor: AppUser, entity: string, entityId: string, action: string, before: unknown, after: unknown, reason?: string) {
  await ctx.db.insert("audit", { actorId: actor._id, entity, entityId, action, beforeJson: before === null ? undefined : JSON.stringify(before), afterJson: after === null ? undefined : JSON.stringify(after), reason, at: Date.now() });
}
