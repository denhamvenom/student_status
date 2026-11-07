# Handoff

November 7, 2026 | main `b790a69`; branch `feat/auto-withdrawal-undo`, PR #73 (withdrawal work, below; main merged in on branch `feat/withdrawals-update`)

## Mentor Home, Mentor meetings and sign-up, Mentor notifications (released)

PR #75 merged as main `b790a69` (head `60e3f1e`). Production Convex amicable-eel-413 deployed from main `b790a69` after the merge (five new indexes, no deletions; about 1.5 minutes between merge and deploy). Workers: student-status `0647a74f-c53d-4043-b0b1-bfa9a85e45a4`, timeclock `a50c91ea-1521-4bdb-a99b-81b312a85263` (rollback `5ab34c28-4f60-4a1b-8da4-c490d3cd2fac` / `5d96036e-16db-43bc-aa5a-7cdd130cac72`). Both sites returned 200 and served the new bundle. Simplified Mentor Home and Schedule tabs, Mentor meetings (optional, 12h cap, creator-only edit/cancel), Mentor self sign-up with drive/hotel answers and series scope, Parents with staff grants as Mentors first, Mentor notifications M1–M5 ("Meetings and events"), Who's here now, Travel Lead My schedule, event-page Mentors section, Created by, one-time optional Team meetings, and the create-a-meeting crash fix. Additive schema (five new indexes, new table `mentorSeriesSignups`). Security reviews: no Medium+ open; tests pass (known `feeBulk` timeout passes alone); persona round 3: all tasks completed. Open: M5 "student dropped out" is wired on the withdrawals branch (below), not released; no real-phone notification test; theme flash. [Release receipt](docs/releases/RELEASE_2026-11-07_MENTOR_HOME.md)

Owner follow-ups (not yet verified): signed-in role walkthroughs (Mentor, Travel Lead, Coach, Parent with staff access, Student, Parent); in the Convex dashboard confirm the five new indexes finished backfilling and that Node actions (push, email) still run, since the deploy also reported an unexplained Node.js action version change (VERIFY); real-phone Mentor notification test.

## Automatic withdrawal, Put back on event, Undo (on development, not in production)

Branch `feat/auto-withdrawal-undo`, commit `c2c571f`, [PR #73](https://github.com/denhamvenom/student_status/pull/73) open against main, not merged. Development Convex synced 2026-11-06 (`bunx convex dev --once` to `third-bandicoot-18`). Production deploy not done (needs owner approval). [Release receipt](docs/releases/RELEASE_2026-11-06_AUTOMATIC_WITHDRAWAL.md)

- A student's withdrawal takes effect immediately (approved $0 `full` row, `autoWithdraw` audit, no Coach digest) only when the event has no fee, no charge with amount owed/applied, no pending request, no room membership/request, no team-transport seat, and is not Whole Team or Coach-assigned. Otherwise it stays pending review.
- Coach/Travel Lead can "Put back on event" (`withdrawals.putBackOnEvent`, Event operations > Signups and capacity > Withdrawn). It does not reverse money (warning shown).
- Student Undo (`withdrawals.undoWithdrawal`) of an automatic withdrawal until the earlier of signup close and event start; max 3 per event; rooms and shifts are not restored; parents cannot undo.
- Shared fail-closed reader `convex/lib/withdrawalState.ts`: more than 100 withdrawal rows for one student/event throws an "Ask a Coach" error, which can block the Coach signups list or that student's Home.
- M5 (main merged in, commit on `feat/withdrawals-update`): a Signed up student leaving a Mentor-created Mentor meeting through a withdrawal (automatic, or approved by a Coach/Travel Lead) queues "Student dropped out" for its creator; Put back on event and a student Undo to Signed up queue "Student signed up" (an Undo back to Pending queues "Signup to approve"). Existing per-actor, per-day dedupe applies, so one Coach approving or putting back several students on one meeting in a day sends that creator one item.
- Schema: `withdrawalRequests` gains optional `priorParticipation`, `reinstatedAt`, `reinstatedBy`, `reinstatedByStudent`. Development schema accepted with existing `withdrawalRequests` rows; production only with owner approval.

Open items:
- Persona checks pending for the withdrawal screens (Student, Coach, Travel Lead); blocked because development Student sign-in needs `DEVELOPER_SIGN_IN_KEY`, which this session did not have. Merge to main and production deploy not done.
- "My attendance" month arrows bug report: likely disabled by design when the season start is in the current or a future month (development active season starts 2027-06-01). `/attendance` (More menu) shows `FamilyAttendanceBreakdown` without arrows; `/attendance/report` is `AttendanceReport`. Disabled arrows are only `opacity-60`, so they look broken. Live repro blocked by the same sign-in issue; production season `startsAt` unverified (VERIFY).
- `convex/feeBulk.test.ts` times out (30s) in the full `bun run check` and `bulkInvites.test.ts` timed out once; both pass in isolation (feeBulk 9/9). Known flakiness, so the full check was not clean.

## Coach email change fix and stable profile edit dialog (released)

PR #71 merged as main `08a5d71` (source `d5427af`). Production Convex amicable-eel-413 deployed first (no schema change, no index deletions). A Coach email change is no longer blocked by an orphan Google sign-in; pending requests still block with clearer messages. The profile edit dialog stays open across the 60s refresh and Adults list reloads. Both sites returned 200 and the new bundle was served. [Release receipt](docs/releases/RELEASE_2026-11-04_PROFILE_EDIT_FIX.md)

Owner follow-up (not yet verified): signed-in production walkthrough of the Coach email change and edit dialog (VERIFY).

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
