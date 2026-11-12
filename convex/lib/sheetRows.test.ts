/* eslint-disable @typescript-eslint/no-explicit-any -- fake Google payloads are untyped JSON */
import { describe, expect, it } from "vitest";
import { parseDriveFolderId } from "./driveLinks";
import { buildBatch } from "./googleSheets";
import { folderVisible } from "./sheetKinds";
import { guardianFor, safeCell, rosterGrade } from "./sheetRows";

describe("shared row helpers", () => {
  it.each([[undefined, ""], ["  ", ""], ["10th", "Sophomore"]])("grade %j shows %j", (grade, shown) => expect(rosterGrade(grade)).toBe(shown));
  it("uses the confirmed health profile's guardian, else the older fields (as the Coach roster does)", () => {
    const profile = { guardian: { name: "Profile Guardian", relationship: "Aunt", phone: "555-0111", email: "p@example.invalid" } };
    const old = { guardianName: "Old Guardian", guardianRelationship: "Father", guardianPhone: "555-0122", guardianEmail: "o@example.invalid" };
    expect(guardianFor({ ...old, consentProfileV2: profile, consentProfileV2CompletedAt: 1, consentProfileV2ConfirmedBy: "x" })).toEqual({ name: "Profile Guardian", relationship: "Aunt", phone: "555-0111", email: "p@example.invalid" });
    expect(guardianFor({ ...old, consentProfileV2: profile })).toEqual({ name: "Old Guardian", relationship: "Father", phone: "555-0122", email: "o@example.invalid" });
    expect(guardianFor({})).toEqual({ name: null, relationship: null, phone: null, email: null });
  });
});

describe("Money and Health link visibility (owner decision November 12, 2026)", () => {
  const user = (over: object) => ({ role: "mentor" as "coach" | "mentor" | "parent" | "student", travelLead: true, healthExport: false, ...over });
  it.each([
    ["Coach", { role: "coach", travelLead: false }, true, true],
    ["Travel Lead without Money editing or Health export", {}, true, false],
    ["Travel Lead with Health export", { healthExport: true }, true, true],
    ["Parent acting as Travel Lead (session role Mentor, no Health export)", { healthExport: false }, true, false],
    ["Parent in a Parent session (a stored Travel Lead flag grants nothing)", { role: "parent" }, false, false],
    ["Mentor who is not a Travel Lead", { travelLead: false, healthExport: true }, false, false],
    ["Student", { role: "student", travelLead: false }, false, false],
  ])("%s: Money %s, Health %s", (_name, over, money, health) => {
    expect(folderVisible("money", user(over))).toBe(money);
    expect(folderVisible("health", user(over))).toBe(health);
    expect(folderVisible("general", user(over))).toBe(money);
  });
});

describe("Drive folder links", () => {
  it.each([
    ["https://drive.google.com/drive/folders/1AbC_dEf-GhIjKl?usp=sharing", "1AbC_dEf-GhIjKl"],
    ["https://drive.google.com/drive/u/1/folders/1AbC_dEf-GhIjKl", "1AbC_dEf-GhIjKl"],
    ["https://drive.google.com/open?id=1AbC_dEf-GhIjKl", "1AbC_dEf-GhIjKl"],
    ["  1AbC_dEf-GhIjKl  ", "1AbC_dEf-GhIjKl"],
    ["https://docs.google.com/spreadsheets/d/1AbC_dEf-GhIjKl/edit", null], ["https://evil.example/drive/folders/1AbC_dEf-GhIjKl", null], ["not a link", null], ["", null],
    [`https://drive.google.com/drive/folders/${"a".repeat(100)}`, "a".repeat(100)], [`https://drive.google.com/drive/folders/${"a".repeat(101)}`, null], ["a".repeat(101), null], [`https://drive.google.com/open?id=${"a".repeat(101)}`, null],
  ])("reads %j as %j", (input, id) => expect(parseDriveFolderId(input)).toBe(id));
});

describe("writing a spreadsheet", () => {
  const tabs = [{ title: "Counts", rows: [["Size", "Students"], ["=1+1", 3]] }, { title: "Details", rows: [["Name"]] }];
  it("sends text as text so it can never become a formula", () => {
    const { requests } = buildBatch(tabs, [{ sheetId: 0, title: "Sheet1", protected: false }], 0);
    const write = requests.flatMap((r: any) => (r.updateCells?.rows ? [r.updateCells] : []))[0];
    const cell = write.rows[2].values[0].userEnteredValue;
    expect(cell).toEqual({ stringValue: "'=1+1" });
    expect(write.rows[2].values[1].userEnteredValue).toEqual({ numberValue: 3 });
    expect(JSON.stringify(requests)).not.toContain("formulaValue");
  });
  it.each(["=1+1", "+cmd|calc", "-cmd", "@SUM(A1)", "+", "-A1"])("shows %j as text that Excel cannot run from a CSV download", text => {
    const { requests } = buildBatch([{ title: "T", rows: [["Name"], [text]] }], [], 0);
    const write = requests.flatMap((r: any) => (r.updateCells?.rows ? [r.updateCells] : []))[0];
    expect(write.rows[2].values[0].userEnteredValue).toEqual({ stringValue: `'${text}` });
  });
  it("leaves ordinary text, phone numbers and numbers as they are", () => {
    expect([safeCell("Dev"), safeCell("5 - 7"), safeCell(-5), safeCell(""), safeCell("+1 555-0100"), safeCell("(202) 555-0123"), safeCell("-5"), safeCell("+15550100")]).toEqual(["Dev", "5 - 7", -5, "", "+1 555-0100", "(202) 555-0123", "-5", "+15550100"]);
  });
  it("deletes tabs it no longer produces, after the tabs it keeps, and never a protection twice", () => {
    const existing = [{ sheetId: 0, title: "Counts", protected: true }, { sheetId: 7, title: "Old tab", protected: false }, { sheetId: 8, title: "Details", protected: false }];
    const { requests } = buildBatch(tabs, existing, 0);
    expect(requests.at(-1)).toEqual({ deleteSheet: { sheetId: 7 } });
    expect(requests.filter((r: any) => r.addProtectedRange).map((r: any) => r.addProtectedRange.protectedRange.range.sheetId)).toEqual([8]);
    expect(requests.some((r: any) => r.addSheet)).toBe(false);
  });
  it("reuses the default tab, adds missing tabs, and adds protection once", () => {
    const first = buildBatch(tabs, [{ sheetId: 0, title: "Sheet1", protected: false }], 0);
    expect(first.tabs).toEqual([{ title: "Counts", sheetId: 0 }, { title: "Details", sheetId: 1 }]);
    expect(JSON.stringify(first.requests.filter((r: any) => r.addProtectedRange))).toContain('"warningOnly":true');
    const again = buildBatch(tabs, [{ sheetId: 0, title: "Counts", protected: true }, { sheetId: 1, title: "Details", protected: true }], 0);
    expect(again.requests.some((r: any) => r.addProtectedRange || r.addSheet)).toBe(false);
    expect(again.requests.filter((r: any) => r.updateSheetProperties?.properties.gridProperties?.frozenRowCount === 2)).toHaveLength(2);
  });
});
