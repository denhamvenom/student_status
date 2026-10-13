import { describe, expect, it } from "vitest";
import { buildSeasonStatusAt, chicagoCalendarDateAt, kickoffForCompetitionYear, REPORTING_TIME_ZONE } from "./seasonCalendar";

describe("verified FIRST kickoff calendar", () => {
  it("uses an explicit competition year and carries official provenance", () => {
    expect(kickoffForCompetitionYear(2027)).toEqual({ state: "verified", competitionYear: 2027, kickoffDate: "2027-01-09", timeZone: REPORTING_TIME_ZONE, sourceUrl: "https://www.firstinspires.org/programs/frc/game-and-season", verifiedOn: "2026-10-13" });
    expect(kickoffForCompetitionYear(2026)).toMatchObject({ state: "verified", kickoffDate: "2026-01-10" });
    expect(kickoffForCompetitionYear(2028)).toEqual({ state: "unavailable", competitionYear: 2028, reason: "kickoffDateNotVerified" });
    expect(() => kickoffForCompetitionYear(Number.NaN)).toThrow("Competition year");
    expect(() => kickoffForCompetitionYear(2027.5)).toThrow("Competition year");
  });

  it("starts at midnight on the Chicago kickoff calendar day, not at the broadcast hour", () => {
    expect(buildSeasonStatusAt(2027, Date.parse("2027-01-09T05:59:59.999Z"))).toMatchObject({ localDate: "2027-01-08", phase: "beforeKickoff" });
    expect(buildSeasonStatusAt(2027, Date.parse("2027-01-09T06:00:00.000Z"))).toMatchObject({ localDate: "2027-01-09", phase: "buildSeason" });
    expect(buildSeasonStatusAt(2027, Date.parse("2027-01-09T17:00:00.000Z"))).toMatchObject({ phase: "buildSeason" });
    expect(buildSeasonStatusAt(2026, Date.parse("2026-01-10T06:00:00.000Z"))).toMatchObject({ kickoffDate: "2026-01-10", phase: "buildSeason" });
  });

  it("keeps year and leap-day boundaries in Chicago and never guesses an unknown year", () => {
    expect(chicagoCalendarDateAt(Date.parse("2027-01-01T05:59:59Z"))).toBe("2026-12-31");
    expect(chicagoCalendarDateAt(Date.parse("2028-03-01T05:59:59Z"))).toBe("2028-02-29");
    expect(chicagoCalendarDateAt(Date.parse("2027-03-15T04:59:59Z"))).toBe("2027-03-14");
    expect(chicagoCalendarDateAt(Date.parse("2027-03-15T05:00:00Z"))).toBe("2027-03-15");
    expect(buildSeasonStatusAt(2028, Date.parse("2028-02-29T12:00:00Z"))).toEqual({ state: "unavailable", competitionYear: 2028, reason: "kickoffDateNotVerified" });
    expect(() => chicagoCalendarDateAt(Number.POSITIVE_INFINITY)).toThrow("As-of time");
    expect(() => chicagoCalendarDateAt(1.5)).toThrow("As-of time");
  });
});
