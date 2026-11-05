# Handoff

November 4, 2026 | main `73fae9a`

## Coach profile edit, Timeclock early clock-out and PIN group clock-in, monthly attendance report (released)

PR #69 merged as main `73fae9a` (source `1fcbe7d`). Production Convex amicable-eel-413 deployed first from `1fcbe7d`, adding one index (`parentInvitations.by_parentEmail_and_status`) with no deletions. Workers: student-status `2362b93d-3808-4a59-8b43-13f8ec180c1e`, timeclock `2ebed04d-b623-4d4b-b04c-0d6517a7785e` (rollback `3da2dea9-78bb-4b92-90e7-6658f4d4e741` / `c4478644-fd2c-48c7-9cf6-1c87d04d6d00`). Both sites returned 200 and served the new bundles. [Release receipt](docs/releases/RELEASE_2026-11-04_PROFILE_TIMECLOCK_ATTENDANCE.md)

Owner follow-ups (not yet verified):
- Confirm `TIMECLOCK_OPERATOR_PIN` is set on production; group clock-in fails without it (VERIFY).
- Signed-in production walkthrough: Coach profile and email edit, monthly report as Student and Parent, early clock-out and PIN group clock-in (VERIFY).

## Repeating meetings end date (released)

PR #67 merged as main `1a02e86` (source `fbc16a6`); production Convex deployed first (no schema change). [Release receipt](docs/releases/RELEASE_2026-11-04_SERIES_END_DATE.md)

## Event audiences, subteams, Mentor invitations, virtual events and recurring meetings (released)

PR #65 merged as main `99515ed` (source `e4e7e7a`). Production Convex amicable-eel-413 deployed first from `e4e7e7a` (dry run: 13 new indexes, no deletions, schema valid). Workers: student-status `89e8593b-4884-4153-ad8a-8fd0eeceecb3`, timeclock `d7fdb73e-710c-4aa7-b254-4ec835ae1ada` (rollback `a3c262e4-5a58-4523-a0b1-214a6f01a25d` / `a1312d52-1db1-412e-87ba-8371725c2cc5`). Behavior: [EVENT_AUDIENCES_AND_SERIES.md](docs/EVENT_AUDIENCES_AND_SERIES.md). [Release receipt](docs/releases/RELEASE_2026-11-04_EVENT_AUDIENCES.md)

Owner follow-ups (not yet verified):
- Confirm cron "extend recurring meetings" (`15 10 * * *` UTC) in the production Convex dashboard and the first successful `eventSeries:tick` run in the logs.
- A Coach imports the Tuesday "Team Meeting" series (from August 25) via Events › ⋯ More › Import from Team Calendar, not after 4 PM on a Tuesday; then check the next Tuesday's Timeclock session attaches with no duplicate.
- Signed-in role smoke tests (Coach, Travel Lead, Mentor `/invited`, Student, Parent) per runbook section 5.4.

## PWA install and push notifications (released)

PR #61 merged as main `ccd9145` (commits `6dcc68f`, `604a486`); PR #62 (Home install banner, frontend only) merged as main `ddc3234`. Installable app, service worker, Web Push (VAPID), inbox, per-category preferences, quiet hours, instant triggers, R1–R7 reminders and 5 PM digests. Production Convex deployed first from `604a486` (additive schema, new crons); production VAPID env vars set by the owner. Not verified: real iPhone/Android install and push on production; signed-in production walkthrough; Worker version IDs. [Release receipt](docs/releases/RELEASE_2026-11-02_PWA_PUSH_NOTIFICATIONS.md)

Follow-ups: Inbox items lack an Urgent badge; owner decision on sign-in session length. The development `DEVELOPER_SIGN_IN_KEY` rotation was handled by the owner; virtual events never need permission forms (owner decision, see DECISIONS).

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

- **Next sprint: Mentor home page**, designed like the Parent and Student homes (replaces the interim Mentor Home stack).
- Tighten about 20 pre-existing loose Travel Lead checks (`role === "coach" || travelLead`, which trusts a stored flag on any role) to the canonical rule `coach || (mentor && travelLead)` used by `mentorInvites.requireInviter` (`viewer()` resolves a Parent's selected Travel Lead role to that shape). Lines as of main `99515ed`, in `convex/`:
  - Coach-or-Travel-Lead gates: `app.ts:52,196`; `eventEnrollment.ts:18`; `eventOperations.ts:14`; `lib/eventSignupExtras.ts:22`; `participation.ts:107,167`; `permissionVersions.ts:12`; `rooms.ts:78,219,260,276,306`; `studentHome.ts:289`; `workflowSummaries.ts:9`.
  - Mentor-blocking checks (`mentor && !travelLead`): `app.ts:51,101,126,252`; `announcements.ts:141`; `dashboardReports.ts:39`; `financeDetails.ts:39`.
- Roster bulk edit, and assigning CAD/Leadership from the roster subteam dropdown.
- Student Home wording: the Highlights carousel, FIRST registration and Consent & Release jargon, and the doubled "optional" label on open signups.
- Owner decision: whether a Travel Lead may keep adding/removing Mentor invitations on Coach-only required events (current policy allows it).
- Flaky full-suite load timeouts (`feeBulk`, `bulkInvites`, `financeExport`, `wholeTeam` and others; each passes alone) are an accepted known issue; do not present targeted reruns as a clean full suite.
- Install the app and check push on a real iPhone (Home Screen) and an Android phone against production.

## Top open risks

- Recalculate attendance must be run again after any kickoff change (Coach-only). [Backlog](docs/BACKLOG.md#product)
- Signed-in transportation walkthrough, real PDF signing (deferred), backup/restore proof and security reviews remain open. [Backlog](docs/BACKLOG.md#testing)
- Coach Season overflows at 390px (deferred to its redesign).
