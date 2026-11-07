# Mentor Home, Mentor meetings and sign-up, Mentor notifications — November 7, 2026

> **Not yet released — awaiting owner approval.** This is a pre-release receipt for a release candidate. Nothing below has been pushed, deployed to production or merged. Production facts are marked (VERIFY) and must be filled in from the actual release.

Release candidate on branch `feat/mentor-home` (commits `627fd29` Mentor Home, meetings, sign-up and notifications; `e112893` round 2; `4739f72` round 3), based on main `851d6ad`. PR, merge commit and Worker versions: (VERIFY). Behavior: [EVENT_AUDIENCES_AND_SERIES.md](../EVENT_AUDIENCES_AND_SERIES.md) (Mentor sections).

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

## Release order (project order: backend first)

Each step needs explicit owner approval. Use a clean worktree at the exact reviewed source commit.

1. **Record the rollback baseline:** current Worker versions for `student-status` and `timeclock` in Cloudflare, and the current production Convex source (last recorded: `d5427af`, PR #71) (VERIFY).
2. **Push the branch and open the PR** with the validation evidence below (owner approval).
3. **Production Convex first, dry run:** `bunx convex deploy --dry-run` against production `amicable-eel-413` from the release source. Confirm the target, five new indexes, **no index deletions** and a valid schema (VERIFY).
4. **Production Convex deploy:** `bunx convex deploy` against `amicable-eel-413` from the same source. In the dashboard, confirm the new indexes finished backfilling and are ready, and no errors in recent logs (VERIFY).
5. **Merge to main** (merge commit). Cloudflare Workers Builds publish both Workers (Student Status and Timeclock); confirm both builds succeeded, both sites return 200 and the new bundle is served (VERIFY).
6. **Post-deploy checks per role** (signed in, read-mostly; synthetic or owner-approved test meetings only):
   - **Mentor:** Home shows next event, Who's here now and answers needed; Schedule tabs (Going, Join, Created by me); create a one-time optional meeting, edit and cancel it; sign up for an event with drive/hotel questions; series sign-up (every / just this one / next N), skip and leave; Notification settings list "Meetings and events".
   - **Travel Lead:** My schedule on Home; event page Mentors section with totals and answers; Created by and the Mentor meeting tag.
   - **Coach:** New Event and `+ Team meeting` create without a crash; Team meeting defaults one-time and optional; Mentors section and Created by on the event page.
   - **Parent with staff access (Mentor or Travel Lead grant):** sees Mentor Home and can sign up; as Travel Lead sees Mentor answers; Parent pages unchanged.
   - **Student:** Home and Events unchanged; a Mentor meeting for their subteam appears as an optional event.
   - **Parent (smoke):** Parent Home loads; no Mentor features shown.
7. **Record** PR, merge commit, Worker versions, dry-run output and check results here, and remove the "Not yet released" banner.

## Validation (on the branch, development deployment)

- Security reviews of the Mentor meeting, sign-up, Home, Who's here now and notification paths: findings fixed; **no Medium or higher finding open**. Low items are listed under Known gaps.
- Tests: lint, typecheck and the test suite pass. The only full-suite failure was the known `feeBulk` load timeout, which passes alone (accepted known issue; not a clean full-suite result). Exact counts at the final commit are not recorded here; add them to the PR.
- Persona passes round 3 (Mentor, Travel Lead, Coach, Parent with staff access, Student, Parent) on the development deployment: **all tasks completed**.
- Production dry run: not yet run (VERIFY).

## Known gaps

- **M5 "student dropped out"** (`studentLeft`) is defined but waits on the owner's withdrawals branch to fire.
- Mentor notifications have not been tested on real phones (iPhone Home Screen app, Android).
- A short theme flash can show on load.
- Low items (follow-ups in [BACKLOG.md](../BACKLOG.md#product)): a one-time meeting can't be changed to repeat; the Join list has no filter or search; the series row wording when already signed up; Mentor drive/hotel answers are not yet used by Transport or Rooming planning; a Travel Lead without a subteam sees an empty Who's here now; no greeting/date heading on Mentor Home; no Coach team-wide Mentor overview; the creator's role label is taken at read time, not at creation.
- No signed-in production walkthrough yet for any role (VERIFY).

## Limits and rollback

- **Frontend:** restore the rollback Worker versions recorded in step 1, or revert the merge on main. The previous frontend works against the additive backend (it ignores the new fields, table and category).
- **Backend:** forward-fix only once new data exists; never delete Mentor meetings, sign-ups or answers to force a rollback. To stop Mentor meeting creation quickly, ship a forward fix that refuses `mentorMeetings.createMeeting` for Mentors.
- **Not reversible:** notifications already sent, Mentor meetings created and their student sign-ups, Mentor sign-ups and answers.
- Carried forward: see [KNOWN_GAPS.md](../KNOWN_GAPS.md) and [HANDOFF.md](../../HANDOFF.md) (loose Travel Lead checks, Travel Lead invites on Coach-only events, Student Home wording, flaky full-suite timeouts).
