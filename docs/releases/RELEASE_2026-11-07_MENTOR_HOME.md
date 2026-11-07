# Mentor Home, Mentor meetings and sign-up, Mentor notifications — November 7, 2026

> **Released November 7, 2026.** PR #75 merged as main `b790a69`; production Convex deployed from main `b790a69` after the merge (owner process: merge, update main, deploy main). Signed-in role walkthroughs remain owner follow-ups (VERIFY).

Released through PR #75 (`feat/mentor-home`, commits `627fd29`, `e112893`, `4739f72`, docs `60e3f1e`), merged with a merge commit as main `b790a69` (base `851d6ad`). Behavior: [EVENT_AUDIENCES_AND_SERIES.md](../EVENT_AUDIENCES_AND_SERIES.md) (Mentor sections).

## Scope

- **Mentor Home, simplified** per the approved mockup: the next event first, Who's here now, and what needs an answer. The full lists move to a **Schedule** page with tabs (Going, Join, Created by me), reached through **See all**.
- **Mentor meetings for every Mentor:** any Mentor can create a one-time or repeating Team meeting. It is always optional (Everyone with open signup, Subteams, specific students or Mentors only), at most 12 hours long, with no fees, travel, overnight, rooms, permission forms, Team Calendar or required audiences. Only the creator (or a Coach/Travel Lead through their own tools) can edit or cancel it; a Mentor can't change events a Coach or Travel Lead created.
- **Mentor self sign-up** for any upcoming current-season event of any type, except an event for specific subteams that include none of the Mentor's subteams. The wizard asks only "Can you drive students?" (events with travel) and "Do you need a hotel room?" (overnight events). For a repeating series the Mentor picks **every meeting**, **just this one** or **the next N** (1–52), and can **skip** one meeting or **leave** the series.
- **Parents with a Mentor or Travel Lead grant are Mentors first:** they get Mentor Home, meetings, sign-up and Mentor notifications whatever role their session selected; a Parent acting as Travel Lead can see Mentors' sign-up answers. Their Parent data access does not widen.
- **Mentor notifications M1–M5:** M1 schedule changes and cancellations on a meeting the Mentor is on; M2 evening-before reminder (with R1, 6 PM); M3 unanswered invitation three days out (5 PM); M4 new event the Mentor can sign up for; M5 activity on a meeting the Mentor created. M4 and M5 go in the 5 PM summary under a new Mentor-only category **"Meetings and events"** (on by default); Staff no longer controls them.
- **Who's here now:** students of the Mentor's subteams who are clocked in right now (names, subteam, clock-in time only).
- **Travel Lead My schedule:** a My schedule block at the top of the Travel Lead Home.
- **Event page Mentors section** (Coach and Travel Lead): its own section with totals, for example "Mentors · 3 going · 1 waiting · 2 can drive · 1 hotel room", and the invite controls.
- **Created by:** Coaches and Travel Leads see "Created by <name> (<role>)" on the event page; the Events list tags Mentor meetings "Mentor meeting".
- **Team meetings default to one-time and optional:** `+ Team meeting` starts as a one-time, optional meeting; a Coach can still choose Required or Repeat.
- **Competitions & trips grouping:** the Join list groups competitions and overnight trips under **Competitions & trips**; everything else, including Fundraisers, Outreach and Team meetings with travel, under **Meetings & events**. Repeating series show as one entry.
- **Create-a-meeting crash fix:** the Team meeting sheet no longer crashes on create; the same fix covers the Coach/Travel Lead New Event flow.
- Dismissed pinned messages are remembered per signed-in user on a device.

## Backend

Additive schema only (checked against `convex/schema.ts`, `git diff origin/main...HEAD`). No backfill: existing events have no `createdBy` and show no creator.

- `events.createdBy` (optional `appUsers` id) and new index `events.by_createdBy_and_endsAt`.
- New index `eventSeries.by_createdBy_and_status` (the `createdBy` field already existed).
- `eventMentorInvites.source` gains `"self"`; new optional fields `canDriveStudents`, `needsHotelRoom`, `answeredAt` and `seriesSignupId`.
- New table `mentorSeriesSignups` (series, Mentor, status `active`/`left`, scope `all`/`one`/`next`, `count`, `coveredKeys`, `skippedKeys`, answers, timestamps) with three indexes: `by_seriesId_and_status`, `by_mentorUserId_and_status`, `by_seriesId_and_mentorUserId`.
- Notification category `mentorEvents` added to `notificationCategoryValidator` (used by `notifications.category` and `notificationPreferences.disabledCategories`) and to `notificationDigestItems.category`.
- Five new indexes in total; no index or table removed.
- No new crons: the hourly `notification digest` and `notification reminders` crons now also run M2–M5 (comment updated in `convex/crons.ts`). New public modules `mentorHome`, `mentorMeetings` and `mentorClockedIn`.
- No new environment variables. No Timeclock app change; the Timeclock Worker still rebuilds on merge.

## Release record (actual order)

1. **Baseline:** Workers `denham-venom-student-status` `5ab34c28-4f60-4a1b-8da4-c490d3cd2fac` and `denham-venom-timeclock` `5d96036e-16db-43bc-aa5a-7cdd130cac72` (both deployed 2026-11-05 00:57 UTC); production Convex last recorded source `d5427af` (PR #71).
2. **Push and PR #75** opened; the guard hook refused a production deploy from the feature branch, so the owner process was followed: merge, update main, deploy main.
3. **Merge** of PR #75 (merge commit, head `60e3f1e`) as main `b790a69` at about 20:29:57 UTC.
4. **Production Convex dry run and deploy from main `b790a69`** in a clean release worktree (`wt-release`), target `prod:amicable-eel-413`: "No indexes are deleted by this push", schema validation complete. Added exactly the five indexes: `eventSeries.by_createdBy_and_status`, `events.by_createdBy_and_endsAt`, `mentorSeriesSignups.by_mentorUserId_and_status`, `mentorSeriesSignups.by_seriesId_and_mentorUserId`, `mentorSeriesSignups.by_seriesId_and_status`. Functions deployed (finished 20:31:31 UTC). The dry run also listed "Change the server's version for Node.js actions" with no detail; it is not part of this change (no `convex.json` or Convex version change in the diff) (VERIFY in the dashboard that Node actions such as push and email still run).
5. **Window** between the merge and the finished Convex deploy: about 1 minute 34 seconds. The new frontend could call missing Mentor functions only in that window (Student Status build published 20:31:45 UTC, after the deploy started).
6. **Workers Builds** on `b790a69`: Timeclock succeeded 20:30:55 UTC, Student Status succeeded 20:31:50 UTC.

## Versions

| Item | Deployed | Rollback |
| --- | --- | --- |
| Convex production `amicable-eel-413` | source `b790a69` | forward-fix only (additive) |
| Worker `denham-venom-student-status` | `0647a74f-c53d-4043-b0b1-bfa9a85e45a4` | `5ab34c28-4f60-4a1b-8da4-c490d3cd2fac` |
| Worker `denham-venom-timeclock` | `a50c91ea-1521-4bdb-a99b-81b312a85263` | `5d96036e-16db-43bc-aa5a-7cdd130cac72` |

## Post-release checks

- https://students.team8044.org and https://timeclock.team8044.org returned 200.
- Student Status lazy chunk `LiveApp-CEc-6QLI.js` contains "Meetings and events" and "Competitions & trips" (new strings).
- Index backfill state and recent production logs were not reviewed in the dashboard (VERIFY).
- No signed-in production walkthrough for any role: Mentor, Travel Lead, Coach, Parent with staff access, Student, Parent (VERIFY; checklist in the pre-release plan: Mentor Home, Schedule tabs, create/edit/cancel a meeting, sign-up and series scope, Notification settings "Meetings and events", Travel Lead My schedule and Mentors section, Coach New Event and `+ Team meeting`).
## Validation (on the branch, development deployment)

- Security reviews of the Mentor meeting, sign-up, Home, Who's here now and notification paths: findings fixed; **no Medium or higher finding open**. Low items are listed under Known gaps.
- Tests: lint, typecheck and the test suite pass. The only full-suite failure was the known `feeBulk` load timeout, which passes alone (accepted known issue; not a clean full-suite result). Exact counts at the final commit are not recorded here; add them to the PR.
- Persona passes round 3 (Mentor, Travel Lead, Coach, Parent with staff access, Student, Parent) on the development deployment: **all tasks completed**.
- Production dry run: run from main `b790a69` (see Release record).

## Known gaps

- **M5 "student dropped out"** (`studentLeft`) is defined but waits on the owner's withdrawals branch to fire.
- Mentor notifications have not been tested on real phones (iPhone Home Screen app, Android).
- A short theme flash can show on load.
- Low items (follow-ups in [BACKLOG.md](../BACKLOG.md#product)): a one-time meeting can't be changed to repeat; the Join list has no filter or search; the series row wording when already signed up; Mentor drive/hotel answers are not yet used by Transport or Rooming planning; a Travel Lead without a subteam sees an empty Who's here now; no greeting/date heading on Mentor Home; no Coach team-wide Mentor overview; the creator's role label is taken at read time, not at creation.
- No signed-in production walkthrough yet for any role (VERIFY).

## Limits and rollback

- **Frontend:** restore the rollback Worker versions in the Versions table, or revert the merge on main. The previous frontend works against the additive backend (it ignores the new fields, table and category).
- **Backend:** forward-fix only once new data exists; never delete Mentor meetings, sign-ups or answers to force a rollback. To stop Mentor meeting creation quickly, ship a forward fix that refuses `mentorMeetings.createMeeting` for Mentors.
- **Not reversible:** notifications already sent, Mentor meetings created and their student sign-ups, Mentor sign-ups and answers.
- Carried forward: see [KNOWN_GAPS.md](../KNOWN_GAPS.md) and [HANDOFF.md](../../HANDOFF.md) (loose Travel Lead checks, Travel Lead invites on Coach-only events, Student Home wording, flaky full-suite timeouts).
