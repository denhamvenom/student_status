# Test suite audit

## Approved conservative cleanup — October 21, 2026

Implemented only the approved removal of the unused roster cancellation test and consolidation of legacy consent into the focused suite (both empty and event-bearing inputs retained); corrected hook/query-order assertions, invalid balance evidence and PDF content checks; added adult privilege-escalation and parent travel ownership denial/no-change cases; added the testing rule to AGENTS.md. No production code, dependencies, schema, or other missing tests were added.

Validation: one full suite run, **629 cases: 628 passed, 1 failed**, 115 files, **102.618 seconds wall time**. The failure was the strengthened PDF prose assertion treating repeated page headers inside continued health text as missing content. The comparison now excludes those running headers while still verifying their serialized text operands. The targeted PDF file then passed **5/5**, in 2.21 seconds. The full suite was not rerun. Typecheck and source lint passed before the full run; repository-wide lint encountered existing temporary preview/build artifacts, which were not changed. Independent review found no implementation blockers; the restored empty-event consent case was verified by the full run.

The audit below remains the original pre-cleanup baseline and recommendations, not a claim that its entire cleanup list was implemented.

Date: 2026-10-21. Read-only audit of commit `f944ebf0f52c247f8226bce1e95631f289fc17b8`, branch `docs/optimization-release-2026-10-21`.

## Executive assessment

**628 tests passed in 115 files. The full configured suite ran once, in 108.800 seconds wall time.** Most backend tests protect real financial conservation, authorization, recovery, or attendance rules. There is no evidence supporting a large wholesale deletion. The useful cleanup is targeted: remove one misleading test for an unused cancellation path, consolidate a few overlapping scenarios, and replace brittle or weak assertions.

The most important gaps are adult privilege changes, parent travel ownership, multi-page payment-correction recovery, finance-summary rollback, and mounted frontend behavior. These are missing regression protections, not demonstrated production defects.

No source, test, schema, or AGENTS.md changes were made. No production records were queried for this audit. This report is the only authored file.

## 1. Run and measurement

- Command: `bun run test -- --maxWorkers=1 --no-cache --reporter=json --outputFile=docs/test-audit.md`.
- One full run, no retries or selective reruns. Exit code 0; 628 passed, 0 failed.
- Wall time, measured around the command: **108.7998794 seconds**.
- Sum of reported individual test durations: **48.591 seconds**. This is not wall time: runner startup, module loading/transformation, file setup and reporting account for additional work.
- Single worker and disabled cache make this a specific local baseline, not a prediction of normal parallel CI speed.
- The JSON result was temporarily written into the authorized report path, then replaced by this Markdown report. Individual test names and durations are preserved in the inventory below.
- Vitest includes `convex/**/*.test.ts` and `src/**/*.test.ts`, using `edge-runtime`. The timeclock workspace has lint/build checks but no separate test script. No maintained browser test suite was discovered in the configured test roots. Build, lint, browser rehearsals and production smoke checks were not run as part of this test-only audit.
- No coverage instrumentation was requested or run. Coverage findings below come from test/source inspection and endpoint-call searches; they are not line/branch coverage percentages.

### Ten slowest individual tests

| Rank | File | Full test name | Seconds |
| --- | --- | --- | ---: |
| 1 | convex/feeBulk.test.ts | durable prepared custom fees snapshots and cancels more than 500 historical linked charges using bounded work and causal student fences | 14.554 |
| 2 | convex/timeclockRoster.test.ts | measures bounded clock status reads: 100 students / 50 visits / other | 1.740 |
| 3 | convex/attendanceReportMaintenance.test.ts | attendance projection maintenance reads more than 500 held sessions through aggregates and paginates minimized cards | 1.684 |
| 4 | convex/wholeTeam.test.ts | Whole Team enrollment creates the supported 500-member Whole Team roster | 1.652 |
| 5 | convex/wholeTeam.test.ts | Whole Team enrollment enrolls in 100 upcoming events using rebuilt funding without rescanning financial history | 1.151 |
| 6 | src/lib/field-trip-pdf.test.ts | field trip PDF renderer keeps the approved original layout to one reviewed and signed page for ordinary values | 1.084 |
| 7 | convex/permissionWorkflow.test.ts | synthetic versioned permission workflow paginates a 500-member health export and rechecks revoked grants between pages | 1.083 |
| 8 | convex/financeExport.test.ts | scoped financial CSV export collects all roster and charge pages with exact source cents and zero-charge member metadata | 1.044 |
| 9 | convex/bulkInvites.test.ts | Coach-approved bulk account connections imports 100 unique students without automatic travel status, events or charges and bounds pending requests | 1.026 |
| 10 | convex/timeclockRoster.test.ts | measures bounded clock status reads: 100 students / 50 visits / selected | 1.011 |

**These are synthetic test fixtures, not counts of live app records.** In particular, the slowest test constructs more than 500 historical charges inside its test environment. It does not mean the current app has that many charges, and this audit did not read live financial data. That one test accounts for about 13.4% of command wall time and 30.0% of summed individual-test time. Its purpose is to catch truncation and incomplete cancellation beyond a historical read boundary.

## 2. What the tests protect

Each executed case receives one primary category in the appendix, so counts sum to 628. Many integration tests also protect a secondary concern: a finance test may enforce permissions, or an attendance test may cross midnight. Primary grouping is an organizational aid, not a claim of exclusive coverage. Parameterized cases count separately, as Vitest reports them.

| Primary category | Cases | Protected behavior |
| --- | ---: | --- |
| Money and finance calculations | 106 | Exact cents, balances, allocation, source conservation, fee/payment correction, retries, exports and unknown finance states. |
| Permissions and roles | 192 | Authentication, ownership, roles, grants, private data, invitation security, revoked access and guarded administrative entry points. |
| Clock in / clock out and attendance | 62 | Clock sessions, atomic group actions, corrections, uninterrupted hours, attendance projections, live-clock helpers and roster fetch policy. |
| Deadlines, dates, and time zones | 37 | Chicago boundaries and DST, deadlines, calendar schedule slots, date parsing and retention dates. |
| Event readiness logic | 46 | Enrollment, transport, rooms, consent coverage, incomplete evidence and fail-closed readiness. |
| UI rendering | 71 | Rendered controls, loading/pending/empty states, labels, navigation, sorting and presentation restrictions; mostly static rendering. |
| Other | 114 | Profile validation and migration; consent/PDF integrity; import/export and URL/contact parsing; invitation delivery/status; calendar recovery; rehearsal isolation/cleanup; retention records and bounded-read performance. |

### Synthetic data versus useful software coverage

Made-up people, events and money are appropriate test inputs. A valid test asserts the app's business outcome rather than that these particular fictional records exist. Large synthetic fixtures can protect a real pagination limit even when today's live dataset is small.

There are **23 cases** across the five dedicated fixture creation/cleanup suites (`consentPdfRehearsal`, `consentRehearsal`, `developmentRehearsal`, `reviewerRehearsal`, `syntheticRehearsalCleanup`), about **3.7%** of all cases. Their combined reported test-body duration is **0.862 seconds**, excluding file overhead. These protect actual callable rehearsal tools from adopting, overwriting or deleting unrelated records. They are not customer-facing workflows, but are useful while those tools remain available. If the tools are formally retired, remove their tests with the tools; do not delete their guards merely because their inputs are fictional.

The two `operationsRehearsal` cases exercise actual end-to-end business mutations, including money and revoked family access. Bootstrap/provisioning tests protect real administrative entry points. They should not be counted as tests whose only purpose is preserving dummy information.

The strongest overtesting candidates are repeated assertions, hook-order expectations, and a test for an unused roster-store cancellation method. Synthetic size itself is not proof of low value. Reduce oversized fixtures only after identifying the exact boundary each test must still cross. This audit did not measure current production volume or establish a future capacity requirement.

## 3. Flagged tests and recommendations

“Keep” means retain the scenario, even when its assertions need improvement. “Merge” means preserve all distinct behavior in a shared/table-driven scenario; it does not authorize silently dropping edge cases. None of these recommendations has been applied.

### Removal and consolidation candidates

| File | Exact test name | Reason | Recommendation |
| --- | --- | --- | --- |
| src/timeclock-roster-snapshot.test.ts | does not publish after its operator view unmounts | Calls store.cancel() directly, but the production view no longer calls it after the StrictMode change. It does not prove the claimed view-unmount behavior. | **Remove** this misleading unused-path test; cover actual mounted behavior when adding the frontend regression below. |
| convex/app.test.ts | blocks draft legal consent in live functions | Weaker overlap with the focused legacy submission guard. Only checks that the draft request throws. | **Merge** its event-bearing input into the focused suite, then remove this standalone case. |
| convex/permissions.test.ts | rejects every submission even when the season version has no draft marker | Stronger legacy-endpoint regression: approved-looking wording must not reopen submission; verifies no write. | **Keep** as the consolidation owner. The public legacy endpoint remains a real boundary. |
| convex/feePayments.test.ts | resumes a partial batch across actors, rejects changed upload, and blocks stale or excessive amounts | Overlapping two-row batch/resume/replay setup with the next case. | **Merge** shared setup/table cases, preserving changed-upload and stale/excessive-row rejection. |
| convex/feePayments.test.ts | continues the remaining row after a reload without duplicating the first receipt | Repeats initial receipt, second-Coach resume and replay checks. Adds useful remaining-row completion and blank-reference behavior. | **Merge** only if those distinct assertions remain explicit. |
| src/CoachFinanceTable.test.ts | does not claim an empty season at a native pagination split | Workspace rendering also repeats the table's empty-nonfinal-page copy. | **Keep** the focused presentation check; merge duplicated assertions out of the workspace test. |
| src/CoachFinanceWorkspace.test.ts | preserves empty nonfinal account pages and the server page limit | Repeats table copy and checks positional mock arguments plus a fixed page size of 20. | **Merge** overlapping presentation assertions; retain a named-endpoint subscription/bounded-page contract. |
| src/timeclock-event-clock.test.ts | reduces 240 different query arguments to one during a quiet hour | The 240-element Set partly verifies the constructed fixture. Pure anchor equality does not measure actual subscriptions. | **Merge** useful anchor invariance into the day-boundary table; do not claim measured database-call savings from it. |
| src/ChargeAdministration.test.ts | uses an explicit submit button for the Coach correction form | Static button/text check is narrower than a reviewed correction workflow. | **Merge** into a future mounted correction interaction test, preserving the explicit submit behavior. Do not delete before replacement. |

### Brittle or insufficient assertions worth retaining and improving

| File | Exact test name | Reason | Recommendation |
| --- | --- | --- | --- |
| src/TeamReports.test.ts | counts visible rows when loaded students are filtered | Mocks React.useState by ordinal (third call). An unrelated hook reorder breaks it without changing behavior. | **Keep**; drive the filter through the component or a semantic state seam. |
| src/FeeAdministration.test.ts | keeps a finance reader out of Coach-only mapping queries and commands | queryCount === 1 depends on hook composition and does not identify the forbidden endpoint. | **Keep**; assert Coach-only endpoints are skipped and controls remain unavailable. |
| src/FinanceExport.test.ts | offers the complete active scope without pretending an unprepared file is available | Checks the last mocked query's skip argument, relying on query order. | **Keep**; associate assertions with the relevant endpoint and visible export state. |
| convex/financeReportMaintenance.test.ts | refreshes from actual financial mutations and reconciles with the ledger read model | financeFor() delegates to calculateStudentFinance(), also used by the tested projection. Equality between these is not independent accounting reconciliation. | **Keep** explicit expected amounts; replace the redundant shared-helper comparison with an independent conservation oracle. |
| convex/financeReportMaintenance.test.ts | backfills durably by cursor, ignores duplicate workers and gates team totals | Intermediate processed: 5 reflects the current worker page size. | **Keep** partial-progress, replay, completion and unavailable-total assertions; avoid an arbitrary tuning constant. |
| convex/financialSources.test.ts | rebuilds more than 500 historical receipts without losing cents and resumes guarded pages | Intermediate sourceCount === 20 fixes a page size. The 620-record boundary and final cents are useful. | **Keep** complete history, bounded progress and replay behavior; loosen the intermediate page-size detail. |
| convex/coachRoster.test.ts | matches the finance roster projection and withholds invalid balance data | Compares projections after preparing a valid account; does not inject invalid balance evidence despite its title. Both projections can agree while wrong. | **Keep**; assert explicit expected amounts and add the stated invalid/unavailable case. |
| src/timeclock-roster-snapshot.test.ts | measures one idle fetch per day and one fetch per event selection across midnight | A local render helper duplicates the scope-comparison logic; 5,760 iterations do not establish real component effects. | **Keep** the store contract, reduce redundant iterations, and add a mounted view test for the actual effect. |
| convex/dashboardReports.test.ts | returns the exact future session boundary and preserves live source changes | Re-querying after a database patch proves fresh query output, not browser subscription delivery. | **Keep**; narrow the claim and separately verify mounted live updates. |
| src/timeclock-event-clock.test.ts | expires buttons and stale-calendar status locally while preserving cancellation and closure | Calendar grace checks overlap the dedicated calendarSchedule helper suite. Event expiry itself is useful. | **Keep** event behavior and one wrapper wiring assertion; consolidate repeated grace-boundary detail in the helper suite. |
| src/lib/team-report-csv.test.ts | states partial scope, keeps unknown distinct from zero, and escapes spreadsheet formulas | The PRIVATE HEALTH absence assertion has no corresponding secret in its fixture, so it cannot prove removal of that data. | **Keep** real scope/formula/zero assertions; use a meaningful secret canary or rely on tested backend projection. |
| src/lib/field-trip-pdf.test.ts | preserves excess events on continuation pages without clipping | Page-count assertions do not prove all event text is retained or unclipped. | **Keep**; assert content/placement or narrow the title. |
| src/lib/field-trip-pdf.test.ts | continues long event and health details onto additional pages | Enlarges event count, not health-detail length; page count does not prove long health text survives. | **Keep**; use genuinely long health content and verify its preservation. |
| convex/eventOperations.test.ts | keeps room selection private and requires explicit leave and adult reasons after deadline | Two prohibited invitation calls use catch(() => null), so unrelated exceptions can satisfy the check. | **Keep**; assert the intended rejection and unchanged membership/invitations. |
| src/DashboardReports.test.ts | names earned fundraising separately from spendable credit and explains unknown gross | Alias-to-alias copy equality adds little beyond checking the same constants. Other amount/meaning distinctions are real. | **Keep** the financial presentation contract; remove redundant alias comparisons. |
| src/lib/fundraiser-csv.test.ts | round trips BOM, quoting and blank clears while guarding formula names | Export-then-parse can hide matching mistakes in both directions. Existing explicit row/formula assertions still matter. | **Keep**; add independent expected input/output where necessary, without snapshots. |

### Framework checks, snapshots and apparent duplicates

No clear standalone case was found whose only meaningful protection is that React or Convex itself works. Using convex-test, mocked timers, ResizeObserver, or Auth does not automatically make a test a framework test. For example, `src/lib/sticky-header.test.ts` / “tracks actual header resizing and removes stale offsets on unmount” checks the app's offset and cleanup behavior and should **stay**.

No snapshot assertion calls or saved snapshot files were found in the inspected test roots. “Roster snapshot,” immutable consent snapshots, and prepared-fee snapshots describe application data, not snapshot-testing machinery. Deterministic PDF bytes protect reviewed/signature integrity; they are not saved UI snapshots.

Already parameterized grade aliases, invitation states, date/DST cases, and clock-status modes should stay parameterized. Changing several tests into `it.each` does **not** by itself reduce executed case count or runtime.

Keep these superficially similar protections:
- Uninterrupted-hour math, persisted Coach corrections, and report eligibility are different layers.
- Concurrent clock-ins, atomic stale group rejection, and mixed-group transfer are different race/atomicity guarantees.
- Fundraiser authorization at initiation and after deferred execution/revocation protect different times.
- Consent-export permission checks between pages are not redundant with an initial role check.
- Attendance aggregate rollback is not a substitute for finance aggregate rollback.
- The 501/510/620-record financial fixtures protect different truncation/recovery paths. Keep necessary boundary-crossing scenarios.
- Auth-session tests and internal code-consumption tests protect different integration boundaries.
- Read-cost tests that assert result equivalence and bounded reads are useful; logging a measurement alone would not be sufficient.

## 4. Coverage gaps by category

| Category | Existing strength | Missing or weak protection |
| --- | --- | --- |
| Money and finance | Source-preserving allocation/returns, exact cents, replay, partial failures, historical pagination, unavailable totals and read restrictions. | No direct tests found for paymentAdministration.correctionPage/runCorrection/retryCorrection/correctionStatus; finance aggregate component-failure rollback and old-season namespace removal; season hold/writeOff decisions; fundraiser updatePolicy/close/preview/history/jobs contracts; independent mixed-operation conservation oracle; systematic invalid amount/date inputs at backend entry points. |
| Permissions and roles | Invitation takeover prevention, linked-family isolation, consent provenance, export-time revocation and many finance capability checks. | accounts.updateAdult lacks non-Coach privilege-escalation attempts; travel.ownTravel lacks direct calls and setIndependentTravel lacks unrelated/revoked Parent ownership checks; seasonTransition.resume/progress and retention preview/history need focused role denials. Guards appear present in source—these are regression gaps. |
| Clock/attendance | Atomic groups, concurrency, corrections, archival, scheduled close, bounded status reads and roster-store contracts. | Actual mounted event selection must prove roster freezes while clock status stays live, midnight does not reload selected roster, leaving/reselecting fetches appropriately, and stale responses do not render. Helper invocation/re-query is not a browser subscription test. |
| Dates/time zones | Chicago DST/day anchors, scheduled refresh slots, retention leap day and session boundaries. | Payment CSV date parsing checks an October date but not winter, spring/fall transitions, leap day and invalid dates. Some timer/hidden-resume behaviors are helper-only rather than mounted view tests. |
| Event readiness | Fail-closed overflow, enrollment gates, transport/room coverage and consent invalidation. | Explicit print branches for null rooming/coverage, non-ready overall status, and superficially ready student with open requirements; additional cancelled/no-selected-event clock-button boundary cases where those are real product contracts. |
| UI rendering | Clear loading versus empty/zero, partial progress, guarded controls, review copy and exact amounts. | Most checks use static markup. They do not establish review → confirm → correct mutation arguments, double-click prevention, review invalidation after editing, failure/retry, keyboard/dialog interactions or Calendar Refresh pending/disabled/failure/success behavior. |
| Other | Contact/CSV validation, consent/PDF integrity, fixture isolation, migration fencing and recovery. | PDF page count does not establish unclipped text; round-trip CSV needs independent examples; cleanup tests should be retired only with their corresponding tools. No evidence justifies deleting these safeguards simply because their fixtures are synthetic. |

Specific permission additions should assert **no changes** as well as denial: unchanged grants/revision/audit for adult updates; unchanged participation for unauthorized travel writes; no scheduling or plan progression for unauthorized transition resume. An unrelated Student fixture is not a substitute for an unrelated Parent because it fails the role gate before ownership is checked.

## 5. Cleanup estimate and proposed priorities

### Estimated count and runtime after cleanup

A conservative cleanup would remove the unused cancellation-path test and merge the weaker legacy-consent case into the focused suite: approximately **626 tests**, or **627** if the consent inputs remain separately parameterized.

A fuller consolidation of the overlapping fee-payment and quiet-hour anchor cases could reach approximately **624–627 cases** while preserving their distinct assertions. This is a proposal, not an approved deletion list. Adding the missing protections below may bring the total back above 628; a lower test count is not the quality objective.

**Estimated runtime: still about 109 seconds under the same single-worker, no-cache conditions.** The clearly removable cancellation case took only 0.918 ms; the weaker consent case took 46.177 ms; the overlapping fee-payment continuation took 28.956 ms, and its unique work still needs to run somewhere. These changes cannot credibly deliver a large speedup. One run does not support a reliable variance interval.

Fixture-size or file-layout optimization might save more, but requires separate before/after measurement and preservation of the meaningful boundaries. No unmeasured speedup is included here. In particular, removing the slowest financial cancellation test would discard real regression protection merely to save about 14.6 seconds of test-body work.

### Top five missing tests to add after approval

1. **Adult privilege escalation denial.** Exercise accounts.updateAdult as a Travel Lead with existing grants and as an inactive Coach, attempting role/finance/health escalation. Assert intended denial, unchanged grants/revision and no audit write. This protects who can grant financial authority.
2. **Payment-correction continuation and recovery.** Drive a correction requiring multiple release pages, inject a partial failure, deliver a duplicate page and retry as an authorized Coach. Assert exact final receipt/source/account amounts, original evidence retained, and no duplicated money.
3. **Parent travel ownership matrix.** On ownTravel and setIndependentTravel, verify linked Parent success, unrelated Parent denial, then immediate denial after link revocation. Assert no participant changes after denied writes.
4. **Finance aggregate atomicity and season movement.** Inject a component update failure during refreshStudentFinance and verify summary/aggregate rollback; then retry and change season scope, verifying old namespace entries are removed and all totals remain exact. The attendance analogue does not cover this code path.
5. **Mounted timeclock roster/live-status regression.** With an event selected, cross Chicago midnight and deliver clock-in/out changes: roster stays fixed, attendance updates; switching event requests the correct roster once and stale responses cannot replace it. This tests the actual frontend wiring, not a duplicate of its effect logic. Use the existing stack where practical and avoid introducing a broad new framework solely for this case.

Next priorities after those five: fundraiser lifecycle policy protection; season hold/writeOff money decisions; an independent conservation scenario; Calendar Refresh interactions; payment-date boundary cases.

## 6. Approval boundary

The suite has run once and this report is complete. No cleanup or additions have been performed. Await approval before changing tests, source, or AGENTS.md.

After cleanup approval, add the user's requested rule to AGENTS.md:

> Tests: Only write tests that protect real app behavior or reproduce a fixed bug. Do not test framework or library behavior, do not write snapshot tests, and do not write tests that just mirror the current code. Prefer table-driven tests over near-duplicates.

## Appendix: complete executed-test inventory

Every row below is an executed, **passed** test. Names include suite context to distinguish identical leaf names. Durations are individual Vitest durations in milliseconds, rounded to three decimals; their sum is not command wall time. Paths are relative to this repository. Each case appears in exactly one primary category.

### Money and finance calculations (106)

| File | Full test name | ms |
| --- | --- | ---: |
| convex/app.test.ts | server boundaries creates required Travel Team participation and debt in one transaction | 21.160 |
| convex/app.test.ts | server boundaries rejects overcapacity pending reservations and confirmed downgrades without changing debt | 14.332 |
| convex/app.test.ts | server boundaries does not record a payment before historical financial records are prepared | 67.814 |
| convex/bulkInvites.test.ts | bulk student invitations requires Coach review, creates normal zero-balance records, and replays the same batch once | 16.017 |
| convex/bulkInvites.test.ts | bulk student invitations keeps existing paid event records and roster details untouched through import and redemption | 13.771 |
| convex/chargeAdmin.test.ts | charge obligation administration increases obligation without rewriting original charge, then cancels paid mixed sources without creating money | 170.363 |
| convex/chargeAdmin.test.ts | charge obligation administration keeps old obligation pending across more than20 releases, failure and reasoned takeover retry | 114.633 |
| convex/chargeAdmin.test.ts | charge obligation administration rejects stale reviewed amounts and cancellation increases before acquiring a lock | 36.112 |
| convex/chargeAdmin.test.ts | charge obligation administration corrects unpaid fees and preserves an approved withdrawal when correcting its retained payment | 195.079 |
| convex/chargeAdmin.test.ts | charge obligation administration preserves native split metadata and small read budgets while rejecting expanded source pages before hydration | 43.391 |
| convex/chargeAdmin.test.ts | charge obligation administration holds unrepresentable high-cancellation targets before acquiring a financial lock | 19.386 |
| convex/chargeAdmin.test.ts | charge obligation administration stops when an event is archived between source-release pages and preserves the failed lock | 77.266 |
| convex/coachRoster.test.ts | Coach student roster and record matches the finance roster projection and withholds invalid balance data | 4.342 |
| convex/dashboardReports.test.ts | role-scoped dashboard reports returns honest pending finance states while keeping roster counts readable | 149.718 |
| convex/dashboardReports.test.ts | role-scoped dashboard reports reconciles cancellation, applied payment and conserved transfer without inventing gross Raised | 42.076 |
| convex/dashboardReports.test.ts | role-scoped dashboard reports withholds verified family and team totals while financial processing is incomplete | 40.996 |
| convex/feeBulk.test.ts | durable prepared custom fees holds an unrepresentable prior-cancellation target without money or a stranded season lock | 113.929 |
| convex/feeBulk.test.ts | durable prepared custom fees keeps an exact cent when a high-value correction's intermediate addition would exceed the integer range, including rebuild | 167.653 |
| convex/feeBulk.test.ts | durable prepared custom fees does not rerank prepared or held scopes, and rejects subset cancellation before writes | 43.080 |
| convex/feeBulk.test.ts | durable prepared custom fees a failed verify stage with refreshed held rows returns to applying rather than completing an unapplied target | 46.472 |
| convex/feeBulk.test.ts | durable prepared custom fees snapshots and cancels more than 500 historical linked charges using bounded work and causal student fences | 14554.296 |
| convex/feeBulk.test.ts | durable prepared custom fees full cancellation explicitly accounts for prior never-posted held rows and preserves their original evidence | 59.168 |
| convex/feeBulk.test.ts | durable prepared custom fees retains old obligation through bounded mixed-source release and resumes a failed child without duplicated money | 103.128 |
| convex/feeBulk.test.ts | durable prepared custom fees prepares zero money, freezes members across pages, holds stale rows and retries only reviewed original targets | 586.325 |
| convex/feeBulk.test.ts | durable prepared custom fees cancels untouched prepared commands with evidence and no ledger writes | 27.398 |
| convex/feeDefinitions.test.ts | stable shared fee identities requires exact originating ledger evidence rather than equal labels | 12.425 |
| convex/feeDefinitions.test.ts | stable shared fee identities fails closed for new commands in every unfinished maintenance state | 6.048 |
| convex/feeMaintenanceGates.test.ts | repairs a failed upstream enrollment through its fee/allocation continuation while a failed parent remains draining | 128.706 |
| convex/feeMapping.test.ts | cancels a stale zero-money mapping review after an existing allocator drains and reprepares without abandoning its money | 91.117 |
| convex/feeMapping.test.ts | keeps every ambiguous historical charge reviewable beyond 500 rows and never guesses from equal labels | 326.312 |
| convex/feePayments.test.ts | fee-specific CSV payment batches exports assessed active students and applies a new receipt only to its chosen fee | 97.151 |
| convex/feePayments.test.ts | fee-specific CSV payment batches resumes a partial batch across actors, rejects changed upload, and blocks stale or excessive amounts | 26.119 |
| convex/feePayments.test.ts | fee-specific CSV payment batches continues the remaining row after a reload without duplicating the first receipt | 28.956 |
| convex/feePayments.test.ts | fee-specific CSV payment batches classifies a partial fee as unpaid and a fully covered fee as paid | 25.671 |
| convex/feePayments.test.ts | fee-specific CSV payment batches refuses inactive and cross-season targets even with valid-looking imported IDs | 9.612 |
| convex/feePriorities.test.ts | propagates a season-wide adjacent swap over multiple pages without changing obligations or allocations | 508.596 |
| convex/financeAdmin.test.ts | source-separated finance administration keeps personal Paid and fundraising Credits exact through source release and does not confuse receipts with wallet balances | 118.803 |
| convex/financeAdmin.test.ts | source-separated finance administration finishes a pre-migration allocator as v3 but refuses the same v3 account for a new v4 job | 24.395 |
| convex/financeAdmin.test.ts | source-separated finance administration rejects family access and preserves native small row budgets | 4.766 |
| convex/financeAdmin.test.ts | source-separated finance administration backfills more than 500 receipt facts in bounded replay-safe pages without inventing historical balances | 355.757 |
| convex/financeAdmin.test.ts | source-separated finance administration returns unavailable team totals when individually safe student obligations exceed the exact total range | 43.299 |
| convex/financeAdmin.test.ts | source-separated finance administration preserves and completes an already-partially-posted legacy payout without falsely upgrading its summary | 78.884 |
| convex/financeAdmin.test.ts | source-separated finance administration allows read-only Travel Leads while denying authenticated families, ordinary Mentors and history preparation | 6.171 |
| convex/financeAdmin.test.ts | source-separated finance administration caps native expanded pages before hydration and retains split metadata and caller budgets | 21.101 |
| convex/financeAdmin.test.ts | source-separated finance administration continues persisted legacy fee propagation but prevents new mapping and priority jobs from bypassing v4 | 69.179 |
| convex/financeDetails.test.ts | paginated financial evidence omits staff finance reasons and provenance from family responses | 27.747 |
| convex/financeExport.test.ts | scoped financial CSV export collects all roster and charge pages with exact source cents and zero-charge member metadata | 1044.074 |
| convex/financeExport.test.ts | scoped financial CSV export preserves native row budgets/split metadata and blocks expanded charge pages before hydration | 56.379 |
| convex/financeOperations.test.ts | financial operations records only unallocated personal payment refunds and preserves both source and idempotency | 170.856 |
| convex/financeOperations.test.ts | financial operations moves mixed fundraising sources atomically and conserves credit after recipient allocation | 83.725 |
| convex/financeOperations.test.ts | financial operations rolls back both transfer sides if recipient allocation cannot complete | 27.863 |
| convex/financeOperations.test.ts | financial operations keeps transferred credits in fundraising after deallocation | 76.521 |
| convex/financeOperations.test.ts | financial operations rejects a competing spend when the available source changes | 55.491 |
| convex/financeOperations.test.ts | financial operations retains both locks after a partially committed transfer loses authorization and retries without duplicate money | 179.055 |
| convex/financeOperations.test.ts | financial operations returns preparation state without invented balances for historical accounts awaiting rebuild | 14.201 |
| convex/financeOperations.test.ts | financial operations transfers only fundraising to the team with explicit destination, preserved roots and creator-scoped replay | 52.985 |
| convex/financeOperations.test.ts | financial operations resumes a multipage team transfer after grant revocation without spending personal money or losing creator replay | 106.071 |
| convex/financeReportMaintenance.test.ts | source-authoritative finance report maintenance refreshes from actual financial mutations and reconciles with the ledger read model | 103.458 |
| convex/financeReportMaintenance.test.ts | source-authoritative finance report maintenance backfills durably by cursor, ignores duplicate workers and gates team totals | 86.861 |
| convex/financeReportMaintenance.test.ts | source-authoritative finance report maintenance fails on inconsistent source data and resumes the failed page after repair | 29.514 |
| convex/financeReportMaintenance.test.ts | source-authoritative finance report maintenance restarts from the beginning when completion finds missing earlier coverage | 102.949 |
| convex/financialSources.test.ts | source financial foundation rebuilds more than 500 historical receipts without losing cents and resumes guarded pages | 836.815 |
| convex/financialSources.test.ts | source financial foundation blocks competing transactions until preparation completes and rejects mismatched charge evidence | 8.211 |
| convex/financialSources.test.ts | source financial foundation advances past excluded charges and continues a partial charge across more than 20 sources | 244.910 |
| convex/financialSources.test.ts | source financial foundation finishes student-triggered multipage allocation and preserves the lock after the actor becomes inactive | 361.205 |
| convex/fundraisers.test.ts | fundraiser source posting records genuine gross for a 100% team fundraiser with no invented student credit | 124.793 |
| convex/fundraisers.test.ts | fundraiser source posting preserves original award source, reverses only available award credit and holds spent reductions unchanged | 96.252 |
| convex/fundraisers.test.ts | fundraiser source posting continues a reduction across more than 20 original awards and preserves its lock after failure | 676.399 |
| convex/fundraisingMath.test.ts | fundraiser exact money policy floors the student credit and conserves the team's remainder even at the safe integer boundary | 2.742 |
| convex/fundraisingMath.test.ts | fundraiser exact money policy reserves creation and policy changes for Coach while allowing granted Travel Lead posting | 0.356 |
| convex/historicalFinancialCorrections.test.ts | corrects archived charges through a scoped grant, releases exact funding sources and reapplies historical priorities | 186.764 |
| convex/historicalFinancialCorrections.test.ts | pauses archived allocation after grant expiry and resumes only with a fresh grant | 133.092 |
| convex/operationsRehearsal.test.ts | fictional multi-role operations rehearsal (mocked Convex identities) reconciles signup, approval, room release, partial return, payout, promotion, and source-preserving transfer | 368.198 |
| convex/paymentAdministration.test.ts | corrects allocated receipts without payout, preserves originals, reapplies priority and rebuilds consistently | 194.738 |
| convex/seasonTransitionFinance.test.ts | pairs personal/fundraising carry and debt once, preserves roots, and fences writes | 143.713 |
| convex/teamReports.test.ts | bounded role-scoped team reports reports verified materialized money, unknown raised, and unverified kickoff separately | 29.933 |
| convex/wholeTeam.test.ts | Whole Team enrollment assigns every active member independently of Travel Team and bills once | 101.305 |
| convex/wholeTeam.test.ts | Whole Team enrollment enrolls in 100 upcoming events using rebuilt funding without rescanning financial history | 1151.221 |
| convex/wholeTeam.test.ts | Whole Team enrollment rolls back one member's failed fee and resumes once after Coach retry | 23.045 |
| convex/withdrawals.test.ts | withdrawal decisions preserves reservation while pending or denied, then releases room and capacity with source-preserving full return | 96.759 |
| convex/withdrawals.test.ts | withdrawal decisions rejects over-return and source ambiguity without changing participation or charges | 10.177 |
| convex/withdrawals.test.ts | withdrawal decisions is idempotent for the same decision and rejects a contradictory repeat | 41.631 |
| convex/withdrawals.test.ts | withdrawal decisions returns a partial mixed-source amount and leaves the unpaid main balance owed | 55.139 |
| convex/withdrawals.test.ts | withdrawal decisions rejects an archived event or a changed charge without any partial write | 18.241 |
| convex/withdrawals.test.ts | withdrawal decisions finishes a reviewed disposition beyond 500 historical rows without truncation | 282.453 |
| src/ChargeAdministration.test.ts | charge correction amount entry accepts an explicit zero target and preserves exact pennies | 18.807 |
| src/ChargeAdministration.test.ts | charge correction amount entry rejects missing, negative, fractional penny and unsafe targets | 0.574 |
| src/DashboardReports.test.ts | financial report currency preserves exact cents for genuine gross totals across the supported range | 15.957 |
| src/Fundraising.test.ts | fundraising decimal entry preserves exact pennies and percentage hundredths | 1.536 |
| src/Fundraising.test.ts | fundraising decimal entry rejects missing, fractional pennies, unsafe amounts and ambiguous formats | 0.423 |
| src/Fundraising.test.ts | fundraising decimal entry formats every penny even at the supported integer limit | 15.457 |
| src/Fundraising.test.ts | bounded authoritative fundraising preview collects all rows in bounded pages while preserving true gross for team-only proceeds | 2.153 |
| src/Fundraising.test.ts | bounded authoritative fundraising preview rejects changed or incomplete pages without returning a partial preview | 1.536 |
| src/Fundraising.test.ts | bounded authoritative fundraising preview stops collecting after the selected workspace is left | 0.322 |
| src/PaymentAdministration.test.ts | normalizes imported student email and rejects malformed email before preview | 1.101 |
| src/lib/collect-finance-export.test.ts | retains zero-charge members in metadata without inventing charge rows | 2.383 |
| src/lib/collect-finance-export.test.ts | collects across empty nonfinal pages | 0.801 |
| src/lib/collect-finance-export.test.ts | rejects a final revision change instead of returning a partial export | 1.193 |
| src/lib/collect-finance-export.test.ts | discards collection after permission denial or cancellation | 0.780 |
| src/lib/fee-payment-csv.test.ts | fee payment CSV loads through sparse filtered pages and refuses to download a truncated 501-row export | 3.201 |
| src/lib/fee-payment-csv.test.ts | fee payment CSV exports guarded names and retains exact batch, row, charge, and version identity | 1.584 |
| src/lib/fee-payment-csv.test.ts | fee payment CSV skips blank amounts and rejects a file with nothing to pay | 0.338 |
| src/lib/fee-payment-csv.test.ts | fee payment CSV rejects rounded, zero, overpaid, and formula amounts | 0.781 |
| src/lib/fee-payment-csv.test.ts | fee payment CSV rejects duplicate headers, duplicate row keys, and changed identifiers | 0.665 |
| src/lib/fee-payment-csv.test.ts | fee payment CSV rejects malformed columns and inconsistent visible balances | 0.467 |
| src/lib/withdrawn-fee-label.test.ts | labels only fully cancelled main fees as canceled and preserves retained amounts | 17.321 |

### Permissions and roles (192)

| File | Full test name | ms |
| --- | --- | ---: |
| convex/accounts.test.ts | adult accounts records the latest adult archive transition and audit clocks without changing inactive edits | 45.871 |
| convex/accounts.test.ts | adult accounts accepts only the invited verified Google account, saves grants separately and excludes tokens from lists | 24.529 |
| convex/accounts.test.ts | adult accounts rejects replaced, revoked, expired invitations and invitations from removed Coaches | 16.712 |
| convex/accounts.test.ts | adult accounts protects the last Coach and stale grants, and revokes access immediately | 8.388 |
| convex/accounts.test.ts | adult accounts refuses to convert or overwrite a parent account through invitation acceptance | 8.005 |
| convex/adultEmailAuth.test.ts | adult email authentication creates a real Auth session on the existing Google coach identity without assigning parent access | 306.432 |
| convex/adultEmailAuth.test.ts | adult email authentication creates a real Auth session on the existing Google mentor identity without assigning parent access | 263.651 |
| convex/adultEmailAuth.test.ts | adult email authentication requires a valid adult invitation and preserves grants (existing Google identity: false) | 34.007 |
| convex/adultEmailAuth.test.ts | adult email authentication requires a valid adult invitation and preserves grants (existing Google identity: true) | 6.903 |
| convex/adultEmailAuth.test.ts | adult email authentication handles pending enrollment history without converting linked student identities | 16.703 |
| convex/adultEmailAuth.test.ts | adult email authentication handles declined enrollment history without converting linked student identities | 4.861 |
| convex/adultEmailAuth.test.ts | adult email authentication handles approved enrollment history without converting linked student identities | 3.620 |
| convex/adultEmailAuth.test.ts | adult email authentication rechecks revoked invitations when consuming a previously issued code | 5.035 |
| convex/adultEmailAuth.test.ts | adult email authentication rechecks expired invitations when consuming a previously issued code | 3.576 |
| convex/adultEmailAuth.test.ts | adult email authentication rechecks issuerInactive invitations when consuming a previously issued code | 3.008 |
| convex/adultEmailAuth.test.ts | adult email authentication denies student accounts and rechecks active access after issuing | 1.873 |
| convex/adultEmailAuth.test.ts | adult email authentication denies inactive accounts and rechecks active access after issuing | 2.785 |
| convex/adultEmailAuth.test.ts | adult email authentication denies ambiguous accounts and rechecks active access after issuing | 1.937 |
| convex/adultInvitationTransport.test.ts | adult invitation OAuth transport keeps invitation tokens in fragments and sends no token in the OAuth return URL | 2.166 |
| convex/adultInvitationTransport.test.ts | adult invitation OAuth transport restores only in the original tab and clears its temporary OAuth transfer | 0.434 |
| convex/adultInvitationTransport.test.ts | adult invitation OAuth transport restores the token fragment without removing the OAuth code query | 0.236 |
| convex/adultInvitationTransport.test.ts | adult invitation OAuth transport rejects malformed tokens and permits cancellation cleanup without restoring a token | 0.761 |
| convex/adultInviteEmail.test.ts | staff invitation email refuses disabled configuration without creating a public token or sending | 27.736 |
| convex/adultInviteEmail.test.ts | staff invitation email sends to the invited inbox once with a private link and stable retry idempotency | 14.422 |
| convex/adultInviteEmail.test.ts | staff invitation email does not send revoked invitations | 3.239 |
| convex/adultInviteEmail.test.ts | staff invitation email does not send expired invitations | 2.300 |
| convex/adultInviteEmail.test.ts | staff invitation email does not send issuerInactive invitations | 2.856 |
| convex/adultInviteEmail.test.ts | staff invitation email does not send stale invitations | 2.173 |
| convex/adultInviteEmail.test.ts | staff invitation email rotates a resend token, applies cooldown and ignores old delivery and stall callbacks | 8.239 |
| convex/adultInviteEmail.test.ts | staff invitation email enforces Coach-only controls and per-email cooldown even through create | 6.840 |
| convex/adultInviteEmail.test.ts | staff invitation email refuses resend of accepted invitations | 2.394 |
| convex/adultInviteEmail.test.ts | staff invitation email refuses resend of revoked invitations | 2.149 |
| convex/adultInviteEmail.test.ts | staff invitation email refuses resend of replaced invitations | 3.090 |
| convex/adultInviteEmail.test.ts | staff invitation email refuses resend of expired invitations | 1.834 |
| convex/adultInviteEmail.test.ts | staff invitation email records permanent and exhausted failures without exposing provider details | 5.330 |
| convex/adultProfile.test.ts | staff basic setup rejects unauthenticated, student, parent and inactive accounts for reads, saves and dismissal | 11.051 |
| convex/adultProfile.test.ts | adult own profile shows only auth-derived personal fields and allows staff and denies Parent route access | 4.386 |
| convex/adultProfile.test.ts | adult own profile allows only a Coach to link a verified exact match with stale fences, reason and approval reset | 7.346 |
| convex/app.test.ts | server boundaries shows role-appropriate setup and permission next steps only for confirmed events | 121.205 |
| convex/app.test.ts | server boundaries limits family records to linked students and excludes mentor private data | 4.665 |
| convex/app.test.ts | server boundaries reserves pending capacity, charges only upon confirmation, and denies unauthorized finance writes | 26.223 |
| convex/app.test.ts | server boundaries blocks draft legal consent in live functions | 46.177 |
| convex/app.test.ts | server boundaries uses the stable Convex Auth user across sessions and derives join email from the auth user | 9.078 |
| convex/app.test.ts | server boundaries keeps join status across sessions and validates a new code after a decline | 5.459 |
| convex/app.test.ts | server boundaries lists active team codes only to a Coach and removes revoked codes | 5.164 |
| convex/app.test.ts | server boundaries commits invalid join attempts and locks the account after five failures | 5.366 |
| convex/app.test.ts | server boundaries resolves the Student viewer in the current season when an active historical profile shares the account | 3.560 |
| convex/app.test.ts | server boundaries keeps Parent viewer and event listing independent of historical links and pages current children through empty nonfinal results | 20.812 |
| convex/app.test.ts | Batch 4 workflow summaries and confirmation checks counts only pending signups and rejects family access to staff counts | 10.655 |
| convex/app.test.ts | Batch 4 workflow summaries and confirmation checks distinguishes unconfirmed health entries without exposing them to a student | 2.472 |
| convex/attendanceOperations.test.ts | Coach attendance workspace selectors denies Mentor, Travel Lead, student, parent, inactive Coach, and unauthenticated requests | 65.292 |
| convex/bulkInvites.test.ts | bulk student invitations keeps six-digit team requests separate from five-digit account linking and retries team-code collisions | 218.695 |
| convex/bulkInvites.test.ts | bulk student invitations retries five-digit collisions and never recycles replaced codes | 20.979 |
| convex/bulkInvites.test.ts | bulk student invitations requires confirmed duplicates and preserves an existing student's fields when redeemed | 10.499 |
| convex/bulkInvites.test.ts | bulk student invitations rotates and revokes codes without changing the student record | 14.427 |
| convex/bulkInvites.test.ts | bulk student invitations limits repeated guesses and closes unexpired codes when the season closes | 23.490 |
| convex/bulkInvites.test.ts | bulk student invitations keeps only one pending code when an older batch invitation is restored | 9.338 |
| convex/bulkInvites.test.ts | bulk student invitations rejects non-Coach management and linked Google accounts | 12.433 |
| convex/bulkInvites.test.ts | Coach-approved bulk account connections does not expose a name or grant profile/finance access until the Coach chooses one of two applicants | 18.098 |
| convex/bulkInvites.test.ts | Coach-approved bulk account connections declines without connecting; retry requires a new code and a fresh submission | 14.797 |
| convex/bulkInvites.test.ts | Coach-approved bulk account connections rechecks replace before approval and permits declining stale requests | 12.826 |
| convex/bulkInvites.test.ts | Coach-approved bulk account connections rechecks revoke before approval and permits declining stale requests | 9.881 |
| convex/bulkInvites.test.ts | Coach-approved bulk account connections rechecks inactive before approval and permits declining stale requests | 10.067 |
| convex/bulkInvites.test.ts | Coach-approved bulk account connections rechecks expiry before approval and permits declining stale requests | 8.070 |
| convex/bulkInvites.test.ts | Coach-approved bulk account connections rechecks season before approval and permits declining stale requests | 8.281 |
| convex/bulkInvites.test.ts | Coach-approved bulk account connections rechecks identity before approval and permits declining stale requests | 10.544 |
| convex/bulkInvites.test.ts | Coach-approved bulk account connections rechecks unverified before approval and permits declining stale requests | 8.972 |
| convex/bulkInvites.test.ts | Coach-approved bulk account connections rechecks missingProvider before approval and permits declining stale requests | 10.357 |
| convex/bulkInvites.test.ts | Coach-approved bulk account connections rechecks studentEmailCollision before approval and permits declining stale requests | 11.103 |
| convex/bulkInvites.test.ts | Coach-approved bulk account connections rechecks emailCollision before approval and permits declining stale requests | 9.584 |
| convex/bulkInvites.test.ts | Coach-approved bulk account connections rejects anonymous, unverified, duplicate-email and inactive-student submissions | 11.184 |
| convex/bulkInvites.test.ts | Coach-approved bulk account connections shares the daily 30-attempt allowance between preview and submission across minute resets | 38.777 |
| convex/bulkInvites.test.ts | Coach-approved bulk account connections imports 100 unique students without automatic travel status, events or charges and bounds pending requests | 1025.727 |
| convex/bulkInvites.test.ts | connection request lifecycle does not strand an applicant behind three rotated, revoked or prior-season requests | 35.272 |
| convex/bulkInvites.test.ts | connection request lifecycle shows competing requests as unavailable after approval | 9.205 |
| convex/calendarAuth.test.ts | OAuth redirect allowlist accepts only configured entry paths | 1.476 |
| convex/calendarAuth.test.ts | OAuth redirect allowlist rejects //evil.example/ | 0.606 |
| convex/calendarAuth.test.ts | OAuth redirect allowlist rejects https://evil.example/ | 0.160 |
| convex/calendarAuth.test.ts | OAuth redirect allowlist rejects https://clock.example.test.evil.example/ | 0.234 |
| convex/calendarAuth.test.ts | OAuth redirect allowlist rejects javascript:alert(1) | 0.201 |
| convex/calendarAuth.test.ts | OAuth redirect allowlist rejects https://clock.example.test/admin | 0.133 |
| convex/calendarAuth.test.ts | OAuth redirect allowlist rejects https://clock.example.test/invite-adult | 0.151 |
| convex/calendarAuth.test.ts | OAuth redirect allowlist rejects https://clock.example.test@evil.example/ | 0.139 |
| convex/calendarAuth.test.ts | OAuth redirect allowlist rejects https://clock.example.test/#fragment | 0.340 |
| convex/calendarAuth.test.ts | OAuth redirect allowlist rejects https://students.example.test/invite-adult#token=secret | 0.257 |
| convex/calendarAuth.test.ts | OAuth redirect allowlist rejects /invite-adult/ | 0.158 |
| convex/calendarAuth.test.ts | OAuth redirect allowlist rejects /invite-adult-extra | 0.086 |
| convex/calendarRefresh.test.ts | Calendar refresh allows only active Coach/Mentor manual refreshes and reports a missing configuration | 7.762 |
| convex/chargeAdmin.test.ts | charge obligation administration denies cross-season charges and concurrent contradictory commands before any extra money movement | 47.320 |
| convex/coachRoster.test.ts | Coach student roster and record shows fundraiser presence without exposing its URL in roster rows | 9.678 |
| convex/coachRoster.test.ts | Coach student roster and record authorizes Coach only, minimizes list rows, and keeps inactive current-season details readable | 5.792 |
| convex/consentRehearsal.test.ts | links only a verified test Parent to the proven fixture and never restores revoked access | 12.879 |
| convex/consentRehearsal.test.ts | rejects unverified or wrong-role accounts before creating any consent fixture | 3.130 |
| convex/contactFormats.test.ts | preserves unchanged legacy contact values during unrelated staff edits | 6.776 |
| convex/dashboardReports.test.ts | role-scoped dashboard reports denies anonymous, ordinary Mentor, unrelated family and revoked links | 62.724 |
| convex/dashboardReports.test.ts | role-scoped dashboard reports preserves verified committed totals while exposing season fee maintenance separately | 37.549 |
| convex/developmentRehearsal.test.ts | development rehearsal fixture refuses any deployment except the hard-bound development URL | 46.781 |
| convex/developmentRehearsal.test.ts | development rehearsal fixture requires the expected active Coach and Coach-owned active season | 5.122 |
| convex/eventCalendar.test.ts | Student Status Calendar link preserves unrelated description while changing only the managed media line | 1.916 |
| convex/eventOperations.test.ts | event operations keeps adult assignments role scoped and enforces category and five-person ceiling | 22.027 |
| convex/familyLinkSeasonMigration.test.ts | season-indexed family links stops before writes when the initiating Coach loses access and permits active Coach takeover | 6.568 |
| convex/feePriorities.test.ts | permits projection-only Coach repair after a missing-account failure while keeping the frozen priority job and money gate | 111.716 |
| convex/financeDetails.test.ts | paginated financial evidence keeps all history beyond 500 rows accessible and rejects wrong roles and scopes | 151.063 |
| convex/financeExport.test.ts | scoped financial CSV export rejects foreign scope, changed financial revisions and revoked permission on the final verification page | 217.619 |
| convex/financeExport.test.ts | scoped financial CSV export checks authenticated role, creator and season scope on every endpoint | 14.739 |
| convex/financeOperations.test.ts | financial operations rejects unauthorized, cross-season, inactive, duplicate-key, and overdraw attempts | 64.955 |
| convex/financeReportMaintenance.test.ts | source-authoritative finance report maintenance denies unauthenticated maintenance and fails if coverage is missing after completion | 11.404 |
| convex/fundraiserLinks.test.ts | individual fundraiser links denies unrelated students, revoked parents, non-Coach editors and inactive users | 12.093 |
| convex/fundraiserLinks.test.ts | individual fundraiser links pages current active students only and rejects archived or cross-season access | 7.803 |
| convex/fundraiserLinks.test.ts | fundraiser CSV import rejects stale, duplicate, unsafe, unavailable and unauthorized batches without partial writes | 13.557 |
| convex/fundraisers.test.ts | fundraiser source posting enforces real creation grants and stops a granted poster whose financial permission is revoked | 4.969 |
| convex/historicalFinancialCorrections.test.ts | denies expired/wrong-role/stale grants and holds all linked histories without changing balances | 58.717 |
| convex/historicalRoster.test.ts | audits only the selected historical profile and fences role, grant, season and stale-record changes | 79.295 |
| convex/maintenanceAccess.test.ts | temporary sign-in maintenance access lets the designated existing Coach read the viewer and events while the gate is enabled | 47.636 |
| convex/maintenanceAccess.test.ts | temporary sign-in maintenance access blocks other existing users and unprovisioned join requests before normal lookup | 8.800 |
| convex/maintenanceAccess.test.ts | temporary sign-in maintenance access restores normal viewer and join behavior when the setting is removed | 16.229 |
| convex/maintenanceAccess.test.ts | temporary sign-in maintenance access uses the same email rule at the Google profile gate | 0.829 |
| convex/maintenanceAccess.test.ts | temporary sign-in maintenance access rejects valid adult and Parent invitation acceptance for other verified Google accounts without changing either invitation | 18.858 |
| convex/mentorProvision.test.ts | development Mentor provisioning rejects a different deployment | 30.147 |
| convex/mentorProvision.test.ts | development Mentor provisioning requires verified Google sign-in | 6.373 |
| convex/mentorProvision.test.ts | development Mentor provisioning provisions once and preserves existing non-Mentor roles | 8.283 |
| convex/operationsRehearsal.test.ts | fictional multi-role operations rehearsal (mocked Convex identities) enforces financial capabilities and revokes a linked parent's open-session access | 19.057 |
| convex/parentInvites.test.ts | parent invitations requires own student scope and rejects a student's own email | 113.977 |
| convex/parentInvites.test.ts | parent invitations keeps invite opaque until verified matching Google sign-in, then atomically links once | 278.100 |
| convex/parentInvites.test.ts | parent invitations honors outstanding invites when Coach disables new creation and replacement | 9.230 |
| convex/parentInvites.test.ts | parent invitations rejects expired, replaced, revoked, and unverified invitations | 19.123 |
| convex/parentInvites.test.ts | parent invitations resends only the latest own pending invite at the exact one-hour boundary | 63.391 |
| convex/parentInvites.test.ts | parent invitations rejects resend after acceptance, revocation, expiry, pause, or student deactivation | 12.817 |
| convex/parentInvites.test.ts | parent invitations allows only one replacement when resend requests race | 7.478 |
| convex/parentInvites.test.ts | parent invitations does not elevate existing roles; Coach revocation blocks new invitations until restoration | 15.956 |
| convex/parentInvites.test.ts | parent invitations supports a parent linked to two students and two parents linked to one student | 15.076 |
| convex/parentInvites.test.ts | parent invitations shows only current-season children and removes each revoked child from all family access | 14.336 |
| convex/parentInvites.test.ts | parent invitations ignores long replaced history but still detects an old Coach revocation | 31.852 |
| convex/parentInvites.test.ts | parent invitations keeps inactive and archived student records outside the invitation flow | 7.611 |
| convex/parentInvites.test.ts | parent invitation email rejects creation without private email delivery and never calls a provider | 3.274 |
| convex/parentInvites.test.ts | parent invitation email rejects creation when opt-in lacks a trusted origin | 2.431 |
| convex/parentInvites.test.ts | parent invitation email sends a minimal email with a fragment link and records provider acceptance | 13.665 |
| convex/parentInvites.test.ts | parent invitation email does not send revoked, replaced, or expired invitations | 10.504 |
| convex/parentInvites.test.ts | parent invitation email retries temporary failures and fails closed if a queued job stalls | 13.486 |
| convex/parentInvites.test.ts | parent invitation email marks permanent provider rejection failed without exposing provider text | 5.549 |
| convex/parentInvites.test.ts | parent invitation email runs the scheduled job and exhausts bounded retries with one provider key | 7.684 |
| convex/parentInvites.test.ts | parent invitation email caps automatic mail creation across changing recipients | 22.557 |
| convex/parentInvites.test.ts | parent invitation email does not schedule mail for a cooldown rejection | 5.121 |
| convex/parentInvites.test.ts | private parent email authentication issues an Auth session only for a sent, one-use private invitation | 250.221 |
| convex/parentInvites.test.ts | private parent email authentication uses an emailed code when the first-time private login window expired | 175.770 |
| convex/parentInvites.test.ts | private parent email authentication creates a parent-only identity for a first-time email recipient without Google | 95.608 |
| convex/parentInvites.test.ts | private parent email authentication never upgrades a legacy shared invitation or a student address into a parent login | 83.192 |
| convex/parentInvites.test.ts | private parent email authentication persists the five-attempt OTP cap and rejects an expired code through Auth | 95.812 |
| convex/paymentAdministration.test.ts | matches active-season emails, holds duplicate rows, denies family edits and rejects stale/locked commands | 32.402 |
| convex/permissions.test.ts | permission draft gate rejects every submission even when the season version has no draft marker | 62.667 |
| convex/permissions.test.ts | permission draft gate retains role and student-scope checks while submission is closed | 10.138 |
| convex/permissions.test.ts | allows Coach and Travel Lead to request a new signature, but not an ordinary Mentor | 17.229 |
| convex/permissionsV2.test.ts | rejects incomplete insurance and ungranted paper preparation without changing old health evidence | 8.173 |
| convex/permissionsV2.test.ts | stores the reviewed PDF, refuses stale signing, and retrieves only through linked access | 522.575 |
| convex/permissionsV2.test.ts | fails closed until real signing is explicitly bound to this non-development deployment | 508.381 |
| convex/permissionWorkflow.test.ts | synthetic versioned permission workflow rejects stale profile, event, version, expired draft and wrong signer | 20.484 |
| convex/permissionWorkflow.test.ts | synthetic versioned permission workflow blocks unregistered subjects, wrong deployments, revoked links and ordinary Mentor access | 10.974 |
| convex/permissionWorkflow.test.ts | synthetic versioned permission workflow records paper signer separately from recorder, rejects mismatched retries and restricts health exports | 19.448 |
| convex/permissionWorkflow.test.ts | synthetic versioned permission workflow paginates a 500-member health export and rechecks revoked grants between pages | 1082.685 |
| convex/productionBootstrap.test.ts | first production Coach setup fails closed unless explicitly enabled for this non-development deployment | 37.646 |
| convex/productionBootstrap.test.ts | first production Coach setup requires the expected verified Google account | 6.702 |
| convex/productionBootstrap.test.ts | first production Coach setup refuses existing app users or seasons without changing their records | 7.187 |
| convex/productionBootstrap.test.ts | first production Coach setup creates one Coach and draft-permission season, then refuses a repeat | 5.057 |
| convex/profileSetup.test.ts | profile setup and corrections uses Coach-only revisioned corrections and marks existing room placement for review | 26.641 |
| convex/publicErrors.test.ts | public error boundaries retains explicit errors while keeping unexpected and legacy diagnostics private | 2.689 |
| convex/publicErrors.test.ts | public error boundaries exposes contact validation as deliberate Convex errors without changing legacy handling | 0.822 |
| convex/retentionReview.test.ts | retention review enforces Coach access, native pagination, and minimizes candidate projection | 22.914 |
| convex/reviewerRehearsal.test.ts | reviewer rehearsal fixture requires the bound development deployment and expected Coach-owned active season | 45.068 |
| convex/seasonIdentity.test.ts | active-season identity and Parent links selects the current profile despite a same-account historical profile and denies wrong roles/inactive rows | 18.067 |
| convex/setupWizardFirst.test.ts | shared setup and season FIRST registration denies an unrelated parent the setup, medical, and FIRST paths | 8.074 |
| convex/syntheticRehearsalCleanup.test.ts | exact synthetic account cleanup deletes only reviewed rehearsal identities and leaves the real Coach, season, and audit | 19.903 |
| convex/syntheticRehearsalCleanup.test.ts | exact synthetic account cleanup refuses to include any part of the Coach auth chain in the manifest | 7.963 |
| convex/syntheticRehearsalCleanup.test.ts | exact synthetic account cleanup preserves more than 40 unrelated calendar occurrence cache rows | 20.153 |
| convex/teamReports.test.ts | bounded role-scoped team reports reports link connection to Coaches and Travel without revealing fundraiser URLs | 105.969 |
| convex/teamReports.test.ts | bounded role-scoped team reports denies ordinary Mentor/Parent, minimizes Travel rows and exposes incomplete coverage | 8.423 |
| convex/timeclock.test.ts | timeclock transactions denies students and allows mentors to clock reviewed students without duplicate intervals | 81.193 |
| convex/timeclockPin.test.ts | operator PIN rejects absent configuration without extending | 40.867 |
| convex/timeclockPin.test.ts | operator PIN persists failed attempts and throttles the operator | 31.323 |
| convex/timeclockPin.test.ts | operator PIN validates the in-app sign-out control without revoking auth itself | 13.854 |
| convex/timeclockRoster.test.ts | Timeclock roster and attendance boundary exposes minimized reviewed-student status only to active operators in the active season | 9.537 |
| convex/travel.test.ts | travel operations includes transport in ordinary mentor overall readiness without exposing transport details | 29.914 |
| convex/travelLeadBootstrap.test.ts | development Travel Lead grant rejects other deployments before changing an account | 37.724 |
| convex/travelLeadBootstrap.test.ts | development Travel Lead grant requires an active expected Coach and verified Google Mentor | 14.672 |
| convex/travelLeadBootstrap.test.ts | development Travel Lead grant refuses a different role or an existing finance grant | 9.130 |
| convex/travelLeadBootstrap.test.ts | development Travel Lead grant sets only travelLead once and records one Coach audit entry | 8.306 |
| convex/wholeTeam.test.ts | Whole Team enrollment stops provisioning after Coach access is revoked | 4.521 |
| src/PermissionWorkflow.test.ts | permission export collection does not produce a partial download when any page or the final page is denied | 1.976 |
| src/lib/error-message.test.ts | userFacingError keeps unexpected rendering errors private while retaining explicit application errors | 2.810 |
| src/lib/error-message.test.ts | userFacingError uses explicit Convex data, including a message object | 0.328 |
| src/lib/error-message.test.ts | userFacingError does not show redacted server errors or stack details | 0.314 |
| src/lib/error-message.test.ts | userFacingError offers an action for connection and session failures | 0.233 |
| src/lib/error-message.test.ts | userFacingError preserves short local validation copy | 0.243 |

### Clock in / clock out and attendance (62)

| File | Full test name | ms |
| --- | --- | ---: |
| convex/attendanceOperations.test.ts | Coach attendance workspace selectors returns only current-season students and sessions with the declared minimized fields | 16.705 |
| convex/attendanceOperations.test.ts | Coach attendance workspace selectors fails closed instead of truncating a workspace above the student limit | 112.081 |
| convex/attendanceReportMaintenance.test.ts | attendance projection maintenance requires Coach maintenance and keeps unknown coverage unavailable | 103.956 |
| convex/attendanceReportMaintenance.test.ts | attendance projection maintenance projects paginated unique subjects, includes correction-only visits and fences duplicate workers | 101.426 |
| convex/attendanceReportMaintenance.test.ts | attendance projection maintenance invalidates through actual corrections and refuses stale generations and replay double-counting | 56.572 |
| convex/attendanceReportMaintenance.test.ts | attendance projection maintenance gates stale numerators during cancellation and review changes until rebuilding removes contributions | 48.896 |
| convex/attendanceReportMaintenance.test.ts | attendance projection maintenance scheduled close initializes projections and source math matches the stored projection | 9.737 |
| convex/attendanceReportMaintenance.test.ts | attendance projection maintenance returns structured failed evidence, then repairs and rebuilds without publishing partial counts | 29.782 |
| convex/attendanceReportMaintenance.test.ts | attendance projection maintenance reads more than 500 held sessions through aggregates and paginates minimized cards | 1683.686 |
| convex/attendanceReportMaintenance.test.ts | attendance projection maintenance rolls back summary and aggregate page writes together after component failure, then repairs the old namespace | 36.930 |
| convex/attendanceReportMaintenance.test.ts | attendance projection maintenance updates report metadata after later corrections and uses elapsed cutoff only for open evidence | 29.724 |
| convex/attendanceReportMaintenance.test.ts | attendance projection maintenance coalesces actual group in and bulk out invalidation once per session and ignores command replay | 13.841 |
| convex/attendanceReportMaintenance.test.ts | attendance projection maintenance invalidates actual calendar schedule updates and cancellation with revision fencing | 18.146 |
| convex/dashboardReports.test.ts | role-scoped dashboard reports uses corrected uninterrupted scheduled time and keeps legacy separate and evidence minimized | 149.918 |
| convex/dashboardReports.test.ts | role-scoped dashboard reports does not combine split visits to meet one uninterrupted hour or count open/cancelled sessions | 70.604 |
| convex/dashboardReports.test.ts | attendance subscription work skips history for summary callers and measures saved reads | 50.015 |
| convex/dashboardReports.test.ts | attendance subscription work returns the exact future session boundary and preserves live source changes | 51.582 |
| convex/mentorReportAttendance.test.ts | Mentor attendance report keeps each student's attendance distinct when meetings are loaded once for the season | 62.947 |
| convex/timeclock.test.ts | timeclock transactions settles expired sessions at the effective end and rejects stale scheduled jobs | 24.649 |
| convex/timeclock.test.ts | timeclock transactions requires a Coach reason for append-only correction and keeps the one-hour rule | 7.783 |
| convex/timeclock.test.ts | timeclock transactions refuses corrections and success-key replays after the session season is archived | 9.537 |
| convex/timeclock.test.ts | timeclock transactions rejects an entire group when one expected state is stale | 7.215 |
| convex/timeclock.test.ts | timeclock transactions serializes concurrent clock-ins for the same student across events | 4.129 |
| convex/timeclock.test.ts | timeclock transactions transfers at one timestamp with a PIN and blocks replay with changed arguments | 19.979 |
| convex/timeclock.test.ts | timeclock transactions confirms a mixed group by transferring the conflict and opening the free student atomically | 9.688 |
| convex/timeclock.test.ts | timeclock transactions preserves extension duration and ignores the stale close job | 10.147 |
| convex/timeclock.test.ts | timeclock transactions cancels a live calendar session at detection and rejects stale generation updates | 6.796 |
| convex/timeclock.test.ts | timeclock transactions shares one all-day opening across concurrent devices | 5.743 |
| convex/timeclock.test.ts | timeclock transactions closes a moved calendar end at detection and keeps closed schedule frozen | 5.375 |
| convex/timeclock.test.ts | timeclock transactions preserves added extension across a future calendar end revision and ignores older provider versions | 3.109 |
| convex/timeclock.test.ts | timeclock transactions voids and replaces added correction evidence without erasing audit rows | 13.847 |
| convex/timeclock.test.ts | timeclock transactions pauses new attendance and calendar work during transition while allowing clock-out | 33.530 |
| convex/timeclock.test.ts | timeclock transactions moves future sessionless occurrences once and invalidates old calendar refreshes at cutover | 2.893 |
| convex/timeclock.test.ts | archived attendance correction requires Coach correction mode, preserves original evidence, replays once and rejects closed access | 25.159 |
| convex/timeclockRoster.test.ts | Timeclock roster and attendance boundary returns surname-sorted minimized names and only uses subteam for duplicates | 49.041 |
| convex/timeclockRoster.test.ts | Timeclock roster and attendance boundary requires an explicit Coach name review and keeps it auditable | 11.169 |
| convex/timeclockRoster.test.ts | Timeclock roster and attendance boundary removes the legacy Travel Lead attendance-write bypass | 26.057 |
| convex/timeclockRoster.test.ts | Timeclock roster and attendance boundary distinguishes selected activity, prior checkout, and another event conflict | 56.462 |
| convex/timeclockRoster.test.ts | Timeclock roster and attendance boundary ignores stale pointers and closed sessions as active conflicts | 5.809 |
| convex/timeclockRoster.test.ts | Timeclock roster and attendance boundary refreshes eligibility and rejects locks pointing at another student's visit | 13.473 |
| convex/timeclockRoster.test.ts | Timeclock roster and attendance boundary keeps corrected attendance separate from operational clock status | 4.258 |
| convex/timeclockRoster.test.ts | measures bounded clock status reads: 12 students / 0 visits / selected | 13.761 |
| convex/timeclockRoster.test.ts | measures bounded clock status reads: 100 students / 50 visits / selected | 1010.976 |
| convex/timeclockRoster.test.ts | measures bounded clock status reads: 100 students / 50 visits / other | 1740.469 |
| convex/timeclockRoster.test.ts | measures bounded clock status reads: 100 students / 0 visits / cold | 54.896 |
| src/DashboardReports.test.ts | attendance shown to families shows seconds below the one-hour threshold instead of rounding up to 60 minutes | 0.418 |
| src/DashboardReports.test.ts | attendance shown to families explains split visits using the longest uninterrupted time | 0.248 |
| src/timeclock-roster-snapshot.test.ts | Timeclock roster snapshots refreshes idle scopes daily but freezes a selected event across midnight and DST | 5.517 |
| src/timeclock-roster-snapshot.test.ts | Timeclock roster snapshots fences old event responses and clears previous names while a new event loads | 1.064 |
| src/timeclock-roster-snapshot.test.ts | Timeclock roster snapshots recovers failed daily and selected event fetches through an explicit retry | 0.437 |
| src/timeclock-roster-snapshot.test.ts | Timeclock roster snapshots measures one idle fetch per day and one fetch per event selection across midnight | 114.005 |
| src/timeclock-roster-snapshot.test.ts | Timeclock roster snapshots reuses the same day idle snapshot after leaving an event | 0.366 |
| src/timeclock-roster-snapshot.test.ts | Timeclock roster snapshots deduplicates a pending same-scope request during StrictMode effect replay | 0.316 |
| src/timeclock-roster-snapshot.test.ts | Timeclock roster snapshots does not publish after its operator view unmounts | 0.918 |
| src/timeclock-visible-clock.test.ts | visible Timeclock clock stops hidden updates and immediately expires an ended session on return | 4.854 |
| convex/lib/timeclock.test.ts | timeclock attendance math requires one uninterrupted scheduled hour; separate visits never combine | 1.774 |
| convex/lib/timeclock.test.ts | timeclock attendance math separates early, scheduled, and extended minutes | 1.086 |
| convex/lib/timeclock.test.ts | timeclock attendance math rejects overlapping corrected visits | 0.772 |
| src/lib/roster-refresh.test.ts | roster time query arguments avoids the old 60 argument changes in an unchanged visible hour | 1.998 |
| src/lib/roster-refresh.test.ts | roster time query arguments refreshes once at the exact event transition | 0.472 |
| src/lib/roster-refresh.test.ts | roster time query arguments suspends while hidden and catches up when visible | 0.226 |
| src/lib/team-report-csv.test.ts | loaded team report CSV keeps not-counted attendance distinct from a counted zero in exports | 0.367 |

### Deadlines, dates, and time zones (37)

| File | Full test name | ms |
| --- | --- | ---: |
| convex/calendarAuth.test.ts | calendar normalization preserves recurring instance identity and distinct DST offsets | 1.031 |
| convex/calendarAuth.test.ts | calendar normalization keeps all-day exclusive end as dates | 0.229 |
| convex/calendarAuth.test.ts | calendar normalization accepts a cancellation tombstone without a schedule | 0.167 |
| convex/calendarAuth.test.ts | calendar normalization rejects an active event with no valid window so sync cannot reconcile it away | 0.105 |
| convex/calendarRefresh.test.ts | Calendar refresh does no database or network work outside scheduled Chicago slots | 3.305 |
| convex/coachRoster.test.ts | Coach student roster and record schedules the next indexed event boundary across archived and duplicate times | 52.259 |
| convex/eventCalendar.test.ts | Student Status Calendar link uses Chicago date boundaries across the fall daylight change | 18.722 |
| convex/eventCalendar.test.ts | Student Status Calendar link adopts linked all-day occurrence and cancellation without erasing its details | 29.884 |
| convex/eventCalendar.test.ts | Student Status Calendar link requires a new permission signature after a linked schedule change | 5.121 |
| convex/eventOperations.test.ts | event operations keeps room selection private and requires explicit leave and adult reasons after deadline | 28.528 |
| convex/eventOperations.test.ts | event operations refuses silent singleton replacement and closes every student write after deadline | 21.485 |
| convex/retentionReview.test.ts | retention review uses five calendar years and waits until Mar 1 for a Feb 29 archive | 1.608 |
| convex/retentionReview.test.ts | retention review includes adult accounts, rejects missing archive dates, and resets a changed student archive timestamp | 9.910 |
| convex/retentionReview.test.ts | retention review rejects invalid review times and changed linked-account identity with the same archive values | 5.513 |
| convex/seasonAdmin.test.ts | Coach season draft and roster review validates dates and revisions, and permits a reasoned discard without deleting decisions | 12.373 |
| convex/setupWizardFirst.test.ts | shared setup and season FIRST registration uses the Chicago eighteenth birthday for access and keeps minor medical data private | 56.053 |
| convex/timeclock.test.ts | timeclock transactions selects timed events by Chicago-day overlap, including unopened multi-day events | 5.960 |
| src/PaymentAdministration.test.ts | parses exact cents and quoted receipt references on team local dates, rejects ambiguous CSV | 19.062 |
| src/PermissionWorkflow.test.ts | permission export collection shows one Chicago date for a same-day event and a range across days | 19.704 |
| src/timeclock-event-clock.test.ts | Timeclock stable live-query clock reduces 240 different query arguments to one during a quiet hour | 107.722 |
| src/timeclock-event-clock.test.ts | Timeclock stable live-query clock changes the day anchor at Chicago midnight, including DST days | 4.616 |
| src/timeclock-event-clock.test.ts | Timeclock stable live-query clock expires buttons and stale-calendar status locally while preserving cancellation and closure | 0.841 |
| convex/lib/calendarSchedule.test.ts | Chicago Calendar refresh schedule runs exactly twice across DST on 2026-03-07 | 1.859 |
| convex/lib/calendarSchedule.test.ts | Chicago Calendar refresh schedule runs exactly twice across DST on 2026-03-08 | 0.278 |
| convex/lib/calendarSchedule.test.ts | Chicago Calendar refresh schedule runs exactly twice across DST on 2026-10-31 | 0.239 |
| convex/lib/calendarSchedule.test.ts | Chicago Calendar refresh schedule runs exactly twice across DST on 2026-11-01 | 0.213 |
| convex/lib/calendarSchedule.test.ts | Chicago Calendar refresh schedule finds the prior day's slot across the DST change | 0.271 |
| convex/lib/calendarSchedule.test.ts | Chicago Calendar refresh schedule waits five minutes for the latest slot and accepts successful manual refreshes | 0.247 |
| convex/lib/seasonCalendar.test.ts | verified FIRST kickoff calendar uses an explicit competition year and carries official provenance | 2.711 |
| convex/lib/seasonCalendar.test.ts | verified FIRST kickoff calendar starts at midnight on the Chicago kickoff calendar day, not at the broadcast hour | 19.265 |
| convex/lib/seasonCalendar.test.ts | verified FIRST kickoff calendar keeps year and leap-day boundaries in Chicago and never guesses an unknown year | 1.240 |
| convex/lib/timeclock.test.ts | timeclock attendance math uses Chicago day boundaries across DST transitions | 18.678 |
| src/lib/chicago-time.test.ts | Chicago event times converts ordinary local times independent of the browser timezone | 2.292 |
| src/lib/chicago-time.test.ts | Chicago event times rejects the missing spring-forward hour | 0.342 |
| src/lib/chicago-time.test.ts | Chicago event times uses the first occurrence of the repeated fall-back hour | 0.172 |
| src/lib/new-event-validation.test.ts | event wizard validation stops the first step at the missing field and rejects reversed dates | 1.690 |
| src/lib/new-event-validation.test.ts | event wizard validation validates each step independently and all fields before creation | 0.469 |

### Event readiness logic (46)

| File | Full test name | ms |
| --- | --- | ---: |
| convex/adultProfile.test.ts | staff basic setup saves trimmed staff basics without changing drivers, email or privileges and fences stale updates | 10.542 |
| convex/adultProfile.test.ts | staff basic setup allows coaches to maintain their own profile and driving details without self-approval | 3.496 |
| convex/adultProfile.test.ts | optional staff setup driving creates an unapproved towing driver and atomically rejects stale driving changes | 6.538 |
| convex/adultProfile.test.ts | optional staff setup driving rejects invalid driving details and blocked contexts but allows omitting driving | 7.369 |
| convex/adultProfile.test.ts | optional staff setup driving does not exceed driver capacity or mark blocked driving as completed | 24.297 |
| convex/adultProfile.test.ts | adult own profile creates an unapproved owned driver and resets approval after self-edits or disabling | 10.731 |
| convex/adultProfile.test.ts | adult own profile keeps an unowned same-email driver for Coach reconciliation while saving unrelated profile fields | 3.280 |
| convex/app.test.ts | server boundaries keeps adult rooming open after a student asks for assignment | 22.141 |
| convex/app.test.ts | server boundaries rejects withdrawal from an archived event without changing participation | 8.227 |
| convex/app.test.ts | Batch 4 workflow summaries and confirmation checks rejects a room confirmation whose reviewed membership has changed | 3.450 |
| convex/coachRoster.test.ts | Coach student roster and record marks pending Whole Team enrollment and truncated event coverage unknown | 6.572 |
| convex/eventEnrollmentGates.test.ts | running Whole Team provisioning gates blocks finance, both driver paths, travel, rooms and withdrawal without writes | 94.283 |
| convex/eventEnrollmentGates.test.ts | running Whole Team provisioning gates keeps partial workspaces readable and never reports event or student ready | 42.085 |
| convex/eventEnrollmentGates.test.ts | failed Whole Team provisioning gates blocks finance, both driver paths, travel, rooms and withdrawal without writes | 9.763 |
| convex/eventEnrollmentGates.test.ts | failed Whole Team provisioning gates keeps partial workspaces readable and never reports event or student ready | 6.865 |
| convex/eventOperations.test.ts | event operations keeps cancelled events visible while blocking new signup, approval and roster charges | 116.806 |
| convex/eventOperations.test.ts | event operations approves a pending reserved seat at capacity, then manually promotes waitlist in signup order | 47.829 |
| convex/eventReadinessCoverage.test.ts | event readiness coverage marks participant sentinel overflow incomplete without reporting ready transportation | 106.233 |
| convex/eventReadinessCoverage.test.ts | event readiness coverage marks room-group sentinel overflow incomplete and does not report ready rooming | 8.301 |
| convex/permissionWorkflow.test.ts | synthetic versioned permission workflow uses current coverage so partial supersession and correction never fall back to old acceptance | 31.215 |
| convex/permissionWorkflow.test.ts | synthetic versioned permission workflow requires a fresh signature after an explicit request and rejects stale or hidden review scope | 32.071 |
| convex/permissionWorkflow.test.ts | synthetic versioned permission workflow binds accepted coverage to the receipt and invalidates stale provenance markers | 9.657 |
| convex/permissionWorkflow.test.ts | synthetic versioned permission workflow rejects duplicate prior-event evidence and contradictory paper signer provenance | 12.903 |
| convex/permissionWorkflow.test.ts | synthetic versioned permission workflow never infers coverage from legacy answers JSON and refuses legacy review promotion | 9.135 |
| convex/setupWizardFirst.test.ts | shared setup and season FIRST registration lets an adult student read the invitation and report completion for Coach review | 14.218 |
| convex/setupWizardFirst.test.ts | shared setup and season FIRST registration confirms a saved Parent profile, waits for Coach after self-report, and starts a new season unverified | 23.547 |
| convex/setupWizardFirst.test.ts | shared setup and season FIRST registration requires Coach verification of both conditions across every Competition and preserves old Team marks | 14.547 |
| convex/teamReports.test.ts | bounded role-scoped team reports bounds roster pages and marks pending selected-event enrollment unknown | 46.549 |
| convex/travel.test.ts | travel operations enforces operator roles, active event and season, and valid seat counts | 43.250 |
| convex/travel.test.ts | travel operations counts current riders and adults, excludes independent students and withdrawn participation | 19.113 |
| convex/travel.test.ts | travel operations requires approved assigned tow driver and reacts to driver downgrade or removal | 20.128 |
| convex/travel.test.ts | travel operations rejects a driver beyond the bounded list without changing existing records | 22.841 |
| convex/travel.test.ts | travel operations keeps readiness open when financial or requirement evidence exceeds its supported bound | 31.779 |
| convex/wholeTeam.test.ts | Whole Team enrollment does not reenroll withdrawn members or add new members to started or archived events | 82.569 |
| convex/wholeTeam.test.ts | Whole Team enrollment adds approved new and linked members to upcoming Whole Team events | 41.492 |
| convex/wholeTeam.test.ts | Whole Team enrollment creates the supported 500-member Whole Team roster | 1652.385 |
| convex/wholeTeam.test.ts | Whole Team enrollment ignores more than 100 historical or archived events when enrolling a later member | 38.239 |
| convex/wholeTeam.test.ts | Whole Team enrollment keeps provisioning pending until the stable snapshot finishes and guards duplicate progress | 33.075 |
| convex/wholeTeam.test.ts | Whole Team enrollment rejects capacity and selected subsets for automatic Whole Team events | 2.285 |
| convex/wholeTeam.test.ts | cancelled Whole Team events stops queued assignment and cannot retry or enroll newly activated students | 4.599 |
| convex/withdrawals.test.ts | withdrawal decisions lets a student leave a free Whole Team event immediately and records a dismissible Coach notice | 27.899 |
| convex/withdrawals.test.ts | withdrawal decisions releases a paid Whole Team place before the separate fee decision | 92.515 |
| src/lib/new-event-validation.test.ts | event wizard validation accepts a linked Calendar entry with no location while requiring one for a separate entry | 0.243 |
| src/lib/team-report-csv.test.ts | loaded team report CSV marks an open selected-event requirement Draft even when the loaded scope is complete | 0.334 |
| src/features/design-review/readinessPrint.test.ts | printable readiness summary requires verified coverage and does not treat skipped transportation as not applicable | 1.948 |
| src/features/design-review/readinessPrint.test.ts | printable readiness summary marks open requirements, empty rosters, and incomplete room or requirement coverage Draft | 0.712 |

### UI rendering (71)

| File | Full test name | ms |
| --- | --- | ---: |
| src/BulkConnectionApproval.test.ts | account connection approval presentation keeps an applicant waiting for a Coach without showing the target student or requesting names | 14.645 |
| src/BulkConnectionApproval.test.ts | account connection approval presentation offers a new-code path after a declined or unavailable request | 3.852 |
| src/BulkConnectionApproval.test.ts | account connection approval presentation shows the Coach both the target record and Google identity for review | 21.694 |
| src/ChargeAdministration.test.ts | rendered charge administration controls uses an explicit submit button for the Coach correction form | 19.895 |
| src/ChargeAdministration.test.ts | rendered charge administration controls uses an explicit submit button for failed-job retry and separates source progress from the target | 5.063 |
| src/ChargeAdministration.test.ts | rendered charge administration controls shows family details without editing or retry forms | 2.821 |
| src/ChargeAdministration.test.ts | rendered charge administration controls does not show empty receipts or financial values during initial loading | 0.676 |
| src/CoachFinanceTable.test.ts | Coach finance source columns does not claim an empty season at a native pagination split | 11.689 |
| src/CoachFinanceTable.test.ts | Coach finance source columns renders source-separated applied values and fundraising availability with exact cents | 25.555 |
| src/CoachFinanceTable.test.ts | Coach finance source columns withholds even old supplied values while a row is updating and never substitutes zero | 2.247 |
| src/CoachFinanceTable.test.ts | Coach finance source columns distinguishes initial loading from an empty season and refuses unsafe numeric formatting | 3.257 |
| src/CoachFinanceWorkspace.test.ts | financial query presentation integration preserves empty nonfinal account pages and the server page limit | 14.022 |
| src/CoachFinanceWorkspace.test.ts | financial query presentation integration only offers historical preparation when the server permits it | 19.922 |
| src/CoachFinanceWorkspace.test.ts | financial query presentation integration keeps initial history loading separate from empty history | 0.905 |
| src/CoachFinanceWorkspace.test.ts | server-gated account recovery offers recovery only for an unavailable row the server permits and explains maintenance | 11.940 |
| src/DashboardReports.test.ts | financial report currency shows maintenance independently of committed amounts and tolerates the earlier additive response | 6.044 |
| src/DashboardReports.test.ts | names earned fundraising separately from spendable credit and explains unknown gross | 0.920 |
| src/EventEnrollmentNotice.test.ts | enrollment recovery capability disables Coach retry while server financial coordination blocks it | 16.169 |
| src/FamilyLinkMaintenance.test.ts | shows initial loading without a premature start or completion claim | 14.216 |
| src/FamilyLinkMaintenance.test.ts | offers start for missing or pending server records | 5.327 |
| src/FamilyLinkMaintenance.test.ts | distinguishes active preparation and verification without optimistic completion | 1.692 |
| src/FamilyLinkMaintenance.test.ts | requires a reasoned retry and shows the reported unresolved count and error | 4.148 |
| src/FamilyLinkMaintenance.test.ts | hides completed maintenance and its commands, but keeps unresolved completion visible | 1.543 |
| src/FeeAdministration.test.ts | shared fee presentation automatically pages applicable student choices and prepared rows before enabling confirmation | 1.884 |
| src/FeeAdministration.test.ts | shared fee presentation confirms only the unchanged reviewed scope and reuses its original reason | 0.823 |
| src/FeeAdministration.test.ts | shared fee presentation exposes only authorized mapping recovery and labels cancelled receipts accurately | 16.534 |
| src/FeeAdministration.test.ts | shared fee presentation keeps a finance reader out of Coach-only mapping queries and commands | 1.726 |
| src/FeeAdministration.test.ts | shared fee presentation does not label an initially loading fee page as an empty season | 0.881 |
| src/FeeAdministration.test.ts | shared fee presentation labels custom charge preparation as zero-money review and requires explicit submit | 1.937 |
| src/FeeAdministration.test.ts | shared fee presentation does not display an unfinished scope as zero members or a prepared target as committed | 19.322 |
| src/FeeAdministration.test.ts | shared fee presentation separates committed partial source release from the still-current obligation and frozen target | 1.208 |
| src/FeeAdministration.test.ts | shared fee presentation explains a planned new charge without false errors, but flags a missing existing charge | 1.313 |
| src/FeeAdministration.test.ts | shared fee presentation shows display positions and exact cents without inventing actions for readonly roles | 0.929 |
| src/FeeAdministration.test.ts | shared fee presentation shows event context for equal fee names without changing their order | 0.719 |
| src/FeeAdministration.test.ts | shared fee presentation keeps priority actions as non-submit buttons and blocks them during maintenance | 1.700 |
| src/FeeAdministration.test.ts | shared fee presentation keeps recorded operation details readable while monetary actions are blocked | 0.988 |
| src/FeeAdministration.test.ts | shared fee presentation does not imply propagation finished while current operations are draining | 0.470 |
| src/FeeAdministration.test.ts | shared fee presentation shows failed durable progress separately and uses an explicit retry submit | 2.877 |
| src/FeeAdministration.test.ts | shared fee presentation keeps unavailable recorded event evidence distinct from a standalone charge | 3.573 |
| src/FinanceExport.test.ts | offers the complete active scope without pretending an unprepared file is available | 14.754 |
| src/FinanceExport.test.ts | offers selected-student export only when an explicit student was supplied | 3.303 |
| src/FinanceExport.test.ts | shows pending membership capture without offering partial downloads and honors disabled writes | 1.365 |
| src/FinanceRecentChanges.test.ts | typed finance change evidence keeps incomplete progress and unavailable historical values explicit | 34.019 |
| src/FinanceRecentChanges.test.ts | typed finance change evidence renders priority as ranks rather than currency and never exposes raw unknown kinds | 4.205 |
| src/FinanceRecentChanges.test.ts | finance history coverage and pagination shows only supplied preparation dates and preserves an empty nonfinal page | 2.677 |
| src/FinanceRecentChanges.test.ts | finance history coverage and pagination disables additional requests while loading and shows a supplied completion date | 1.089 |
| src/FinanceRecentChanges.test.ts | identifies team fee-order records without guessing a student | 1.400 |
| src/PermissionWorkflow.test.ts | permission export collection labels earlier signed forms without claiming they lost current coverage | 0.952 |
| src/PermissionWorkflow.test.ts | permission export collection starts every medication category without a preselected answer | 0.248 |
| src/ReviewStates.test.ts | synthetic review states shows committed finance progress and a guarded retry after a failed operation | 46.604 |
| src/ReviewStates.test.ts | synthetic review states shows partial withdrawal processing and Coach-only retry prerequisites | 1.925 |
| src/ReviewStates.test.ts | synthetic review states offers a guarded retry to a Coach when withdrawal processing fails | 2.382 |
| src/ReviewStates.test.ts | synthetic review states shows failed attendance recalculation with an available retry action | 1.725 |
| src/ReviewStates.test.ts | synthetic review states shows held fundraiser posting and the guarded retry route | 5.462 |
| src/ReviewStates.test.ts | synthetic review states shows failed fundraiser posting and the guarded retry route | 2.953 |
| src/ReviewStates.test.ts | synthetic review states keeps sign-out and individual invitation entry available on Join and Waiting | 1.944 |
| src/TeamReports.test.ts | team report scope without a selected event shows empty event columns and an exhaustive student count | 40.365 |
| src/TeamReports.test.ts | team report scope without a selected event keeps partial results scoped and offers more rows | 3.474 |
| src/TeamReports.test.ts | team report scope without a selected event counts visible rows when loaded students are filtered | 3.459 |
| src/TeamReports.test.ts | team report scope without a selected event labels attendance before kickoff as not counted yet, then shows a recorded zero | 6.737 |
| src/lib/navigation-copy.test.ts | staff navigation keeps the New event draft mounted when its Events group tab is selected | 1.328 |
| src/lib/navigation-copy.test.ts | staff navigation recognizes student record routes as part of Team | 0.177 |
| src/lib/navigation-copy.test.ts | staff navigation lists Join requests for Travel Leads and labels a Parent profile for the student | 0.616 |
| src/lib/navigation-copy.test.ts | staff navigation opens the Mentor profile first and keeps its report separate from operational staff | 0.598 |
| src/lib/rosterSort.test.ts | whole-roster sorting brings a second-directory-page surname into the first visible page | 14.970 |
| src/lib/rosterSort.test.ts | whole-roster sorting keeps unfamiliar and missing grades after 9 through 12 in either direction | 1.569 |
| src/lib/rosterSort.test.ts | whole-roster sorting sorts saved subteam aliases together and missing subteams last | 0.387 |
| src/lib/sticky-header.test.ts | tracks actual header resizing and removes stale offsets on unmount | 2.886 |
| src/features/operations/FinanceOperations.test.ts | team transfer review renders every requested penny and explicit review/submit button types | 28.939 |
| src/features/operations/FinanceOperations.test.ts | team transfer review blocks confirmation after a financial revision changes or while updating | 1.790 |
| src/features/operations/FinanceOperations.test.ts | team transfer review does not manufacture zero balances before a preview loads | 1.370 |

### Other (114)

| File | Full test name | ms |
| --- | --- | ---: |
| convex/adminSubteam.test.ts | Coach subteam changes accepts approved choices, rejects retired choices, and guards stale updates | 51.130 |
| convex/adultProfile.test.ts | staff basic setup recognizes complete legacy profiles and missing, whitespace or invalid-size profiles without writes | 38.974 |
| convex/adultProfile.test.ts | staff basic setup validates supplied values without partial saves | 6.380 |
| convex/adultProfile.test.ts | staff basic setup finishes with individual skipped fields, preserves saved values and does not prompt again | 4.259 |
| convex/adultProfile.test.ts | staff basic setup persists a self-only dismissal across sessions and seasons, preserves it after saves and rejects stale dismissal | 5.634 |
| convex/adultProfile.test.ts | optional staff setup driving preserves an approval on unchanged explicit details and revokes it on towing changes | 4.663 |
| convex/adultProfile.test.ts | adult own profile lets a reactivated active Mentor reconcile while retaining historical archivedAt | 2.754 |
| convex/adultProfile.test.ts | adult own profile rejects mismatched identity, owned duplicates and operational duplicate-email writes | 5.001 |
| convex/app.test.ts | server boundaries rejects stale profile edits and invalid required shirt sizes | 8.614 |
| convex/calendarRefresh.test.ts | Calendar refresh retries a 410 with full sync, reconciles missing occurrences, and stores the new token | 179.755 |
| convex/calendarRefresh.test.ts | Calendar refresh fences stale generations from ingestion and reconciliation | 5.164 |
| convex/calendarRefresh.test.ts | Calendar refresh reports manual success, throttles duplicate calls, and reports failure without diagnostics | 129.225 |
| convex/coachRoster.test.ts | Coach student roster and record pages lightweight directory, projects grade precedence and structured surnames, and scopes enriched IDs | 17.895 |
| convex/coachRoster.test.ts | Coach student roster and record filters connection across pages without restricting Coach access to unconnected students | 19.405 |
| convex/consentPdfRehearsal.test.ts | creates one isolated fictional PDF subject and preserves its provenance on retry | 77.031 |
| convex/consentPdfRehearsal.test.ts | never adopts a matching unmarked student | 2.567 |
| convex/consentRehearsal.test.ts | creates only a paper fixture and preserves its IDs on retry | 75.470 |
| convex/consentRehearsal.test.ts | never adopts a matching identity without a fixture marker | 2.238 |
| convex/consentRehearsal.test.ts | does not reactivate a disabled fixture on retry | 11.138 |
| convex/consentRehearsal.test.ts | rejects repurposed or archived fixture records on retry | 12.135 |
| convex/contactFormats.test.ts | normalizes student setup, emergency editing and parent wizard contacts at the server | 72.517 |
| convex/contactFormats.test.ts | normalizes both driver creation endpoints and rejects malformed payment lookup emails | 16.481 |
| convex/developmentRehearsal.test.ts | development rehearsal fixture creates only two unbound fictional students and one event, then returns the same ids without rewriting old records | 52.366 |
| convex/developmentRehearsal.test.ts | development rehearsal fixture fails closed on a partial fixture collision without changing any rows | 3.401 |
| convex/developmentRehearsal.test.ts | development rehearsal fixture guards and creates an idempotent isolated archived charge fixture without touching existing season records | 16.480 |
| convex/eventCalendar.test.ts | Student Status Calendar link reserves links uniquely, protects stale edits, and imports only a linked occurrence | 26.922 |
| convex/eventCalendar.test.ts | Student Status Calendar link blocks every external call on a development deployment even if the write flag is true | 5.008 |
| convex/eventCalendar.test.ts | Student Status Calendar link recovers an uncertain insert by reusing its deterministic ID and applying the latest edit | 163.673 |
| convex/familyLinkSeasonMigration.test.ts | season-indexed family links withholds pages before verification and finds current children after more than 100 historical links | 84.270 |
| convex/familyLinkSeasonMigration.test.ts | season-indexed family links records a broken source link, retries from the same cursor, and ignores stale scheduled work | 8.968 |
| convex/fundraiserLinks.test.ts | individual fundraiser links sets, updates and clears a shared family link without profile or financial effects | 41.559 |
| convex/fundraiserLinks.test.ts | individual fundraiser links rejects unsafe schemes, lookalike hosts, credentials, ports, fragments and oversized URLs | 10.315 |
| convex/fundraiserLinks.test.ts | fundraiser CSV import previews canonical names then applies connects and clears atomically without financial changes | 7.454 |
| convex/permissionsV2.test.ts | accepts only recognized or unchanged legacy profile grades | 40.332 |
| convex/permissionsV2.test.ts | requires student setup and explicit parent confirmation before a populated PDF draft | 25.610 |
| convex/permissionsV2.test.ts | seals reviewed and signed PDFs, preserves the reviewed pages, and retries once | 324.262 |
| convex/permissionsV2.test.ts | selects one immutable approved version and keeps prior V2 snapshot parsing | 8.300 |
| convex/permissionWorkflow.test.ts | synthetic versioned permission workflow captures immutable full electronic evidence, explicit choices, review and retry | 73.331 |
| convex/permissionWorkflow.test.ts | synthetic versioned permission workflow rejects oversized serialized evidence before any draft or submission is written | 8.409 |
| convex/profileSetup.test.ts | profile setup and corrections requires explicit setup, validates required fields, locks category and rejects repeat and stale saves | 60.438 |
| convex/profileSetup.test.ts | profile setup and corrections preserves an existing legacy locked category during first setup | 13.564 |
| convex/profileSetup.test.ts | profile setup and corrections keeps earlier-season correction history out of the current Coach queue | 16.959 |
| convex/profileSetup.test.ts | profile setup and corrections keeps one pending request per field and treats an identical retry as the same request | 10.889 |
| convex/profileSetup.test.ts | profile setup and corrections paginates more than 100 legitimate current-season corrections without truncation | 56.682 |
| convex/profileSetup.test.ts | profile setup and corrections retains revisioned roster room corrections and placement review | 38.510 |
| convex/profileSetup.test.ts | profile setup and corrections records the latest archive transition and audits preserved clocks | 11.023 |
| convex/readCost.test.ts | synthetic read cost measures team report before accounts are ready | 48.991 |
| convex/readCost.test.ts | synthetic read cost measures confirmed competition roster rows | 39.860 |
| convex/retentionReview.test.ts | retention review keeps append-only hold/release evidence and rejects repeated or stale actions | 12.024 |
| convex/retentionReview.test.ts | retention review invalidates old student and linked-account archive instances after reactivation and rearchive | 9.679 |
| convex/retentionReview.test.ts | retention review reviews inactive application accounts and preserves old hold history across rearchive | 10.116 |
| convex/retentionReview.test.ts | retention review caps expanded native account pages before hydration | 20.989 |
| convex/retentionReview.test.ts | retention review rejects malformed native row budgets before clamping | 9.183 |
| convex/reviewerRehearsal.test.ts | reviewer rehearsal fixture adds the review scenarios and projections once while preserving existing records and access boundaries | 157.303 |
| convex/reviewerRehearsal.test.ts | reviewer rehearsal fixture fails closed when a marked fixture identity changes | 96.342 |
| convex/seasonAdmin.test.ts | Coach season draft and roster review saves a draft once without creating a season or changing any student | 43.643 |
| convex/seasonAdmin.test.ts | Coach season draft and roster review pages a large active roster and fences stale student and competing Coach decisions | 51.870 |
| convex/seasonTransition.test.ts | complete synthetic season transition requires explicit confirmation and preserves source IDs while resetting new seasonal evidence | 174.487 |
| convex/seasonTransition.test.ts | complete synthetic season transition keeps old season active after missing review and permits returning to editable review | 10.546 |
| convex/setupWizardFirst.test.ts | shared setup and season FIRST registration normalizes known grades, preserves old unknown grades, and rejects new arbitrary grades | 39.899 |
| convex/setupWizardFirst.test.ts | shared setup and season FIRST registration allows initial subteam choice, preserves legacy assignment, and shares parent revisions | 8.089 |
| convex/subteamMigration.test.ts | prepared subteam migration previews a bounded page, refuses stale evidence, and changes only reviewed fields | 36.206 |
| convex/syntheticRehearsalCleanup.test.ts | exact synthetic account cleanup requires the exact opt-in and refuses a changed dependency inventory | 48.288 |
| convex/syntheticRehearsalCleanup.test.ts | exact synthetic account cleanup removes only exact reviewed signature-only orphan verifiers | 24.698 |
| convex/syntheticRehearsalCleanup.test.ts | exact synthetic account cleanup cleans a real join and parent invitation flow with zero finance leaves | 114.495 |
| convex/syntheticRehearsalCleanup.test.ts | exact synthetic account cleanup refuses account deletion after participation appears | 6.732 |
| src/PermissionWorkflow.test.ts | permission export collection collects 500 students across 50 bounded pages before producing one collection-range file | 4.729 |
| src/PermissionWorkflow.test.ts | permission export collection rejects a cursor that cannot advance and unexpected event scope | 0.645 |
| src/PermissionWorkflow.test.ts | permission export collection cancels between pages without producing a downloadable packet | 0.594 |
| src/lib/bulk-invite-csv.test.ts | bulk invitation CSV reads BOM, CRLF, quoted commas and escaped quotes | 1.964 |
| src/lib/bulk-invite-csv.test.ts | bulk invitation CSV requires the exact two-column header and bounded names | 1.379 |
| src/lib/bulk-invite-csv.test.ts | bulk invitation CSV rejects malformed quotes and excess rows | 0.530 |
| src/lib/bulk-invite-csv.test.ts | bulk invitation CSV escapes formula cells in exported codes and names | 0.642 |
| src/lib/contact-format.test.ts | contact entry formatting normalizes US numbers and optional country prefix; empty stays optional | 2.436 |
| src/lib/contact-format.test.ts | contact entry formatting normalizes structurally valid email while rejecting common malformed forms | 0.963 |
| src/lib/contact-format.test.ts | contact entry formatting preserves unchanged legacy fields but rejects new malformed edits | 0.394 |
| src/lib/field-trip-pdf.test.ts | field trip PDF renderer keeps the approved original layout to one reviewed and signed page for ordinary values | 1083.624 |
| src/lib/field-trip-pdf.test.ts | field trip PDF renderer refuses a version whose text disagrees with the fixed approved page | 1.329 |
| src/lib/field-trip-pdf.test.ts | field trip PDF renderer preserves excess events on continuation pages without clipping | 211.491 |
| src/lib/field-trip-pdf.test.ts | field trip PDF renderer produces deterministic letter-size reviewed pages and appends signature evidence | 149.271 |
| src/lib/field-trip-pdf.test.ts | field trip PDF renderer continues long event and health details onto additional pages | 79.102 |
| src/lib/fundraiser-csv.test.ts | fundraiser CSV round trips BOM, quoting and blank clears while guarding formula names | 3.231 |
| src/lib/fundraiser-csv.test.ts | fundraiser CSV rejects changed headers, duplicate IDs, invalid revisions and oversized batches | 3.410 |
| src/lib/fundraiser-csv.test.ts | fundraiser CSV exports every page and refuses a stuck cursor | 1.812 |
| src/lib/grades.test.ts | grade choices recognizes 9 as Freshman | 1.443 |
| src/lib/grades.test.ts | grade choices recognizes 9th grade as Freshman | 0.225 |
| src/lib/grades.test.ts | grade choices recognizes grade ninth as Freshman | 0.168 |
| src/lib/grades.test.ts | grade choices recognizes freshman as Freshman | 0.174 |
| src/lib/grades.test.ts | grade choices recognizes 10th as Sophomore | 0.093 |
| src/lib/grades.test.ts | grade choices recognizes grade 10 as Sophomore | 0.119 |
| src/lib/grades.test.ts | grade choices recognizes tenth grade as Sophomore | 0.111 |
| src/lib/grades.test.ts | grade choices recognizes 11 as Junior | 0.080 |
| src/lib/grades.test.ts | grade choices recognizes grade11 as Junior | 0.359 |
| src/lib/grades.test.ts | grade choices recognizes eleventh as Junior | 0.143 |
| src/lib/grades.test.ts | grade choices recognizes 12th grade as Senior | 0.124 |
| src/lib/grades.test.ts | grade choices recognizes grade twelfth as Senior | 0.055 |
| src/lib/grades.test.ts | grade choices recognizes SENIOR as Senior | 0.042 |
| src/lib/grades.test.ts | grade choices keeps an unknown earlier value unchanged, but rejects new free text | 0.761 |
| src/lib/grades.test.ts | grade choices treats an alias as the same grade for existing parent confirmation | 0.101 |
| src/lib/invitation-code.test.ts | invitation routing routes five digits to individual linking and six digits to team requests | 1.685 |
| src/lib/parent-invite-share.test.ts | reactive email status labels maps queued to emailQueued | 1.258 |
| src/lib/parent-invite-share.test.ts | reactive email status labels maps sent to emailSent | 0.194 |
| src/lib/parent-invite-share.test.ts | reactive email status labels maps failed to emailFailed | 0.097 |
| src/lib/parent-invite-share.test.ts | reactive email status labels maps not_sent to emailNotSent | 0.182 |
| src/lib/parent-invite-share.test.ts | reactive email status labels maps null to emailChecking | 0.093 |
| src/lib/parent-invite-share.test.ts | reactive email status labels maps undefined to emailUnknown | 0.112 |
| src/lib/retention-draft.test.ts | retention decision draft does not turn a reviewed hold into a release after another Coach places a competing hold | 2.267 |
| src/lib/retention-draft.test.ts | retention decision draft retains a release intention on reactivation but requires fresh archive review | 0.439 |
| src/lib/share-fundraiser.test.ts | fundraiser share action copies on desktop even if native sharing is available | 2.988 |
| src/lib/share-fundraiser.test.ts | fundraiser share action uses native sharing on phones and does not copy after cancellation | 0.713 |
| src/lib/share-fundraiser.test.ts | fundraiser share action falls back to clipboard and offers manual copying when unavailable | 0.424 |
| src/lib/subteams.test.ts | subteam compatibility keeps the five approved choices and an unassigned display | 1.970 |
| src/lib/subteams.test.ts | subteam compatibility groups earlier stored values without writing new values | 0.344 |
| src/lib/team-report-csv.test.ts | loaded team report CSV states partial scope, keeps unknown distinct from zero, and escapes spreadsheet formulas | 2.635 |


