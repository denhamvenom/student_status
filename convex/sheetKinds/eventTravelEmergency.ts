import type { SheetKindDefinition } from "../lib/sheetKinds";
import { eventKindTitle } from "../lib/sheetEvents";
import { ADULT_HEALTH_HEADERS, STUDENT_HEALTH_HEADERS, adultHealthCells, eventDateText, sortAdults, sortStudents, studentHealthCells, type HealthAdult, type HealthStudent } from "../lib/healthRows";
import type { SheetTab } from "../lib/sheetRows";

/** A confirmed participant's health details plus the wording for their permission form for this event. */
export type TravelStudent = HealthStudent & { permissionForm: string };
export type Data = { event: { name: string; startsAt: number; endsAt: number; place: string }; students: readonly TravelStudent[]; adults: readonly HealthAdult[] };

export function travelEmergencyTabs(data: Data): SheetTab[] {
  return [
    { title: "Event", rows: [["Event", data.event.name], ["Date", eventDateText(data.event.startsAt, data.event.endsAt)], ["Place", data.event.place]] },
    {
      title: "Students",
      rows: [
        [...STUDENT_HEALTH_HEADERS, "Permission form"],
        ...sortStudents(data.students).map(student => [...studentHealthCells(student), student.permissionForm]),
      ],
    },
    // Accepted Mentors only; emergency contacts and nothing else (the app stores no health information for adults).
    { title: "Mentors", rows: [ADULT_HEALTH_HEADERS, ...sortAdults(data.adults).map(adultHealthCells)] },
  ];
}

/** Health folder, one file per qualifying event: confirmed students' emergency and health information and accepted Mentors' emergency contacts. */
export const definition: SheetKindDefinition<Data> = {
  kind: "eventTravelEmergency", folder: "health", scope: "event", ready: true, label: "Travel emergency",
  title: info => eventKindTitle(info, "Travel emergency"),
  build: travelEmergencyTabs,
};
