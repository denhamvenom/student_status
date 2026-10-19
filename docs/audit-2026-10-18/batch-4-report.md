# Batch 4 implementation report

This report records the Batch 4 changes against [the master audit](master_report_2026-10-18.md), sections 4 and 5. It describes the current local implementation, not a production rollout. Automated checks, independent review and Coach, Travel Lead, Parent and Student spot-checks are complete. This report accompanies the Batch 4 development checkpoint; stored conversion is deferred by the owner. No private student or family records are included.

## Changes implemented

- **Clearer family and staff status.** Money pages now explain each balance term, and the Home Money card shows Available funds when positive (`src/lib/family-copy.ts`, `src/DashboardReports.tsx`, `src/LiveApp.tsx`). A Coach student record distinguishes entered health information awaiting Parent confirmation (`convex/workflowSummaries.ts`, `src/CoachStudentRecord.tsx`). Parent independent-travel selection says “My student will travel on their own (not with the team).” and confirms “Saved”; the Student sees the parent/Coach-set status (`src/Travel.tsx`). Attendance before a counted Tuesday meeting says “Not counted yet” (`src/DashboardReports.tsx`, `src/TeamReports.tsx`).
- **Navigation and work queues.** Money tools has its own page for fee order, charge matching, bulk payments, exports and recent changes; the existing financial edit permissions still govern its tools (`src/LiveApp.tsx`, `src/AppShell.tsx`, `src/lib/navigation-copy.ts`). Travel Leads can open New event and Join requests. The Coach Team roster links to the profile-correction queue when a bounded query finds waiting items. Staff event cards show waiting signups, capped at “100+ waiting” (`convex/workflowSummaries.ts`, `src/LiveApp.tsx`). Event pages now explain open, approval and assigned signups. Readiness permission cells link to the selected student's permission forms (`src/features/design-review/ReadinessReview.tsx`, `src/PermissionWorkflow.tsx`).
- **Join and roster flow.** The join screen reads request status from the server, so pending survives a reload and declined gets a distinct explanation. Sign-in warns a new Student that a team code follows; the team-code section explains who approves requests, lists active codes, and lets a Coach revoke one (`convex/app.ts`, `convex/admin.ts`, `src/PendingJoinView.tsx`, `src/LiveApp.tsx`, `src/lib/live-copy.ts`). Archived Coach roster rows have disabled assignment controls (`src/CoachRosterManagement.tsx`).
- **Review before hard-to-undo actions.** Revoke Parent access, Finalize room and Write off now use the accessible `ConfirmAction` dialog; the reviewed action and context are frozen while the dialog is open. Room finalization also checks the expected member list on the server so a changed room cannot silently be finalized (`src/ConfirmAction.tsx`, `src/ParentInvites.tsx`, `src/features/operations/RoomOperations.tsx`, `src/SeasonReviewSteps.tsx`, `convex/rooms.ts`). Routine Subteam, Travel Team, Promote, Approve and Decline actions retain their existing flow.
- **Subteams.** The user's final canonical list is Build, Electrical, Machining, Programming, and Business/Media. The earlier master-audit phrase “Business and Media” is superseded. The option and validation update uses this final spelling, with no Unassigned selection. Existing missing assignments remain missing. Legacy Mechanical maps to Build, and Business and Outreach map to Business/Media in the planned conversion. Bounded internal preview/apply functions with revision checks and audit entries are prepared (`src/lib/subteams.ts`, `src/lib/live-copy.ts`, `src/SetupWizard.tsx`, `src/CoachRosterManagement.tsx`, `src/TeamReports.tsx`, `src/lib/team-report-csv.ts`, `convex/admin.ts`, `convex/setupWizard.ts`, `convex/subteamMigration.ts`). CSV headers and money calculations are unchanged. **The owner explicitly deferred stored-record changes.** No production comparison or development conversion was run. The prepared migration also maps the superseded Business and Media value to Business/Media.
- **Independent travel authority.** The server now accepts an independent-travel change from a linked Parent or Coach, and denies the Student; the Student sees a read-only status (`convex/travel.ts`, `src/Travel.tsx`). Existing flag provenance cannot be established from the flag alone: it has no setter or timestamp fields, though normal mutation audit entries include actor and time. No live record inspection was done.
- **Whole Team event leaving.** A confirmed Student can confirm “Leave this event” and leave immediately. The server withdraws participation, releases room placement, writes a durable Whole Team leave notice, and leaves any nonzero-fee decision in the normal review path. The Coach can dismiss notices on Withdrawal requests or the event Signups area; Travel Leads can read them. A prior withdrawal record stays attached and re-enrollment does not restore a departed Student (`convex/withdrawals.ts`, `convex/schema.ts`, `src/Withdrawals.tsx`, `src/features/operations/EventOperations.tsx`, `src/ConfirmAction.tsx`). The Student sees “You have left this event. Your Coach has been told.” Fee-review wording distinguishes that later money decision from the already completed leave.

The exact display wording and its source files are in [batch-4-copy-inventory.md](batch-4-copy-inventory.md).

## Validation and remaining checks

Development `third-bandicoot-18` synchronized successfully after the final canonical-subteam validation change. Build and TypeScript passed, with the existing bundle-size warning. Lint across `src` and `convex` passed. Full repository lint still reports nine existing errors in ignored private helpers. The full suite reported **412 passed, four pre-existing failures, 416 tests across 89 files**. The final subteam/report/permission focused run passed **18/18 across six files** after the spelling and invalid-student-link corrections. The four full-suite failures remain three stale FamilyLinkMaintenance assertions and one FinanceExport wording assertion. Sandbox temporary-module errors were resolved by running the local suite outside that restriction. Diff whitespace checks passed.

Independent final review found no blockers after correcting the New event route guard and preventing unavailable student links from opening another student's forms. Confirmations preserve the reviewed IDs, reasons, amounts, revisions and room members. Approved field-trip wording, immutable copy reference, fixture App.tsx and Timeclock were unchanged.

A Coach dark-phone live check has covered the event-card waiting count, Money tools page, and Revoke access confirmation with Cancel; no write was made. Travel Lead dark-desktop checks verified the exact five-subteam filter, New event through its editable fee step, Cancel without saving, and Money tools without bulk payment or charge-matching controls for an account without financial editing. Parent dark-desktop checks verified Money definitions, positive Available funds on Home, and event signup guidance. The viewed event had no eligible Parent signup, so the checkbox and Saved state were not exercised. Student dark-desktop checks verified positive Available funds on Home, the independent-travel read-only explanation with no checkbox, and the Whole Team leave confirmation. Cancel returned to the event with participation still Confirmed. No leave was submitted. Actual success writes, Parent Saved acknowledgement, pending/declined join account states, remaining confirmation combinations and light-theme comparisons were not exercised live; automated/source evidence is separate. The all-event **open requirement count** was conditional on a cheap query in the master audit and is deferred to avoid adding an expensive per-event readiness expansion. The implemented per-event waiting-signups query is bounded and indexed; this does not fulfill the separate open-requirement-count proposal.

The Student wizard now directs rooming changes to Profile > Request a correction while keeping Coach direction for subteam and Travel Team changes.

No production sync, production data write, or subteam backfill is part of this report.

## Tests changed or added

- `convex/app.test.ts`: join status/resend/lockout and active-code access; waiting counts, private health-state summary, and stale room membership confirmation.
- `convex/adminSubteam.test.ts`, `convex/subteamMigration.test.ts`, `src/lib/subteams.test.ts`: canonical choices, legacy mapping, guarded migration and rejection of invalid assignment.
- `convex/travel.test.ts`: Parent/Coach authority and Student denial for independent travel.
- `convex/withdrawals.test.ts`: immediate Whole Team leave, durable notices, authorization and later paid-fee decisions.
- `convex/eventEnrollmentGates.test.ts`: enrollment gate checked with the authorized Coach; Student independently denied.
- `src/ReviewStates.test.ts`: new notice-query response in the review-state fixture.
- `src/TeamReports.test.ts`, `src/lib/team-report-csv.test.ts`: accurate loaded counts and canonical subteam display/filter/export.

## Other known work

The separate audit bug list (waitlist ordering, cross-Coach import duplicate keys, seeded event-date correction and missing Whole Team fixture enrollment) is not repaired by this checkpoint. Existing independent-travel flags do not independently prove which role set them. No shared-data cleanup, approvals, payments or signing was performed.

## Files changed in this checkpoint

- `convex/_generated/api.d.ts`
- `convex/admin.ts`
- `convex/adminSubteam.test.ts`
- `convex/app.test.ts`
- `convex/app.ts`
- `convex/eventEnrollmentGates.test.ts`
- `convex/rooms.ts`
- `convex/schema.ts`
- `convex/setupWizard.ts`
- `convex/subteamMigration.test.ts`
- `convex/subteamMigration.ts`
- `convex/travel.test.ts`
- `convex/travel.ts`
- `convex/withdrawals.test.ts`
- `convex/withdrawals.ts`
- `convex/workflowSummaries.ts`
- `docs/CURRENT_STATE.md`
- `docs/DEVELOPMENT_CHECKLIST.md`
- `docs/FRONTEND_CONFORMANCE_LOG.md`
- `docs/PLAN.md`
- `docs/VISUAL_CHECKS.md`
- `docs/audit-2026-10-18/batch-4-copy-inventory.md`
- `docs/audit-2026-10-18/batch-4-report.md`
- `src/AppShell.tsx`
- `src/CoachRosterManagement.tsx`
- `src/CoachStudentRecord.tsx`
- `src/ConfirmAction.tsx`
- `src/DashboardReports.tsx`
- `src/LiveApp.tsx`
- `src/ParentInvites.tsx`
- `src/PendingJoinView.tsx`
- `src/PermissionWorkflow.tsx`
- `src/ReviewStates.test.ts`
- `src/SeasonReviewSteps.tsx`
- `src/SetupWizard.tsx`
- `src/TeamReports.test.ts`
- `src/TeamReports.tsx`
- `src/Travel.tsx`
- `src/Withdrawals.tsx`
- `src/features/design-review/ReadinessReview.tsx`
- `src/features/operations/EventOperations.tsx`
- `src/features/operations/RoomOperations.tsx`
- `src/lib/family-copy.ts`
- `src/lib/live-copy.ts`
- `src/lib/navigation-copy.ts`
- `src/lib/setup-wizard-copy.ts`
- `src/lib/subteams.test.ts`
- `src/lib/subteams.ts`
- `src/lib/team-report-csv.test.ts`
- `src/lib/team-report-csv.ts`
