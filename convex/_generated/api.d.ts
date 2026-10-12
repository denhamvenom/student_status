/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as app from "../app.js";
import type * as attendanceOperations from "../attendanceOperations.js";
import type * as auth from "../auth.js";
import type * as bootstrap from "../bootstrap.js";
import type * as calendar from "../calendar.js";
import type * as calendarState from "../calendarState.js";
import type * as crons from "../crons.js";
import type * as developmentRehearsal from "../developmentRehearsal.js";
import type * as eventOperations from "../eventOperations.js";
import type * as finance from "../finance.js";
import type * as financeOperations from "../financeOperations.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_authRedirect from "../lib/authRedirect.js";
import type * as lib_calendarNormalize from "../lib/calendarNormalize.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_readModels from "../lib/readModels.js";
import type * as lib_timeclock from "../lib/timeclock.js";
import type * as lib_timeclockPin from "../lib/timeclockPin.js";
import type * as parentInvites from "../parentInvites.js";
import type * as participation from "../participation.js";
import type * as permissions from "../permissions.js";
import type * as rooms from "../rooms.js";
import type * as timeclock from "../timeclock.js";
import type * as timeclockPinControl from "../timeclockPinControl.js";
import type * as timeclockRoster from "../timeclockRoster.js";
import type * as travel from "../travel.js";
import type * as withdrawals from "../withdrawals.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  app: typeof app;
  attendanceOperations: typeof attendanceOperations;
  auth: typeof auth;
  bootstrap: typeof bootstrap;
  calendar: typeof calendar;
  calendarState: typeof calendarState;
  crons: typeof crons;
  developmentRehearsal: typeof developmentRehearsal;
  eventOperations: typeof eventOperations;
  finance: typeof finance;
  financeOperations: typeof financeOperations;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/authRedirect": typeof lib_authRedirect;
  "lib/calendarNormalize": typeof lib_calendarNormalize;
  "lib/money": typeof lib_money;
  "lib/readModels": typeof lib_readModels;
  "lib/timeclock": typeof lib_timeclock;
  "lib/timeclockPin": typeof lib_timeclockPin;
  parentInvites: typeof parentInvites;
  participation: typeof participation;
  permissions: typeof permissions;
  rooms: typeof rooms;
  timeclock: typeof timeclock;
  timeclockPinControl: typeof timeclockPinControl;
  timeclockRoster: typeof timeclockRoster;
  travel: typeof travel;
  withdrawals: typeof withdrawals;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
