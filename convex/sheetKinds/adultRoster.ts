import type { SheetKindDefinition } from "../lib/sheetKinds";

/**
 * Not built yet (one file per season, General folder). To finish it: describe the loaded data in `Data`, build the tabs in `build`,
 * fill in `convex/sheetData/adultRoster.ts`, add `convex/sheetKinds/adultRoster.test.ts`, then set `ready: true`. See docs/TEAM_SPREADSHEETS.md.
 */
export type Data = null;

export const definition: SheetKindDefinition<Data> = {
  kind: "adultRoster", folder: "general", scope: "team", ready: false, label: "Adult roster",
  title: info => `Adult roster - ${info.seasonName}`,
  build: () => [],
};
