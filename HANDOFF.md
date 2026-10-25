# Handoff

October 25, 2026 | Branch: feature/developer-sign-in

## Student Status

Automatic past-event archival is live in [v0.1.0-onboarding.18](https://github.com/denhamvenom/student_status/releases/tag/v0.1.0-onboarding.18), PR38 merge `51ca4d5`. Events and remaining requirements leave Student/Parent views; outstanding balances remain visible. Coaches and Travel Leads can view the archive across seasons.
Production backend and all five public application files were verified after the automatic rollout, with 100% Worker traffic. All 657 tests passed; lint/types, both app builds and synthetic phone/desktop light/dark checks passed. Real-account archive acceptance was not performed. [Release receipt and rollback limits](docs/releases/RELEASE_2026-10-23_EVENT_ARCHIVE.md)
Parent Mentor/Travel Lead grants and role switching are live in PR37 / v0.1.0-onboarding.17; transportation choices and own-transport guards are live in PR36 / v0.1.0-onboarding.16. Their production verification is recorded in docs/releases/.

## Timeclock

Clocking, PIN controls, automatic closing, fixed event roster and historical attendance import remain implemented; Calendar checks run at 6 AM/3 PM Central plus manual refresh.
Owner confirmed device concurrency/reconnection on October 22. This release's automatic Worker rollout reached 100%; the public endpoint returned HTTP 200.

## In progress

Claude Code is now project lead and integration owner (CLAUDE.md mirrors AGENTS.md); Codex sessions are helpers.
Developer sign-in (draft PR #39, branch `feature/developer-sign-in`): six fictional development-only accounts for testing every role without Google. Synced to development `third-bandicoot-18` with the switch and key set and accounts created; all six signed in at phone/desktop sizes in a headless browser. Not merged; production unchanged. Key is in ignored `private-data/`. See docs/DECISIONS.md and docs/DEVELOPMENT.md.
Pre-development baseline (October 25, at `749005e`, development data only): the private claude.ai artifact "Student Status Screen Baseline" holds 185 screens × phone/desktop × light/dark for all six developer accounts, including wizard steps, event states and Rooming. Timeclock and the `?review=` fixtures were out of scope. The owner has the draft "Student Status Language Dictionary" workbook (32 terms, 34 findings, 5,191 extracted strings) for term decisions. Screenshots, workbook and capture scripts are outside Git. Dev Student setup answers were saved with fictional values.
Pre-redesign language work (October 25, all draft PRs, none merged, production unchanged). Approved terms are in docs/LANGUAGE.md. Stack: #39 → #40 typography/US spelling (plus two flaky-test fixes) → #41 page-error boundary + developer Parent verified record, and #42 money, #43 one six-digit invitation code, #44 permission-form messages (Parents no longer see hashes), #45 remaining server messages, each based on #40. Each branch passed `bun run check` on Windows; a local trial merge of all five had one test conflict (resolved) and passed apart from rotating 5–30 s timeouts. Development `third-bandicoot-18` currently runs that unpushed trial merge (local branch `tmp/integration-trial`); all six accounts opened every menu page with no errors at 1440 light and 390 dark, except the known Coach Season overflow. Not done: real Google join with an unconnected account, real email delivery. A per-role dashboard draft for the redesign was given to the owner in chat.
Start the next session on `feature/developer-sign-in` until PR #39 merges.

## Top open risks

- Signed-in transportation walkthrough remains open; archive browser proof used synthetic data. [Testing](docs/BACKLOG.md#testing)
- Real PDF signing remains deferred until separately authorized; backup/restore proof and security reviews remain open. [Security/Recovery](docs/BACKLOG.md#securityrecovery)
- Payment recovery, finance rollback, intermittent-suite reports and the unconfirmed Pay-device issue remain for triage; this release's full suite passed. [Testing](docs/BACKLOG.md#testing)
- Older waitlist, payment replay, event-date and fixture reports still need source triage. [Audit follow-ups](docs/BACKLOG.md#october-18-audit-follow-ups)
- Coach Season overflows at 390px (deferred to the redesign). Slow tests (feeBulk, seasonTransition, calendarRefresh) intermittently hit 5–30 s timeouts in this OneDrive folder. [Testing](docs/BACKLOG.md#testing)

## Next step

Owner: review and merge #39 → #40 → #41–#45 (merge order matters only for #40 first); approve the dashboard draft; answer open items: team report CSV now in dollars (#45), who "Contact the Student Status administrator" means (#45), proposed signed-PDF wording changes (#44, not applied). Then pick a visual direction in Claude Design for the Parent Home dashboard and start the redesign, writing every screen to docs/LANGUAGE.md. The signed-in Coach transportation walkthrough remains open.
