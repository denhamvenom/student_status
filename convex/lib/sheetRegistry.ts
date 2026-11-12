import type { ActionCtx } from "../_generated/server";
import type { SheetFileKind, SheetKindDefinition, SheetLoadArgs, SheetLoader } from "./sheetKinds";
import type { SheetTab } from "./sheetRows";
import * as adultRoster from "../sheetKinds/adultRoster";
import * as adultRosterData from "../sheetData/adultRoster";
import * as attendance from "../sheetKinds/attendance";
import * as attendanceData from "../sheetData/attendance";
import * as drivers from "../sheetKinds/drivers";
import * as driversData from "../sheetData/drivers";
import * as event from "../sheetKinds/event";
import * as eventData from "../sheetData/event";
import * as eventFees from "../sheetKinds/eventFees";
import * as eventFeesData from "../sheetData/eventFees";
import * as eventTravelEmergency from "../sheetKinds/eventTravelEmergency";
import * as eventTravelEmergencyData from "../sheetData/eventTravelEmergency";
import * as health from "../sheetKinds/health";
import * as healthData from "../sheetData/health";
import * as money from "../sheetKinds/money";
import * as moneyData from "../sheetData/money";
import * as readiness from "../sheetKinds/readiness";
import * as readinessData from "../sheetData/readiness";
import * as shirtSizes from "../sheetKinds/shirtSizes";
import * as shirtSizesData from "../sheetData/shirtSizes";
import * as studentRoster from "../sheetKinds/studentRoster";
import * as studentRosterData from "../sheetData/studentRoster";

/** A kind with its data type erased: what the runner, the run planner and the status query use. */
export type RegisteredKind = {
  /** The kind's own definition object. Read `ready` through it, so a test that flips `ready` on the definition is seen here. */
  definition: SheetKindDefinition<never>;
  /** Reads the kind's data and builds its tabs. */
  tabs: (ctx: ActionCtx, args: SheetLoadArgs) => Promise<SheetTab[]>;
};

function register<Data>(definition: SheetKindDefinition<Data>, load: SheetLoader<Data>): RegisteredKind {
  return { definition: definition as SheetKindDefinition<never>, tabs: async (ctx, args) => definition.build(await load(ctx, args)) };
}

/**
 * Every kind, keyed by name (TypeScript refuses a missing kind). This file is the only shared file that names kinds; it already lists
 * every planned kind, so finishing a kind only touches that kind's own files.
 */
export const SHEET_REGISTRY: { readonly [K in SheetFileKind]: RegisteredKind } = {
  studentRoster: register(studentRoster.definition, studentRosterData.load),
  shirtSizes: register(shirtSizes.definition, shirtSizesData.load),
  adultRoster: register(adultRoster.definition, adultRosterData.load),
  drivers: register(drivers.definition, driversData.load),
  readiness: register(readiness.definition, readinessData.load),
  attendance: register(attendance.definition, attendanceData.load),
  money: register(money.definition, moneyData.load),
  health: register(health.definition, healthData.load),
  event: register(event.definition, eventData.load),
  eventFees: register(eventFees.definition, eventFeesData.load),
  eventTravelEmergency: register(eventTravelEmergency.definition, eventTravelEmergencyData.load),
};

/** All kinds in card and run order (the order above). */
export const allSheetKinds = (): RegisteredKind[] => Object.values(SHEET_REGISTRY);

/** Kinds that runs write and the Reports card lists. A kind with `ready: false` is skipped everywhere. */
export const readySheetKinds = (scope: "team" | "event"): SheetKindDefinition<never>[] =>
  allSheetKinds().map(entry => entry.definition).filter(definition => definition.ready && definition.scope === scope);

export function sheetKind(kind: SheetFileKind): RegisteredKind {
  const entry = SHEET_REGISTRY[kind];
  if (!entry) throw new Error("Unknown spreadsheet kind");
  return entry;
}
