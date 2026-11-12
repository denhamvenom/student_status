import { describe, expect, it } from "vitest";
import { definition, healthTabs, type HealthSheetStudent } from "./health";

const student = (name: string, extra: Partial<HealthSheetStudent> = {}): HealthSheetStudent => ({
  legalName: name, preferredName: name, grade: "11", dateOfBirth: "2009-01-02", emergencyName: "Em", emergencyRelationship: "Mother", emergencyPhone: "555-0100",
  allergies: { state: "none", text: null }, medications: { state: "none", text: null }, otcAuthorization: null,
  insurance: { state: "none", provider: null, policy: null }, physician: { state: "provided", name: "Dr Who", phone: "555-0199" }, formsAccepted: 2, formsOpen: 1, ...extra,
});

describe("health file", () => {
  it("has a Students tab sorted by name and an Adults tab with only emergency contacts", () => {
    const [students, adults] = healthTabs({
      students: [student("Zed"), student("Amy", { formsAccepted: 0, formsOpen: 0 })],
      adults: [{ name: "Pat", role: "Mentor", emergencyName: null, emergencyRelationship: null, emergencyPhone: null }, { name: "Ann", role: "Coach", emergencyName: "Bo", emergencyRelationship: "Spouse", emergencyPhone: "555-0150" }],
    });
    expect(students.title).toBe("Students");
    expect(students.rows[0]).toHaveLength(15);
    expect(students.rows[0].slice(-2)).toEqual(["Permission forms accepted", "Permission forms not accepted yet"]);
    expect(students.rows.slice(1).map(row => row[0])).toEqual(["Amy", "Zed"]);
    expect(students.rows[2]).toEqual(["Zed", "Junior", "2009-01-02", "Em", "Mother", "555-0100", "None reported", "None reported", "", "None reported", "", "Dr Who", "555-0199", 2, 1]);
    expect(adults.title).toBe("Adults");
    expect(adults.rows[0]).toEqual(["Name", "Role", "Emergency contact name", "Emergency contact relationship", "Emergency contact phone"]);
    expect(adults.rows.slice(1)).toEqual([["Ann", "Coach", "Bo", "Spouse", "555-0150"], ["Pat", "Mentor", "", "", ""]]);
    expect(adults.rows[0].join("|")).not.toMatch(/allerg|medic|insurance|physician/i);
  });

  it("is a Health team file named after the season", () => {
    expect([definition.folder, definition.scope, definition.ready, definition.title({ seasonName: "Synthetic 2027", event: null })]).toEqual(["health", "team", true, "Health - Synthetic 2027"]);
  });
});
