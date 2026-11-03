# Handoff

November 2, 2026 | main `ddc3234`

## PWA install and push notifications (released)

PR #61 merged as main `ccd9145` (commits `6dcc68f`, `604a486`); PR #62 (Home install banner, frontend only) merged as main `ddc3234`. Installable app, service worker, Web Push (VAPID), inbox, per-category preferences, quiet hours, instant triggers, R1–R7 reminders and 5 PM digests. Production Convex deployed first from `604a486` (additive schema, new crons); production VAPID env vars set by the owner. Not verified: real iPhone/Android install and push on production; signed-in production walkthrough; Worker version IDs. [Release receipt](docs/releases/RELEASE_2026-11-02_PWA_PUSH_NOTIFICATIONS.md)

Follow-ups: Inbox items lack an Urgent badge; rotate the development `DEVELOPER_SIGN_IN_KEY`; owner decisions on sign-in session length and virtual-event permission forms.

## New Event setup steps (released)

PR #59 merged as main `d8f1464` (source `6bae22a`): the New Event wizard adds optional Time slots, Signup questions and Things students must do steps, each with Skip for now; `admin:createEvent` saves them with the event in one mutation. Production Convex deployed first (no schema change). Not verified: signed-in production walkthrough; Worker version IDs. [Release receipt](docs/releases/RELEASE_2026-11-01_NEW_EVENT_SETUP.md)

## Event signups, shifts and Fundraisers (released)

PR #57 merged as main `e8e18d8` (source `e51ed7e`): signup questions, shifts (min/max per student, capacity, generator, roster, CSV), Fundraiser type, student signup wizard and parent time-slot view. Production Convex has the additive schema (verified November 1, 2026; deploy order not recorded). Not verified: signed-in production walkthrough; Worker version IDs. [Release receipt](docs/releases/RELEASE_2026-10-30_EVENT_SIGNUPS.md)

Follow-ups:
- Profile setup prompts reappear (staff skip per page load; Student/Parent setup redirects while the FIRST invite is unavailable). Fix proposed, not implemented.
- Events list title is not clickable and has no filters.
- Slow `signUp` (about 10 s on development) to investigate.
- DSHS STEM Center address and drop-off note not added.

## Permission signing switch (released)

Parent permission signing switch is live: PR #54 merged as main `2449718`; production defaults Off, hiding parent sign prompts until a Coach or Travel Lead turns it On. Release docs PR #55 merged as main `316039e`. [Release receipt](docs/releases/RELEASE_2026-10-29_PERMISSION_SIGNING_SWITCH.md)

## Parent Home (released)

Parent Home and Coach announcement audiences (Students, Parents, Both) are live: PR #52 merged as main `bcda86a` (source head `1b43843`); production Convex synced first (additive optional `teamAnnouncements.audience`). Not verified: signed-in production walkthrough; permission and balance action links are unit-tested only; Worker version IDs not recorded. [Release receipt](docs/releases/RELEASE_2026-10-28_PARENT_HOME.md)

## Attendance breakdown (released)

PR #50 merged as main `7c14129` (source head `637353f`); production Convex synced first (additive schema). A Coach ran Recalculate attendance on production (owner-confirmed October 28/29, 2026). Not verified: signed-in production walkthrough. [Release receipt](docs/releases/RELEASE_2026-10-28_ATTENDANCE_BREAKDOWN.md)

## Student Home (released)

Student Home redesign, Student shell, pinned announcements and build hours target are live: PR #48 merged as main `6937fa2` (source head `d89ded8`); production Convex synced first (additive schema). Not verified: signed-in production walkthrough; Worker version IDs not recorded. [Release receipt](docs/releases/RELEASE_2026-10-27_STUDENT_HOME.md)

## Timeclock

Clocking, PIN controls, automatic closing, fixed event roster and historical import remain implemented; Calendar checks run at 6 AM/3 PM Central plus manual refresh. Rollout reached 100%.

## Repository cleanup (October 29, 2026)

- Closed draft PRs #2–#9; all their work is in main (PR #6 Timeclock frontend commits match main `59f58d3`, `314a4a9`, `a7aa5e0`).
- Removed sibling worktrees; `student-status-app` is the only checkout. Branches remain on GitHub; operations' uncommitted drafts are on `wip/operations-salvage-2026-10-29` (superseded by main, nothing to port).
- Ignored local files from those worktrees (env settings, test results, release-check scripts, design reference) are archived in ignored `private-data/worktree-archive-2026-10-29/`; `apps/timeclock/.env.local` now exists in this checkout.

## Next

- Sprint 2 (event audiences, subteams including CAD/Leadership, mentor invites, Virtual (Discord) location, recurring meetings) on a new branch off main. Its untracked drafts are in this checkout (`convex/lib/eventAudienceRules*`, `convex/lib/rrule*`, `convex/lib/seriesRecurrence*`, `src/features/event-setup/audience/`) and must use the helpers in `convex/lib/notificationTriggers.ts` and `convex/lib/eventAudience.ts`.
- Install the app and check push on a real iPhone (Home Screen) and an Android phone against production.
- A Coach or Parent does a signed-in production check of Parent Home.

## Top open risks

- Recalculate attendance must be run again after any kickoff change (Coach-only). [Backlog](docs/BACKLOG.md#product)
- Signed-in transportation walkthrough, real PDF signing (deferred), backup/restore proof and security reviews remain open. [Backlog](docs/BACKLOG.md#testing)
- Coach Season overflows at 390px (deferred to its redesign).
