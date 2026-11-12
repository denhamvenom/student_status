import type { SheetLoader } from "../lib/sheetKinds";
import { readAllStudents } from "../sheetExportData";
import type { Data } from "../sheetKinds/studentRoster";

/** Active students of the season with guardian contacts and linked parent accounts. */
export const load: SheetLoader<Data> = async (ctx, args) => await readAllStudents(ctx, args.seasonId, true);
