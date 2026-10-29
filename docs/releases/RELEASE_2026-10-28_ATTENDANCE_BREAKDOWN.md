# Attendance breakdown release — October 28, 2026

Status: RELEASED — October 28, 2026. PR #50 merged to main `7c14129` (source head `637353f`).

Scope: PR #50 (`feature/attendance-breakdown`): Required/Other/Outreach meeting breakdown, Build days with Weekday/Weekend split on Attendance, and Home's Required meetings ring. Decisions: [DECISIONS](../DECISIONS.md#attendance-breakdown).

## Schema (additive)

- `events.isOutreach`; `timeclockSessions.requiredOverride`; required/build flags on report-state rows; required on summary rows.
- New indexes: `by_seasonId_and_required`, `by_seasonId_and_outreach_and_required_and_scheduledStart`, `by_seasonId_and_build`, `by_seasonId_and_build_and_scheduledStart`.
- Per-student weekend-minutes aggregate; Required/Other aggregate categories.

## Release sequence (as executed)

1. Owner approval.
2. Production Convex `amicable-eel-413` synced: schema validated, no indexes deleted. Added `timeclockSessionReportStates` indexes `by_seasonId_and_build`, `by_seasonId_and_build_and_scheduledStart`, `by_seasonId_and_outreach_and_required_and_scheduledStart`, `by_seasonId_and_required`. `attendanceBreakdown`, `attendanceSessions` and `homeAttendance` are present.
3. PR #50 merged immediately after the sync. The planned Coach Recalculate before the merge was skipped by owner decision.
4. Both Workers auto-deployed from `7c14129`.

A Coach ran Recalculate attendance on production (owner-confirmed October 28/29, 2026).

## Validation done

- eslint and typecheck clean; 415 related tests pass.
- Full `check`: only intermittent timeouts (feeBulk, financeExport, seasonTransition); each passed on rerun.
- `check:timeclock` and both Cloudflare dry-runs pass.
- Development `third-bandicoot-18` checked as Student, Coach and Travel Lead.

## Validation limits

No real-data paging, weekday/weekend values or team Build columns were seen. Not run on production.

## Worker versions

Both Cloudflare Workers Builds for `7c14129` succeeded:

- `denham-venom-student-status`: `2662a930-f0b1-4201-ae7b-400231b25c85`
- `denham-venom-timeclock`: `b026a47f-78f3-4a95-965f-66f3cf2a6668`

## Verification results

- `students.team8044.org` and `timeclock.team8044.org` returned HTTP 200 unauthenticated.
- Entry bundles reference `amicable-eel-413.convex.cloud`.
- The LiveApp chunk contains "Required meetings", "Other meetings" and "Outreach event".

Limits: no signed-in production walkthrough; paging, Weekday/Weekend values and team Build columns not yet checked with real data.

## Rollback

Roll back to the previous Worker versions (student-status: see the [Student Home receipt](RELEASE_2026-10-27_STUDENT_HOME.md); timeclock: code unchanged) and keep the additive schema. Confirm in Cloudflare that they are still the prior versions.

## Note

Recalculate attendance must be rerun after any kickoff change.
