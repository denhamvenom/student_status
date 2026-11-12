import type { SheetLoader } from "../lib/sheetKinds";
import { readAllAdults, readAllStudents } from "../sheetExportData";
import type { Data, ShirtPerson } from "../sheetKinds/shirtSizes";
import { subteamDisplay } from "../../src/lib/subteams";

/** Active students, then active adults who count as Mentors (plain Parents are never read). */
export const load: SheetLoader<Data> = async (ctx, args) => {
  const students = await readAllStudents(ctx, args.seasonId, false);
  const adults = await readAllAdults(ctx);
  return [
    ...students.map((student): ShirtPerson => ({ name: student.preferredName || student.legalName, type: "Student", subteam: subteamDisplay(student.subteam), size: student.shirtSize })),
    ...adults.map((adult): ShirtPerson => ({ name: adult.name, type: "Adult", subteam: adult.subteam, size: adult.shirtSize })),
  ];
};
