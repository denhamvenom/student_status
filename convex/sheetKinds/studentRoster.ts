import type { SheetKindDefinition } from "../lib/sheetKinds";
import { rosterGrade, yesNo, type SheetTab } from "../lib/sheetRows";
import { subteamDisplay } from "../../src/lib/subteams";

export type RosterStudent = {
  preferredName: string; legalName: string; grade: string | null | undefined; subteam: string; secondarySubteam: string | null | undefined;
  leadership: boolean; travelTeam: boolean; email: string; guardianName: string | null; guardianRelationship: string | null; guardianPhone: string | null; guardianEmail: string | null;
  parentAccounts: string[];
};
export type Data = readonly RosterStudent[];

export function studentRosterTabs(students: Data): SheetTab[] {
  const sorted = [...students].sort((a, b) => (a.legalName || a.preferredName).localeCompare(b.legalName || b.preferredName, "en", { sensitivity: "base", numeric: true }));
  return [{
    title: "Students",
    rows: [
      ["Preferred name", "Legal name", "Grade", "Subteam", "Second subteam", "Leadership role", "Travel Team", "Student email", "Parent or guardian name", "Parent or guardian relationship", "Parent or guardian phone", "Parent or guardian email", "Parent accounts (linked)"],
      ...sorted.map(student => [student.preferredName, student.legalName, rosterGrade(student.grade), subteamDisplay(student.subteam), student.secondarySubteam ? subteamDisplay(student.secondarySubteam) : "", yesNo(student.leadership), yesNo(student.travelTeam), student.email, student.guardianName ?? "", student.guardianRelationship ?? "", student.guardianPhone ?? "", student.guardianEmail ?? "", student.parentAccounts.join("; ")]),
    ],
  }];
}

/** Active students of the season with guardian contacts and linked parent accounts (General folder; owner decision November 12, 2026). */
export const definition: SheetKindDefinition<Data> = {
  kind: "studentRoster", folder: "general", scope: "team", ready: true, label: "Student roster",
  title: info => `Student roster - ${info.seasonName}`,
  build: studentRosterTabs,
};
