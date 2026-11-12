import type { SheetKindDefinition } from "../lib/sheetKinds";
import { eventKindTitle } from "../lib/sheetEvents";
import { yesNo, type SheetCell, type SheetTab } from "../lib/sheetRows";
import { answerText, questionHeading, type AnswerValue } from "../../src/features/event-setup/signup-csv";
import { statusLabel } from "../../src/lib/ui-copy";

export type EventParticipantRow = {
  studentId: string; name: string; subteam: string; status: string; independentTravel: boolean;
  /** Ready for a confirmed student, not counting fees (those stay in the Money folder); null when not confirmed. */
  ready: boolean | null; missing: string[]; answers: { questionId: string; value: AnswerValue }[];
};
export type EventRoomRow = { student: string; room: string; finalized: boolean; needsReview: boolean; requested: boolean };
export type EventAttendancePerson = { studentId: string; name: string; subteam: string; signedUp: boolean; confirmed: boolean; intervals: { inAt: number; outAt: number }[]; corrections: number };
export type EventShiftRow = { label: string; startsAt: number; endsAt: number; capacity: number | null; students: { studentId: string; name: string }[] };

/** One event's file. Optional parts are null or empty when they do not apply, and their tabs are left out. */
export type Data = {
  event: { name: string; type: string; startsAt: number; endsAt: number; destination: string; capacity: number | null; overnight: boolean; roomingEnabled: boolean; shiftsEnabled: boolean; permissionRequired: boolean };
  questions: { id: string; prompt: string; archived: boolean }[];
  participants: EventParticipantRow[];
  mentors: { name: string; response: string; canDrive: boolean | null; needsHotel: boolean | null }[];
  rooming: EventRoomRow[] | null;
  transport: { enabled: boolean; state: string; seats: number; demand: number; busSeats: number; open: string[]; vehicles: { driver: string; vehicle: string; seats: number }[] };
  shifts: EventShiftRow[] | null;
  /** Set only when the event is linked to a Timeclock session through Team Calendar. */
  attendance: { sessionState: "open" | "closed"; people: EventAttendancePerson[] } | null;
};

const dateTime = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
const when = (at: number) => dateTime.format(at).replace(/\s+/g, " ");
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true });
const STATUS_ORDER: Record<string, number> = { confirmed: 0, pending: 1, waitlist: 2, withdrawn: 3 };
const clockedMs = (intervals: { inAt: number; outAt: number }[]) => intervals.reduce((sum, i) => sum + Math.max(0, i.outAt - i.inAt), 0);

function attendanceRows(attendance: NonNullable<Data["attendance"]>) {
  return attendance.people.map(person => {
    const clockedIn = person.intervals.length > 0;
    const flag = person.confirmed && !clockedIn && attendance.sessionState === "closed" ? "No-show" : clockedIn && !person.confirmed ? "Walk-in" : "";
    return { person, clockedIn, flag };
  });
}

export function eventTabs(data: Data): SheetTab[] {
  const { event, participants } = data;
  const tabs: SheetTab[] = [];
  const attendance = data.attendance ? attendanceRows(data.attendance) : null;
  const count = (status: string) => participants.filter(p => p.status === status).length;
  const confirmed = participants.filter(p => p.status === "confirmed");

  const summary: SheetCell[][] = [
    ["Detail", "Answer"],
    ["Name", event.name], ["Type", event.type], ["Starts", when(event.startsAt)], ["Ends", when(event.endsAt)], ["Place", event.destination],
    ["Fee", "See the Money folder"],
    ["Capacity", event.capacity ?? "No limit"],
    ["Permission form required", yesNo(event.permissionRequired)], ["Overnight", yesNo(event.overnight)],
    ["Signed up", participants.length - count("withdrawn")], ["Confirmed", confirmed.length], ["Ready (not counting fees)", confirmed.filter(p => p.ready).length],
    ["Waitlisted", count("waitlist")], ["Waiting for approval", count("pending")], ["Withdrew", count("withdrawn")],
    ["Mentors accepted", data.mentors.filter(m => m.response === "accepted").length],
  ];
  if (attendance) summary.push(["Showed up", attendance.filter(r => r.clockedIn).length], ["No-shows", attendance.filter(r => r.flag === "No-show").length], ["Walk-ins", attendance.filter(r => r.flag === "Walk-in").length]);
  tabs.push({ title: "Summary", rows: summary });

  const sorted = [...participants].sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) || byName(a, b));
  tabs.push({
    title: "Who's going", note: "Fees and payments are not shown here. See the Money folder.",
    rows: [["Student", "Subteam", "Status", "Ready (not counting fees)", "What's missing"], ...sorted.map(p => [p.name, p.subteam, statusLabel(p.status), p.ready === null ? "" : yesNo(p.ready), p.missing.join("; ")])],
  });

  if (data.questions.length) {
    tabs.push({
      title: "Question answers",
      rows: [["Student", "Status", ...data.questions.map(q => questionHeading({ questionId: q.id, prompt: q.prompt, archived: q.archived }))],
        ...sorted.map(p => [p.name, statusLabel(p.status), ...data.questions.map(q => answerText(p.answers.find(a => a.questionId === q.id)?.value))])],
    });
  }

  if (data.mentors.length) {
    tabs.push({
      title: "Mentors",
      rows: [["Name", "Response", "Can drive students", "Needs hotel room"],
        ...[...data.mentors].sort(byName).map(m => [m.name, statusLabel(m.response), m.canDrive === null ? "" : yesNo(m.canDrive), m.needsHotel === null ? "" : yesNo(m.needsHotel)])],
    });
  }

  if (data.rooming) {
    const rooms = [...data.rooming].sort((a, b) => Number(a.requested) - Number(b.requested) || a.room.localeCompare(b.room, "en", { numeric: true }) || a.student.localeCompare(b.student));
    tabs.push({
      title: "Rooming",
      rows: [["Student", "Room", "Final room", "Needs review", "Status"],
        ...rooms.map(r => [r.student, r.room, r.requested ? "" : yesNo(r.finalized), r.requested ? "" : yesNo(r.needsReview), r.requested ? "Asked to be assigned" : "In a room"])],
    });
  }

  const own = participants.filter(p => p.status === "confirmed" && p.independentTravel);
  if (data.transport.enabled || data.transport.vehicles.length) {
    const rides: SheetCell[][] = [["Type", "Name", "Vehicle", "Seats"]];
    if (data.transport.busSeats > 0) rides.push(["Bus", "", "", data.transport.busSeats]);
    for (const vehicle of data.transport.vehicles) rides.push(["Driver", vehicle.driver, vehicle.vehicle, vehicle.seats]);
    for (const person of [...own].sort(byName)) rides.push(["Own transport", person.name, "", ""]);
    rides.push(["Seats available", "", "", data.transport.seats], ["Seats needed", "", "", data.transport.demand]);
    for (const open of data.transport.open) rides.push(["Still open", open, "", ""]);
    tabs.push({ title: "Rides", rows: rides });
  }

  if (data.shifts) {
    const clockIns = data.attendance ? new Map(data.attendance.people.map(p => [p.studentId, p.intervals])) : null;
    const shiftRows = data.shifts.map(shift => {
      const worked = clockIns ? shift.students.filter(s => (clockIns.get(s.studentId) ?? []).some(i => i.inAt < shift.endsAt && i.outAt > shift.startsAt)).length : null;
      return [shift.label || "Shift", when(shift.startsAt), when(shift.endsAt), shift.capacity ?? "No limit", shift.students.length, shift.capacity === null ? "" : Math.max(0, shift.capacity - shift.students.length), shift.students.map(s => s.name).sort().join("; "), ...(worked === null ? [] : [worked])] as SheetCell[];
    });
    tabs.push({ title: "Shifts", rows: [["Shift", "Starts", "Ends", "Spots", "Signed up", "Open spots", "Who", ...(clockIns ? ["Worked"] : [])], ...shiftRows] });
  }

  if (attendance && data.attendance) {
    const rows = [...attendance].sort((a, b) => a.person.name.localeCompare(b.person.name, "en", { sensitivity: "base", numeric: true })).map(({ person, clockedIn, flag }): SheetCell[] => {
      const times = [...person.intervals].sort((a, b) => a.inAt - b.inAt);
      return [person.name, person.subteam, yesNo(person.signedUp), yesNo(clockedIn), clockedIn ? when(times[0].inAt) : "", clockedIn ? when(Math.max(...times.map(t => t.outAt))) : "", clockedIn ? Math.round(clockedMs(times) / 36_000) / 100 : "", person.corrections, flag];
    });
    tabs.push({ title: "Attendance", rows: [["Student", "Subteam", "Signed up", "Clocked in", "Time in", "Time out", "Total hours", "Times fixed by a Coach", "Note"], ...rows] });
  }
  return tabs;
}

/** One file per qualifying event (Events folder): signups, answers, Mentors, rooms, rides, shifts and clock-ins. No money or health data. */
export const definition: SheetKindDefinition<Data> = {
  kind: "event", folder: "events", scope: "event", ready: true, label: "Event spreadsheet",
  title: info => eventKindTitle(info),
  build: eventTabs,
};
