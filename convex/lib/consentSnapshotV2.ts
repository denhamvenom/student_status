import { v, type Infer } from "convex/values";
import { consentProfileV2Validator, type ConsentProfileV2 } from "../consentProfileV2Schema";
export { consentProfileV2Validator, type ConsentProfileV2 } from "../consentProfileV2Schema";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { boundedText, MAX_CONSENT_EVENTS, MAX_SNAPSHOT_BYTES, expectedCoverageValidator } from "./consentSnapshot";
import { requireEnrollmentComplete } from "./eventEnrollmentState";
import { tokenHash } from "./invitationIdentity";

export const consentVersionV2Validator = v.object({ versionId: v.id("permissionVersions"), version: v.string(), title: v.string(), wording: v.string(), schoolName: v.string(), teamName: v.string(), acknowledgmentText: v.string() });
export const consentEventV2Validator = v.object({
  eventId: v.id("events"), name: v.string(), type: v.union(v.literal("Competition"), v.literal("Outreach"), v.literal("Team")), startsAt: v.number(), endsAt: v.number(), destination: v.string(), travel: v.string(), overnight: v.boolean(), feeCents: v.number(), independentTravel: v.boolean(), transportEnabled: v.boolean(), busSeats: v.union(v.number(), v.null()), additionalAdults: v.union(v.number(), v.null()), trailerRequired: v.boolean(), signupMode: v.union(v.literal("assigned"), v.literal("open"), v.literal("approval")), capacity: v.union(v.number(), v.null()), signupClosesAt: v.union(v.number(), v.null()), roomingEnabled: v.boolean(), roomDeadline: v.union(v.number(), v.null()), permissionRequired: v.boolean(), firstRequired: v.boolean(), sponsorName: v.union(v.string(), v.null()), sponsorPhone: v.union(v.string(), v.null()), lodging: v.union(v.string(), v.null()),
});
export const consentSnapshotV2Validator = v.object({
  format: v.literal(2), synthetic: v.literal(true), templateVersion: v.literal("field-trip-v2"), version: consentVersionV2Validator,
  student: v.object({ studentId: v.id("students"), seasonId: v.id("seasons"), legalName: v.string(), preferredName: v.string(), email: v.string(), subteam: v.string(), grade: v.string(), dateOfBirth: v.string(), profileRevision: v.number(), profileConfirmedBy: v.id("appUsers"), profileConfirmedAt: v.number() }),
  profile: consentProfileV2Validator, events: v.array(consentEventV2Validator),
  priorCoverage: v.array(v.object({ eventId: v.id("events"), revision: v.number(), submissionId: v.union(v.id("permissionSubmissions"), v.null()) })),
  signer: v.object({ source: v.union(v.literal("electronic"), v.literal("paper")), accountId: v.union(v.id("appUsers"), v.null()), name: v.string(), email: v.union(v.string(), v.null()), recordedBy: v.id("appUsers") }),
  typedName: v.union(v.string(), v.null()), acknowledged: v.boolean(), signedAt: v.union(v.number(), v.null()), recordedAt: v.union(v.number(), v.null()),
  pdf: v.union(v.object({reviewedStorageId: v.id("_storage"), reviewedSha256: v.string(), signedStorageId: v.id("_storage"), signedSha256: v.string()}), v.null()),
  paper: v.union(v.object({ reference: v.string(), signedAt: v.number(), attested: v.literal(true) }), v.null()),
});
export type ConsentSnapshotV2 = Infer<typeof consentSnapshotV2Validator>;
export type ExpectedCoverageV2 = Infer<typeof expectedCoverageValidator>;

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function required(value: string, max: number, label: string) { boundedText(value, max, label); return value.trim(); }
export function validateConsentProfileV2(profile: ConsentProfileV2): ConsentProfileV2 {
  const normalized: ConsentProfileV2 = {
    grade: required(profile.grade, 32, "Grade"), dateOfBirth: required(profile.dateOfBirth, 10, "Date of birth"),
    guardian: { name: required(profile.guardian.name, 160, "Guardian name"), relationship: required(profile.guardian.relationship, 80, "Guardian relationship"), phone: required(profile.guardian.phone, 40, "Guardian phone"), email: required(profile.guardian.email, 254, "Guardian email").toLowerCase() },
    emergency: { name: required(profile.emergency.name, 160, "Emergency contact name"), relationship: required(profile.emergency.relationship, 80, "Emergency contact relationship"), phone: required(profile.emergency.phone, 40, "Emergency contact phone") },
    allergies: { state: profile.allergies.state, entries: profile.allergies.entries.map(item => ({ allergen: required(item.allergen, 160, "Allergen"), severity: required(item.severity, 120, "Allergy severity"), reaction: required(item.reaction, 500, "Allergy reaction"), response: required(item.response, 500, "Allergy response") })) },
    prescriptions: { state: profile.prescriptions.state, entries: profile.prescriptions.entries.map(item => ({ name: required(item.name, 160, "Prescription name"), dose: required(item.dose, 120, "Prescription dose"), timing: required(item.timing, 160, "Prescription timing"), reason: required(item.reason, 500, "Prescription reason"), carriedBy: required(item.carriedBy, 160, "Prescription carrier") })) },
    insurance: { state: profile.insurance.state, provider: profile.insurance.provider?.trim() || null, policy: profile.insurance.policy?.trim() || null },
    physician: { state: profile.physician.state, name: profile.physician.name?.trim() || null, phone: profile.physician.phone?.trim() || null },
  };
  const born = Date.parse(`${normalized.dateOfBirth}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized.dateOfBirth) || !Number.isFinite(born) || new Date(born).toISOString().slice(0, 10) !== normalized.dateOfBirth || born >= Date.UTC(2100, 0, 1)) throw new Error("Enter a valid date of birth.");
  if (!emailPattern.test(normalized.guardian.email)) throw new Error("Enter a valid guardian email.");
  for (const [label, report] of [["Allergies", normalized.allergies], ["Prescriptions", normalized.prescriptions]] as const) {
    if (report.entries.length > 20 || report.state === "none" && report.entries.length !== 0 || report.state === "reported" && report.entries.length === 0) throw new Error(`${label} require explicit none or complete entries.`);
  }
  for (const [label, pair] of [["Insurance", normalized.insurance], ["Physician", normalized.physician]] as const) {
    const values = label === "Insurance" ? [normalized.insurance.provider, normalized.insurance.policy] : [normalized.physician.name, normalized.physician.phone];
    if (pair.state === "provided" && values.some(value => !value) || pair.state !== "provided" && values.some(value => value !== null) || values.some(value => (value?.length ?? 0) > 254)) throw new Error(`${label} needs complete details or an explicit none/unavailable choice.`);
  }
  return normalized;
}

type Ctx = QueryCtx | MutationCtx;
export async function selectedEventsV2(ctx: Ctx, student: Doc<"students">, eventIds: Id<"events">[]) {
  if (!eventIds.length || eventIds.length > MAX_CONSENT_EVENTS || new Set(eventIds).size !== eventIds.length) throw new Error("Choose between 1 and 50 unique covered events.");
  const result: ConsentSnapshotV2["events"] = [];
  for (const eventId of [...eventIds].sort()) {
    const event = await ctx.db.get(eventId);
    if (!event || event.archived || event.seasonId !== student.seasonId) throw new Error("A covered event is unavailable.");
    requireEnrollmentComplete(event);
    const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", student._id)).unique();
    if (participant?.status !== "confirmed") throw new Error("Permission forms cover confirmed event participation only.");
    result.push({ eventId, name: event.name, type: event.type, startsAt: event.startsAt, endsAt: event.endsAt, destination: event.destination, travel: event.travel, overnight: event.overnight, feeCents: event.feeCents, independentTravel: participant.independentTravel ?? false, transportEnabled: event.transportEnabled ?? event.travel !== "None", busSeats: event.busSeats ?? null, additionalAdults: event.additionalAdults ?? null, trailerRequired: event.trailerRequired ?? false, signupMode: event.signupMode, capacity: event.capacity ?? null, signupClosesAt: event.signupClosesAt ?? null, roomingEnabled: event.roomingEnabled, roomDeadline: event.roomDeadline ?? null, permissionRequired: event.permissionRequired, firstRequired: event.firstRequired, sponsorName: null, sponsorPhone: null, lodging: null });
  }
  return result;
}
export function validateSnapshotV2(snapshot: ConsentSnapshotV2) {
  validateConsentProfileV2(snapshot.profile);
  if (snapshot.student.grade !== snapshot.profile.grade || snapshot.student.dateOfBirth !== snapshot.profile.dateOfBirth || !snapshot.events.length || snapshot.events.length > MAX_CONSENT_EVENTS || snapshot.priorCoverage.length !== snapshot.events.length || new Set(snapshot.events.map(event => event.eventId)).size !== snapshot.events.length || snapshot.priorCoverage.some(row => !snapshot.events.some(event => event.eventId === row.eventId))) throw new Error("Permission snapshot evidence is inconsistent.");
  if (!snapshot.version.wording.toLowerCase().includes("minor first aid") || /medication choices|pain medication|cold medication|allergy medication/i.test(snapshot.version.wording)) throw new Error("New permission wording must include minor first aid and omit OTC choices.");
  if (snapshot.signedAt !== null && (!snapshot.pdf || !/^[0-9a-f]{64}$/.test(snapshot.pdf.reviewedSha256) || !/^[0-9a-f]{64}$/.test(snapshot.pdf.signedSha256)) || snapshot.signedAt === null && snapshot.pdf !== null) throw new Error("PDF evidence binding is invalid.");
  if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > MAX_SNAPSHOT_BYTES) throw new Error("Permission snapshot is too large.");
  return snapshot;
}
export async function snapshotHashV2(snapshot: ConsentSnapshotV2) { return tokenHash(JSON.stringify(snapshot)); }
