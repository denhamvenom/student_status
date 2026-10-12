import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const role = v.union(v.literal("coach"), v.literal("mentor"), v.literal("parent"), v.literal("student"));
const category = v.union(v.literal("Boys"), v.literal("Girls"));
const report = v.object({ state: v.union(v.literal("unknown"), v.literal("none"), v.literal("reported")), text: v.optional(v.string()) });

export default defineSchema({
  ...authTables,
  appUsers: defineTable({ authUserId: v.id("users"), email: v.string(), name: v.string(), role, travelLead: v.boolean(), financialEdit: v.boolean(), active: v.boolean(), theme: v.optional(v.union(v.literal("light"), v.literal("dark"), v.literal("system"))) })
    .index("by_authUserId", ["authUserId"]).index("by_email", ["email"]).index("by_role", ["role"]),
  seasons: defineTable({ name: v.string(), year: v.number(), status: v.union(v.literal("active"), v.literal("archived")), startsAt: v.number(), endsAt: v.optional(v.number()), permissionVersion: v.string(), createdBy: v.id("appUsers") })
    .index("by_status", ["status"]).index("by_year", ["year"]),
  students: defineTable({ seasonId: v.id("seasons"), userId: v.optional(v.id("appUsers")), legalName: v.string(), preferredName: v.string(), email: v.string(), subteam: v.string(), active: v.boolean(), travelTeam: v.boolean(), shirtSize: v.optional(v.string()), roomCategory: v.optional(category), roomCategoryLocked: v.boolean(), emergencyName: v.optional(v.string()), emergencyRelationship: v.optional(v.string()), emergencyPhone: v.optional(v.string()), allergies: report, medications: report, otcAuthorization: v.optional(v.union(v.literal("yes"), v.literal("contact"), v.literal("no"))) })
    .index("by_seasonId", ["seasonId"]).index("by_userId", ["userId"]).index("by_seasonId_and_email", ["seasonId", "email"]),
  familyLinks: defineTable({ parentUserId: v.id("appUsers"), studentId: v.id("students"), active: v.boolean(), createdBy: v.id("appUsers"), revokedAt: v.optional(v.number()), revokedBy: v.optional(v.id("appUsers")) })
    .index("by_parentUserId", ["parentUserId"]).index("by_studentId", ["studentId"]).index("by_parentUserId_and_studentId", ["parentUserId", "studentId"]),
  parentInvitationSettings: defineTable({ key: v.literal("team"), enabled: v.boolean(), updatedBy: v.id("appUsers"), updatedAt: v.number() })
    .index("by_key", ["key"]),
  parentInvitations: defineTable({ studentId: v.id("students"), parentEmail: v.string(), tokenHash: v.string(), status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("revoked"), v.literal("replaced")), createdBy: v.id("appUsers"), createdAt: v.number(), expiresAt: v.number(), acceptedBy: v.optional(v.id("appUsers")), acceptedAt: v.optional(v.number()), relationship: v.optional(v.string()), attestationVersion: v.optional(v.string()), attestationText: v.optional(v.string()), attestedAt: v.optional(v.number()) })
    .index("by_tokenHash", ["tokenHash"]).index("by_studentId", ["studentId"]).index("by_studentId_and_status", ["studentId", "status"]).index("by_studentId_and_parentEmail", ["studentId", "parentEmail"]).index("by_studentId_and_parentEmail_and_status", ["studentId", "parentEmail", "status"]),
  joinRequests: defineTable({ authUserId: v.id("users"), email: v.string(), firstName: v.string(), lastName: v.string(), seasonId: v.id("seasons"), status: v.union(v.literal("pending"), v.literal("approved"), v.literal("declined")), createdAt: v.number(), decidedAt: v.optional(v.number()), decidedBy: v.optional(v.id("appUsers")) })
    .index("by_authUserId", ["authUserId"]).index("by_status", ["status"]),
  joinCodes: defineTable({ seasonId: v.id("seasons"), code: v.string(), expiresAt: v.number(), revoked: v.boolean(), createdBy: v.id("appUsers") })
    .index("by_code", ["code"]).index("by_seasonId", ["seasonId"]),
  joinAttempts: defineTable({ authUserId: v.id("users"), failed: v.number(), lockedUntil: v.number() })
    .index("by_authUserId", ["authUserId"]),
  events: defineTable({ seasonId: v.id("seasons"), name: v.string(), type: v.union(v.literal("Competition"), v.literal("Outreach"), v.literal("Team")), startsAt: v.number(), endsAt: v.number(), destination: v.string(), travel: v.string(), overnight: v.boolean(), roomingEnabled: v.boolean(), roomDeadline: v.optional(v.number()), feeCents: v.number(), signupMode: v.union(v.literal("assigned"), v.literal("open"), v.literal("approval")), assignmentScope: v.optional(v.union(v.literal("selected"), v.literal("travelTeam"))), capacity: v.optional(v.number()), signupClosesAt: v.optional(v.number()), allowWithdrawal: v.boolean(), permissionRequired: v.boolean(), firstRequired: v.boolean(), archived: v.boolean() })
    .index("by_seasonId_and_startsAt", ["seasonId", "startsAt"]),
  participants: defineTable({ eventId: v.id("events"), studentId: v.id("students"), status: v.union(v.literal("pending"), v.literal("confirmed"), v.literal("waitlist"), v.literal("withdrawn")), createdAt: v.number(), updatedAt: v.number() })
    .index("by_eventId", ["eventId"]).index("by_studentId", ["studentId"]).index("by_eventId_and_studentId", ["eventId", "studentId"]),
  requirements: defineTable({ eventId: v.id("events"), key: v.string(), label: v.string(), instructions: v.optional(v.string()), url: v.optional(v.string()), dueAt: v.optional(v.number()) })
    .index("by_eventId", ["eventId"]).index("by_eventId_and_key", ["eventId", "key"]),
  requirementCompletions: defineTable({ eventId: v.id("events"), studentId: v.id("students"), key: v.string(), completedBy: v.id("appUsers"), completedAt: v.number() })
    .index("by_eventId_and_studentId", ["eventId", "studentId"]).index("by_eventId_and_studentId_and_key", ["eventId", "studentId", "key"]),
  charges: defineTable({ studentId: v.id("students"), eventId: v.optional(v.id("events")), label: v.string(), amountCents: v.number(), appliedCents: v.number(), priority: v.number(), createdBy: v.id("appUsers"), createdAt: v.number() })
    .index("by_studentId_and_priority", ["studentId", "priority"]).index("by_eventId_and_studentId", ["eventId", "studentId"]),
  ledgerEntries: defineTable({ studentId: v.id("students"), chargeId: v.optional(v.id("charges")), eventId: v.optional(v.id("events")), kind: v.union(v.literal("charge"), v.literal("payment"), v.literal("fundraiser"), v.literal("allocation"), v.literal("adjustment")), amountCents: v.number(), previousCents: v.number(), newCents: v.number(), reason: v.optional(v.string()), recordedBy: v.id("appUsers"), recordedAt: v.number(), idempotencyKey: v.string() })
    .index("by_studentId_and_recordedAt", ["studentId", "recordedAt"]).index("by_idempotencyKey", ["idempotencyKey"]),
  permissionSubmissions: defineTable({ studentId: v.id("students"), seasonId: v.id("seasons"), signedBy: v.id("appUsers"), typedName: v.string(), wordingVersion: v.string(), eventIds: v.array(v.id("events")), answersJson: v.string(), signedAt: v.number() })
    .index("by_studentId_and_signedAt", ["studentId", "signedAt"]),
  permissionReviews: defineTable({ submissionId: v.id("permissionSubmissions"), status: v.union(v.literal("accepted"), v.literal("correction")), note: v.optional(v.string()), reviewedBy: v.id("appUsers"), reviewedAt: v.number() })
    .index("by_submissionId", ["submissionId"]),
  attendanceMeetings: defineTable({ seasonId: v.id("seasons"), kind: v.union(v.literal("Tuesday"), v.literal("Thursday"), v.literal("Outreach")), startsAt: v.number(), cancelled: v.boolean(), eventId: v.optional(v.id("events")) })
    .index("by_seasonId_and_startsAt", ["seasonId", "startsAt"]),
  attendanceRecords: defineTable({ meetingId: v.id("attendanceMeetings"), studentId: v.id("students"), present: v.boolean(), recordedBy: v.id("appUsers") })
    .index("by_meetingId_and_studentId", ["meetingId", "studentId"]).index("by_studentId", ["studentId"]),
  roomGroups: defineTable({ eventId: v.id("events"), category, name: v.string(), finalized: v.boolean(), adultFifthException: v.boolean(), needsReview: v.boolean(), createdBy: v.id("appUsers") })
    .index("by_eventId", ["eventId"]),
  roomMemberships: defineTable({ eventId: v.id("events"), groupId: v.id("roomGroups"), studentId: v.id("students"), joinedAt: v.number() })
    .index("by_groupId", ["groupId"]).index("by_eventId_and_studentId", ["eventId", "studentId"]),
  roomInvites: defineTable({ eventId: v.id("events"), groupId: v.id("roomGroups"), studentId: v.id("students"), invitedBy: v.id("students"), status: v.union(v.literal("pending"), v.literal("accepted"), v.literal("declined")), createdAt: v.number() })
    .index("by_studentId", ["studentId"]).index("by_groupId", ["groupId"]).index("by_groupId_and_studentId", ["groupId", "studentId"]),
  roomRequests: defineTable({ eventId: v.id("events"), studentId: v.id("students"), requestedAt: v.number() })
    .index("by_eventId_and_studentId", ["eventId", "studentId"]),
  drivers: defineTable({ seasonId: v.id("seasons"), name: v.string(), phone: v.string(), email: v.string(), seats: v.number(), approved: v.boolean() })
    .index("by_seasonId", ["seasonId"]),
  eventVehicles: defineTable({ eventId: v.id("events"), driverId: v.id("drivers"), seats: v.number(), notes: v.optional(v.string()) })
    .index("by_eventId", ["eventId"]).index("by_eventId_and_driverId", ["eventId", "driverId"]),
  audit: defineTable({ actorId: v.id("appUsers"), entity: v.string(), entityId: v.string(), action: v.string(), beforeJson: v.optional(v.string()), afterJson: v.optional(v.string()), reason: v.optional(v.string()), at: v.number() })
    .index("by_entity_and_entityId", ["entity", "entityId"]).index("by_actorId_and_at", ["actorId", "at"]),
});
