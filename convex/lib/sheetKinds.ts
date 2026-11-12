import { v } from "convex/values";
import { isCoachOrTravelLead } from "./staffRule";

/** Drive folders under the team's shared drive. Money and Health files are only linked for people with matching access. */
export const sheetFolder = v.union(v.literal("general"), v.literal("money"), v.literal("health"), v.literal("events"));
export type SheetFolder = "general" | "money" | "health" | "events";

/** One spreadsheet kind per file. Later steps add kinds here and a builder in sheetExportActions. */
export const sheetFileKind = v.union(v.literal("studentRoster"), v.literal("shirtSizes"));
export type SheetFileKind = "studentRoster" | "shirtSizes";

export const SHEET_KINDS: readonly { kind: SheetFileKind; folder: SheetFolder; title: string }[] = [
  { kind: "studentRoster", folder: "general", title: "Student roster" },
  { kind: "shirtSizes", folder: "general", title: "Shirt sizes" },
];

export function sheetKindInfo(kind: SheetFileKind) {
  const info = SHEET_KINDS.find(item => item.kind === kind);
  if (!info) throw new Error("Unknown spreadsheet kind");
  return info;
}

/** Stable key stored on the Drive file so a lost save can be recovered without making a duplicate. */
export function sheetAppKey(seasonId: string, kind: SheetFileKind, eventId?: string): string {
  return `${seasonId}:${kind}:${eventId ?? "-"}`;
}

/**
 * Who sees links to which folder's files (owner decision November 12, 2026). General: any Coach or Travel Lead. Money: the same people who
 * can open the app's money views (any Coach or Travel Lead, a Parent acting as Travel Lead included). Health: a Coach, or a Travel Lead with
 * Health export access (a Parent acting as Travel Lead never has it). Events: any Coach or Travel Lead, same as General (per-event files; each
 * event's Fees file stays in Money and its travel emergency file stays in Health).
 */
export function folderVisible(folder: SheetFolder, user: { role: "coach" | "mentor" | "parent" | "student"; travelLead: boolean; healthExport?: boolean }): boolean {
  if (!isCoachOrTravelLead(user)) return false;
  if (folder === "health") return user.role === "coach" || user.healthExport === true;
  return true;
}
