import type { SheetKindDefinition } from "../lib/sheetKinds";
import { yesNo, type SheetTab } from "../lib/sheetRows";

export const ADULT_ROLES = ["Coach", "Travel Lead", "Mentor", "Parent"] as const;
export type AdultRole = (typeof ADULT_ROLES)[number];
export type AdultRow = { name: string; role: AdultRole; travelLead: boolean; subteams: string; email: string; phone: string; students: string[] };
export type Data = readonly AdultRow[];

export function adultRosterTabs(adults: Data): SheetTab[] {
  const byName = (a: AdultRow, b: AdultRow) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true });
  const staff = adults.filter(adult => adult.role !== "Parent").sort((a, b) => ADULT_ROLES.indexOf(a.role) - ADULT_ROLES.indexOf(b.role) || byName(a, b));
  const parents = adults.filter(adult => adult.role === "Parent").sort(byName);
  return [
    {
      title: "Coaches and mentors",
      rows: [
        ["Name", "Role", "Travel Lead", "Subteams", "Email", "Phone", "Students (linked)"],
        ...staff.map(adult => [adult.name, adult.role, yesNo(adult.travelLead), adult.subteams, adult.email, adult.phone, adult.students.join("; ")]),
      ],
    },
    { title: "Parents", rows: [["Name", "Email", "Phone", "Students"], ...parents.map(adult => [adult.name, adult.email, adult.phone, adult.students.join("; ")])] },
  ];
}

/** Active, non-archived Coaches, Mentors, Travel Leads and Parents (General folder). Parents have their own tab; a Parent with Mentor or Travel Lead access is listed once, with the Coaches and mentors, and keeps their students. */
export const definition: SheetKindDefinition<Data> = {
  kind: "adultRoster", folder: "general", scope: "team", ready: true, label: "Adult roster",
  title: info => `Adult roster - ${info.seasonName}`,
  build: adultRosterTabs,
};
