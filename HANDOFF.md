# Handoff

November 8, 2026 | main `18ffc06`

## Student Status

- Latest release: the November 2026 audit cleanup, PRs #81–#84 (main `ab7824b`, `4c9894a`, `08eb5e7`, `480b44e`) and receipt PR #85 (`18ffc06`, docs only). Production Convex amicable-eel-413 deployed from main after each code merge (no schema change, 577 to 554 functions); one strict Coach-or-Travel-Lead rule; removing `bulkInvites.previewCode` ends backend compatibility with the pre-2026-10-25 frontend. [Receipt](docs/releases/RELEASE_2026-11-08_AUDIT_CLEANUP.md)
- Team Calendar meetings (PR #80, main `1e9768b`) has no receipt; its code reached production with the November 8 deploys from main. Behavior: [EVENT_CALENDAR_SYNC.md](docs/EVENT_CALENDAR_SYNC.md).
- Earlier releases (Mentor Home, withdrawals, PWA and push, event audiences and others) are in CHANGELOG.md and docs/releases/.

## Timeclock

- Clocking, PIN controls, automatic closing, fixed event roster and historical import are implemented; rollout reached 100%. Calendar checks run at 6 AM/3 PM Central plus manual refresh.
- Early clock-out and PIN group clock-in were released November 4 (PR #69); group clock-in needs `TIMECLOCK_OPERATOR_PIN` on production (VERIFY).

## In progress

- No open pull requests as of `18ffc06`. The shared checkout `student-status-app` is clean and detached at `5971124` (behind main); work happens in worktrees per docs/REPOSITORY.md. Worktrees `wt-calendar-team-meetings` and `wt-handoff-fix` hold already-merged work.

## Owner decisions

- Owner (November 8, 2026): signed-in production walkthroughs are the owner's own routine; do not list them as open items.

## Top open risks

- Unconfirmed production checks (VERIFY): Worker version IDs for recent releases; Node actions (push, email) still run after the reported Node.js action version change; Mentor Home indexes finished backfilling; recurring-meetings cron ran `eventSeries:tick`. Details in the [Mentor Home](docs/releases/RELEASE_2026-11-07_MENTOR_HOME.md) and [event audiences](docs/releases/RELEASE_2026-11-04_EVENT_AUDIENCES.md) receipts.
- App install and push have not been tried on a real iPhone or Android phone against production. [PWA receipt](docs/releases/RELEASE_2026-11-02_PWA_PUSH_NOTIFICATIONS.md)
- Recalculate attendance (Coach-only) must run before kickoff (January 9, 2027) and after any kickoff change. [Backlog](docs/BACKLOG.md#product)
- Real PDF signing stays deferred by the owner; backup/restore proof, security reviews and the development transportation walkthrough remain open. [Backlog](docs/BACKLOG.md#testing)
- Full-suite load timeouts (`feeBulk` and others) are an accepted known issue; never present targeted reruns as a clean suite. [Backlog](docs/BACKLOG.md#testing)
- Coach Season overflows at 390px (deferred to its redesign). [Known gaps](docs/KNOWN_GAPS.md)

## Next

- The owner chooses the next work from BACKLOG: the November 8 persona findings (Product) or the audit's Code health decisions.
