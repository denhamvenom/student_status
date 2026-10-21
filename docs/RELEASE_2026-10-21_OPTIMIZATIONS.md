# Optimization release - October 21, 2026

Owner approved production release of all reviewed optimizations in PR31. Release identifier: v0.1.0-onboarding.12. Implementation source:14298e3; production baseline:357bd4f (v0.1.0-onboarding.11).

Scope: fewer recurring query refreshes, shared attendance report results, cheaper kiosk status reads, deferred authenticated UI loading, Calendar sync at 6 AM/3 PM America/Chicago with manual Refresh, and memory-only roster snapshots that remain fixed during a selected event. Clock-in/out and device selection stay live. No schema/index/dependency changes or data migration.

Validation: all628 tests across115 files, source lint, strict types and both builds passed. Independent Astra implementation and release reviews found no blockers. Development rehearsal covered two-client clock-in/out and reports, automatic closure, manual refresh/cooldown, and phone/dark/desktop/light layouts. Snapshot tests cover daily/event boundaries, midnight freeze, retry and late responses. Measurement details and limits:USAGE_OPTIMIZATION.md.

Release order: deploy backward-compatible backend to production amicable-eel-413, then merge the exact approved PR head to main to trigger both existing Cloudflare builds. Final merge revision, Worker versions and live checks will be recorded in the GitHub release notes. No real invitation, attendance, financial or consent submission is part of verification.

Rollback baseline: Student Status Worker279082dd-0f64-4ca6-9db2-a3df244ab182; Timeclock91b4231c-ea25-4520-9058-93eddef71c8a. Roll back frontends first while retaining compatible backend endpoints until new clients reload; a hard backend revert can break already-open new clients. No migration reversal is needed, and code rollback does not reverse subsequent user writes.

Operational limits: provider calendar edits/cancellations can wait until the next scheduled/manual sync; known event end times still close automatically. A cron execution delayed beyond its intended local hour is skipped. Calendar automatic sync attempts fall from1,440 to2 daily, plus manual requests; four cheap UTC candidate invocations accommodate DST. Development workload savings are not measured production billing savings. Roster names refresh on page load/event selection and daily while idle; they do not change mid-event.

## Completed execution

PR31 merged at b15db4e46a48806b6f25e5d81414e911ccf155d5, exactly matching the approved release tree. Convex deployed before frontends. Both initial authenticated CLI fallback deployments and subsequent automatic rollouts completed; final versions:a31339f5-3763-4572-8535-a51d41140f8c (Student Status),54630232-0b39-436a-b7c8-ecb512c5996c (Timeclock), each100%. Public pages/scripts and deferred workspace chunk verified200 with production endpoint only. New Timeclock controls/schedule and deferred Student Status bundle confirmed. No production test-data writes.

Immutable v0.1.0-onboarding.12 tag targets the merge SHA. Full timestamps, rollout reconciliation, verification limitations and rollback evidence:https://github.com/denhamvenom/student_status/releases/tag/v0.1.0-onboarding.12. Comparable production usage measurement remains a later follow-up, not a claimed outcome of this release.
