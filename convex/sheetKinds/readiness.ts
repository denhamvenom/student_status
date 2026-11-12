import type { SheetKindDefinition } from "../lib/sheetKinds";
import { MONEY_ITEMS, yesNo, type SheetTab } from "../lib/sheetRows";
import { subteamDisplay } from "../../src/lib/subteams";
import { firstRegistrationLabel, missingProfileItems, needsAttention, permissionLabel, type RequirementRow } from "../../src/lib/rosterRequirements";

/** One active student as the Team roster computes it (same fields, same rules), plus the subteam. */
export type ReadinessStudent = RequirementRow & { subteam: string };
export type Data = readonly ReadinessStudent[];

const byName = (a: ReadinessStudent, b: ReadinessStudent) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true });

/** The roster's Needs attention rule applied with fee items removed, so a student whose only open item is a fee is not flagged here (fees stay in the Money folder). */
function attentionWithoutMoney(row: ReadinessStudent): ReadinessStudent {
  return row.nextEvent ? { ...row, nextEvent: { ...row.nextEvent, open: row.nextEvent.open.filter(item => !MONEY_ITEMS.has(item)) } } : row;
}

/** Why a student is flagged: their next event and what is still open on it (the roster's Needs attention rule), without fee items (those stay in the Money folder). */
function attentionReason(row: ReadinessStudent): string {
  const shown = attentionWithoutMoney(row);
  if (!needsAttention(shown) || !shown.nextEvent) return "";
  return `${shown.nextEvent.name}: ${shown.nextEvent.open.join("; ")}`;
}

export function readinessTabs(students: Data): SheetTab[] {
  return [{
    title: "Readiness",
    rows: [
      ["Student", "Subteam", "Profile complete", "FIRST registration", "Permission form", "Needs attention", "What is left"],
      ...[...students].sort(byName).map(row => [
        row.name, subteamDisplay(row.subteam), yesNo(missingProfileItems(row).length === 0), firstRegistrationLabel[row.firstRegistrationState], permissionLabel(row),
        yesNo(needsAttention(attentionWithoutMoney(row))), attentionReason(row),
      ]),
    ],
  }];
}

/** Active students of the season with the same readiness the Team roster shows (General folder). */
export const definition: SheetKindDefinition<Data> = {
  kind: "readiness", folder: "general", scope: "team", ready: true, label: "Readiness",
  title: info => `Readiness - ${info.seasonName}`,
  build: readinessTabs,
};
