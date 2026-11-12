import type { SheetKindDefinition } from "../lib/sheetKinds";
import type { SheetCell, SheetTab } from "../lib/sheetRows";

export const SHIRT_SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL"] as const;

export type ShirtPerson = { name: string; type: "Student" | "Adult"; subteam: string; size: string | null | undefined };
export type Data = readonly ShirtPerson[];

const byTypeThenName = (a: ShirtPerson, b: ShirtPerson) =>
  (a.type === b.type ? 0 : a.type === "Adult" ? -1 : 1) || a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true });

/** Shirt size workbook: Counts, Details and Missing size (adults are Coaches, Mentors and Parents with Mentor or Travel Lead access). Sizes outside the app's list are counted as "Other" and shown as entered. */
export function shirtSizeTabs(people: Data): SheetTab[] {
  const sorted = [...people].sort(byTypeThenName);
  const sized = sorted.filter(person => person.size?.trim());
  const missing = sorted.filter(person => !person.size?.trim());
  const known: readonly string[] = SHIRT_SIZES;
  const bucket = (size: string) => (known.includes(size.trim()) ? size.trim() : "Other");
  const tally = (label: string) => {
    const group = sized.filter(person => bucket(person.size!) === label);
    const students = group.filter(person => person.type === "Student").length;
    const mentors = group.length - students;
    return [label, students, mentors, group.length] as SheetCell[];
  };
  const counts = [...SHIRT_SIZES, "Other"].map(tally);
  const totals: SheetCell[] = ["Total", 0, 0, 0];
  for (const row of counts) for (let index = 1; index < 4; index++) totals[index] = (totals[index] as number) + (row[index] as number);
  return [
    { title: "Counts", rows: [["Size", "Students", "Adults", "Total"], ...counts, totals] },
    { title: "Details", rows: [["Name", "Student or adult", "Subteam", "Size"], ...sized.map(person => [person.name, person.type, person.subteam, person.size!.trim()])] },
    { title: "Missing size", rows: [["Name", "Student or adult", "Subteam"], ...missing.map(person => [person.name, person.type, person.subteam])] },
  ];
}

export const definition: SheetKindDefinition<Data> = {
  kind: "shirtSizes", folder: "general", scope: "team", ready: true, label: "Shirt sizes",
  title: info => `Shirt sizes - ${info.seasonName}`,
  build: shirtSizeTabs,
};
