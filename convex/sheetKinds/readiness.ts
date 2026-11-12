import type { SheetKindDefinition } from "../lib/sheetKinds";
import { yesNo, type SheetTab } from "../lib/sheetRows";
import { subteamDisplay } from "../../src/lib/subteams";
import { balanceDueCents, firstRegistrationLabel, missingProfileItems, needsAttention, permissionLabel, type RequirementRow } from "../../src/lib/rosterRequirements";

/** One active student as the Team roster computes it (same fields, same rules), plus the subteam. */
export type ReadinessStudent = RequirementRow & { subteam: string };
export type Data = readonly ReadinessStudent[];

const byName = (a: ReadinessStudent, b: ReadinessStudent) => a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true });

/** Why a student is flagged: their next event and what is still open on it (the roster's Needs attention rule). */
function attentionReason(row: ReadinessStudent): string {
  return needsAttention(row) && row.nextEvent ? `${row.nextEvent.name}: ${row.nextEvent.open.join("; ")}` : "";
}

export function readinessTabs(students: Data): SheetTab[] {
  return [{
    title: "Readiness",
    rows: [
      ["Student", "Subteam", "Profile complete", "FIRST registration", "Permission form", "Balance due ($)", "Needs attention", "What is left"],
      ...[...students].sort(byName).map(row => [
        row.name, subteamDisplay(row.subteam), yesNo(missingProfileItems(row).length === 0), firstRegistrationLabel[row.firstRegistrationState], permissionLabel(row),
        // Same as the roster's export: the amount while the balance is ready, otherwise "Unavailable" rather than a misleading 0.
        row.balance.state === "ready" && row.balance.dueCents !== null ? balanceDueCents(row) / 100 : "Unavailable",
        yesNo(needsAttention(row)), attentionReason(row),
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
