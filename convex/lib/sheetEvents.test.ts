import { describe, expect, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import { eventFileName, eventQualifies, eventWindowEnds, type SheetEventFields } from "./sheetEvents";

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

describe("event file names", () => {
  it("uses the event name and its start date in team time, with an optional suffix", () => {
    // 11:30 PM Central on Mar 6 is already Mar 7 in UTC.
    const at = Date.parse("2027-03-07T05:30:00Z");
    expect(eventFileName({ name: " Lone Star Regional ", startsAt: at })).toBe("Lone Star Regional - Mar 6, 2027");
    expect(eventFileName({ name: "Lone Star Regional", startsAt: at }, "Fees")).toBe("Lone Star Regional - Mar 6, 2027 - Fees");
  });
});
