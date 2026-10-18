# Batch 1 safe wording report

October 18, 2026. Based on the owner master report, role reports and pasted implementation instructions. Batch 0 documentation commit `bd7ab86` was pushed to the existing development branch after explicit owner approval; its remote SHA was verified. This batch changes displayed wording and formatting, with no new workflow or access grants. Stop before Batch 2.

## Changes

[Exact old and new wording by source file](batch-1-copy-changes.md) covers every changed application source file. It includes money column/help/export labels, report and attendance terminology, roster/profile wording, event descriptions/counts/date formatting, readiness labels, season/archive explanations, invitation messages, Parents heading and the shared Travel Team explanations.

The only backend edit is two validation errors in `convex/setupWizard.ts`: “Choose a valid T-shirt size.” becomes “Choose a valid shirt size.” The development sync completed successfully against **third-bandicoot-18**. No production deployment/query, schema change, migration or deliberate shared-data mutation was performed. Existing scheduled development jobs were not stopped.

Text-dependent rendering changes are limited to singular/plural forms, truthful report counts using existing pagination/filter state, and choosing the Team activity display label. All event option values are explicit (`Competition`, `Outreach`, `Team`), preserving the stored enum. Travel Team help is visible and associated with staff filters/columns; families see the approved explanation on Profile and wizard step 2. Date formatting preserves timestamps and shows minutes and the Chicago timezone abbreviation, without seconds.

The existing Coach-and-Travel-Lead Join requests blocked message is corrected separately from Coach-only routes. Other route guards stay unchanged. Event jump-link text is now Signups (master Batch 1 T-L13); its target is unchanged. The Student health waiting line uses the approved S-L1 wording, while the separate Profile health privacy line and FIRST-specific messages remain for Batch 2.

## Tests updated

- `src/TeamReports.test.ts`: new display-column/data-label pins, approved complete and partial count sentences, and a filtered partial-page case proving the displayed count matches the rows shown. Three tests pass.
- `src/DashboardReports.test.ts`: checked but unchanged in the final batch. Its original Available fundraising credit expectations are preserved, matching the master's explicit Family Money label exception. Five tests pass.

Only TeamReports.test.ts changed. Pinned action labels remain intact, including Record payment for, Prepare export, Download charge details (CSV), Recalculate attendance, Match earlier charges, Retry remaining work and Start maintenance.

## Validation

- Typecheck passed during integration and after final edits.
- Application build passed with the existing large-bundle warning. No frontend was deployed.
- Lint on every changed TypeScript/TSX source passed.
- Full repository lint still reports the same nine baseline errors in ignored private helper files documented in Batch 0. Those files were not changed.
- Initial full test run: 389 passed, nine failed. One failure exposed a shared fundraising label change; final scope review restored the original Family Money label and original DashboardReports expectations, and the affected tests passed. Two financial suites timed out under full-suite load; both subsequently passed in an isolated rerun.
- Final full suite with two workers: **393 passed, six failed, 399 tests across 85 files**. Remaining failures are the three pre-existing FamilyLinkMaintenance assertions, two pre-existing ReviewStates fundraiser recovery assertions, and the pre-existing 30-second large feeBulk timeout. The feeBulk suite passes in isolation. No failure introduced by this batch remains, but the repository does not have a green baseline.
- Focused final report tests: eight passed across TeamReports and DashboardReports. The added filter test checks a meaningful count discrepancy found in review.
- Independent source review found the filtered partial count discrepancy; it was corrected and tested. Stored values, money/safety guards, CSV headers, the approved field-trip wording and the reference snapshot are unchanged.

## Live browser checks

Used the real local app at localhost:5173 without fixture parameters. The owner switched accounts. No form saves, approvals, money recording, signatures or invitation creation occurred.

- Coach: roster subtitle, sign-in status, missing-information label and Travel Team help; Money personal-payment label and help, overview, export and recent-change notes; Team Reports columns and transition from a partial count to the complete count; event signup capacity explanation, minute-only Chicago date, singular requirement count and Signups jump link.
- Parent: Shirt size in setup; Home empty-action message while FIRST remains waiting; Timeclock and earlier Coach-marked attendance headings; Profile Travel Team explanation.
- Student: Home empty-action and health waiting messages, shared kickoff explanation, Parents heading.
- Travel Lead: read-only Team roster Travel Team explanation; Readiness field-trip and overnight-event views, open count and permission-form print instruction. No summary or forms were submitted.

Representative screens were checked in the existing narrow dark-theme browser. Desktop/light-theme visual conformance and every exceptional invitation/error state were not exhaustively rechecked in this text batch. No fixture evidence is presented as a live check. The setup Save and continue button was not used, so later wizard steps were source-checked rather than saved through.

## Deferred and unchanged work

- Batch 2 money recovery/consent/FIRST/room-safety/driver-status text, the receipt-to-signed-form rename, and Profile health privacy line remain unchanged.
- Batch 3 navigation groups, route relocation, parent profile navigation name, archive-button removal, Edit profile behavior and collapsed tools remain unchanged.
- Batch 4 access, independent travel, Whole Team withdrawal, subteam migration, server join-status persistence, attendance missing-value behavior and family money explanations remain unchanged.
- The date data problem and missing Whole Team fixture registration remain as diagnosed in Batch 0. This batch formats dates; it does not shift timestamps or repair shared records.
- Sign-in onboarding hint and lockout duration are queued with their specified later behavior work. PendingJoinView and ParentInvites consume the changed shared copy and required no component edit. The parent invitation unavailable long message already matched the approved version and was retained.
- Baseline private-helper lint, family-link completion wording/assertions and fundraiser recovery assertions were not silently repaired. The family-link completion message still says some links need review even for the complete server state; that is an existing inconsistency outside the approved C-L52 failure-message edit, and merits a separate behavior/copy decision.

## File inventory

Application files: all 28 source files listed in [the exact-copy inventory](batch-1-copy-changes.md). Tests: `src/TeamReports.test.ts`. Documentation: this report, `batch-1-copy-changes.md`, `docs/CURRENT_STATE.md`, `docs/PLAN.md`, `docs/DEVELOPMENT_CHECKLIST.md`. Private validation logs remain ignored and are not part of the commit.
