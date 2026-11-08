import type { Doc } from "../_generated/dataModel";

/**
 * The canonical staff rule: a Coach, or a Mentor who is a Travel Lead. A stored travelLead flag on any other role
 * (Parent, Student) grants nothing. Kept dependency-free so schema-imported modules can use it; access.ts re-exports it.
 */
export function isCoachOrTravelLead(user: Pick<Doc<"appUsers">, "role" | "travelLead">) {
  return user.role === "coach" || (user.role === "mentor" && user.travelLead);
}
