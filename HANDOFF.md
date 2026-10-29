# Handoff

October 29, 2026 | main `2449718`: Parent permission signing switch released via PR #54; production defaults Off, hiding parent sign prompts until a Coach or Travel Lead turns it On. [Release receipt](docs/releases/RELEASE_2026-10-29_PERMISSION_SIGNING_SWITCH.md)

October 28, 2026 | main `bcda86a`

## Parent Home (released)

Parent Home and Coach announcement audiences (Students, Parents, Both) are live: PR #52 merged as main `bcda86a` (source head `1b43843`); production Convex synced first (additive optional `teamAnnouncements.audience`). Not verified: signed-in production walkthrough; permission and balance action links are unit-tested only; Worker version IDs not recorded. [Release receipt](docs/releases/RELEASE_2026-10-28_PARENT_HOME.md)

## Attendance breakdown (released)

PR #50 merged as main `7c14129` (source head `637353f`); production Convex synced first (additive schema). A Coach ran Recalculate attendance on production (owner-confirmed October 28/29, 2026). Not verified: signed-in production walkthrough. [Release receipt](docs/releases/RELEASE_2026-10-28_ATTENDANCE_BREAKDOWN.md)

## Student Home (released)

Student Home redesign, Student shell, pinned announcements and build hours target are live: PR #48 merged as main `6937fa2` (source head `d89ded8`); production Convex synced first (additive schema). Not verified: signed-in production walkthrough; Worker version IDs not recorded. [Release receipt](docs/releases/RELEASE_2026-10-27_STUDENT_HOME.md)

## Timeclock

Clocking, PIN controls, automatic closing, fixed event roster and historical import remain implemented; Calendar checks run at 6 AM/3 PM Central plus manual refresh. Rollout reached 100%.

## Next

A Coach or Parent does a signed-in production check of Parent Home; merge docs PRs #51 and #53; remove helper worktrees `student-status-sh-d`…`sh-j`.

## Top open risks

- Recalculate attendance must be run again after any kickoff change (Coach-only). [Backlog](docs/BACKLOG.md#product)
- Signed-in transportation walkthrough, real PDF signing (deferred), backup/restore proof and security reviews remain open. [Backlog](docs/BACKLOG.md#testing)
- Coach Season overflows at 390px (deferred to its redesign).
