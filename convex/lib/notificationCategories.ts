import { v } from "convex/values";

export const NOTIFICATION_CATEGORIES = ["schedule", "announcements", "forms", "events", "money", "travel", "staff"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const notificationCategoryValidator = v.union(
  v.literal("schedule"), v.literal("announcements"), v.literal("forms"), v.literal("events"), v.literal("money"), v.literal("travel"), v.literal("staff"),
);

export type NotificationAudience = "student" | "parent" | "staff";

export const NOTIFICATION_CATEGORY_INFO: Record<NotificationCategory, { label: string; description: string; audiences: readonly NotificationAudience[]; urgentByDefault: boolean }> = {
  schedule: { label: "Schedule changes", description: "Meeting or event time changes and cancellations. Delivered right away, even during school hours.", audiences: ["student", "parent", "staff"], urgentByDefault: true },
  announcements: { label: "Announcements", description: "Messages from Coaches and Travel Leads to the team.", audiences: ["student", "parent", "staff"], urgentByDefault: false },
  forms: { label: "Forms and permission", description: "Permission forms and profile items that need a parent or guardian.", audiences: ["parent"], urgentByDefault: false },
  events: { label: "Events", description: "New events, sign-ups and what is left to do before an event.", audiences: ["student", "parent", "staff"], urgentByDefault: false },
  money: { label: "Money", description: "Payments due and balance updates.", audiences: ["parent"], urgentByDefault: false },
  travel: { label: "Travel", description: "Rooming, transportation and departure details.", audiences: ["student", "parent", "staff"], urgentByDefault: false },
  staff: { label: "Staff", description: "Coach, Mentor and Travel Lead work items.", audiences: ["staff"], urgentByDefault: false },
};

export function categoriesForAudience(audience: NotificationAudience): NotificationCategory[] {
  return NOTIFICATION_CATEGORIES.filter(category => NOTIFICATION_CATEGORY_INFO[category].audiences.includes(audience));
}

export function audienceForRole(user: { role: "coach" | "mentor" | "parent" | "student" }): NotificationAudience {
  return user.role === "student" ? "student" : user.role === "parent" ? "parent" : "staff";
}
