import type { SheetKindDefinition } from "../lib/sheetKinds";
import { yesNo, type SheetTab } from "../lib/sheetRows";

export type DriverRow = { name: string; phone: string; email: string; seats: number; vehicle: string; canTow: boolean; approved: boolean; active: boolean };
export type Data = readonly DriverRow[];

export function driverTabs(drivers: Data): SheetTab[] {
  const sorted = [...drivers].sort((a, b) => Number(b.approved) - Number(a.approved) || a.name.localeCompare(b.name, "en", { sensitivity: "base", numeric: true }));
  return [{
    title: "Drivers",
    rows: [
      ["Name", "Phone", "Email", "Passenger seats", "Vehicle", "Can tow", "Approved", "Active"],
      ...sorted.map(driver => [driver.name, driver.phone, driver.email, driver.seats, driver.vehicle, yesNo(driver.canTow), yesNo(driver.approved), yesNo(driver.active)]),
    ],
  }];
}

/** Every driver saved for the season, approved ones first (General folder). */
export const definition: SheetKindDefinition<Data> = {
  kind: "drivers", folder: "general", scope: "team", ready: true, label: "Drivers",
  title: info => `Drivers - ${info.seasonName}`,
  build: driverTabs,
};
