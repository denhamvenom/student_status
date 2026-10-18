# Batch 0 audit facts

October 18, 2026. Source checkpoint: `e38aa7a`, branch `feature/development-review-fixtures-2026-10-18`. This checkpoint answers the six prerequisite questions; no application code, stored values, account permissions or shared data changed. Stop here before Batch 1, as requested.

The owner supplied the master report in this folder. Its five referenced role reports were copied here unchanged from the workspace root; `claude/` references in the master identify those originals. The master controls later wording and batch scope. The pasted implementation request controls explicit development-only and stop-after-batch restrictions.

## 1 Family contact and health forms

They converge on **one final student profile**, but unfinished wizard answers are separate. `src/SetupWizard.tsx:88` calls `saveContacts` and `saveMedical`. `convex/setupWizard.ts:28`, `:66` and `:67` save `setupDrafts`; contacts also update student contact fields, while medical answers remain draft. `finishParent` validates the combined answers, writes `students.consentProfileV2` and confirmation metadata, then deletes the draft (`convex/setupWizard.ts:69`).

Parent Profile and Forms use the same `ConsentProfileV2Form` (`src/LiveApp.tsx:260`, `src/PermissionWorkflow.tsx:63`). That form uses `permissionsV2.profile/saveProfile` (`src/ConsentProfileV2Form.tsx:22`, `:28`, `:45`); the server reads/writes the same final student field and removes the setup draft (`convex/permissionsV2.ts:62-80`).

The master section 7 condition is satisfied for replacing the extra Forms editor with a summary and an Edit in Student profile link. Implement that later as layout/workflow work, preserving unfinished draft handling; do not describe step autosaves as a confirmed health profile.

## 2 Draft badges

**Team reports:** computed incomplete-report status, not a stored draft. Conditions include more pages, attendance not ready, incomplete/no event coverage, missing values or open/unknown selected-event readiness (`src/lib/team-report-csv.ts:13-17`, `src/TeamReports.tsx:35-37`).

**Printable readiness:** computed status for unknown coverage/requirements/transport/rooming, open readiness or zero students (`src/features/design-review/readinessPrint.ts:16-27`). The print preview is a timestamped snapshot of live query results (`ReadinessReview.tsx:61-66`, `:85-99`).

These labels have a real meaning. The master's conditional instruction to remove a meaningless badge does not apply. No badge was removed; a clearer replacement requires wording that preserves the incomplete-data warning.

## 3 Earlier attendance checkmarks

These are legacy `attendanceMeetings` and `attendanceRecords`, separate from Timeclock intervals (`convex/lib/readModels.ts:56-64`, `convex/dashboardReports.ts:96-100`, `src/AttendanceOperations.tsx:41`). The current recording operation is Coach-only and saves `present` and `recordedBy` (`convex/admin.ts:145-156`).

`attendanceRecords` has no explicit `recordedAt`; its Convex creation time identifies initial insertion, while `recordedBy` can change on an edit. Meeting `startsAt` is the meeting time, not entry time. Retained audit history can identify a particular change's actor and time (`convex/schema.ts:236-238`, `:269`; `convex/lib/access.ts:95-97`).

Read-only development inspection found **zero legacy meetings and zero legacy records**, so there is no current individual/date to identify. “Earlier attendance (marked by a Coach)” describes the current entry path; do not claim all marks necessarily predate Timeclock, since the legacy mutation remains available.

## 4 Label meanings

| Label | Confirmed meaning and evidence |
| --- | --- |
| Room Finalized | Coach or Travel Lead validates membership/occupancy and finalizes. Students cannot leave a finalized room. Adult assign/move/unassign clears finalization and requires review, so correction effectively reopens it; there is no separate undo-finalize button. `convex/rooms.ts:204-223`, `:229-237`, `:261-304`; `src/features/operations/RoomOperations.tsx:73`. |
| Personal held / Fundraising held | Unused source balance retained in the archived season, not carried forward or paid out. Hold completes its decision without a transfer ledger entry. `src/SeasonReviewSteps.tsx:41-42`, `:65`; `convex/seasonHistory.ts:6`; `convex/lib/seasonTransitionFinance.ts:59-77`, `:113-117`. |
| Invitation Replaced | A newer invitation superseded a pending invitation to that email; parent invitations also scope this to the student. The old link no longer passes pending-status validation. `convex/accounts.ts:38-52`, `:73-82`; `convex/parentInvites.ts:56-75`. |
| Row reference | Per-student row identifier within the named bulk-payment batch; used in duplicate protection with season, student and currently actor. Identical retry returns the original receipt; altered content is rejected. Distinct from check/payment reference. `convex/paymentAdministration.ts:115-149`; `src/PaymentAdministration.tsx:13`, `:46`, `:93-94`. The actor-key change belongs to the later fix batch. |
| Event arrangements | The event workspace blocked while automatic Whole Team enrollment is running or failed. Coach retry appears on failure. `src/lib/event-copy.ts:6-10`; `src/EventEnrollmentNotice.tsx:9-27`; `src/LiveApp.tsx:151`; `convex/lib/eventEnrollmentState.ts:3-11`. |

## 5 Event date one day early

New event uses `datetime-local` and `Date.parse` (`src/LiveApp.tsx:277`, `:284`); backend stores epoch milliseconds (`convex/admin.ts:78-99`). A Central-time browser entering June 22 midnight produces 05:00 UTC. The list/detail date currently uses the device timezone (`src/LiveApp.tsx:91-92`); readiness and permissions explicitly use America/Chicago (`src/features/design-review/ReadinessReview.tsx:22`; `src/PermissionWorkflow.tsx:35`). The architecture calls for epoch timestamps with Chicago presentation (`docs/ARCHITECTURE.md:30`).

Development inspection confirmed the reported review trip has start `2027-06-22T00:00:00Z`, exactly 21 days after the synthetic season's UTC-midnight start. This matches its fixture's `eventBase + 21 * day` construction (`convex/reviewerRehearsal.ts:54`, `:86`). That instant is correctly June 21 at 7 PM CDT. The demonstrated discrepancy originates in the seed timestamp, not a formatter subtracting a day.

Later correction should preserve meaningful timed-event instants and use an explicit Chicago input/display convention. Do not blindly shift every timestamp or replace the timed-event schema with date-only strings. Shared fixture repair was not run; the request prohibits saving shared development data without separate permission.

## 6 Missing Whole Team registration

Read-only development inspection found the fictional PDF student active in the current season, with no participant record for the current Whole Team event and no withdrawal records. Its enrollment job completed all four original members, and that student was not among them. The student was created after the enrollment job. The older Whole Team event belongs to a different season and is not applicable.

`convex/consentPdfRehearsal.ts:41-49` directly inserts this fictional student and its PDF-event participation, without calling the Whole Team sync helper. Ordinary join/reactivation paths do call the helper (`convex/admin.ts:62`, `:67`, `:139`), and the newer reviewer seed calls it too (`convex/reviewerRehearsal.ts:83`). The helper adds eligible upcoming membership while preserving existing participation and approved withdrawals (`convex/lib/wholeTeam.ts:7-19`, `:27-36`). Enrollment jobs process only their captured member rows (`convex/eventEnrollment.ts:30-37`).

**Conclusion: development fixture omission, not an unfinished enrollment job or evidence that normal join registration is broken.** Do not rerun completed jobs or reactivate students as a repair shortcut. Any narrow fixture repair remains later work and needs permission to save shared data.

## Development wording visibility

No wording was removed. A production frontend build and a production backend are different gates.

| Requested location | Gate and production visibility |
| --- | --- |
| `readinessCopy.ts:6` | Banner rendered only under `import.meta.env.DEV` in `src/AppShell.tsx:70`. |
| `permission-workflow-copy.ts:6` | Main notice uses server synthetic signing mode (`PermissionWorkflow.tsx:67`, `:127`); synthetic receipt label uses `row.synthetic` (`:92`). Legacy format-1 details show the notice (`:215`). Historical synthetic evidence can remain labeled in a production build. |
| `permission-workflow-copy.ts:10` | Old format-1 unapproved wording shown only when that snapshot version is unapproved (`PermissionWorkflow.tsx:219`). Current format-2 receipts take another component (`:94-95`). |
| `permission-workflow-copy.ts:13` | History/no-history strings are live production UI (`PermissionWorkflow.tsx:92`). Prepare synthetic form/startAgain appear unused in the current v2 path. |
| `permission-workflow-copy.ts:28`, `:40` | Synthetic submit/paper button selected by snapshot.synthetic (`PermissionWorkflow.tsx:87`, `:140`). Older paper heading/attestation constants appear unused. |
| `permission-workflow-copy.ts:46`, `:51` | Synthetic export notice when visible receipt history contains synthetic evidence (`PermissionWorkflow.tsx:172`); old versionGate appears unused in current template panel (`:203-210`). |
| `PermissionWorkflow.tsx:109` | Synthetic evidence label requires receipt.snapshot.synthetic; may show for historical synthetic evidence in production builds. |
| `convex/permissions.ts:103`; `convex/lib/permissionSigningMode.ts:38` | Server returns signing mode/eligibility. Synthetic requires exact dev URL plus registered subject; real requires explicit matching production configuration; otherwise closed (`permissionSigningMode.ts:11-40`, `permissions.ts:35-40`, `:99-103`). Closed-signing messages are not test-only. No configuration was changed or production queried. |
| `src/lib/field-trip-pdf.ts:29`, `:191`, `:298` | Current approved template stamp requires snapshot.synthetic (`:191`). Older renderers stamp unconditionally but are selected for legacy versions (`:217-228`). Preserve truthful historic evidence labels. |
| `family-copy.ts:32` | Used by `PermissionDraft.tsx:6-7`, which is not imported/routed in the live app. |
| `family-copy.ts:70`; `ParentInvites.tsx:136-138` | Static review component used by the development fixture app (`src/App.tsx:69`, `:74`); not production live UI. |
| `retention-copy.ts:28` | Policy-gap note appears on live Coach retention pages, including production builds (`src/RetentionReview.tsx:83`, `:111`; `src/LiveApp.tsx:376`). It is not automatically hidden by build mode. |

## Scope and next batch

No tests or live copy changed, so there is no old-to-new copy list. Existing role reports and the owner master were preserved, not rewritten. Batch 1 and all behavioral fixes remain unimplemented.

Additional observations to preserve: the date formatter depends on the viewer's device timezone; legacy attendance can still be entered after Timeclock exists; parent profile confirmation clears the wizard draft. The master conditional Draft removal should not silently erase incomplete-data status. The later production mapping comparison must respect the current no-production-access instruction before any migration proceeds.

Browser access used localhost without fixture parameters; it opened an existing Mentor session. No sign-in, save, approval, payment or signature was performed. The attempted `bun run dev` launch found port 5173 already occupied; the existing app was used, without stopping its process. Role-specific changed-screen checks do not apply to this source-investigation checkpoint.

## Baseline validation

- `bun run typecheck`: passed.
- `bun run check`: stopped at lint with nine existing errors in ignored private helpers: five undefined browser/network globals in `private-data/launch/verify-calendar.mjs`, four explicit-any errors in `private-data/rehearsal-preview/SetupWizardPreview.tsx`. These private files were not edited.
- Initial sandbox test run: 71 suites could not load temporary modules (ENOENT); 14 suites/50 tests passed. Retried outside the sandbox under the documented project procedure.
- Unrestricted `bun run test`: **390 passed, 8 failed across 85 files**. Three failures in `src/FamilyLinkMaintenance.test.ts`, two in `src/ReviewStates.test.ts`, two in `src/TeamReports.test.ts` are baseline rendering/copy assertions. One `convex/feeBulk.test.ts` case exceeded its 30-second timeout. No application/test edits preceded these results. Later copy batches should update affected pins together; this report does not claim a green baseline.
- No tests were added or updated. No backend sync, migration, deployment or production query was run. No build result is claimed because the combined check stopped at lint.
- Reviewed the documentation diff and copied reports for email addresses; no account addresses, tokens, private identifiers, medical answers or database snapshots were added. The report contains only source explanations and aggregate/synthetic diagnostic facts.

Changed files: this findings report; the owner-provided master report; unchanged copies of `audit_coach_2026-10-18.md`, `audit_travellead_2026-10-18.md`, `audit_parent_2026-10-18.md`, `audit_student_2026-10-18.md`, `audit_signedout_2026-10-18.md`; and the milestone notes in `docs/CURRENT_STATE.md`, `docs/PLAN.md`, `docs/DEVELOPMENT_CHECKLIST.md`. No live text has an old-to-new replacement in Batch 0.
