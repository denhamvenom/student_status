import { v } from "convex/values";

export const NOTIFICATION_CATEGORIES = ["schedule", "announcements", "forms", "events", "money", "travel", "staff"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const notificationCategoryValidator = v.union(
  v.literal("schedule"), v.literal("announcements"), v.literal("forms"), v.literal("events"), v.literal("money"), v.literal("travel"), v.literal("staff"),
);

/** "staff" is a Coach or Travel Lead; "mentor" is a Mentor without Travel Lead access, who has no travel pages. */
export type NotificationAudience = "student" | "parent" | "staff" | "mentor";

export const NOTIFICATION_CATEGORY_INFO: Record<NotificationCategory, { label: string; description: string; audiences: readonly NotificationAudience[]; urgentByDefault: boolean }> = {
  schedule: { label: "Schedule changes", description: "Meeting or event time changes and cancellations. Delivered right away, even during school hours.", audiences: ["student", "parent", "staff", "mentor"], urgentByDefault: true },
  announcements: { label: "Announcements", description: "Messages from Coaches and Travel Leads to the team.", audiences: ["student", "parent", "staff", "mentor"], urgentByDefault: false },
  forms: { label: "Forms and permission", description: "Permission forms and profile items that need a parent or guardian.", audiences: ["parent"], urgentByDefault: false },
  events: { label: "Events", description: "New events, sign-ups and what is left to do before an event.", audiences: ["student", "parent", "staff", "mentor"], urgentByDefault: false },
  money: { label: "Money", description: "Payments due and balance updates.", audiences: ["parent"], urgentByDefault: false },
  travel: { label: "Travel", description: "Rooming, transportation and departure details.", audiences: ["student", "parent", "staff"], urgentByDefault: false },
  staff: { label: "Staff", description: "Coach, Mentor and Travel Lead work items.", audiences: ["staff", "mentor"], urgentByDefault: false },
};

export function categoriesForAudience(audience: NotificationAudience): NotificationCategory[] {
  return NOTIFICATION_CATEGORIES.filter(category => NOTIFICATION_CATEGORY_INFO[category].audiences.includes(audience));
}

/** The audience of one stored account role. Use categoriesForUser for settings and delivery, never this alone. */
export function audienceForRole(user: { role: "coach" | "mentor" | "parent" | "student"; travelLead: boolean }): NotificationAudience {
  if (user.role === "student") return "student";
  if (user.role === "parent") return "parent";
  return user.role === "mentor" && !user.travelLead ? "mentor" : "staff";
}

/**
 * The categories an account can see and receive: the union over every role it can operate as, read from the
 * stored appUsers row (never the session's selected operating role). A Parent with staff access gets the Parent
 * categories plus those of the staff access (Travel Lead → staff, Mentor → mentor). The preferences list, the
 * preference toggle and push delivery all use this, so a category hidden from settings is never pushed and
 * Settings reads the same whichever role a Parent selected for the session.
 */
export function categoriesForUser(stored: { role: "coach" | "mentor" | "parent" | "student"; travelLead: boolean; parentStaffAccess?: "mentor" | "travelLead" }): NotificationCategory[] {
  const audiences = new Set<NotificationAudience>([audienceForRole(stored)]);
  if (stored.role === "parent" && stored.parentStaffAccess) audiences.add(stored.parentStaffAccess === "travelLead" ? "staff" : "mentor");
  return NOTIFICATION_CATEGORIES.filter(category => NOTIFICATION_CATEGORY_INFO[category].audiences.some(audience => audiences.has(audience)));
}
