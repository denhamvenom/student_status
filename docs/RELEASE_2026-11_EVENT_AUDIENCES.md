# Release runbook: event audiences, Mentor invitations and recurring meetings (November 2026)

Status: **runbook only — not deployed.** Production actions need the owner's explicit approval for this release. Nothing here authorizes a deploy, and old receipts do not either. When the release is done, record what actually happened in a receipt in `docs/releases/`.

Behavior reference: [EVENT_AUDIENCES_AND_SERIES.md](EVENT_AUDIENCES_AND_SERIES.md) and [EVENT_CALENDAR_SYNC.md](EVENT_CALENDAR_SYNC.md) (section "Recurring series (RRULE)"). Deploy rules: [DEPLOYMENT.md](DEPLOYMENT.md).

## 1. What's shipping

- **Event audiences:** "Who is this event for?" (Everyone, Subteams, Specific students, Mentors only) plus "Is this event required?". Stored as `audienceKind`, `audienceSubteams` and `mandatory`, mapped onto the existing `signupMode`/`assignmentScope`. Legacy events are read through `resolveAudience` and are not rewritten.
- **Student groups:** secondary subteam (`CAD`) and a Leadership flag. A Coach or a non-parent Travel Lead can set them. The change syncs the student into or out of future required subteam events.
- **Mentor subteams:** only a Coach can set them, on `/adults`. They are used only for inviting Mentors by subteam.
- **Mentor invitations:** individual or by subteam, at creation and afterwards. Mentors see and answer their own invitations at `/invited`.
- **Virtual (Discord) location type:** the server forces no permission form, no overnight, no rooming and no travel.
- **Team Calendar choice per event:** create, connect existing, or don't add. Team meetings default to "Don't add".
- **Recurring meetings (`eventSeries`):** weekly rule in America/Chicago with a rolling 56-day window. You can edit or cancel one meeting, or this and following meetings (a split). A series can optionally have its own Google recurring master.
- **Import an existing Google series (Coach only):** Events › ⋯ More › **Import from Team Calendar**. It makes no Google write and keeps Tuesday Timeclock history attached.
- **New daily cron:** "extend recurring meetings" (`15 10 * * *` UTC → `eventSeries.tick`).
- **Related UI in the same working tree:** events list and page header/edit actions, Student Home agenda/Next up card, Parent Home forms summary, roster filter, staff and parent setup skip (7 days per account per device).

## 2. Schema changes

I checked these against `git diff convex/schema.ts` (base `main` 53180bb). Every change is additive.

**New fields on existing tables (all `v.optional`):**

| Table | Fields |
| --- | --- |
| `appUsers` | `subteams` |
| `students` | `secondarySubteam`, `leadership` |
| `events` | `audienceKind`, `audienceSubteams`, `mandatory`, `locationType`, `seriesId`, `seriesOccurrenceKey`, `seriesDetached` |

No required field was added, and no field, table or index was removed.

**New tables:** `eventSeries` (indexes `by_seasonId_and_status`, `by_status_and_generatedThrough`, `by_calendarMasterId`), `eventSeriesCalendarClaims` (`by_calendarMasterId`, `by_seriesId`), `eventMentorInvites` (`by_eventId`, `by_eventId_and_mentorUserId`, `by_mentorUserId_and_status`) and `eventAudienceStudents` (`by_eventId`, `by_eventId_and_studentId`).

**New indexes on an existing table (`events`):** `by_seriesId_and_seriesOccurrenceKey`, `by_seasonId_and_audienceKind_and_archived_and_startsAt` and `by_seasonId_audienceKind_signupMode_archived_startsAt`.

**Staged indexes:** not needed. `convex/_generated/ai/guidelines.md` recommends `staged: true` only for an index on a *large* existing table, where the backfill could block the deploy. `events` is a one-team table that previous releases indexed in normal deploys (for example 2026-10-27 and 2026-10-28). The new tables start empty. If the production dry run shows an unexpectedly long index backfill, stop and switch to staged indexes in a separate change.

**Data backfill:** none. Legacy events resolve their audience at read time, and the new tables start empty.

## 3. Pre-flight checklist

- [ ] **Owner approval** for this exact scope: production Convex deploy, merge to `main` (which auto-publishes both Workers), and the Coach import step.
- [ ] **Key rotation done by the owner:** the development `DEVELOPER_SIGN_IN_KEY` follow-up in HANDOFF.md / the 2026-11-02 receipt. This is development only; confirm it is closed and do not record the value.
- [ ] **Fixed source revision:** the sprint work is currently uncommitted on local `main`. Commit it to a feature branch/PR and deploy Convex from a clean worktree at that exact commit, as previous receipts did.
- [ ] `bun run check` green in that clean worktree. Expected exception: known load timeouts that pass alone (see the check results below).
- [ ] `bun run check:timeclock`, because the Calendar and schema contracts are shared.
- [ ] `bun run cloudflare:check` and `bun run cloudflare:timeclock` succeed.
- [ ] Record the current Worker version IDs for both Workers and the current production Convex code baseline, for rollback (VERIFY).
- [ ] **Environment variables used by the new code (names only).** No new file reads `process.env` directly. Series Calendar code reuses `convex/eventCalendar.ts` helpers, which read:
  - `TIMECLOCK_CALENDAR_ID`
  - `TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL`
  - `TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY`
  - `STUDENT_STATUS_CALENDAR_WRITE_ENABLED`
  - `CONVEX_CLOUD_URL` (built-in)

  All of these already exist on production from the October 19 Calendar release (VERIFY with `env list` names only; never print values). **No new env var is required.** Import from Team Calendar works without write enablement, because it only reads.
- [ ] Frontend builds use the production public `VITE_CONVEX_URL` (Workers Builds setting; VERIFY). No server secret goes in VITE variables.

### Non-production check results (this runbook's author, Windows, shared dirty checkout, 2026-11-04)

| Check | Result |
| --- | --- |
| `bun run lint` | Pass |
| `bun run typecheck` | Pass |
| `bun run test` | 1929 of 1934 passed. All 5 failures were 5000 ms timeouts in `bulkInvites`, `feeBulk` (2), `financeExport` and `seasonTransition`. Rerunning those 4 files alone: 44/44 passed. These are the known load timeouts. |
| `bun run build` | Pass (only the usual >500 kB chunk warning) |
| `bun run cloudflare:check` | Pass (dry run read 50 assets from `dist`; no credentials needed) |
| `bun run check:timeclock` | Pass |
| `bun run cloudflare:timeclock` | Pass (dry run read 7 assets) |

These ran in a shared working tree where other sessions may be editing, not in a clean worktree at a release commit. Repeat them at the release commit.

## 4. Deploy order (Convex first, then Cloudflare)

This follows DEPLOYMENT.md "Prepare an authorized release" and the commands recorded in previous receipts. The backend goes first because the new frontend calls new functions, and the old frontend keeps working against the additive backend (`admin.createEvent` keeps its previous arguments).

1. **Announce and verify the target.** Production Convex is `amicable-eel-413` (VERIFY before every operation). Work from a clean worktree at the release commit.
2. **Convex dry run:** `bunx convex deploy --dry-run` as the signed-in CLI user with `CONVEX_DEPLOYMENT=prod:amicable-eel-413`. Confirm:
   - the target;
   - no index deletions;
   - the 3 new `events` indexes and 4 new tables;
   - the new cron "extend recurring meetings".
3. **Convex deploy:** `bunx convex deploy` with the same `CONVEX_DEPLOYMENT=prod:amicable-eel-413`. Schema validation must pass. Expect no env changes, no migration and no bootstrap.
4. **Confirm the functions:** run `bunx convex function-spec --deployment amicable-eel-413` and check that `eventSeries:*`, `mentorInvites:*`, `studentSubteams:*` and the `adoptGoogleSeries` action are present.
5. **Cloudflare:** merge the PR to `main` with a merge commit. Cloudflare Workers Builds then publishes **both** `denham-venom-student-status` and `denham-venom-timeclock`. Confirm that both build check-runs on the merge commit succeeded.
6. **Live assets:** confirm that `https://students.team8044.org` returns HTTP 200 and serves a new entry asset, and that `timeclock.team8044.org` returns 200.

## 5. Post-deploy steps

1. **Coach imports the Tuesday Google series.** The series is "Team Meeting", repeating every Tuesday from August 25.
   - Path: **Events › ⋯ More › Import from Team Calendar**. Choose the "Team Meeting" series.
   - Timing: **not after 4 PM on a Tuesday.** Avoid the window when that day's meeting is about to run in Timeclock.
   - The import makes no Google write and sends no notifications.
   - Expected result: an `origin: "adopted"` series, with the next 56 days of Tuesdays linked to the existing Google instance IDs. Any Tuesday already connected as a one-off event is converted in place, not duplicated.
   - **Do not** create an app-owned Tuesday series. The duplicate guard should refuse it.
2. **Verify the cron is registered.** In the Convex dashboard (production) › Cron jobs, "extend recurring meetings" should appear at `15 10 * * *` UTC (4:15 AM CST). The next morning, check the logs for a successful `eventSeries:tick` run. A registered cron alone does not prove that it ran (VERIFY).
3. **Tuesday Timeclock check:** after the next Tuesday meeting, confirm that the session attaches to the adopted event, with no duplicate occurrence. Also confirm that Tuesday `timeclockOccurrences` carry `recurringEventId` (VERIFY; not yet checked on live data).
4. **Smoke tests per role** (signed in, read-mostly; don't create real finance or consent writes as evidence):
   - **Coach:**
     - Events list loads, and the ⋯ More menu shows Import.
     - Wizard audience and required steps work.
     - `/adults` shows Mentor subteams.
     - Set one student's secondary subteam/Leadership, then revert it.
     - The imported series shows its meetings.
   - **Travel Lead:**
     - Required Everyone/Subteams are refused with a plain message.
     - Optional events and Mentor invites are allowed.
     - Series import is not available to them (hidden or refused, because it is Coach only).
   - **Mentor:** `/invited` lists only their own invitations (title, time and place only), and accept/decline works.
   - **Student:** Home shows the agenda/Next up. Only events for their audience are visible; subteam- or list-limited optional events stay hidden from non-members.
   - **Parent:** Home and the forms summary load, and only linked students' events show.
5. **Write the receipt** in `docs/releases/`: exact commits, Worker versions, checks, and what was and was not verified.

## 6. Rollback plan

- **Stop on failure.** If validation fails partway, stop the remaining steps and keep all data (DEPLOYMENT.md "Recovery").
- **Frontend:** restore the previous Worker versions for both Workers in Cloudflare, using the IDs recorded in pre-flight (VERIFY). Alternatively, revert the merge on `main`, which republishes. The old frontend works against the additive backend.
- **Backend:** treat it as **forward-fix only** once new data exists. Redeploying the previous Convex code would drop the new tables and fields from the schema. Schema validation is expected to refuse that if any event, series or invite document uses them (VERIFY). Never delete the new data to force a rollback.
- **Calendar:** importing a series makes no Google write. App-created series and splits do write to Google, but only when write enablement is on. Turning `STUDENT_STATUS_CALENDAR_WRITE_ENABLED` off stops **all** app Calendar writes, including single events; that is the owner's decision. Changes already made in Google Calendar are not reversed by any rollback.
- **Cron:** if `eventSeries.tick` misbehaves, ship a forward fix. A series can also end or be cancelled through the app.
- **Not reversible by rollback:** notifications already sent, Mentor invitation answers, enrollments and charges created for required events.

## 7. Known gaps carried forward

From [KNOWN_GAPS.md](KNOWN_GAPS.md) (sprint-relevant rows) and this runbook:

- The Mentor Home is an interim stack; the designed Mentor home page is not built.
- A Travel Lead can add or remove Mentor invitations on Coach-only required events (`mentorInvites.requireInviter`). This is current policy.
- Events list titles are not links, and the only filter is Show canceled.
- Virtual (Discord) events always save with no permission form; this is waiting on an owner decision.
- Tuesday `timeclockOccurrences.recurringEventId` has not been checked against live data (VERIFY).
- Five tests in the full suite time out under load and pass when run alone.
- Carried over from previous releases:
  - no signed-in production walkthrough recorded;
  - Worker version IDs not recorded;
  - attendance breakdown paging and Build columns not checked with real data;
  - Coach Season page overflows at 390px;
  - the Student Home first slide layout issue.
