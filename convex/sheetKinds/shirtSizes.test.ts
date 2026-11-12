import { describe, expect, it } from "vitest";
import { definition, shirtSizeTabs, type ShirtPerson } from "./shirtSizes";

const person = (name: string, type: ShirtPerson["type"], size: string | null, subteam = "Build"): ShirtPerson => ({ name, type, subteam, size });

describe("shirt size tabs", () => {
  const tabs = shirtSizeTabs([
    person("Sam Student", "Student", "M"), person("Ada Student", "Student", "XL"), person("Mia Mentor", "Adult", "M"), person("Max Mentor", "Adult", "xxl"),
    person("Una Unsized", "Student", null), person("Blank Mentor", "Adult", "  "),
  ]);
  const [counts, details, missing] = tabs;
  it("counts sizes by group, with an Other bucket and a totals row", () => {
    expect(counts.rows).toEqual([
      ["Size", "Students", "Adults", "Total"], ["XS", 0, 0, 0], ["S", 0, 0, 0], ["M", 1, 1, 2], ["L", 0, 0, 0], ["XL", 1, 0, 1], ["2XL", 0, 0, 0], ["3XL", 0, 0, 0], ["Other", 0, 1, 1], ["Total", 2, 2, 4],
    ]);
  });
  it("lists Mentors first and shows an unusual size as entered", () => {
    expect(details.rows.map(row => row.slice(0, 2).concat(row[3]))).toEqual([["Name", "Student or adult", "Size"], ["Max Mentor", "Adult", "xxl"], ["Mia Mentor", "Adult", "M"], ["Ada Student", "Student", "XL"], ["Sam Student", "Student", "M"]]);
  });
  it("puts people without a size in Missing size, not in Counts", () => {
    expect(missing.rows.map(row => row[0])).toEqual(["Name", "Blank Mentor", "Una Unsized"]);
  });
  it("still returns all three tabs with no people", () => {
    expect(shirtSizeTabs([]).map(tab => tab.title)).toEqual(["Counts", "Details", "Missing size"]);
  });
});

describe("shirt sizes file", () => {
  it("is a General team file named after the season", () => {
    expect([definition.folder, definition.scope, definition.ready, definition.title({ seasonName: "Synthetic 2027", event: null })]).toEqual(["general", "team", true, "Shirt sizes - Synthetic 2027"]);
  });
});
