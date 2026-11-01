# New Event setup steps — November 1, 2026

Released through PR #59 (`feature/new-event-setup-steps`, source `6bae22a`), merged as main `d8f1464` on November 1, 2026.

## Scope

- The New Event wizard has three optional steps after “Who’s going”: Time slots (only when students pick shifts), Signup questions, and Things students must do. Each has “Skip for now”; skipping removes only unfinished items after an in-app confirmation.
- Time slots: generator, single-slot entry, overlap warnings, most/fewest per student.
- The Review step lists every slot, question, requirement and the participant limit, flags invalid items with a jump to the step, and lists what to add later on the event page.
- The event page lists custom requirement names and due dates.

## Backend

- No schema change; no index changes.
- `admin:createEvent` accepts optional `shifts` and `questions` and validates `requirements`. Size caps (100 shifts, 25 questions, 100 requirements, 20 options) are checked before any database read; every item is validated before any write, so a bad item rejects the whole create.
- Shared validation moved to `convex/lib/eventSignupExtras.ts` (`cleanShift`, `cleanQuestion`, `checkRequirementFields`); `saveShift` and `saveQuestion` behave as before.

## Order

1. Production Convex `amicable-eel-413` deployed first from exactly `6bae22a` (`bunx convex deploy` as the signed-in CLI user with `CONVEX_DEPLOYMENT=prod:amicable-eel-413`). A dry run first confirmed the target and showed no index deletions. Schema validation passed. The deploy also reported a Node.js action server-version config change. No env vars, data mutations, bootstrap or migrations.
2. `bunx convex function-spec --deployment amicable-eel-413` confirmed `admin:createEvent` has `shifts`, `questions`, `requirements` and `onsite` args.
3. PR #59 merged with a merge commit as main `d8f1464`; this auto-deployed both Workers.

## Validation

- `bun run check` in a clean worktree: lint and typecheck passed; 1178 of 1179 tests passed. The one failure was the known `feeBulk` 30 s timeout, which passes alone (9/9). `bun run build` and `bun run cloudflare:check` passed.
- Security review: GO (no high or medium findings). Testing review findings fixed before release. Synthetic Coach and Travel Lead usability passes on the development deployment.

## Live evidence

- GitHub check-runs on `d8f1464` succeeded for Workers Builds `denham-venom-student-status` and `denham-venom-timeclock`.
- `https://students.team8044.org` returned HTTP 200 and served entry asset `index-D7O2PQwX.js` (previously `index-CPNlfPki.js`); the loaded `LiveApp` chunk contains “Skip for now” and “Things students must do”.

## Limits and rollback

- Signed-in production walkthrough was not done (VERIFY). Worker version IDs were not recorded (VERIFY).
- Low: `createEvent` derives requirement keys from names and does not apply `saveRequirement`'s short-key rule.
- Restore previous Worker versions only after confirming their IDs in Cloudflare (VERIFY). The backend change is additive (optional args); the previous frontend keeps working against it.
