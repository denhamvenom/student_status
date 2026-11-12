import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { adultRoleFor, coverageAccepted, eventDateText, healthStudentFor, permissionStatusText, studentHealthCells, STUDENT_HEALTH_HEADERS } from "./healthRows";

const legacy = {
  legalName: "Dev Student", preferredName: "Dev", emergencyName: "Old Contact", emergencyRelationship: "Aunt", emergencyPhone: "555-0100",
  allergies: { state: "reported" as const, text: "Peanuts" }, medications: { state: "unknown" as const }, otcAuthorization: "contact" as const,
  consentProfileV2: undefined, consentProfileV2CompletedAt: undefined, consentProfileV2ConfirmedBy: undefined,
};
const profile = {
  grade: "10", dateOfBirth: "2010-05-06", guardian: { name: "G", relationship: "Mother", phone: "555-0000", email: "g@example.invalid" },
  emergency: { name: "New Contact", relationship: "Father", phone: "+1 555-0111" },
  allergies: { state: "reported" as const, entries: [{ allergen: "Bees", severity: "Severe", reaction: "Swelling", response: "EpiPen" }] },
  prescriptions: { state: "none" as const, entries: [] },
  insurance: { state: "provided" as const, provider: "Acme Health", policy: "P-1" }, physician: { state: "unavailable" as const, name: null, phone: null },
};
const confirmed = { ...legacy, consentProfileV2: profile, consentProfileV2CompletedAt: 1, consentProfileV2ConfirmedBy: "u1" as Id<"appUsers"> };

describe("health rows", () => {
  it("uses the confirmed profile when present, and ignores the older fields", () => {
    const row = studentHealthCells(healthStudentFor(confirmed, null));
    expect(row).toEqual(["Dev Student", "Sophomore", "May 6, 2010", "New Contact", "Father", "+1 555-0111", "Bees: Severe; Swelling; response: EpiPen", "None reported", "", "Acme Health", "P-1", "Information unavailable", ""]);
  });

  it("falls back to the older fields, with profile-only columns blank", () => {
    const row = studentHealthCells(healthStudentFor(legacy, "9"));
    expect(row).toEqual(["Dev Student", "Freshman", "", "Old Contact", "Aunt", "555-0100", "Peanuts", "Not provided", "Contact a parent first", "", "", "", ""]);
  });

  it("treats an unconfirmed profile as absent", () => {
    expect(healthStudentFor({ ...confirmed, consentProfileV2ConfirmedBy: undefined }, null).emergencyName).toBe("Old Contact");
  });

  it("has no columns beyond the Health export's fields", () => {
    expect(STUDENT_HEALTH_HEADERS).toHaveLength(13);
    expect(STUDENT_HEALTH_HEADERS.join("|")).not.toMatch(/guardian|email|shirt|room/i);
  });

  it("names adults' roles and permission forms in plain words", () => {
    expect(adultRoleFor({ role: "coach", travelLead: false })).toBe("Coach");
    expect(adultRoleFor({ role: "mentor", travelLead: true })).toBe("Travel Lead");
    expect(adultRoleFor({ role: "parent", travelLead: false, parentStaffAccess: "mentor" })).toBe("Mentor");
    expect(permissionStatusText(null, false, false)).toBe("Not required");
    expect(permissionStatusText({ state: "pending", signatureRequestedAt: undefined }, false, true)).toBe("Waiting for review");
    expect(permissionStatusText({ state: "correction", signatureRequestedAt: undefined }, false, true)).toBe("Needs correction");
    expect(permissionStatusText(null, false, true)).toBe("Not signed");
    expect(permissionStatusText(null, true, true)).toBe("Accepted");
  });

  it("counts a form as accepted only when sealed and reviewed", () => {
    const sealed = { state: "accepted" as const, signatureRequestedAt: undefined, latestSubmissionId: "s" as Id<"permissionSubmissions">, latestReviewId: "r" as Id<"permissionReviews">, sealedSnapshotFormat: 2 as const, sealedSnapshotHash: "h", versionId: "v" as Id<"permissionVersions">, source: "paper" as const };
    expect(coverageAccepted(sealed)).toBe(true);
    expect(coverageAccepted({ ...sealed, latestReviewId: undefined })).toBe(false);
    expect(coverageAccepted({ ...sealed, signatureRequestedAt: 5 })).toBe(false);
  });

  it("writes one date for a one-day event and a range for a longer one (team time)", () => {
    expect(eventDateText(Date.UTC(2027, 2, 5, 18), Date.UTC(2027, 2, 5, 20))).toBe("Mar 5, 2027");
    expect(eventDateText(Date.UTC(2027, 2, 5, 18), Date.UTC(2027, 2, 7, 18))).toBe("Mar 5, 2027 to Mar 7, 2027");
  });
});
