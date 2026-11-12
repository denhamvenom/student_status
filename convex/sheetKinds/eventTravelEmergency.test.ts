import { describe, expect, it } from "vitest";
import { definition, travelEmergencyTabs, type TravelStudent } from "./eventTravelEmergency";

const student: TravelStudent = {
  legalName: "Dev Student", preferredName: "Dev", grade: "9", dateOfBirth: null, emergencyName: "Em", emergencyRelationship: "Aunt", emergencyPhone: "555-0100",
  allergies: { state: "reported", text: "Peanuts\nBees" }, medications: { state: "unknown", text: null }, otcAuthorization: "yes", insurance: null, physician: null, permissionForm: "Accepted",
};
const event = { name: "Synthetic Regional", startsAt: Date.UTC(2027, 2, 5, 18), endsAt: Date.UTC(2027, 2, 7, 18), place: "Synthetic Arena" };

describe("travel emergency file", () => {
  it("writes event header rows, confirmed students, and Mentors with emergency contacts only", () => {
    const [header, students, mentors] = travelEmergencyTabs({ event, students: [student], adults: [{ name: "Mia", role: "Travel Lead", emergencyName: "Jo", emergencyRelationship: "Friend", emergencyPhone: "555-0123" }] });
    expect(header.rows).toEqual([["Event", "Synthetic Regional"], ["Date", "Mar 5, 2027 to Mar 7, 2027"], ["Place", "Synthetic Arena"]]);
    expect(students.rows[0].at(-1)).toBe("Permission form");
    expect(students.rows[1]).toEqual(["Dev Student", "Freshman", "", "Em", "Aunt", "555-0100", "Peanuts; Bees", "Not provided", "Yes", "", "", "", "", "Accepted"]);
    expect(mentors.rows).toEqual([["Name", "Role", "Emergency contact name", "Emergency contact relationship", "Emergency contact phone"], ["Mia", "Travel Lead", "Jo", "Friend", "555-0123"]]);
  });

  it("is a Health event file named after the event", () => {
    expect([definition.folder, definition.scope, definition.ready]).toEqual(["health", "event", true]);
    expect(definition.title({ seasonName: "S", event: { name: "Synthetic Regional", startsAt: Date.UTC(2027, 2, 5, 18) } })).toBe("2027-03-05 Synthetic Regional - Travel emergency");
  });
});
