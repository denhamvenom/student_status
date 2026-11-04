import { canonicalSubteam, subteamOptions } from "../../src/lib/subteams";

/**
 * Pure audience rules for events: who an event is for, and how the audience choice maps onto stored event fields.
 * Types are declared locally because the audience fields are not in the schema yet.
 */

export const PRIMARY_SUBTEAMS = subteamOptions;
export const SECONDARY_SUBTEAMS = ["CAD"] as const;
export const LEADERSHIP_GROUP = "Leadership";
export const AUDIENCE_GROUPS = [...subteamOptions, ...SECONDARY_SUBTEAMS, LEADERSHIP_GROUP] as const;

export type AudienceKind = "everyone" | "subteams" | "students" | "mentorsOnly";
export type SignupMode = "assigned" | "open" | "approval";
export type AssignmentScope = "selected" | "travelTeam" | "wholeTeam";

export type AudienceEventFields = {
  signupMode: SignupMode;
  assignmentScope?: AssignmentScope;
  audienceKind?: AudienceKind;
  audienceSubteams?: string[];
  mandatory?: boolean;
};

export type AudienceStudent = { subteam: string; secondarySubteam?: string; leadership?: boolean; active: boolean };

export type ResolvedAudience = { kind: AudienceKind; subteams: string[]; mandatory: boolean; legacy: boolean };

/**
 * The event's audience. Events saved before audiences existed have no `audienceKind` and are read as:
 * assigned + wholeTeam => everyone, mandatory; assigned + selected/travelTeam (or no scope) => listed students, mandatory;
 * open/approval => everyone, optional.
 */
export function resolveAudience(event: AudienceEventFields): ResolvedAudience {
  if (event.audienceKind !== undefined) {
    return {
      kind: event.audienceKind,
      subteams: event.audienceKind === "subteams" ? [...(event.audienceSubteams ?? [])] : [],
      mandatory: event.audienceKind === "mentorsOnly" ? false : event.mandatory ?? event.signupMode === "assigned",
      legacy: false,
    };
  }
  if (event.signupMode !== "assigned") return { kind: "everyone", subteams: [], mandatory: false, legacy: true };
  if (event.assignmentScope === "wholeTeam") return { kind: "everyone", subteams: [], mandatory: true, legacy: true };
  return { kind: "students", subteams: [], mandatory: true, legacy: true };
}

/** Primary subteam (legacy names canonicalized), secondary subteam, or Leadership membership. */
export function studentMatchesSubteams(student: AudienceStudent, groups: readonly string[]): boolean {
  const wanted = new Set(groups.map(group => canonicalSubteam(group)));
  if (wanted.size === 0) return false;
  if (wanted.has(canonicalSubteam(student.subteam))) return true;
  const secondary = student.secondarySubteam?.trim();
  if (secondary && wanted.has(secondary)) return true;
  return wanted.has(LEADERSHIP_GROUP) && student.leadership === true;
}

/** Whether a student is in the event's audience. `isListedStudent` is true when the student is named on the event. */
export function studentInAudience(event: AudienceEventFields, student: AudienceStudent, isListedStudent: boolean): boolean {
  const audience = resolveAudience(event);
  switch (audience.kind) {
    case "everyone": return student.active;
    case "subteams": return student.active && studentMatchesSubteams(student, audience.subteams);
    case "students": return isListedStudent;
    case "mentorsOnly": return false;
  }
}

export type AudienceInput = {
  kind: AudienceKind;
  subteams: string[];
  mandatory: boolean;
  studentCount: number;
  mentorInviteCount: number;
  actorIsCoach: boolean;
};

export function validateAudienceInput(input: AudienceInput): string[] {
  const errors: string[] = [];
  if (input.kind === "subteams") {
    if (input.subteams.length === 0) errors.push("Choose at least one subteam.");
    else if (input.subteams.some(group => !(AUDIENCE_GROUPS as readonly string[]).includes(group))) errors.push("Choose subteams from the list.");
    else if (new Set(input.subteams).size !== input.subteams.length) errors.push("Each subteam can only be chosen once.");
  }
  if (input.kind === "students" && input.studentCount < 1) errors.push("Choose at least one student.");
  if (input.kind === "mentorsOnly") {
    if (input.mentorInviteCount < 1) errors.push("Invite at least one Mentor.");
    if (input.mandatory) errors.push("Mentor-only events can't be mandatory.");
  }
  if (input.mandatory && (input.kind === "everyone" || input.kind === "subteams") && !input.actorIsCoach) {
    errors.push("Only Coaches can make an event mandatory for the whole team or a subteam.");
  }
  return errors;
}

export type StoredAudienceFields = {
  signupMode: SignupMode;
  assignmentScope?: AssignmentScope;
  audienceKind: AudienceKind;
  audienceSubteams: string[];
  mandatory: boolean;
};

/**
 * Event fields for a validated audience choice. Mandatory audiences are assigned (everyone => wholeTeam, subteams/students =>
 * selected); optional ones use `optionalSignupMode` (default open) with no scope; mentor-only events are assigned with no scope.
 */
export function toStoredEventFields(input: { kind: AudienceKind; subteams: string[]; mandatory: boolean; optionalSignupMode?: "open" | "approval" }): StoredAudienceFields {
  const audienceSubteams = input.kind === "subteams" ? [...input.subteams] : [];
  if (input.kind === "mentorsOnly") return { signupMode: "assigned", audienceKind: "mentorsOnly", audienceSubteams, mandatory: false };
  if (!input.mandatory) return { signupMode: input.optionalSignupMode ?? "open", audienceKind: input.kind, audienceSubteams, mandatory: false };
  return { signupMode: "assigned", assignmentScope: input.kind === "everyone" ? "wholeTeam" : "selected", audienceKind: input.kind, audienceSubteams, mandatory: true };
}
