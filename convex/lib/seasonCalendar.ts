import { chicagoDateString, TEAM_TIME_ZONE } from "../../shared/chicago-time";

/** FIRST competition-year kickoff dates. Add each year only after checking an official FIRST source. */

type VerifiedKickoff = {
  state: "verified";
  competitionYear: number;
  kickoffDate: string;
  timeZone: typeof TEAM_TIME_ZONE;
  sourceUrl: string;
  verifiedOn: string;
};
type UnavailableKickoff = { state: "unavailable"; competitionYear: number; reason: "kickoffDateNotVerified" };

const KICKOFFS: Readonly<Record<number, Readonly<Omit<VerifiedKickoff, "state" | "competitionYear" | "timeZone">>>> = Object.freeze({
  2026: Object.freeze({ kickoffDate: "2026-01-10", sourceUrl: "https://community.firstinspires.org/2026-just-a-few-days-until-kickoff", verifiedOn: "2026-10-13" }),
  2027: Object.freeze({ kickoffDate: "2027-01-09", sourceUrl: "https://www.firstinspires.org/programs/frc/game-and-season", verifiedOn: "2026-10-13" }),
});

/** A season name is intentionally not accepted as a substitute for competition year. */
export function kickoffForCompetitionYear(competitionYear: number): VerifiedKickoff | UnavailableKickoff {
  if (!Number.isSafeInteger(competitionYear) || competitionYear < 1900 || competitionYear > 9999) throw new Error("Competition year must be a four-digit whole number.");
  const entry = KICKOFFS[competitionYear];
  return entry
    ? { state: "verified", competitionYear, kickoffDate: entry.kickoffDate, timeZone: TEAM_TIME_ZONE, sourceUrl: entry.sourceUrl, verifiedOn: entry.verifiedOn }
    : { state: "unavailable", competitionYear, reason: "kickoffDateNotVerified" };
}

/** YYYY-MM-DD in the reporting calendar, independent of the server/browser locale. */
export function chicagoCalendarDateAt(epochMs: number): string {
  if (!Number.isSafeInteger(epochMs) || !Number.isFinite(new Date(epochMs).getTime())) throw new Error("As-of time must be a valid epoch millisecond integer.");
  return chicagoDateString(epochMs);
}

export function buildSeasonStatusAt(competitionYear: number, epochMs: number) {
  const localDate = chicagoCalendarDateAt(epochMs);
  const kickoff = kickoffForCompetitionYear(competitionYear);
  if (kickoff.state === "unavailable") return kickoff;
  return { ...kickoff, localDate, phase: localDate < kickoff.kickoffDate ? "beforeKickoff" as const : "buildSeason" as const };
}

/** Verified FIRST kickoffs fall in January, when Chicago midnight is 06:00 UTC. */
export function kickoffBoundaryForCompetitionYear(competitionYear: number) {
  const kickoff = kickoffForCompetitionYear(competitionYear);
  if (kickoff.state === "unavailable") return kickoff;
  const kickoffAt = Date.parse(`${kickoff.kickoffDate}T06:00:00.000Z`);
  if (chicagoCalendarDateAt(kickoffAt) !== kickoff.kickoffDate || chicagoCalendarDateAt(kickoffAt - 1) === kickoff.kickoffDate) throw new Error("Verified kickoff does not resolve to Chicago midnight.");
  return { ...kickoff, kickoffAt };
}
