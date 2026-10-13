/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as accounts from "../accounts.js";
import type * as admin from "../admin.js";
import type * as app from "../app.js";
import type * as attendanceOperations from "../attendanceOperations.js";
import type * as attendanceReportMaintenance from "../attendanceReportMaintenance.js";
import type * as auth from "../auth.js";
import type * as bootstrap from "../bootstrap.js";
import type * as calendar from "../calendar.js";
import type * as calendarState from "../calendarState.js";
import type * as consentRehearsal from "../consentRehearsal.js";
import type * as crons from "../crons.js";
import type * as dashboardReports from "../dashboardReports.js";
import type * as developmentRehearsal from "../developmentRehearsal.js";
import type * as eventEnrollment from "../eventEnrollment.js";
import type * as eventOperations from "../eventOperations.js";
import type * as finance from "../finance.js";
import type * as financeOperations from "../financeOperations.js";
import type * as financeReportMaintenance from "../financeReportMaintenance.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_attendanceReports from "../lib/attendanceReports.js";
import type * as lib_authRedirect from "../lib/authRedirect.js";
import type * as lib_calendarNormalize from "../lib/calendarNormalize.js";
import type * as lib_consentSnapshot from "../lib/consentSnapshot.js";
import type * as lib_eventEnrollmentState from "../lib/eventEnrollmentState.js";
import type * as lib_financeSummaries from "../lib/financeSummaries.js";
import type * as lib_invitationIdentity from "../lib/invitationIdentity.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_permissionCoverage from "../lib/permissionCoverage.js";
import type * as lib_profileCorrections from "../lib/profileCorrections.js";
import type * as lib_readModels from "../lib/readModels.js";
import type * as lib_reportAggregates from "../lib/reportAggregates.js";
import type * as lib_timeclock from "../lib/timeclock.js";
import type * as lib_timeclockPin from "../lib/timeclockPin.js";
import type * as lib_wholeTeam from "../lib/wholeTeam.js";
import type * as parentInvites from "../parentInvites.js";
import type * as participation from "../participation.js";
import type * as permissionVersions from "../permissionVersions.js";
import type * as permissions from "../permissions.js";
import type * as profileSetup from "../profileSetup.js";
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
  accounts: typeof accounts;
  admin: typeof admin;
  app: typeof app;
  attendanceOperations: typeof attendanceOperations;
  attendanceReportMaintenance: typeof attendanceReportMaintenance;
  auth: typeof auth;
  bootstrap: typeof bootstrap;
  calendar: typeof calendar;
  calendarState: typeof calendarState;
  consentRehearsal: typeof consentRehearsal;
  crons: typeof crons;
  dashboardReports: typeof dashboardReports;
  developmentRehearsal: typeof developmentRehearsal;
  eventEnrollment: typeof eventEnrollment;
  eventOperations: typeof eventOperations;
  finance: typeof finance;
  financeOperations: typeof financeOperations;
  financeReportMaintenance: typeof financeReportMaintenance;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/attendanceReports": typeof lib_attendanceReports;
  "lib/authRedirect": typeof lib_authRedirect;
  "lib/calendarNormalize": typeof lib_calendarNormalize;
  "lib/consentSnapshot": typeof lib_consentSnapshot;
  "lib/eventEnrollmentState": typeof lib_eventEnrollmentState;
  "lib/financeSummaries": typeof lib_financeSummaries;
  "lib/invitationIdentity": typeof lib_invitationIdentity;
  "lib/money": typeof lib_money;
  "lib/permissionCoverage": typeof lib_permissionCoverage;
  "lib/profileCorrections": typeof lib_profileCorrections;
  "lib/readModels": typeof lib_readModels;
  "lib/reportAggregates": typeof lib_reportAggregates;
  "lib/timeclock": typeof lib_timeclock;
  "lib/timeclockPin": typeof lib_timeclockPin;
  "lib/wholeTeam": typeof lib_wholeTeam;
  parentInvites: typeof parentInvites;
  participation: typeof participation;
  permissionVersions: typeof permissionVersions;
  permissions: typeof permissions;
  profileSetup: typeof profileSetup;
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
  reportAggregates: import("@convex-dev/aggregate/_generated/component.js").ComponentApi<"reportAggregates">;
};
