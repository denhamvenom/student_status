import type { SheetKindDefinition } from "../lib/sheetKinds";
import { eventKindTitle } from "../lib/sheetEvents";

/**
 * Not built yet (one file per qualifying event, Money folder). To finish it: describe the loaded data in `Data`, build the tabs in `build`,
 * fill in `convex/sheetData/eventFees.ts`, add `convex/sheetKinds/eventFees.test.ts`, then set `ready: true`. See docs/TEAM_SPREADSHEETS.md.
 */
export type Data = null;

export const definition: SheetKindDefinition<Data> = {
  kind: "eventFees", folder: "money", scope: "event", ready: false, label: "Event fees",
  title: info => eventKindTitle(info, "Fees"),
  build: () => [],
};
