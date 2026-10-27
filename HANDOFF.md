# Handoff

October 26, 2026 | Branch: docs/release-2026-10-25 (from main 7376a71)

## Venom Status (formerly Student Status)

[v0.1.0-onboarding.19](https://github.com/denhamvenom/student_status/releases/tag/v0.1.0-onboarding.19) is live (main `7376a71`): Venom Status name, plain-language messages ([docs/LANGUAGE.md](docs/LANGUAGE.md)), one six-digit invitation code, Coach-only Contact admin, page-level error boundary, development-only developer sign-in.
Production backend and both Workers were verified, and the live files match the local production build. No real-account production walkthrough, real Google join with a code, or real email send was done. [Release receipt](docs/releases/RELEASE_2026-10-25_VENOM_STATUS.md)

## Timeclock

Clocking, PIN controls, automatic closing, fixed event roster and historical attendance import remain implemented; Calendar checks run at 6 AM/3 PM Central plus manual refresh. This release's Timeclock rollout reached 100% and returned HTTP 200.

## In progress

Claude Code is project lead and integration owner; Codex sessions are helpers.
Frontend redesign: a simpler bento interface with a dashboard per audience and details revealed on tap. Owner decisions are in docs/DECISIONS.md "Redesign dashboards"; every redesigned screen is written to docs/LANGUAGE.md.
The owner chose **Student Home first** (students see it soonest), then Parent Home. Paste-ready Claude Design briefs, before screenshots and logos are outside Git in `Logistics Work\Claude Design Pack - Student Home` and `...\Claude Design Pack - Parent Home`. The owner is now trying 2–3 visual directions in Claude Design.
Developer sign-in works only on development `third-bandicoot-18` (key in ignored `private-data/`; see docs/DEVELOPMENT.md). Current screenshots of every role are in ignored `test-results/smoke`.

## Top open risks

- **Exposed key fragments (October 25):** part of JWT_PRIVATE_KEY or TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY was printed into a working session (not published). Rotation awaits the owner's decision. Never list production settings with `cut`; list names only or use the dashboard.
- Outstanding five-digit invitation codes stay valid until they expire (low risk).
- Contact admin email has not been sent for real; one dev test send awaits owner approval.
- Signed-in transportation walkthrough, real PDF signing (deferred), backup/restore proof and security reviews remain open. [Backlog](docs/BACKLOG.md#testing)
- Heavy tests (feeBulk, bulkInvites, financeExport, seasonTransition, calendarRefresh) time out intermittently in full runs in this OneDrive folder. [Testing](docs/BACKLOG.md#testing)
- Coach Season overflows at 390px (deferred to the redesign).

## Next step

When the owner brings back the chosen Claude Design direction, build Student Home on a new branch from main against development, with before/after screenshots (phone/desktop, light/dark) from the six developer accounts. No production action without the owner's explicit approval.
