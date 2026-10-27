# Handoff

October 28, 2026 | Branch: main

## Venom Status (formerly Student Status)

[v0.1.0-onboarding.19](https://github.com/denhamvenom/student_status/releases/tag/v0.1.0-onboarding.19) is live (main `7376a71`). Production backend and both Workers were verified; no real-account production walkthrough or real email send was done. [Release receipt](docs/releases/RELEASE_2026-10-25_VENOM_STATUS.md)

## Timeclock

Clocking, PIN controls, automatic closing, fixed event roster and historical import remain implemented; Calendar checks run at 6 AM/3 PM Central plus manual refresh. Rollout reached 100%.

## Student Home (released)

Student Home redesign, Student shell, pinned announcements and build hours target are live: PR #48 merged as main `6937fa2` (source head `d89ded8`); production Convex synced first (additive schema). Not verified: signed-in production walkthrough; Worker version IDs not recorded. [Release receipt](docs/releases/RELEASE_2026-10-27_STUDENT_HOME.md)

## Attendance breakdown (released)

PR #50 merged as main `7c14129` (source head `637353f`); production Convex synced first (additive schema) and both Workers built. Home ring and Attendance tiles show "updating" until a Coach runs Recalculate attendance. Not verified: signed-in production walkthrough. [Release receipt](docs/releases/RELEASE_2026-10-28_ATTENDANCE_BREAKDOWN.md)

## Next

Coach runs Recalculate attendance on production, real-data check of the attendance breakdown, close PR #49 as superseded, remove helper worktrees `student-status-sh-d`…`sh-j`, then start Parent Home.

## Top open risks

- Recalculate attendance must be run by a signed-in Coach on production (Coach-only) now, and again after any kickoff change. [Backlog](docs/BACKLOG.md#product)
- Signed-in transportation walkthrough, real PDF signing (deferred), backup/restore proof and security reviews remain open. [Backlog](docs/BACKLOG.md#testing)
- Coach Season overflows at 390px (deferred to its redesign).

## Next step

A Coach runs Recalculate attendance on production (Coach-only), then check real data, close PR #49 as superseded, remove helper worktrees `student-status-sh-d`…`sh-j`, then begin Parent Home.
