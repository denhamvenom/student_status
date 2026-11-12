import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { eventFileName, eventKindApplies, eventNeedsTravelEmergency, eventQualifies, eventWindowEnds, type SheetEventFields, type SheetTravelFields } from "./sheetEvents";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-12T18:00:00Z");
const event = (startDays: number, endDays: number, over: Partial<SheetEventFields> = {}): SheetEventFields =>
  ({ startsAt: NOW + startDays * DAY, endsAt: NOW + endDays * DAY, archived: false, cancelled: undefined, type: "Competition", seriesId: undefined, ...over });

describe("which events get their own spreadsheets", () => {
  it.each([
    ["starts in 60 days", event(60, 61), true],
    ["starts in 61 days", event(61, 62), false],
    ["is happening now", event(-1, 1), true],
    ["ended 7 days ago", event(-8, -7), true],
    ["ended 8 days ago (frozen)", event(-9, -8), false],
    ["is canceled", event(5, 6, { cancelled: true }), false],
    ["is archived", event(5, 6, { archived: true }), false],
    ["is a regular Team meeting", event(5, 6, { type: "Team" }), false],
    ["is an occurrence of a repeating meeting", event(5, 6, { type: "Outreach", seriesId: "series1" as Id<"eventSeries"> }), false],
    ["is an Outreach event", event(5, 6, { type: "Outreach" }), true],
    ["is a Fundraiser with cancelled: false", event(5, 6, { type: "Fundraiser", cancelled: false }), true],
  ])("an event that %s: %s", (_name, fields, expected) => expect(eventQualifies(fields, NOW)).toBe(expected));

  it("searches end times wide enough to hold every qualifying event", () => {
    const { from, to } = eventWindowEnds(NOW);
    for (const fields of [event(60, 61), event(-8, -7), event(60, 85)]) expect(fields.endsAt >= from && fields.endsAt <= to).toBe(true);
  });
});

describe("which events get a Travel emergency file", () => {
  const plain: SheetTravelFields = { travel: "Provide your Own", transportEnabled: undefined, onsite: undefined, locationType: "inPerson", overnight: false, permissionRequired: false };
  it.each([
    ["has no travel, overnight stay or permission form", plain, false],
    ["uses a charter bus", { ...plain, travel: "Charter Bus" }, true],
    ["uses a carpool with team transport turned off", { ...plain, travel: "Team Carpool", transportEnabled: false }, false],
    ["is virtual (a bus value left over)", { ...plain, travel: "Charter Bus", locationType: "virtual" as const }, false],
    ["is on site", { ...plain, travel: "Charter Bus", onsite: true }, false],
    ["is overnight", { ...plain, overnight: true }, true],
    ["requires a permission form", { ...plain, permissionRequired: true }, true],
  ])("an event that %s: %s", (_name, fields, expected) => {
    expect(eventNeedsTravelEmergency(fields)).toBe(expected);
    expect(eventKindApplies("eventTravelEmergency", fields)).toBe(expected);
    // The Event and Fees files don't depend on travel.
    expect(eventKindApplies("event", fields) && eventKindApplies("eventFees", fields)).toBe(true);
  });
});

describe("event file names", () => {
  it("starts with the start date in team time (YYYY-MM-DD), then the event name and an optional suffix", () => {
    // 11:30 PM Central on Mar 6 is already Mar 7 in UTC.
    const at = Date.parse("2027-03-07T05:30:00Z");
    expect(eventFileName({ name: " Lone Star Regional ", startsAt: at })).toBe("2027-03-06 Lone Star Regional");
    expect(eventFileName({ name: "Lone Star Regional", startsAt: at }, "Fees")).toBe("2027-03-06 Lone Star Regional - Fees");
    expect(eventFileName({ name: "Kickoff", startsAt: Date.parse("2027-01-04T15:00:00Z") }, "Travel emergency")).toBe("2027-01-04 Kickoff - Travel emergency");
  });
});
