# Timeclock operator access and Group clock-in PIN unlock — November 8, 2026

> **Status:** prepared on branch `feat/timeclock-access` (based on main `dc92696`). The merge and production deploy outcome is recorded in the PR and HANDOFF.md after release.

## Scope

- **Timeclock operators are Coaches, Mentors and Travel Leads**, whether they sign in with Google or by email code. Timeclock has its own auth session and no Student Status role picker, so a Parent account with a current Mentor or Travel Lead grant (`parentStaffAccess`) is resolved server-side as a Mentor there (`timeclockOperatorActor` in `convex/lib/access.ts`). That actor has no Money edit and no health export. Parents without a grant, Students and inactive accounts are refused. Coach sessions keep Coach privileges. `convex/timeclock.ts`, `timeclockRoster.ts`, `timeclockPinControl.ts` and `calendarState.ts` use the new operator helper instead of `viewer` plus `requireRole`.
- **Group clock-in asks for the PIN on entry.** A new Group unlock (`timeclock:unlockGroupClock`, status query `timeclock:groupClockStatus`) is held on the server for one operator, one console profile and one open meeting. It ends when the meeting closes or reaches its end, or when the console selects a different meeting. A Group clock-in (more than one student) needs a PIN on the request or that unlock; a one-student clock-in stays PIN-free; transfers still need the PIN on every request; a supplied PIN is always verified. Timeclock UI (`apps/timeclock/src/main.tsx`) shows the PIN prompt when entering Group clock-in.
- **PIN guessing limits:** wrong PINs count per account (5 per minute) and, because all operators share one PIN, per team (30 per minute), on every PIN-protected action.

## Backend

- Additive schema only: new table `timeclockGroupUnlocks` (`actorId`, `sessionId`, `profileId`, `grantedAt`) with indexes `by_actorId_and_sessionId_and_profileId`, `by_sessionId`, `by_profileId`. No field, index or table removed, no backfill, no migration. At most 100 unlock rows per meeting.
- New public functions: `timeclock:unlockGroupClock` (mutation), `timeclock:groupClockStatus` (query). `clockCommand` gains an optional `profileId` argument (an older Timeclock frontend that omits it must keep using the PIN-per-request path).
- No new environment variables; Group clock-in still needs `TIMECLOCK_OPERATOR_PIN` on production (existing VERIFY item in HANDOFF.md).

## Validation (on the branch, from a clean worktree at main `dc92696` plus this change)

- `bun run check:timeclock` (lint, typecheck, Vite build) passed. Root `bunx tsc --noEmit` and `bunx tsc --noEmit -p convex` passed. `bun run lint` and `bun run build` passed.
- `bun run test`: 209 of 210 files and 2506 of 2507 tests passed. The one failure was the known load-sensitive `feeBulk` timeout; `convex/feeBulk.test.ts` passes alone (9/9). This is not a clean full-suite result.
- The Timeclock browser check (`apps/timeclock/tests/browser-check.mjs`) was updated for the PIN-on-entry flow but was not run for this receipt.
- Synthetic data only. No signed-in production walkthrough.

## Limits and rollback

- **Frontend:** the Timeclock Worker rebuilds automatically from main. To roll back, restore the previous Worker version in Cloudflare or revert the merge on main.
- **Backend:** additive; forward-fix only once unlock rows exist. The unlock rows are short-lived operational state and can be ignored by an older backend. Never deploy a feature branch.
- Mentors and Travel Leads (including Parents with a staff grant) can now operate Timeclock: if that is too broad, ship a forward fix tightening `timeclockOperatorActor`.

## Release record

Recorded in the PR description and the next HANDOFF.md update (merge commit, production target, deploy result).
