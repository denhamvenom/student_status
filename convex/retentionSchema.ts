import { defineTable } from "convex/server";
import { v } from "convex/values";

/** Append-only review evidence. A changed archive fingerprint starts a new review instance. */
export const retentionTables = {
  retentionHoldEvents: defineTable({
    subjectKind: v.union(v.literal("student"), v.literal("account")),
    subjectId: v.union(v.id("students"), v.id("appUsers")),
    subjectKey: v.string(),
    archiveFingerprint: v.string(),
    archivedAt: v.number(),
    action: v.union(v.literal("hold"), v.literal("release")),
    reason: v.string(),
    actorId: v.id("appUsers"),
    recordedAt: v.number(),
  }).index("by_subjectKey_and_archiveFingerprint_and_recordedAt", ["subjectKey", "archiveFingerprint", "recordedAt"])
    .index("by_subjectKey_and_recordedAt", ["subjectKey", "recordedAt"]),
};
