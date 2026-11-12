import { describe, expect, it } from "vitest";
import { definition, driverTabs, type DriverRow } from "./drivers";

const driver = (name: string, extra: Partial<DriverRow> = {}): DriverRow => ({ name, phone: "555-0100", email: "d@example.invalid", seats: 4, vehicle: "Van", canTow: false, approved: true, active: true, ...extra });

describe("driver rows", () => {
  it("lists approved drivers first, then by name, with typed seats", () => {
    const [{ rows }] = driverTabs([driver("Zoe", { approved: false }), driver("Bo", { canTow: true, vehicle: "", active: false }), driver("Al")]);
    expect(rows[0]).toEqual(["Name", "Phone", "Email", "Passenger seats", "Vehicle", "Can tow", "Approved", "Active"]);
    expect(rows.slice(1).map(row => row[0])).toEqual(["Al", "Bo", "Zoe"]);
    expect(rows[2]).toEqual(["Bo", "555-0100", "d@example.invalid", 4, "", "Yes", "Yes", "No"]);
    expect(rows[3].slice(5)).toEqual(["No", "No", "Yes"]);
  });
  it("still has a header with no drivers", () => {
    expect(driverTabs([])[0].rows).toHaveLength(1);
  });
});

describe("drivers file", () => {
  it("is a General team file named after the season", () => {
    expect([definition.folder, definition.scope, definition.ready, definition.title({ seasonName: "Synthetic 2027", event: null })]).toEqual(["general", "team", true, "Drivers - Synthetic 2027"]);
  });
});
