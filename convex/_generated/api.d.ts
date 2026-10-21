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
import type * as adultInviteEmail from "../adultInviteEmail.js";
import type * as adultProfile from "../adultProfile.js";
import type * as app from "../app.js";
import type * as attendanceOperations from "../attendanceOperations.js";
import type * as attendanceReportMaintenance from "../attendanceReportMaintenance.js";
import type * as auth from "../auth.js";
import type * as bootstrap from "../bootstrap.js";
import type * as bulkInvites from "../bulkInvites.js";
import type * as calendar from "../calendar.js";
import type * as calendarState from "../calendarState.js";
import type * as chargeAdmin from "../chargeAdmin.js";
import type * as coachRoster from "../coachRoster.js";
import type * as consentPdfRehearsal from "../consentPdfRehearsal.js";
import type * as consentProfileV2Schema from "../consentProfileV2Schema.js";
import type * as consentRehearsal from "../consentRehearsal.js";
import type * as crons from "../crons.js";
import type * as dashboardReports from "../dashboardReports.js";
import type * as developmentRehearsal from "../developmentRehearsal.js";
import type * as eventCalendar from "../eventCalendar.js";
import type * as eventEnrollment from "../eventEnrollment.js";
import type * as eventOperations from "../eventOperations.js";
import type * as familyLinkSeasonMigration from "../familyLinkSeasonMigration.js";
import type * as feeBulk from "../feeBulk.js";
import type * as feeBulkWorker from "../feeBulkWorker.js";
import type * as feeDefinitions from "../feeDefinitions.js";
import type * as feeMappingWorker from "../feeMappingWorker.js";
import type * as feePayments from "../feePayments.js";
import type * as feePriorities from "../feePriorities.js";
import type * as feePriorityWorker from "../feePriorityWorker.js";
import type * as finance from "../finance.js";
import type * as financeAdmin from "../financeAdmin.js";
import type * as financeChangeBackfill from "../financeChangeBackfill.js";
import type * as financeDetails from "../financeDetails.js";
import type * as financeExport from "../financeExport.js";
import type * as financeOperations from "../financeOperations.js";
import type * as financeReportMaintenance from "../financeReportMaintenance.js";
import type * as financialAllocation from "../financialAllocation.js";
import type * as financialOperationsWorker from "../financialOperationsWorker.js";
import type * as financialSources from "../financialSources.js";
import type * as firstRegistration from "../firstRegistration.js";
import type * as fundraiserLinks from "../fundraiserLinks.js";
import type * as fundraiserPosting from "../fundraiserPosting.js";
import type * as fundraisers from "../fundraisers.js";
import type * as historicalCorrections from "../historicalCorrections.js";
import type * as historicalFinancialCorrections from "../historicalFinancialCorrections.js";
import type * as historicalRoster from "../historicalRoster.js";
import type * as http from "../http.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_attendanceReports from "../lib/attendanceReports.js";
import type * as lib_authRedirect from "../lib/authRedirect.js";
import type * as lib_calendarAuth from "../lib/calendarAuth.js";
import type * as lib_calendarDates from "../lib/calendarDates.js";
import type * as lib_calendarNormalize from "../lib/calendarNormalize.js";
import type * as lib_chargeCorrection from "../lib/chargeCorrection.js";
import type * as lib_chargeObligation from "../lib/chargeObligation.js";
import type * as lib_consentSnapshot from "../lib/consentSnapshot.js";
import type * as lib_consentSnapshotV2 from "../lib/consentSnapshotV2.js";
import type * as lib_contactEntry from "../lib/contactEntry.js";
import type * as lib_contactValidation from "../lib/contactValidation.js";
import type * as lib_eventEnrollmentState from "../lib/eventEnrollmentState.js";
import type * as lib_feeBulkMoney from "../lib/feeBulkMoney.js";
import type * as lib_feeDefinitions from "../lib/feeDefinitions.js";
import type * as lib_financeChanges from "../lib/financeChanges.js";
import type * as lib_financeRow from "../lib/financeRow.js";
import type * as lib_financeSummaries from "../lib/financeSummaries.js";
import type * as lib_financialAllocation from "../lib/financialAllocation.js";
import type * as lib_financialSources from "../lib/financialSources.js";
import type * as lib_financialWithdrawal from "../lib/financialWithdrawal.js";
import type * as lib_fundraisingMath from "../lib/fundraisingMath.js";
import type * as lib_invitationIdentity from "../lib/invitationIdentity.js";
import type * as lib_maintenanceAccess from "../lib/maintenanceAccess.js";
import type * as lib_money from "../lib/money.js";
import type * as lib_parentInviteEmail from "../lib/parentInviteEmail.js";
import type * as lib_permissionCoverage from "../lib/permissionCoverage.js";
import type * as lib_permissionSigningMode from "../lib/permissionSigningMode.js";
import type * as lib_profileCorrections from "../lib/profileCorrections.js";
import type * as lib_publicErrors from "../lib/publicErrors.js";
import type * as lib_readModels from "../lib/readModels.js";
import type * as lib_reportAggregates from "../lib/reportAggregates.js";
import type * as lib_retention from "../lib/retention.js";
import type * as lib_seasonCalendar from "../lib/seasonCalendar.js";
import type * as lib_seasonFamilyLinks from "../lib/seasonFamilyLinks.js";
import type * as lib_seasonFinance from "../lib/seasonFinance.js";
import type * as lib_seasonIdentity from "../lib/seasonIdentity.js";
import type * as lib_seasonTransitionFinance from "../lib/seasonTransitionFinance.js";
import type * as lib_teamReportAttendance from "../lib/teamReportAttendance.js";
import type * as lib_timeclock from "../lib/timeclock.js";
import type * as lib_timeclockPin from "../lib/timeclockPin.js";
import type * as lib_timeclockTransition from "../lib/timeclockTransition.js";
import type * as lib_wholeTeam from "../lib/wholeTeam.js";
import type * as parentEmailAuth from "../parentEmailAuth.js";
import type * as parentInviteEmail from "../parentInviteEmail.js";
import type * as parentInvites from "../parentInvites.js";
import type * as participation from "../participation.js";
import type * as paymentAdministration from "../paymentAdministration.js";
import type * as permissionVersions from "../permissionVersions.js";
import type * as permissions from "../permissions.js";
import type * as permissionsV2 from "../permissionsV2.js";
import type * as permissionsV2Pdf from "../permissionsV2Pdf.js";
import type * as profileSetup from "../profileSetup.js";
import type * as retentionReview from "../retentionReview.js";
import type * as retentionSchema from "../retentionSchema.js";
import type * as reviewerRehearsal from "../reviewerRehearsal.js";
import type * as rooms from "../rooms.js";
import type * as seasonAdmin from "../seasonAdmin.js";
import type * as seasonConfirmation from "../seasonConfirmation.js";
import type * as seasonFamilyLinks from "../seasonFamilyLinks.js";
import type * as seasonHistory from "../seasonHistory.js";
import type * as seasonTransition from "../seasonTransition.js";
import type * as seasonTransitionReview from "../seasonTransitionReview.js";
import type * as setupWizard from "../setupWizard.js";
import type * as subteamMigration from "../subteamMigration.js";
import type * as syntheticRehearsalCleanup from "../syntheticRehearsalCleanup.js";
import type * as teamReports from "../teamReports.js";
import type * as timeclock from "../timeclock.js";
import type * as timeclockPinControl from "../timeclockPinControl.js";
import type * as timeclockRoster from "../timeclockRoster.js";
import type * as travel from "../travel.js";
import type * as withdrawals from "../withdrawals.js";
import type * as workflowSummaries from "../workflowSummaries.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  accounts: typeof accounts;
  admin: typeof admin;
  adultInviteEmail: typeof adultInviteEmail;
  adultProfile: typeof adultProfile;
  app: typeof app;
  attendanceOperations: typeof attendanceOperations;
  attendanceReportMaintenance: typeof attendanceReportMaintenance;
  auth: typeof auth;
  bootstrap: typeof bootstrap;
  bulkInvites: typeof bulkInvites;
  calendar: typeof calendar;
  calendarState: typeof calendarState;
  chargeAdmin: typeof chargeAdmin;
  coachRoster: typeof coachRoster;
  consentPdfRehearsal: typeof consentPdfRehearsal;
  consentProfileV2Schema: typeof consentProfileV2Schema;
  consentRehearsal: typeof consentRehearsal;
  crons: typeof crons;
  dashboardReports: typeof dashboardReports;
  developmentRehearsal: typeof developmentRehearsal;
  eventCalendar: typeof eventCalendar;
  eventEnrollment: typeof eventEnrollment;
  eventOperations: typeof eventOperations;
  familyLinkSeasonMigration: typeof familyLinkSeasonMigration;
  feeBulk: typeof feeBulk;
  feeBulkWorker: typeof feeBulkWorker;
  feeDefinitions: typeof feeDefinitions;
  feeMappingWorker: typeof feeMappingWorker;
  feePayments: typeof feePayments;
  feePriorities: typeof feePriorities;
  feePriorityWorker: typeof feePriorityWorker;
  finance: typeof finance;
  financeAdmin: typeof financeAdmin;
  financeChangeBackfill: typeof financeChangeBackfill;
  financeDetails: typeof financeDetails;
  financeExport: typeof financeExport;
  financeOperations: typeof financeOperations;
  financeReportMaintenance: typeof financeReportMaintenance;
  financialAllocation: typeof financialAllocation;
  financialOperationsWorker: typeof financialOperationsWorker;
  financialSources: typeof financialSources;
  firstRegistration: typeof firstRegistration;
  fundraiserLinks: typeof fundraiserLinks;
  fundraiserPosting: typeof fundraiserPosting;
  fundraisers: typeof fundraisers;
  historicalCorrections: typeof historicalCorrections;
  historicalFinancialCorrections: typeof historicalFinancialCorrections;
  historicalRoster: typeof historicalRoster;
  http: typeof http;
  "lib/access": typeof lib_access;
  "lib/attendanceReports": typeof lib_attendanceReports;
  "lib/authRedirect": typeof lib_authRedirect;
  "lib/calendarAuth": typeof lib_calendarAuth;
  "lib/calendarDates": typeof lib_calendarDates;
  "lib/calendarNormalize": typeof lib_calendarNormalize;
  "lib/chargeCorrection": typeof lib_chargeCorrection;
  "lib/chargeObligation": typeof lib_chargeObligation;
  "lib/consentSnapshot": typeof lib_consentSnapshot;
  "lib/consentSnapshotV2": typeof lib_consentSnapshotV2;
  "lib/contactEntry": typeof lib_contactEntry;
  "lib/contactValidation": typeof lib_contactValidation;
  "lib/eventEnrollmentState": typeof lib_eventEnrollmentState;
  "lib/feeBulkMoney": typeof lib_feeBulkMoney;
  "lib/feeDefinitions": typeof lib_feeDefinitions;
  "lib/financeChanges": typeof lib_financeChanges;
  "lib/financeRow": typeof lib_financeRow;
  "lib/financeSummaries": typeof lib_financeSummaries;
  "lib/financialAllocation": typeof lib_financialAllocation;
  "lib/financialSources": typeof lib_financialSources;
  "lib/financialWithdrawal": typeof lib_financialWithdrawal;
  "lib/fundraisingMath": typeof lib_fundraisingMath;
  "lib/invitationIdentity": typeof lib_invitationIdentity;
  "lib/maintenanceAccess": typeof lib_maintenanceAccess;
  "lib/money": typeof lib_money;
  "lib/parentInviteEmail": typeof lib_parentInviteEmail;
  "lib/permissionCoverage": typeof lib_permissionCoverage;
  "lib/permissionSigningMode": typeof lib_permissionSigningMode;
  "lib/profileCorrections": typeof lib_profileCorrections;
  "lib/publicErrors": typeof lib_publicErrors;
  "lib/readModels": typeof lib_readModels;
  "lib/reportAggregates": typeof lib_reportAggregates;
  "lib/retention": typeof lib_retention;
  "lib/seasonCalendar": typeof lib_seasonCalendar;
  "lib/seasonFamilyLinks": typeof lib_seasonFamilyLinks;
  "lib/seasonFinance": typeof lib_seasonFinance;
  "lib/seasonIdentity": typeof lib_seasonIdentity;
  "lib/seasonTransitionFinance": typeof lib_seasonTransitionFinance;
  "lib/teamReportAttendance": typeof lib_teamReportAttendance;
  "lib/timeclock": typeof lib_timeclock;
  "lib/timeclockPin": typeof lib_timeclockPin;
  "lib/timeclockTransition": typeof lib_timeclockTransition;
  "lib/wholeTeam": typeof lib_wholeTeam;
  parentEmailAuth: typeof parentEmailAuth;
  parentInviteEmail: typeof parentInviteEmail;
  parentInvites: typeof parentInvites;
  participation: typeof participation;
  paymentAdministration: typeof paymentAdministration;
  permissionVersions: typeof permissionVersions;
  permissions: typeof permissions;
  permissionsV2: typeof permissionsV2;
  permissionsV2Pdf: typeof permissionsV2Pdf;
  profileSetup: typeof profileSetup;
  retentionReview: typeof retentionReview;
  retentionSchema: typeof retentionSchema;
  reviewerRehearsal: typeof reviewerRehearsal;
  rooms: typeof rooms;
  seasonAdmin: typeof seasonAdmin;
  seasonConfirmation: typeof seasonConfirmation;
  seasonFamilyLinks: typeof seasonFamilyLinks;
  seasonHistory: typeof seasonHistory;
  seasonTransition: typeof seasonTransition;
  seasonTransitionReview: typeof seasonTransitionReview;
  setupWizard: typeof setupWizard;
  subteamMigration: typeof subteamMigration;
  syntheticRehearsalCleanup: typeof syntheticRehearsalCleanup;
  teamReports: typeof teamReports;
  timeclock: typeof timeclock;
  timeclockPinControl: typeof timeclockPinControl;
  timeclockRoster: typeof timeclockRoster;
  travel: typeof travel;
  withdrawals: typeof withdrawals;
  workflowSummaries: typeof workflowSummaries;
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
