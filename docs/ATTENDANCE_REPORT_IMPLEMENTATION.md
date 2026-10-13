# Attendance report implementation and evidence

Updated October 13, 2026. Stored projections, durable workers, aggregate counters, Timeclock invalidation hooks and the family reporting UI are implemented in the current development branch. This describes source reviewed in this wave, not production or visual acceptance. G4 remains partial because other dashboard/reporting workflows are unfinished.

## Public report contract

`convex/dashboardReports.ts` exposes `familyAttendance({studentId, asOf, paginationOpts?})` to an active current-season student, actively linked parent or Coach. Ordinary Mentors and Travel Leads cannot use this family endpoint. The response contains minimized session cards and counters, not raw intervals, correction reasons, acting-account IDs or health data.

Session cards paginate the season's `timeclockSessions` index by scheduled start, including absences. The default and server maximum are ten cards; the UI requests ten. Closed/cancelled cards use materialized summaries. A missing summary means zero only when the session report is ready and current. Open cards compute provisional evidence using the latest corrections and the elapsed `asOf` cutoff.

`totalsScope: currentFinalized` explicitly identifies verified totals as current finalized evidence, not a historical reconstruction at `asOf`. Closed cards also show current finalized evidence. `asOf` filters the card list and legacy meeting dates and caps open elapsed time. Latest corrections and the current applicable schedule prevail. The verified updated timestamp is the maximum of the season backfill and latest session-report timestamp.

Only closed sessions without `needsReview` enter held-session and qualifying-attendance counters. Tuesday/Thursday classification uses America/Chicago scheduled start. Qualification requires one uninterrupted scheduled hour; shorter visits do not combine, and early/extended time does not qualify. Verified Outreach remains unavailable because there is no explicit Timeclock category. Legacy checkmarks remain separate and exclude future/cancelled meetings.

Responses are `ready`, `updating` or `failed`. Verified totals are null until season enumeration is complete and there are no pending/failed finalized session projections or stale cards. Legacy totals remain independently readable. Coach controls can rebuild; families cannot alter projection state.

## Stored data and aggregation

- `timeclockAttendanceSummaries`: one derived student/session row with duration buckets, qualification, scheduled start/weekday, session revision, report generation, eligibility state, evidence timestamp and version 1.
- `timeclockSessionReportStates`: session coverage, generation/revision, state, originals/corrections/verify phase, cursor, processed count and sanitized failure metadata. The season/updatedAt index supports report freshness.
- `timeclockAttendanceReportMembers`: deduplicated student/session work membership, reused across generations, with projected-generation marker.
- `attendanceReportBackfills`: durable season enumeration state, cursor, processed count and sanitized failure metadata.

`@convex-dev/aggregate` stores held/pending/failed session counts and per-student qualifying counts, partitioned by season and weekday. Duration buckets remain in individual summaries; aggregate duration totals are not implemented. Summary and aggregate replacements are transactional. Pending or failed finalized sessions gate all verified totals, including cancellation/review rebuilds while old student contributions are being removed.

Original intervals and corrections remain authoritative and append-preserved in application workflows. Voids retain the evidence subject, so rediscovery also projects zero attendance and removes previous qualifying contributions. Workers do not implement arbitrary source-deletion reconciliation; future import/deletion tooling must preserve or explicitly rebuild that invariant.

## Workers and invalidation

`convex/lib/attendanceReports.ts` increments a separate report generation for every affected source transaction. Open sessions are ready only for provisional display; finalized sessions become rebuilding. Stale generation/revision/phase/cursor jobs return without changes.

`attendanceReportMaintenance.ts` enumerates five season sessions per transaction. Session discovery pages twenty originals or corrections, then projects one deduplicated student per transaction. Each evidence history is guarded at 500 originals and 500 corrections per student/session. Projection, aggregate changes, member marker and cursor commit together through nested `processSessionPage`; the outer worker catches a rolled-back page error and records a sanitized failed state. Season pages use the same nested-transaction pattern. Retrying a season rebuild restarts enumeration; per-session rebuild restarts discovery with a new generation. Duplicate jobs cannot advance an already-advanced cursor.

Actual Timeclock hooks cover session creation, final session closure (including scheduled and expiry closure), group in/out/transfer, bulk out, extension, calendar window/cancellation/review changes and accepted corrections. Group mutations coalesce affected sessions; stored command replay returns before invalidation. Closed-session calendar handling retains its existing frozen schedule semantics. Legacy attendance writers stay independent. Future report-affecting editors, imports and fixture writers must explicitly initialize/invalidate projections.

## Query and worker budgets

A maximum-size family page with ten open sessions reads at most 10 × (501 original + 501 correction) evidence documents, plus up to 501 legacy meetings and 501 legacy records: 11,022 evidence/legacy documents before small authentication, session, occurrence, state, summary and aggregate-index overhead. The owner estimates about 11,070 application documents including that metadata, plus seven aggregate calls with tree-traversal cost. Closed cards do not perform evidence fanout. The requested count is enforced server-side, not merely a UI convention. Native endCursor pagination can expand a page beyond numItems, so the query additionally caps maximumRowsRead at eleven (preserving any lower caller budget) and rejects pages larger than ten before hydration. It never silently truncates an expanded page. Native splitCursor/pageStatus metadata is preserved. The implementation owner reports a passing regression for endCursor expansion, rejection before hydration, a caller row budget of three and invalid row budgets. Histories above the supported guard fail closed rather than truncate. Aggregate component reads add tree traversal cost, so this arithmetic is not an exact deployment profiler measurement or a byte-budget guarantee.

Each projection page processes one member and at most 1,002 source documents plus bounded metadata/aggregate operations. Discovery and season pages stay small. No whole-season ledger/evidence scan is performed in a family query. Arbitrarily long per-session histories and legacy histories above 500 remain explicit unsupported guards, not silently claimed scalability.

## Verification and remaining limits

Source review confirmed nested rollback, revision/generation/cursor fences, cancellation/review pending gates, minimized family output and actual update timestamps. The implementation owner reports eleven passing attendance-maintenance tests covering authorization and the ten-card bound; paginated unique subjects and correction-only evidence; actual corrections and replay; cancellation/review removal; scheduled closure/source equivalence; failure/repair; more than 500 held sessions; injected post-summary aggregate failure and namespace repair; report timestamp/cutoff semantics; actual group/bulk-out coalescing; and actual calendar window/cancellation changes. Dashboard tests separately cover family authorization, revoked links, corrected uninterrupted qualification, split visits and legacy separation.

Root reports full lint/build and 145 tests across 25 files passing for this wave. This reviewer inspected source and test cases; these suite results are attributed to their runners. The 500-plus-session test exercises aggregate reads and card pagination, not a measured production-scale backfill. Dedicated maximum-fanout/byte-limit load measurement and every possible Timeclock transition interleaving are not established by those tests.

Development synchronization, live synthetic multi-role rehearsal, phone/desktop and light/dark visual checks remain distinct evidence steps owned by the integration agent. There is no production deployment, real signing approval, final visual approval or full G4/G5 completion implied by this document.



