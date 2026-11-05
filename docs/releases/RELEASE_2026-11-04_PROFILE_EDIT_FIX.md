# Release 2026-11-04: Coach email change fix and stable profile edit dialog

Owner authorized the full production release. PR #71 `fix/coach-email-change-orphan-signin`, merged with a merge commit as main `08a5d71` (head `d5427af`, commits `b9c1baa`, `d5427af`). Production baseline before release: main `8a69e85`.

## What shipped
- A Coach email change is no longer blocked by a leftover Google sign-in that has no team account and no pending request; that orphan sign-in is absorbed. Pending requests still block, with clearer messages.
- The profile edit dialog no longer closes on the 60-second record refresh or when the Adults list reloads. It closes only via Cancel, the close button, Escape or a successful save; an outside click does not dismiss it. Save failures also show inside the dialog.
- The Coach student record cache is keyed by studentId.
- No schema change.

## Steps
1. Source checks on `d5427af`, based on origin/main `8a69e85`: `bun run check` (lint, typecheck, build pass; the parallel test run had one known timeout in `convex/feeBulk.test.ts`, which passed alone with `--maxWorkers=1`; 2101/2102 otherwise) and `bun run check:timeclock` passed. Security review: nothing serious.
2. `CONVEX_DEPLOYMENT=prod:amicable-eel-413 npx convex deploy --yes` from `d5427af`: target `amicable-eel-413`, "No indexes are deleted by this push", schema validation complete, functions deployed. Deployed before the merge.
3. PR merged with `--merge --match-head-commit` using the full SHA `d5427af2c20759cdd3d0143ebdb9caff043669f8` (the short SHA is rejected by GitHub). Both Workers Builds checks on `08a5d71` succeeded: Timeclock at 00:55:14 UTC, Student Status at 00:55:53 UTC (2026-11-05).

## Versions
| Item | Deployed | Rollback |
| --- | --- | --- |
| Convex production `amicable-eel-413` | source `d5427af` | forward-fix only (no schema change) |
| Worker `denham-venom-student-status` | build for main `08a5d71` (version ID not recorded, VERIFY) | previous build for main `8a69e85` (Workers Builds check passed; version ID not recorded, VERIFY) |
| Worker `denham-venom-timeclock` | build for main `08a5d71` (version ID not recorded, VERIFY) | previous build for main `8a69e85` (version ID not recorded, VERIFY) |

## Post-release checks
- https://students.team8044.org and https://timeclock.team8044.org returned 200.
- The served Student Status lazy chunk `LiveApp-CGvsyL7R.js` contains "Changes apply right away. Changing the email also changes how this person signs in." (new in `src/CoachProfileEdit.tsx`).

## Not yet verified
- No signed-in production walkthrough (VERIFY): Coach email change over an orphan sign-in, pending-request messages, edit dialog staying open across the refresh and list reload.
- Convex production logs after the release were not reviewed (VERIFY).
- Worker version IDs were not captured (VERIFY).
