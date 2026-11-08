// The Required-meeting weekday rule, shared by attendance reports (attendanceReports.ts) and the app's Team Calendar
// defaults for new meetings (src/features/event-setup/new-event-defaults.ts). Pure: no Convex server imports, so the
// browser bundle can use it too.
import { TEAM_TIME_ZONE } from "../../shared/chicago-time";
import { kickoffBoundaryForCompetitionYear } from "./seasonCalendar";

const chicagoWeekday = new Intl.DateTimeFormat("en-US", { timeZone: TEAM_TIME_ZONE, weekday: "long" });

/** The weekday a meeting must fall on to count as Required: Tuesday before Build Season kickoff, Monday from kickoff. */
function requiredWeekday(scheduledStart: number, kickoffAt: number | null): "Monday" | "Tuesday" {
  return kickoffAt !== null && scheduledStart >= kickoffAt ? "Monday" : "Tuesday";
}

/** Required meetings: non-Outreach sessions on Tuesdays before Build Season kickoff and Mondays from kickoff (Chicago weekday). */
export function requiredFromSchedule(scheduledStart: number, outreach: boolean, kickoffAt: number | null): boolean {
  if (outreach) return false;
  return chicagoWeekday.format(scheduledStart) === requiredWeekday(scheduledStart, kickoffAt);
}

/** The season's Build Season kickoff instant when FIRST's date is verified (seasonCalendar), else null (also with no season). */
export function verifiedKickoffAt(competitionYear: number | null): number | null {
  if (competitionYear === null) return null;
  const kickoff = kickoffBoundaryForCompetitionYear(competitionYear);
  return kickoff.state === "verified" ? kickoff.kickoffAt : null;
}

/**
 * The weekday on which a meeting starting at `startsAt` in the season of `competitionYear` would be counted as Required by
 * attendance reports (requiredFromSchedule), or null when it wouldn't (another day, or no valid time yet).
 */
export function requiredMeetingDay(startsAt: number, competitionYear: number | null): "Monday" | "Tuesday" | null {
  if (!Number.isFinite(startsAt)) return null;
  const kickoffAt = verifiedKickoffAt(competitionYear);
  return requiredFromSchedule(startsAt, false, kickoffAt) ? requiredWeekday(startsAt, kickoffAt) : null;
}
