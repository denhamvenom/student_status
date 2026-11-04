// Roster "subteam" filter: every primary subteam, CAD, Leadership and "No subteam", matched the same way event audiences are.
import { studentMatchesSubteams } from '../../convex/lib/eventAudienceRules'
import { audienceSubteamOptions } from '../features/event-setup/audience/audience-rules'
import { canonicalSubteam } from './subteams'

/** Students whose primary subteam has not been chosen yet. */
export const noSubteamGroup = 'No subteam'

/** Always the full list, so a subteam stays choosable even when no listed student is in it yet. */
export const rosterGroupOptions: readonly string[] = [...audienceSubteamOptions, noSubteamGroup]

type RosterStudent = { subteam: string; secondarySubteam?: string | null; leadership?: boolean }

/** Blank keeps everyone; otherwise primary subteam (legacy names included), second subteam, Leadership, or no primary subteam. */
export function inRosterGroup(student: RosterStudent, group: string): boolean {
  if (!group) return true
  if (group === noSubteamGroup) return canonicalSubteam(student.subteam) === ''
  return studentMatchesSubteams({ subteam: student.subteam, secondarySubteam: student.secondarySubteam ?? undefined, leadership: student.leadership, active: true }, [group])
}
