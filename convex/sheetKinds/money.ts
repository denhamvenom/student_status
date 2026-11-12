import type { SheetKindDefinition } from "../lib/sheetKinds";

/**
 * Not built yet (one file per season, Money folder). To finish it: describe the loaded data in `Data`, build the tabs in `build`,
 * fill in `convex/sheetData/money.ts`, add `convex/sheetKinds/money.test.ts`, then set `ready: true`. See docs/TEAM_SPREADSHEETS.md.
 */
export type Data = null;

export const definition: SheetKindDefinition<Data> = {
  kind: "money", folder: "money", scope: "team", ready: false, label: "Money",
  title: info => `Money - ${info.seasonName}`,
  build: () => [],
};
