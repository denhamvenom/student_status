import type { SheetKindDefinition } from "../lib/sheetKinds";
import { ADULT_HEALTH_HEADERS, STUDENT_HEALTH_HEADERS, adultHealthCells, sortAdults, sortStudents, studentHealthCells, type HealthAdult, type HealthStudent } from "../lib/healthRows";
import type { SheetTab } from "../lib/sheetRows";

/** An active student's health details plus how many of their permission forms are accepted and how many are not yet. */
export type HealthSheetStudent = HealthStudent & { formsAccepted: number; formsOpen: number };
export type Data = { students: readonly HealthSheetStudent[]; adults: readonly HealthAdult[] };

export function healthTabs(data: Data): SheetTab[] {
  return [
    {
      title: "Students",
      rows: [
        [...STUDENT_HEALTH_HEADERS, "Permission forms accepted", "Permission forms not accepted yet"],
        ...sortStudents(data.students).map(student => [...studentHealthCells(student), student.formsAccepted, student.formsOpen]),
      ],
    },
    { title: "Adults", rows: [ADULT_HEALTH_HEADERS, ...sortAdults(data.adults).map(adultHealthCells)] },
  ];
}

/** Health folder, one file per season: students' emergency contacts and health information, and active adults' emergency contacts. */
export const definition: SheetKindDefinition<Data> = {
  kind: "health", folder: "health", scope: "team", ready: true, label: "Health",
  title: info => `Health - ${info.seasonName}`,
  build: healthTabs,
};
