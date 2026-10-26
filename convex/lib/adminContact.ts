import { ConvexError, v, type Infer } from "convex/values";

/** The one place the administrator's address lives. */
export const ADMIN_CONTACT_EMAIL = "admin@team8044.org";
export const ADMIN_CONTACT_DETAILS_MAX = 500;

export const adminContactTopics = ["inviteEmailNotConfigured", "tooManyCoaches", "tooManyDrivers", "tooManyEvents"] as const;
export const adminContactTopicValidator = v.union(
  v.literal("inviteEmailNotConfigured"),
  v.literal("tooManyCoaches"),
  v.literal("tooManyDrivers"),
  v.literal("tooManyEvents"),
);
export type AdminContactTopic = Infer<typeof adminContactTopicValidator>;

/** Plain words for the email subject and body. */
export const adminContactTopicLabels: Record<AdminContactTopic, string> = {
  inviteEmailNotConfigured: "Invitation email isn't set up",
  tooManyCoaches: "Too many Coach accounts to check an access change",
  tooManyDrivers: "Driver or Mentor list too long to match",
  tooManyEvents: "Too many events to update rooms for a Room type change",
};

const USE_CONTACT_ADMIN = "Use Contact admin to let the administrator know.";

/** A Coach-only setup error that the screen can pair with a Contact admin button. */
export function adminContactError(topic: AdminContactTopic, message: string) {
  return new ConvexError({ message: `${message} ${USE_CONTACT_ADMIN}`, contactAdmin: topic });
}
