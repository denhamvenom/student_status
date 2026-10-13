import type { Doc } from "../_generated/dataModel";

export function enrollmentPending(event: Doc<"events">) {
  return event.enrollmentState === "running" || event.enrollmentState === "failed";
}

export function requireEnrollmentComplete(event: Doc<"events">) {
  if (enrollmentPending(event)) {
    throw new Error("Whole Team enrollment must finish before changing event participation or arrangements.");
  }
}
