import type { SheetKindDefinition } from "../lib/sheetKinds";

/**
 * Not built yet (one file per season, General folder). To finish it: describe the loaded data in `Data`, build the tabs in `build`,
 * fill in `convex/sheetData/attendance.ts`, add `convex/sheetKinds/attendance.test.ts`, then set `ready: true`. See docs/TEAM_SPREADSHEETS.md.
 */
export type Data = null;

export const definition: SheetKindDefinition<Data> = {
  kind: "attendance", folder: "general", scope: "team", ready: false, label: "Attendance",
  title: info => `Attendance - ${info.seasonName}`,
  build: () => [],
};
