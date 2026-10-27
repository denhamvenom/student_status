# Attendance breakdown release — October 28, 2026

Status: PENDING RELEASE (complete after release).

Scope: PR #50 (`feature/attendance-breakdown`): Required/Other/Outreach meeting breakdown, Build days with Weekday/Weekend split on Attendance, and Home's Required meetings ring. Decisions: [DECISIONS](../DECISIONS.md#attendance-breakdown).

## Schema (additive)

- `events.isOutreach`; `timeclockSessions.requiredOverride`; required/build flags on report-state rows; required on summary rows.
- New indexes: `by_seasonId_and_required`, `by_seasonId_and_outreach_and_required_and_scheduledStart`, `by_seasonId_and_build`, `by_seasonId_and_build_and_scheduledStart`.
- Per-student weekend-minutes aggregate; Required/Other aggregate categories.

## Required order

1. Owner approval.
2. Sync production Convex `amicable-eel-413`.
3. A Coach runs Recalculate attendance while the old frontend is live (Home shows "updating" until it finishes).
4. Merge PR #50; this auto-deploys both Workers.
5. Verify.

## Validation done

- eslint and typecheck clean; 415 related tests pass.
- Full `check`: only intermittent timeouts (feeBulk, financeExport, seasonTransition); each passed on rerun.
- `check:timeclock` and both Cloudflare dry-runs pass.
- Development `third-bandicoot-18` checked as Student, Coach and Travel Lead.

## Validation limits

No real-data paging, weekday/weekend values or team Build columns were seen. Not run on production.

## Worker versions

TODO

## Verification results

TODO

## Rollback

Revert the code; keep the additive schema. Previous Worker versions are recorded in the [Student Home receipt](RELEASE_2026-10-27_STUDENT_HOME.md); confirm they are still the prior versions in Cloudflare.

## Note

Recalculate attendance must be rerun after any kickoff change.
