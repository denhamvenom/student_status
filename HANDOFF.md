# Handoff

October 25, 2026 | Branch: docs/release-2026-10-25 (from main 7376a71)

## Venom Status (formerly Student Status)

[v0.1.0-onboarding.19](https://github.com/denhamvenom/student_status/releases/tag/v0.1.0-onboarding.19) is live (PR39–PR47, main `7376a71`):
- App renamed Venom Status for people; repository, Convex project, Workers and domains keep their names.
- Plain-language messages written to [docs/LANGUAGE.md](docs/LANGUAGE.md).
- One six-digit invitation code.
- Coach-only Contact admin button (emails admin@team8044.org).
- Page-level error boundary.
- Development-only developer sign-in.

Production backend and both Workers were verified, and the live files match the local production build. No real-account production walkthrough, real Google join with a code, or real email send was done. [Release receipt and rollback limits](docs/releases/RELEASE_2026-10-25_VENOM_STATUS.md)
Earlier releases (archive, parent staff roles, transportation) are recorded in docs/releases/.

## Timeclock

Clocking, PIN controls, automatic closing, fixed event roster and historical attendance import remain implemented; Calendar checks run at 6 AM/3 PM Central plus manual refresh. This release's automatic Timeclock rollout reached 100% and the public endpoint returned HTTP 200.

## In progress

Claude Code is project lead and integration owner (CLAUDE.md mirrors AGENTS.md); Codex sessions are helpers.
Developer sign-in works only on development `third-bandicoot-18` (key in ignored `private-data/`; see docs/DEVELOPMENT.md). The pre-development screen baseline (185 screens) is a private claude.ai artifact; the screenshots, Language Dictionary workbook and capture scripts are outside Git.
The redesign is next: a simpler bento interface, with a dashboard of each audience's most important needs and details revealed on demand. A per-role dashboard draft was given to the owner in chat on October 25 (tiles, urgency rules, needed new queries); its three decisions are recorded in docs/DECISIONS.md "Redesign dashboards". Every redesigned screen is written to docs/LANGUAGE.md.

## Top open risks

- **Exposed key fragments (October 25):** fragments of a production private key were printed into a working session while listing setting names. They came from either JWT_PRIVATE_KEY or TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY; it's unclear which. Nothing was published. Rotation was recommended and awaits the owner's decision. Never list production settings with `cut`; filter to key names only, or use the dashboard.
- Outstanding five-digit invitation codes stay valid until they expire (low guessing risk; replacing them closes it).
- Signed-in transportation walkthrough remains open; archive browser proof used synthetic data. [Testing](docs/BACKLOG.md#testing)
- Real PDF signing remains deferred until separately authorized; backup/restore proof and security reviews remain open. [Security/Recovery](docs/BACKLOG.md#securityrecovery)
- Payment recovery, finance rollback, intermittent-suite reports and the unconfirmed Pay-device issue remain for triage. Heavy tests (feeBulk, bulkInvites, financeExport, seasonTransition, calendarRefresh) time out intermittently in full runs in this OneDrive folder. [Testing](docs/BACKLOG.md#testing)
- Coach Season overflows at 390px (deferred to the redesign).

## Next step

Owner:
- Decide on key rotation.
- Approve one real Contact admin test email, if wanted.
- Pick a visual direction in Claude Design for the Parent Home dashboard.

Then start the redesign on a new branch from main.
