# Batch 3 navigation and layout report

October 18, 2026. Starting checkpoint: Batch 2 `5813fca`, on `feature/development-review-fixtures-2026-10-18`. Implementation, independent review, automated validation and the Coach browser check are complete. This report accompanies the Batch 3 development checkpoint.

## Changes

- Coach navigation uses Team, Events, Money and Admin groups. Travel Lead uses Team, Events, Money and Account. Group tabs open the first page unless already within that group, preserving an open New event draft. Phone More uses matching headings, omits empty groups and keeps Sign out last. Parent navigation says Student profile.
- Owner resolved the batch-boundary conflict: expose Travel Lead Join requests now; keep New event access for Batch 4. The existing route and backend already permit Travel Leads. Team-code and parent-access controls remain Coach-only.
- Join requests puts Pending first, followed by Coach Team code and parent access. Roster archive/reactivate actions remain only on the student record. The archive confirmation points to Reactivate student. The dead family-management link now opens Join requests.
- Home Edit profile opens `/setup?edit=1` at step 1; ordinary setup resumes normally. While FIRST awaits a Coach, a complete parent profile has no redundant Finish setup button. An incomplete profile retains the existing confirmation action as Save profile because that action saves profile confirmation independently of FIRST.
- Empty event travel slots are omitted. Standalone rooming shows its event name and back link, including enrollment-running/failed states. Permission template identifiers use Version.
- Driver ownership review, attendance recalculation, historical preparation, financial report rebuild, FIRST reopening and fifth-occupant approval controls sit in collapsed More options sections. Existing permissions, reasons and confirmations are preserved.
- Shared fee rows and their review titles show connected event names. The paginated query resolves at most one event per returned fee (maximum 20), returning names only for the current season. Showing names for all connected fees also distinguishes duplicate labels split across pages. No money behavior changes.
- Archived records replaces the remaining retention heading/error wording; the Archive status changed error prefix remains intact.

## Validation

- Typecheck, build, changed-source lint and diff whitespace checks passed. Existing bundle-size warning remains.
- Full suite: **399 passed, four failed, 403 tests across 86 files**. The failures are the same three FamilyLinkMaintenance assertions and one FinanceExport wording assertion recorded in Batch 2. Added navigation tests and fee event-context rendering coverage pass.
- Full repository lint retains nine errors in ignored private helpers. No new source lint errors.
- Independent review found a missing rooming header during enrollment-running/failed states; corrected before the final build. No access-control or financial-behavior issues found.
- Development target `dev:third-bandicoot-18` verified and synchronized successfully. No production deployment, schema changes or shared-data workflow writes.
- Approved field-trip source, immutable UI reference, fixture App.tsx, stored keys and Timeclock are unchanged.

## Browser evidence and remaining check

The local Travel Lead session showed the four desktop groups at 1440px and grouped phone More links at 390px. Join requests opened with Pending and without Coach-only Team code/parent access. Sign out remained last. These were dark-theme, read-only checks; no requests were approved.

Coach desktop navigation opened Events from Team. The draft check exposed backdrop dismissal when clicking over the Events tab. New event now disables pointer dismissal; the repeated click retained both `/events/new` and the entered draft name. Cancel returned to Events without saving. The roster has no Archive action column. Final build/typecheck and scoped lint were rerun after this fix. Parent/Student edit-mode and waiting-state changes have source review and existing backend coverage, but no fresh role browser check. Light-theme comparisons remain unobserved; no saved theme preference was changed.

## Boundary

Stop before Batch 4. Do not enable Travel Lead New event, move Money tools, change stored behavior, or repair shared data under this batch. The checkpoint is intended for the existing development branch only; no merge or production release is authorized.
