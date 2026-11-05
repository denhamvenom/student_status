# Release 2026-11-04: Coach profile edit, Timeclock early clock-out and PIN group clock-in, monthly attendance report

Owner authorized the full production release. PR #69 `feature/coach-edit-timeclock-attendance-report`, merged with a merge commit as main `73fae9a` (head `1fcbe7d`). Production baseline before release: main `0cb1c40`.

## What shipped
- Coach profile edit, including login email. An email change requires a reason, revokes invitations for the old email and ends that user's sessions.
- Timeclock: an "early clock-out" confirmation ("No, stay clocked in" / "Yes, clock me out"). Group clock-in needs the operator PIN, which the server checks against `TIMECLOCK_OPERATOR_PIN`.
- Monthly attendance report (`/attendance/report`) for Students and Parents, linked from the shell, Student navigation, Home and family attendance.
- Schema: one additive index, `parentInvitations.by_parentEmail_and_status`. No deletions, no backfill.

## Steps
1. Source checks on `1fcbe7d` before release: lint, typecheck, tests, build and `bun run check:timeclock`. The parallel test run had one known timeout in `convex/feeBulk.test.ts`, which passes alone (see PR #69).
2. `CONVEX_DEPLOYMENT=prod:amicable-eel-413 npx convex deploy --dry-run` from a clean `1fcbe7d` checkout: target `amicable-eel-413`, no index deletions, schema valid, one index to add. It also listed "Change the server's version for Node.js actions" with no detail, as in the previous release.
3. `CONVEX_DEPLOYMENT=prod:amicable-eel-413 npx convex deploy --yes`: "Added table indexes: [+] parentInvitations.by_parentEmail_and_status". Deployed before the merge.
4. PR merged at 2026-11-05 00:22:36 UTC with `--merge --match-head-commit 1fcbe7d`. Both Workers Builds checks on `73fae9a` succeeded: Timeclock at 00:23:40 UTC, Student Status at 00:24:08 UTC.

## Versions
| Item | Deployed | Rollback |
| --- | --- | --- |
| Convex production `amicable-eel-413` | source `1fcbe7d` | forward-fix only (the added index is harmless to old code) |
| Worker `denham-venom-student-status` | `2362b93d-3808-4a59-8b43-13f8ec180c1e` | `3da2dea9-78bb-4b92-90e7-6658f4d4e741` (main `0cb1c40`) |
| Worker `denham-venom-timeclock` | `2ebed04d-b623-4d4b-b04c-0d6517a7785e` | `c4478644-fd2c-48c7-9cf6-1c87d04d6d00` (main `0cb1c40`) |

## Post-release checks
- At 00:24 UTC https://students.team8044.org returned 200 and served new assets (`index-DrDFuPym.js`, `LiveApp-DP6iZ-B4.js`) containing "See full attendance report" and the `attendance/report` route. `/attendance/report` returned 200 (SPA fallback).
- At 00:24 UTC https://timeclock.team8044.org returned 200 and served `index-BB1gzqMF.js`, which contains the "stay clocked in" early clock-out dialog text.

## Not yet verified
- No signed-in production walkthrough (VERIFY): Coach profile edit and email change, the monthly report as a Student and as a Parent, early clock-out, and PIN group clock-in on the kiosk.
- `TIMECLOCK_OPERATOR_PIN` is set on production (VERIFY). It was not checked, because env values are not read during releases. If it is missing, group clock-in will fail.
- Convex production logs after the release were not reviewed (VERIFY).
