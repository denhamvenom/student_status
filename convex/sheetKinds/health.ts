import type { SheetKindDefinition } from "../lib/sheetKinds";

/**
 * Not built yet (one file per season, Health folder). To finish it: describe the loaded data in `Data`, build the tabs in `build`,
 * fill in `convex/sheetData/health.ts`, add `convex/sheetKinds/health.test.ts`, then set `ready: true`. See docs/TEAM_SPREADSHEETS.md.
 */
export type Data = null;

export const definition: SheetKindDefinition<Data> = {
  kind: "health", folder: "health", scope: "team", ready: false, label: "Health",
  title: info => `Health - ${info.seasonName}`,
  build: () => [],
};
