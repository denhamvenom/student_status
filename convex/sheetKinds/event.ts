import type { SheetKindDefinition } from "../lib/sheetKinds";
import { eventKindTitle } from "../lib/sheetEvents";

/**
 * Not built yet (one file per qualifying event, Events folder). To finish it: describe the loaded data in `Data`, build the tabs in `build`,
 * fill in `convex/sheetData/event.ts`, add `convex/sheetKinds/event.test.ts`, then set `ready: true`. See docs/TEAM_SPREADSHEETS.md.
 */
export type Data = null;

export const definition: SheetKindDefinition<Data> = {
  kind: "event", folder: "events", scope: "event", ready: false, label: "Event spreadsheet",
  title: info => eventKindTitle(info),
  build: () => [],
};
