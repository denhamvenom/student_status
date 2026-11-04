# Event audiences, subteams, Mentor invitations, virtual events and recurring meetings — November 4, 2026

Released through PR #65 (`feature/event-audiences-subteams-series`, commits `4460c2d` backend, `0099a40` UI, `e4e7e7a` docs), merged as main `99515ed` on November 4, 2026. Runbook: [RELEASE_2026-11_EVENT_AUDIENCES.md](../RELEASE_2026-11_EVENT_AUDIENCES.md). Behavior: [EVENT_AUDIENCES_AND_SERIES.md](../EVENT_AUDIENCES_AND_SERIES.md).

## Scope

- Event audiences: "Who is this event for?" (Everyone, Subteams, Specific students, Mentors only) and "Is this event required?". Legacy events are read through `resolveAudience` and are not rewritten.
- Student groups: secondary subteam `CAD` and a Leadership flag (Coach or non-parent Travel Lead). Mentor subteams (Coach only, on `/adults`).
- Mentor invitations, individually or by subteam, at creation and afterwards; Mentors answer their own at `/invited`.
- Virtual (Discord) location type: no permission form, overnight, rooming or travel.
- Team Calendar choice per event (create, connect existing, don't add).
- Recurring meetings (`eventSeries`): weekly America/Chicago rule, rolling 56-day window, edit/cancel one meeting or this and following (always a split), optional native Google recurring series.
- Import an existing Google series (Coach only): Events › ⋯ More › Import from Team Calendar; no Google write.
- `+ Team meeting` fast path and the redesigned New Event wizard (audience, where, repeat and review steps); Events list grouped by date; Student Home agenda/Next up; Parent Home forms summary.
- Security hardening: family event projection (`convex/lib/eventProjection.ts`, `familyEvent`), Travel Lead checks on the new code paths (`convex/tests/travelLeadChecks.test.ts`) and consent/projection gap fixes.

## Backend

- Additive schema only. New optional fields on `appUsers`, `students` and `events`; four new tables (`eventSeries`, `eventSeriesCalendarClaims`, `eventMentorInvites`, `eventAudienceStudents`). No backfill.
- New daily cron "extend recurring meetings" (`15 10 * * *` UTC → `eventSeries.tick`), registered in `convex/crons.ts`.
- No new environment variables.

## Order and commands

1. Rollback baseline recorded first (Worker versions below).
2. `bunx convex deploy --dry-run` against production `amicable-eel-413` from the release source `e4e7e7a`: target confirmed; 13 new indexes, no index deletions; schema valid.
3. `bunx convex deploy` against `amicable-eel-413` from `e4e7e7a`: completed with schema validation passing.
4. PR #65 merged with a merge commit as main `99515ed`; Cloudflare Workers Builds published both Workers.

## Versions

| Item | Deployed | Rollback |
| --- | --- | --- |
| Convex production `amicable-eel-413` | source `e4e7e7a` | forward-fix only (see below) |
| Worker `student-status` | `89e8593b-4884-4153-ad8a-8fd0eeceecb3` | `a3c262e4-5a58-4523-a0b1-214a6f01a25d` |
| Worker `timeclock` | `d7fdb73e-710c-4aa7-b254-4ec835ae1ada` | `a1312d52-1db1-412e-87ba-8371725c2cc5` |

## Validation (PR #65, at the final commit)

- `bun run lint`, `bun run typecheck`, `bun run build`, `bun run cloudflare:check` and `bun run check:timeclock` passed.
- `bunx vitest run`: 1965 of 1968 passed. The 3 failures were known 5 s/30 s load timeouts in `bulkInvites`, `feeBulk` and `financeExport`; each file passes alone (29/29, 9/9, 4/4). The owner accepted these as a known issue.
- Production dry run as above.

## Not yet verified

- Cron "extend recurring meetings" visible in the production Convex dashboard, and the first successful `eventSeries:tick` run in the logs (VERIFY).
- The Tuesday "Team Meeting" series has not been imported yet; Tuesday Timeclock sessions attaching to the adopted events and `timeclockOccurrences.recurringEventId` on live data are unchecked (VERIFY).
- No signed-in production walkthrough for any role (VERIFY).

## Owner follow-ups

1. In the production Convex dashboard › Cron jobs, confirm "extend recurring meetings" at `15 10 * * *` UTC; the next morning, confirm a successful `eventSeries:tick` run in the logs.
2. A Coach imports the Tuesday "Team Meeting" series (repeats every Tuesday from August 25) through **Events › ⋯ More › Import from Team Calendar**, **not after 4 PM on a Tuesday**. Do not create an app-owned Tuesday series. After the next Tuesday meeting, confirm the Timeclock session attaches to the adopted event with no duplicate.
3. Role smoke tests (signed in, read-mostly), per runbook section 5.4: Coach, Travel Lead, Mentor (`/invited`), Student and Parent.

## Limits and rollback

- Frontend: restore the rollback Worker versions above in Cloudflare, or revert the merge on main. The old frontend works against the additive backend.
- Backend: forward-fix only once new data exists; never delete the new data to force a rollback. Import makes no Google write; app-created series and splits write to Google only while `STUDENT_STATUS_CALENDAR_WRITE_ENABLED` is on.
- Not reversible: notifications already sent, Mentor invitation answers, enrollments and charges created for required events.
- Carried forward: see [KNOWN_GAPS.md](../KNOWN_GAPS.md) and [HANDOFF.md](../../HANDOFF.md) (Mentor home page, loose Travel Lead checks, Travel Lead invites on Coach-only events, student home wording, flaky full-suite timeouts).
