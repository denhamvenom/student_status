import { teamTransportEnabled } from "./transportation";
import { ConvexError } from 'convex/values';
import { v, type Infer, type GenericValidator } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireEnrollmentComplete } from "./eventEnrollmentState";
import { tokenHash } from "./invitationIdentity";

export const MAX_CONSENT_EVENTS = 50;
export const MAX_SNAPSHOT_BYTES = 128 * 1024;
export const medicationChoiceValidator = v.union(v.literal("allow"), v.literal("contact"), v.literal("deny"));
export const medicationChoicesValidator = v.object({ pain: medicationChoiceValidator, allergy: medicationChoiceValidator, cold: medicationChoiceValidator });
export const correctionFieldValidator = v.union(v.literal("general"), v.literal("emergencyName"), v.literal("emergencyPhone"), v.literal("allergies"), v.literal("medications"), v.literal("medicationChoices"));
export const expectedCoverageValidator = v.object({ eventId: v.id("events"), revision: v.number() });
export const medicationDefinitionValidator = v.object({ key: v.union(v.literal("pain"), v.literal("allergy"), v.literal("cold")), label: v.string(), productsText: v.string(), exceptionsText: v.string() });
export const versionValidator = v.object({ versionId: v.id("permissionVersions"), version: v.string(), title: v.string(), wording: v.string(), schoolName: v.string(), teamName: v.string(), medications: v.array(medicationDefinitionValidator), administrationText: v.string(), acknowledgmentText: v.string(), approved: v.boolean() });
const reportValidator = v.object({ state: v.union(v.literal("none"), v.literal("reported")), text: v.union(v.string(), v.null()) });
export const consentEventValidator = v.object({ eventId: v.id("events"), name: v.string(), type: v.union(v.literal("Competition"), v.literal("Outreach"), v.literal("Team")), startsAt: v.number(), endsAt: v.number(), destination: v.string(), travel: v.string(), overnight: v.boolean(), feeCents: v.number(), independentTravel: v.boolean(), transportEnabled: v.boolean(), busSeats: v.union(v.number(), v.null()), additionalAdults: v.union(v.number(), v.null()), trailerRequired: v.boolean() });
export const consentSnapshotValidator = v.object({
  format: v.literal(1), synthetic: v.literal(true), version: versionValidator,
  student: v.object({ studentId: v.id("students"), seasonId: v.id("seasons"), legalName: v.string(), preferredName: v.string(), email: v.string(), subteam: v.string(), profileRevision: v.number() }),
  events: v.array(consentEventValidator),
  emergency: v.object({ name: v.string(), relationship: v.string(), phone: v.string() }),
  health: v.object({ allergies: reportValidator, medications: reportValidator }),
  priorCoverage: v.array(v.object({ eventId: v.id("events"), revision: v.number(), submissionId: v.union(v.id("permissionSubmissions"), v.null()) })),
  signer: v.object({ source: v.union(v.literal("electronic"), v.literal("paper")), accountId: v.union(v.id("appUsers"), v.null()), name: v.string(), email: v.union(v.string(), v.null()), recordedBy: v.id("appUsers") }),
  choices: v.union(medicationChoicesValidator, v.null()), typedName: v.union(v.string(), v.null()), acknowledged: v.boolean(), signedAt: v.union(v.number(), v.null()), recordedAt: v.union(v.number(), v.null()),
  paper: v.union(v.object({ reference: v.string(), signedAt: v.number(), attested: v.literal(true) }), v.null()),
});
export type ConsentSnapshot = Infer<typeof consentSnapshotValidator>;
export type ExpectedCoverage = Infer<typeof expectedCoverageValidator>;
export type MedicationChoices = Infer<typeof medicationChoicesValidator>;
type Ctx = QueryCtx | MutationCtx;

/** Runtime validation of JSON evidence uses the exact same tree as return validators. */
function matches(ctx: Ctx, value: unknown, validator: GenericValidator): boolean {
  switch (validator.kind) {
    case "id": return typeof value === "string" && ctx.db.normalizeId(validator.tableName as keyof import("../_generated/dataModel").DataModel, value) !== null;
    case "string": return typeof value === "string" && value.length <= 30000;
    case "float64": return typeof value === "number" && Number.isFinite(value);
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    case "literal": return value === validator.value;
    case "union": return validator.members.some((member: GenericValidator) => matches(ctx, value, member));
    case "array": return Array.isArray(value) && value.length <= MAX_CONSENT_EVENTS && value.every(item => matches(ctx, item, validator.element));
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) return false;
      const record = value as Record<string, unknown>;
      const fields = validator.fields as Record<string, GenericValidator>;
      return Object.keys(record).every(key => key in fields) && Object.entries(fields).every(([key, field]) => key in record ? matches(ctx, record[key], field) : field.isOptional === "optional");
    }
    default: return false;
  }
}
/** Who can prepare a form again: a Parent signs online; a Coach or Travel Lead records paper forms. */
export const PREPARE_FORM_AGAIN = "Prepare the permission form again. A parent prepares their own form; a Coach or Travel Lead prepares paper forms.";
const formMismatch = (what: string) => `${what} ${PREPARE_FORM_AGAIN}`;
export function validateSnapshot(ctx: Ctx, value: unknown): ConsentSnapshot {
  if (!matches(ctx, value, consentSnapshotValidator)) throw new ConvexError(formMismatch("This permission form can't be used as it was prepared."));
  const snapshot = value as ConsentSnapshot;
  validateVersion(snapshot.version);
  if (!snapshot.events.length || snapshot.events.length > MAX_CONSENT_EVENTS || new Set(snapshot.events.map(event => event.eventId)).size !== snapshot.events.length || snapshot.events.some(event => event.endsAt < event.startsAt || !Number.isSafeInteger(event.feeCents) || event.feeCents < 0)) throw new ConvexError(formMismatch("The events on this permission form don't match."));
  for (const revision of [snapshot.student.profileRevision, ...snapshot.priorCoverage.map(row => row.revision)]) assertRevision(revision);
  if (snapshot.priorCoverage.length !== snapshot.events.length || snapshot.priorCoverage.some(row => !snapshot.events.some(event => event.eventId === row.eventId))) throw new ConvexError(formMismatch("The earlier forms for these events don't match."));
  if (snapshot.signer.source === "electronic" && (!snapshot.signer.accountId || !snapshot.signer.email || snapshot.paper !== null) || snapshot.signer.source === "paper" && snapshot.signer.accountId !== null) throw new ConvexError(formMismatch("The signer on this permission form doesn't match."));
  boundedText(snapshot.student.legalName, 160, "Student legal name"); boundedText(snapshot.signer.name, 160, "Signer name");
  for (const [label, value] of [["Emergency contact name", snapshot.emergency.name], ["Emergency contact relationship", snapshot.emergency.relationship], ["Emergency contact phone", snapshot.emergency.phone]] as const) boundedText(value, 254, label);
  for (const report of [snapshot.health.allergies, snapshot.health.medications]) {
    if (report.state === "reported") boundedText(report.text ?? "", 4000, "Health details");
    else if (report.text !== null) throw new ConvexError(formMismatch("Health information on this form says none reported but also has details."));
  }
  if (snapshot.priorCoverage.some((row,index,all) => all.findIndex(item => item.eventId === row.eventId) !== index)) throw new ConvexError(formMismatch("An event is listed twice on this permission form."));
  if (new TextEncoder().encode(JSON.stringify(snapshot)).byteLength > MAX_SNAPSHOT_BYTES) throw new ConvexError("This permission form is too long. Choose fewer events or shorten the wording, then prepare it again.");
  return snapshot;
}
export function parseSnapshot(ctx: Ctx, raw: string) {let value: unknown; try {value = JSON.parse(raw)} catch {throw new ConvexError(formMismatch("This permission form can't be used as it was prepared."))} return validateSnapshot(ctx, value)}
export function assertRevision(value: number) {if (!Number.isSafeInteger(value) || value < 0) throw new ConvexError("This permission form changed since you opened it. Reload to see the latest, then try again.")}
export function boundedText(value: string, maximum: number, label: string) {if (!value.trim() || value.length > maximum) throw new ConvexError(`${label} is required and must be at most ${maximum} characters.`)}
export function validateVersion(version: Infer<typeof versionValidator> | Omit<Doc<"permissionVersions">, "_id" | "_creationTime">) {
  boundedText(version.version, 80, "Version"); boundedText(version.title, 160, "Form title"); boundedText(version.wording, 20000, "Permission wording"); boundedText(version.administrationText, 5000, "Administration text"); boundedText(version.acknowledgmentText, 2000, "Acknowledgment");
  if (version.schoolName !== "Denham Springs High School" || version.teamName !== "FIRST Team 8044, Denham Venom" || !version.wording.toLowerCase().includes("minor first aid")) throw new ConvexError("Permission wording must name the agreed organizations and include minor first aid.");
  if (version.medications.length !== 3 || new Set(version.medications.map(item => item.key)).size !== 3) throw new ConvexError("Exactly Pain, Allergy and Cold medication definitions are required.");
  const labels = {pain: "Pain Medication", allergy: "Allergy Medication", cold: "Cold Medication"};
  for (const item of version.medications) {if (item.label !== labels[item.key]) throw new ConvexError("Use the agreed Pain, Allergy and Cold medication category labels."); boundedText(item.label, 80, "Medication label"); boundedText(item.productsText, 2000, "Covered products"); boundedText(item.exceptionsText, 2000, "Exceptions")}
}
export function publicVersion(version: Doc<"permissionVersions">): Infer<typeof versionValidator> {return { versionId: version._id, version: version.version, title: version.title, wording: version.wording, schoolName: version.schoolName, teamName: version.teamName, medications: version.medications, administrationText: version.administrationText, acknowledgmentText: version.acknowledgmentText, approved: version.approvedAt !== undefined }}
export async function selectedEvents(ctx: Ctx, student: Doc<"students">, eventIds: Id<"events">[]) {
  if (!eventIds.length || eventIds.length > MAX_CONSENT_EVENTS || new Set(eventIds).size !== eventIds.length) throw new ConvexError("Choose between 1 and 50 unique covered events.");
  const result: Infer<typeof consentEventValidator>[] = [];
  for (const eventId of [...eventIds].sort()) {
    const event = await ctx.db.get(eventId);
    if (!event || event.archived || event.cancelled || event.seasonId !== student.seasonId) throw new ConvexError("A covered event is unavailable.");
    requireEnrollmentComplete(event);
    const participant = await ctx.db.query("participants").withIndex("by_eventId_and_studentId", q => q.eq("eventId", eventId).eq("studentId", student._id)).unique();
    if (participant?.status !== "confirmed") throw new ConvexError("Permission forms cover confirmed event participation only.");
    result.push({ eventId, name: event.name, type: event.type, startsAt: event.startsAt, endsAt: event.endsAt, destination: event.destination, travel: event.travel, overnight: event.overnight, feeCents: event.feeCents, independentTravel: participant.independentTravel ?? false, transportEnabled: teamTransportEnabled(event), busSeats: event.busSeats ?? null, additionalAdults: event.additionalAdults ?? null, trailerRequired: event.trailerRequired ?? false });
  }
  return result;
}
export async function snapshotHash(snapshot: ConsentSnapshot) {return tokenHash(JSON.stringify(snapshot))}
