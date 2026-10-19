# Batch 2 sensitive-area wording report

October 18, 2026. Based on the owner master report, role reports and original implementation request. Starting checkpoint: Batch 1 `41fb348`, on `feature/development-review-fixtures-2026-10-18`. The owner authorized Batch 2 and a stop/report on completion. No Batch 3 work is included.

## Changes

[Exact old and new wording](batch-2-copy-changes.md) lists the 24 application source files. Money recovery now distinguishes saved results, planned amounts, rows needing review and money returned to available funds. Payment corrections/imports, shared-charge matching, withdrawal outcomes and season decisions use the approved wording. Fundraiser hold text matches between the frontend and backend.

Consent displays, accessible PDF labels and consent-related server errors now say signed form. Payment receipts, code identifiers and saved records keep their existing names. The approved form itself and all PDF/snapshot contents are unchanged. Permission history, event status, export-grant explanations and health-profile guidance use the approved text. Synthetic signing restrictions remain visible; only the ordinary closed-signing reason was reworded.

FIRST instructions explicitly distinguish looking up records, checking both boxes and pressing Verify. Home has distinct health and FIRST setup labels with unchanged destinations. The original request's explanation of Consent & Release appears on Home's FIRST task and the shared wizard FIRST step. Student health privacy and FIRST waiting text are updated. The Parent waiting sentence follows Batch 1's existing “Nothing for you to do right now.” line, so no duplicate replacement was needed.

Room text retains adult approval and a note for a fifth student, the absolute six-person prohibition, and the required leading space/separator. Driver status now says Not approved or inactive. T-L11 signup capacity and P-L7 returned-money wording already matched the master's chosen shared wording from Batch 1 and were retained.

## Preserved boundaries

- No stored enum/key, schema, permission, route destination or domain behavior changed. No money mutation, approval, signature, import, fixture repair or account change was performed through the live app.
- Preview/confirmation, reason length, stale-data checks, frozen targets, season safeguards, FIRST double-tick and closed-signing checks remain intact. Pinned action labels and export headers are unchanged.
- `src/lib/field-trip-approved.ts`, `ui-copy.reference.json`, `src/App.tsx` and Timeclock are untouched.
- Backend changes are display/error messages only in five source files. Development **third-bandicoot-18** was verified and synchronized successfully with `bunx convex dev --once`. No production access or frontend deployment occurred.

## Validation and review

- Typecheck and application build passed. The existing large-bundle warning remains.
- Lint on changed TypeScript/TSX files passed. Repository lint retains the same nine errors in ignored private helper files.
- Initial sandbox test runs could not load generated modules from sandbox temporary files. The local suite ran successfully outside that restriction; no shared backend records are used by these in-memory tests.
- Final suite: **395 passed, four failed, 399 tests across 85 files**. All Batch 2 affected suites passed. Remaining failures are three existing FamilyLinkMaintenance assertions and one existing FinanceExport expectation for the pre-Batch-1 phrase “collected over a time range.” That export failure was missing from the prior Batch 1 summary; its source and test are unchanged in Batch 2. The large feeBulk test passed in this run. No Batch 2 regression remains.
- Permission error expectations were updated with the changed messages. Money rendering tests now pin the approved recovery wording, including the previously stale ReviewStates fundraiser expectations.
- Independent source review found no material issues. It checked financial distinctions, immutable form content, state keys, permission guards, room limits and FIRST destinations.

## Browser evidence and limitations

The existing Travel Lead session at localhost:5173 was checked without fixture parameters. Drivers showed the new seat explanation and both Approved and Not approved or inactive statuses. Permission forms showed the approved subtitle, Permission status by event, Signed form history and the renamed export checkbox. The Health export checkbox remained disabled for the account lacking that grant.

No forms were saved and no money/recovery/signing workflow was executed. Coach, Parent and Student were not switched through again for this batch; their changed rendering was source-reviewed and relevant component/backend tests were run. Rare partial-money failures and signing states were validated with isolated tests rather than manufacturing live records. This is not an exhaustive desktop/light-theme visual pass.

## Next boundary

Stop before Batch 3 navigation/layout. All previously deferred behavior changes, migrations and shared-data repairs remain separate. The older family-link completion inconsistency and unrelated baseline checks remain documented, not silently changed.
