# Event signups, shifts and Fundraisers — October 30, 2026

Released through PR #57 (`feature/event-signups-shifts-fundraisers`, source `e51ed7e`), merged as main `e8e18d8` on October 30, 2026.

## Scope

- Event signup questions that students answer while signing up.
- Event shifts with a minimum and maximum per student, per-shift capacity, a shift generator, a roster and CSV export.
- Fundraiser event type.
- On site events display as “DSHS STEM Center (on site)”.
- The ride option is labeled “Provide your Own Ride”.
- Step-by-step student signup wizard.
- Parent time-slot view of a student’s shifts.

## Backend

- Additive schema: new tables `eventQuestions`, `eventQuestionAnswers`, `eventShifts` and `shiftSignups`; new optional `events` fields `shiftsEnabled`, `minShiftsPerStudent`, `maxShiftsPerStudent` and `onsite`; `Fundraiser` added to `events.type`. No index deletions. No env vars and no data mutations.
- New modules `convex/eventQuestions.ts` and `convex/eventShifts.ts`; `admin:createEvent` accepts `onsite` and `shiftsEnabled`.

## Order

- Production Convex `amicable-eel-413` presence was verified read-only on November 1, 2026 (`bunx convex function-spec` / `data --deployment amicable-eel-413`): modules `eventQuestions` and `eventShifts`, the four new tables, and `admin:createEvent` with `onsite` and `shiftsEnabled` args.
- The deploy timestamp and actor were not recorded, so whether Convex deployed before the merge is unknown (VERIFY).

## Validation

- `bun run check`: lint and typecheck passed; 1149 of 1150 tests passed. The one failure was the known `feeBulk` 30 s timeout, which passes alone (9/9). Production build passed.
- `bun run cloudflare:check` and `git diff --check` passed.
- Security review: GO. Synthetic-persona usability pass on the development deployment.

## Live evidence

- GitHub check-runs on `e8e18d8` succeeded for Workers Builds `denham-venom-student-status` and `denham-venom-timeclock`.
- `https://students.team8044.org` served entry asset `index-CPNlfPki.js`.

## Limits and rollback

- Signed-in production walkthrough was not done (VERIFY). Worker version IDs were not recorded (VERIFY).
- Signup took about 10 s on development; to investigate.
- The DST fall-back ambiguous hour is not handled specially for shift times.
- Parents cannot see a student’s signup answers.
- Restore previous Worker versions only after confirming their IDs in Cloudflare (VERIFY). Keep the additive Convex schema on rollback; do not delete the new tables or fields.
