import type { SheetKindDefinition } from "../lib/sheetKinds";
import type { SheetCell, SheetTab } from "../lib/sheetRows";
import { hoursCell, percentCell, weekHeader, weekKeysBetween } from "../lib/sheetAttendance";
import { subteamDisplay } from "../../src/lib/subteams";

export type AttendanceStudent = {
  name: string; subteam: string;
  /** Meetings attended (qualifying) in each group: the same counters as the app's attendance breakdown. */
  required: number; other: number; outreach: number;
  /** Clocked time at held meetings, in milliseconds, and the same split by Chicago week (key: the week's Monday, "YYYY-MM-DD"). */
  totalMs: number; weeks: readonly { week: string; ms: number }[];
};
export type Data = { held: { required: number; other: number; outreach: number }; students: readonly AttendanceStudent[] };

const byName = (a: AttendanceStudent, b: AttendanceStudent) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true });
const meetingHeaders = ["Required meetings attended", "Required meetings held", "Required %", "Other meetings attended", "Other meetings held", "Other %", "Outreach attended", "Outreach held", "Outreach %"];

/** Meeting columns for `students` students whose attended counts total `sum`: every student has the same meetings held. */
function meetingCells(sum: { required: number; other: number; outreach: number }, held: Data["held"], students: number): SheetCell[] {
  const heldTotal = (count: number) => count * students;
  return [sum.required, heldTotal(held.required), percentCell(sum.required, heldTotal(held.required)), sum.other, heldTotal(held.other), percentCell(sum.other, heldTotal(held.other)), sum.outreach, heldTotal(held.outreach), percentCell(sum.outreach, heldTotal(held.outreach))];
}

export function attendanceTabs(data: Data): SheetTab[] {
  const students = [...data.students].sort(byName);
  const summary: SheetCell[][] = [["Student", "Subteam", ...meetingHeaders, "Total hours"]];
  for (const student of students) summary.push([student.name, subteamDisplay(student.subteam), ...meetingCells(student, data.held, 1), hoursCell(student.totalMs)]);

  const groups = new Map<string, AttendanceStudent[]>();
  for (const student of students) groups.set(subteamDisplay(student.subteam), [...(groups.get(subteamDisplay(student.subteam)) ?? []), student]);
  const bySubteam: SheetCell[][] = [["Subteam", "Students", ...meetingHeaders, "Total hours", "Average hours per student"]];
  for (const [subteam, members] of [...groups].sort(([a], [b]) => a.localeCompare(b, "en", { sensitivity: "base" }))) {
    const sum = { required: 0, other: 0, outreach: 0 };
    let ms = 0;
    for (const member of members) { sum.required += member.required; sum.other += member.other; sum.outreach += member.outreach; ms += member.totalMs; }
    bySubteam.push([subteam, members.length, ...meetingCells(sum, data.held, members.length), hoursCell(ms), hoursCell(ms / members.length)]);
  }

  const weekKeys = students.flatMap(student => student.weeks.map(week => week.week)).sort();
  const columns = weekKeys.length ? weekKeysBetween(weekKeys[0], weekKeys[weekKeys.length - 1]) : [];
  const weekly: SheetCell[][] = [["Student", "Subteam", ...columns.map(weekHeader)]];
  for (const student of students) {
    const ms = new Map(student.weeks.map(week => [week.week, week.ms]));
    weekly.push([student.name, subteamDisplay(student.subteam), ...columns.map(week => hoursCell(ms.get(week) ?? 0))]);
  }
  return [{ title: "Summary", rows: summary }, { title: "By subteam", rows: bySubteam }, { title: "Weekly hours", rows: weekly }];
}

/** Students only (no Mentors): attended and held meetings by group, with hours, per student, per subteam and per week. Same numbers as the app's attendance breakdown. */
export const definition: SheetKindDefinition<Data> = {
  kind: "attendance", folder: "general", scope: "team", ready: true, label: "Attendance",
  title: info => `Attendance - ${info.seasonName}`,
  build: attendanceTabs,
};
