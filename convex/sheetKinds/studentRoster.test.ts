import { describe, expect, it } from "vitest";
import { definition, studentRosterTabs, type RosterStudent } from "./studentRoster";

describe("student roster rows", () => {
  const base: RosterStudent = { preferredName: "Dev", legalName: "Dev Student", grade: "10th", subteam: "Build", secondarySubteam: null, leadership: true, travelTeam: false, email: "dev@example.invalid", guardianName: "Gail", guardianRelationship: "Mother", guardianPhone: "555-0100", guardianEmail: "g@example.invalid", parentAccounts: ["Pat Parent", "Lee Parent"] };
  it("writes one row per student, with a blank grade when none is saved", () => {
    const [{ rows }] = studentRosterTabs([base, { ...base, preferredName: "Zed", legalName: "Zed Student", grade: null, secondarySubteam: "Programming", leadership: false, travelTeam: true, guardianName: null, parentAccounts: [] }]);
    expect(rows[0]).toHaveLength(13);
    expect(rows[1]).toEqual(["Dev", "Dev Student", "Sophomore", "Build", "", "Yes", "No", "dev@example.invalid", "Gail", "Mother", "555-0100", "g@example.invalid", "Pat Parent; Lee Parent"]);
    expect(rows[2].slice(2, 7)).toEqual(["", "Build", "Programming", "No", "Yes"]);
    expect(rows[2][8]).toBe("");
  });
});

describe("student roster file", () => {
  it("is a General team file named after the season", () => {
    expect([definition.folder, definition.scope, definition.ready, definition.title({ seasonName: "Synthetic 2027", event: null })]).toEqual(["general", "team", true, "Student roster - Synthetic 2027"]);
  });
});
