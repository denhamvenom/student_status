import { v, type Infer } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import type { SheetTab } from "./sheetRows";
import { isCoachOrTravelLead } from "./staffRule";

/** Drive folders under the team's shared drive. Money and Health files are only linked for people with matching access. */
export const sheetFolder = v.union(v.literal("general"), v.literal("money"), v.literal("health"), v.literal("events"));
export type SheetFolder = "general" | "money" | "health" | "events";

/**
 * Every spreadsheet kind, in the order runs and the Reports card use. A kind is one file per season ("team" scope) or one file per
 * qualifying event ("event" scope). Each kind has its own two modules, `convex/sheetKinds/<kind>.ts` (what the file looks like) and
 * `convex/sheetData/<kind>.ts` (how its data is read); `convex/lib/sheetRegistry.ts` lists them all.
 */
export const sheetFileKind = v.union(
  v.literal("studentRoster"), v.literal("shirtSizes"), v.literal("adultRoster"), v.literal("drivers"), v.literal("readiness"), v.literal("attendance"),
  v.literal("money"), v.literal("health"), v.literal("event"), v.literal("eventFees"), v.literal("eventTravelEmergency"),
);
export type SheetFileKind = Infer<typeof sheetFileKind>;
export const SHEET_KIND_NAMES: readonly SheetFileKind[] = sheetFileKind.members.map(member => member.value);

export type SheetScope = "team" | "event";

/** What a file's name may use. `event` is set only for event-scoped kinds. */
export type SheetTitleInfo = { seasonName: string; event: { name: string; startsAt: number } | null };

/**
 * The pure half of a kind (`convex/sheetKinds/<kind>.ts`). `build` turns the loaded data into tabs and must not read the database;
 * it is unit-tested on its own. `ready: false` keeps the kind out of runs and out of the Reports card.
 */
export type SheetKindDefinition<Data> = {
  kind: SheetFileKind;
  folder: SheetFolder;
  scope: SheetScope;
  ready: boolean;
  /** Short name on the Reports card, e.g. "Student roster". */
  label: string;
  /** The Drive file name. It is part of the fingerprint, so changing it rewrites the file once. */
  title: (info: SheetTitleInfo) => string;
  build: (data: Data) => SheetTab[];
};

/** What the runner passes to a kind's loader. `eventId` is set only for event-scoped kinds. */
export type SheetLoadArgs = { seasonId: Id<"seasons">; eventId: Id<"events"> | null };
/** The data half of a kind (`convex/sheetData/<kind>.ts`): reads everything the file needs through bounded internal queries. */
export type SheetLoader<Data> = (ctx: ActionCtx, args: SheetLoadArgs) => Promise<Data>;

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
