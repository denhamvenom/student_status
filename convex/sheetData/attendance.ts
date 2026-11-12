import type { SheetLoader } from "../lib/sheetKinds";
import type { Data } from "../sheetKinds/attendance";

/** Not built yet: reads nothing. Put this kind's bounded internal queries in this file and read them here (see docs/TEAM_SPREADSHEETS.md). */
export const load: SheetLoader<Data> = async () => null;
