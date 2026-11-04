import { describe, expect, it } from "vitest";
import { AUDIENCE_GROUPS, resolveAudience, studentInAudience, studentMatchesSubteams, toStoredEventFields, validateAudienceInput, type AudienceEventFields, type AudienceInput, type AudienceStudent } from "./eventAudienceRules";

const student = (overrides: Partial<AudienceStudent> = {}): AudienceStudent => ({ subteam: "Programming", active: true, ...overrides });

describe("resolveAudience", () => {
  it.each<[string, AudienceEventFields, string, boolean]>([
    ["assigned whole team", { signupMode: "assigned", assignmentScope: "wholeTeam" }, "everyone", true],
    ["assigned selected", { signupMode: "assigned", assignmentScope: "selected" }, "students", true],
    ["assigned Travel Team", { signupMode: "assigned", assignmentScope: "travelTeam" }, "students", true],
    ["open", { signupMode: "open" }, "everyone", false],
    ["approval", { signupMode: "approval", assignmentScope: "travelTeam" }, "everyone", false],
  ])("reads legacy %s events", (_label, event, kind, mandatory) => {
    expect(resolveAudience(event)).toEqual({ kind, subteams: [], mandatory, legacy: true });
  });

  it("uses explicit audience fields when present", () => {
    expect(resolveAudience({ signupMode: "open", audienceKind: "subteams", audienceSubteams: ["CAD"], mandatory: false })).toEqual({ kind: "subteams", subteams: ["CAD"], mandatory: false, legacy: false });
    expect(resolveAudience({ signupMode: "assigned", audienceKind: "mentorsOnly", mandatory: true }).mandatory).toBe(false);
  });
});

describe("studentMatchesSubteams", () => {
  it.each<[string, AudienceStudent, string[], boolean]>([
    ["primary", student(), ["Programming"], true],
    ["legacy primary name", student({ subteam: "Mechanical" }), ["Build"], true],
    ["legacy business name", student({ subteam: "Outreach" }), ["Business/Media"], true],
    ["secondary CAD", student({ secondarySubteam: "CAD" }), ["CAD"], true],
    ["leadership", student({ leadership: true }), ["Leadership"], true],
    ["no leadership flag", student(), ["Leadership"], false],
    ["other subteam", student(), ["Build", "CAD"], false],
    ["no groups", student(), [], false],
  ])("%s", (_label, who, groups, expected) => {
    expect(studentMatchesSubteams(who, groups)).toBe(expected);
  });
});

describe("studentInAudience", () => {
  const subteams: AudienceEventFields = { signupMode: "assigned", assignmentScope: "selected", audienceKind: "subteams", audienceSubteams: ["Build"], mandatory: true };
  it.each<[string, AudienceEventFields, AudienceStudent, boolean, boolean]>([
    ["everyone includes active students", { signupMode: "open" }, student(), false, true],
    ["everyone excludes inactive students", { signupMode: "assigned", assignmentScope: "wholeTeam" }, student({ active: false }), true, false],
    ["subteams include members", subteams, student({ subteam: "Build" }), false, true],
    ["subteams exclude non-members", subteams, student(), true, false],
    ["subteams exclude inactive members", subteams, student({ subteam: "Build", active: false }), false, false],
    ["legacy Travel Team uses the list", { signupMode: "assigned", assignmentScope: "travelTeam" }, student(), true, true],
    ["legacy selected excludes unlisted", { signupMode: "assigned", assignmentScope: "selected" }, student(), false, false],
    ["mentor-only has no students", { signupMode: "assigned", audienceKind: "mentorsOnly", mandatory: false }, student(), true, false],
  ])("%s", (_label, event, who, listed, expected) => {
    expect(studentInAudience(event, who, listed)).toBe(expected);
  });
});

describe("validateAudienceInput", () => {
  const input = (overrides: Partial<AudienceInput>): AudienceInput => ({ kind: "everyone", subteams: [], mandatory: false, studentCount: 0, mentorInviteCount: 0, actorIsCoach: false, ...overrides });
  it.each<[string, Partial<AudienceInput>, number]>([
    ["optional everyone by a Travel Lead", {}, 0],
    ["mandatory everyone by a Coach", { mandatory: true, actorIsCoach: true }, 0],
    ["mandatory everyone by a Travel Lead", { mandatory: true }, 1],
    ["mandatory subteams by a Travel Lead", { kind: "subteams", subteams: ["CAD"], mandatory: true }, 1],
    ["every audience group", { kind: "subteams", subteams: [...AUDIENCE_GROUPS] }, 0],
    ["no subteams", { kind: "subteams" }, 1],
    ["unknown subteam", { kind: "subteams", subteams: ["Mechanical"] }, 1],
    ["duplicate subteam", { kind: "subteams", subteams: ["CAD", "CAD"] }, 1],
    ["no students", { kind: "students", mandatory: true }, 1],
    ["mandatory listed students by a Travel Lead", { kind: "students", studentCount: 3, mandatory: true }, 0],
    ["mentor-only without invites", { kind: "mentorsOnly" }, 1],
    ["mandatory mentor-only", { kind: "mentorsOnly", mentorInviteCount: 2, mandatory: true, actorIsCoach: true }, 1],
    ["mentor-only with invites", { kind: "mentorsOnly", mentorInviteCount: 2 }, 0],
  ])("%s", (_label, overrides, errorCount) => {
    expect(validateAudienceInput(input(overrides))).toHaveLength(errorCount);
  });
});

describe("toStoredEventFields", () => {
  it.each<[string, Parameters<typeof toStoredEventFields>[0], ReturnType<typeof toStoredEventFields>]>([
    ["mandatory everyone", { kind: "everyone", subteams: [], mandatory: true }, { signupMode: "assigned", assignmentScope: "wholeTeam", audienceKind: "everyone", audienceSubteams: [], mandatory: true }],
    ["mandatory subteams", { kind: "subteams", subteams: ["Build", "CAD"], mandatory: true }, { signupMode: "assigned", assignmentScope: "selected", audienceKind: "subteams", audienceSubteams: ["Build", "CAD"], mandatory: true }],
    ["mandatory students", { kind: "students", subteams: ["Build"], mandatory: true }, { signupMode: "assigned", assignmentScope: "selected", audienceKind: "students", audienceSubteams: [], mandatory: true }],
    ["optional subteams", { kind: "subteams", subteams: ["CAD"], mandatory: false }, { signupMode: "open", audienceKind: "subteams", audienceSubteams: ["CAD"], mandatory: false }],
    ["optional with approval", { kind: "everyone", subteams: [], mandatory: false, optionalSignupMode: "approval" }, { signupMode: "approval", audienceKind: "everyone", audienceSubteams: [], mandatory: false }],
    ["mentor-only", { kind: "mentorsOnly", subteams: [], mandatory: false }, { signupMode: "assigned", audienceKind: "mentorsOnly", audienceSubteams: [], mandatory: false }],
  ])("%s", (_label, input, stored) => {
    expect(toStoredEventFields(input)).toEqual(stored);
    expect(resolveAudience(stored)).toEqual({ kind: input.kind, subteams: stored.audienceSubteams, mandatory: stored.mandatory, legacy: false });
  });
});
