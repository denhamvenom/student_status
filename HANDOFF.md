# Handoff

October 27, 2026 | Branch: feature/student-home-redesign (from main 7376a71)

## Venom Status (formerly Student Status)

[v0.1.0-onboarding.19](https://github.com/denhamvenom/student_status/releases/tag/v0.1.0-onboarding.19) is live (main `7376a71`). Production backend and both Workers were verified; no real-account production walkthrough or real email send was done. [Release receipt](docs/releases/RELEASE_2026-10-25_VENOM_STATUS.md)

## Timeclock

Clocking, PIN controls, automatic closing, fixed event roster and historical import remain implemented; Calendar checks run at 6 AM/3 PM Central plus manual refresh. Rollout reached 100%.

## In progress

Student Home redesign (Claude Design "Student Home — chosen direction", October 26; newest design folder is the reference). Built and polished locally through `2261a09`, `868fadc`, `046563a`, synced to development `third-bandicoot-18` only, not pushed. Polish includes "Closes today", "Due {Mon D}" within seven days, and the muted desktop second Sign up matching the design. Owner kept "{n} open" badge wording; key fragments will not be rotated. References: docs/DECISIONS.md "Redesign dashboards", docs/LANGUAGE.md, docs/DEVELOPMENT.md "Student Home scenarios".
Live scenarios passed at 390/1440 in light/dark on development. `bun run check` passed except intermittent heavy timeouts in bulkInvites and feeBulk (each passes alone); `bun run check:timeclock` passed. Contact admin test send will not be done.
Then: obtain owner approval for push/PR/merge; after merge, remove helper worktrees `student-status-sh-d`…`sh-j`, then start Parent Home.

## Top open risks

- Build hours need a signed-in Coach to click Recalculate attendance once on production before kickoff (Coach-only action). [Backlog](docs/BACKLOG.md#product)
- Signed-in transportation walkthrough, real PDF signing (deferred), backup/restore proof and security reviews remain open. [Backlog](docs/BACKLOG.md#testing)
- Coach Season overflows at 390px (deferred to its redesign).

## Next step

Get owner approval for push/PR/merge. After merge, remove helper worktrees `student-status-sh-d`…`sh-j`, then begin Parent Home. A signed-in Coach still needs to recalculate attendance once on production.
