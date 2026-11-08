# Handoff

November 8, 2026 | main `18ffc06`

## Student Status

- Latest release: the November 2026 audit cleanup, PRs #81–#84 (main `ab7824b`, `4c9894a`, `08eb5e7`, `480b44e`) and receipt PR #85 (`18ffc06`, docs only). Production Convex amicable-eel-413 deployed from main after each code merge (no schema change, 577 to 554 functions); one strict Coach-or-Travel-Lead rule; removing `bulkInvites.previewCode` ends backend compatibility with the pre-2026-10-25 frontend. [Receipt](docs/releases/RELEASE_2026-11-08_AUDIT_CLEANUP.md)
- Team Calendar meetings (PR #80, main `1e9768b`) has no receipt; its code reached production with the November 8 deploys from main. Behavior: [EVENT_CALENDAR_SYNC.md](docs/EVENT_CALENDAR_SYNC.md).
- Earlier releases (Mentor Home, withdrawals, PWA and push, event audiences and others) are in CHANGELOG.md and docs/releases/.

## Timeclock

- Clocking, PIN controls, automatic closing, fixed event roster and historical import are implemented; rollout reached 100%. Calendar checks run at 6 AM/3 PM Central plus manual refresh.
- Early clock-out and PIN group clock-in were released November 4 (PR #69); group clock-in needs `TIMECLOCK_OPERATOR_PIN` on production (VERIFY).
- Timeclock now accepts Coaches, Mentors and Travel Leads (Google or email) and asks for the PIN when entering Group clock-in. [Receipt](docs/releases/RELEASE_2026-11-08_TIMECLOCK_ACCESS_GROUP_PIN.md)

## In progress

- No open pull requests as of `18ffc06`. The shared checkout `student-status-app` is clean and detached at `5971124` (behind main); work happens in worktrees per docs/REPOSITORY.md. Worktrees `wt-calendar-team-meetings` and `wt-handoff-fix` hold already-merged work.

## Owner decisions

- Owner (November 8, 2026): signed-in production walkthroughs are the owner's own routine; do not list them as open items.

## Top open risks

- Worker version IDs for recent releases are not recorded (VERIFY). [Audit receipt](docs/releases/RELEASE_2026-11-08_AUDIT_CLEANUP.md)
- Node actions (push, email) are not confirmed running after the reported Node.js action version change (VERIFY). [Audit receipt](docs/releases/RELEASE_2026-11-08_AUDIT_CLEANUP.md)
- Mentor Home indexes are not confirmed finished backfilling (VERIFY). [Mentor Home receipt](docs/releases/RELEASE_2026-11-07_MENTOR_HOME.md)
- The recurring-meetings cron's first `eventSeries:tick` run is not confirmed (VERIFY). [Event audiences receipt](docs/releases/RELEASE_2026-11-04_EVENT_AUDIENCES.md)
- App install and push have not been tried on a real iPhone or Android phone against production. [PWA receipt](docs/releases/RELEASE_2026-11-02_PWA_PUSH_NOTIFICATIONS.md)
- Recalculate attendance (Coach-only) must run before kickoff (January 9, 2027) and after any kickoff change. [Backlog](docs/BACKLOG.md#product)
- Real PDF signing stays deferred by the owner. [Backlog](docs/BACKLOG.md#securityrecovery)
- Backup/restore has not been proven. [Backlog](docs/BACKLOG.md#securityrecovery)
- The history secret scan and dependency vulnerability inventory have not been done. [Backlog](docs/BACKLOG.md#securityrecovery)
- Full-suite load timeouts (`feeBulk` and others) are an accepted known issue; never present targeted reruns as a clean suite. [Backlog](docs/BACKLOG.md#testing)

## Next

- The owner chooses the next work from BACKLOG: the November 8 persona findings (Product) or the audit's Code health decisions.
