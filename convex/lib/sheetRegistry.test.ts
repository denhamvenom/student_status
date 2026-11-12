import { describe, expect, it } from "vitest";
import { SHEET_KIND_NAMES } from "./sheetKinds";
import { SHEET_REGISTRY, readySheetKinds } from "./sheetRegistry";

describe("spreadsheet kind registry", () => {
  it("registers every kind the schema accepts, each under its own name", () => {
    expect(Object.keys(SHEET_REGISTRY)).toEqual([...SHEET_KIND_NAMES]);
    for (const [name, entry] of Object.entries(SHEET_REGISTRY)) expect(entry.definition.kind).toBe(name);
  });
  it("puts each planned kind in its agreed folder and scope", () => {
    const placed = Object.fromEntries(Object.values(SHEET_REGISTRY).map(entry => [entry.definition.kind, `${entry.definition.scope}/${entry.definition.folder}`]));
    expect(placed).toEqual({
      studentRoster: "team/general", shirtSizes: "team/general", adultRoster: "team/general", drivers: "team/general", readiness: "team/general", attendance: "team/general",
      money: "team/money", health: "team/health", event: "event/events", eventFees: "event/money", eventTravelEmergency: "event/health",
    });
  });
  it("lists every ready kind by scope, in registry order, and skips a kind that is not ready", () => {
    const names = (scope: "team" | "event") => readySheetKinds(scope).map(definition => definition.kind);
    expect(names("team")).toEqual(["studentRoster", "shirtSizes", "adultRoster", "drivers", "readiness", "attendance", "money", "health"]);
    expect(names("event")).toEqual(["event", "eventFees", "eventTravelEmergency"]);
    const drivers = SHEET_REGISTRY.drivers.definition;
    drivers.ready = false;
    try { expect(names("team")).not.toContain("drivers"); } finally { drivers.ready = true; }
  });
});
