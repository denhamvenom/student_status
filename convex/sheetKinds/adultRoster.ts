import type { SheetKindDefinition } from "../lib/sheetKinds";
import { yesNo, type SheetTab } from "../lib/sheetRows";

export const ADULT_ROLES = ["Coach", "Travel Lead", "Mentor", "Parent"] as const;
export type AdultRole = (typeof ADULT_ROLES)[number];
export type AdultRow = { name: string; role: AdultRole; travelLead: boolean; subteams: string; email: string; phone: string; students: string[] };
export type Data = readonly AdultRow[];

export function adultRosterTabs(adults: Data): SheetTab[] {
  const sorted = [...adults].sort((a, b) => ADULT_ROLES.indexOf(a.role) - ADULT_ROLES.indexOf(b.role) || a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }));
  return [{
    title: "Adults",
    rows: [
      ["Name", "Role", "Travel Lead", "Subteams", "Email", "Phone", "Students (linked)"],
      ...sorted.map(adult => [adult.name, adult.role, yesNo(adult.travelLead), adult.subteams, adult.email, adult.phone, adult.students.join("; ")]),
    ],
  }];
}

/** Active, non-archived Coaches, Mentors, Travel Leads and Parents (General folder). A Parent with Mentor access is listed as a Mentor. */
export const definition: SheetKindDefinition<Data> = {
  kind: "adultRoster", folder: "general", scope: "team", ready: true, label: "Adult roster",
  title: info => `Adult roster - ${info.seasonName}`,
  build: adultRosterTabs,
};
