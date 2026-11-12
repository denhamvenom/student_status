import type { SheetKindDefinition } from "../lib/sheetKinds";
import { eventKindTitle } from "../lib/sheetEvents";

/**
 * Not built yet (one file per qualifying event, Health folder). To finish it: describe the loaded data in `Data`, build the tabs in `build`,
 * fill in `convex/sheetData/eventTravelEmergency.ts`, add `convex/sheetKinds/eventTravelEmergency.test.ts`, then set `ready: true`. See docs/TEAM_SPREADSHEETS.md.
 */
export type Data = null;

export const definition: SheetKindDefinition<Data> = {
  kind: "eventTravelEmergency", folder: "health", scope: "event", ready: false, label: "Travel emergency",
  title: info => eventKindTitle(info, "Travel emergency"),
  build: () => [],
};
