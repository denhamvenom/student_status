# Release 2026-11-17: Background state machines, Wave 1 (unstick states with no way out)

**Status: prepared on branch `feat/state-machines-w1` (PR #95); not yet merged or deployed.** The merge commit, deploy time and production checks are recorded in the PR and HANDOFF.md after release.

| Item | Value |
| --- | --- |
| Commit | `bc4a729` (Unstick background state machines, Wave 1) |
| Base commit | `0f364a6` |
| Size | 19 files, +794/-46 (five new test files) |
| Production Convex deploy | Pending: `bunx convex deploy` from a clean main equal to origin/main after the PR is merged |

## Scope
Six fixes for states that could get stuck with no way out. Normal behavior and existing data are unchanged.
- **Team Calendar push:** a skipped push (archived event, other season, season change in progress) now ends as failed with a plain message instead of staying pending. Google requests time out after 20 seconds.
- **Membership sync:** a sync that gives up records a stop in the new `membershipSyncStops` table and logs it. Internal resume is idempotent. A later completed sync clears the stop.
- **Zeffy sync:** no longer loads whole tables, so it keeps working past 5000 payments.
- **Timeclock:** a session with more open intervals than one batch now closes in batches at the effective end instead of staying open.
- **Invite and contact email:** a confirmed late delivery can correct a stall-marked failed to sent, for the same attempt and token.
- **Push notifications:** a send that never reports back is marked failed after 15 minutes. A late report no longer overwrites skipped.

## Schema
Additive only.
- One new table: `membershipSyncStops`. No existing table changes, no backfill, no data migration.

## Verification (implemented, tested)
- Each fix has a test that failed before the change (new test files: `eventCalendar.stuck`, `inviteEmailStalled`, `push.stuck`, `timeclock.closeLarge`, `zeffy.scale`; membership sync tests added to `membershipSync.test.ts`).
- `bun run check`: lint, typecheck and build pass; tests 3132/3134.
- The 2 failures are `feeBulk` timeouts. They also fail on base `0f364a6` (pre-existing) and pass when run alone.
- Reviews: correctness (Opus), security (Fable), wording (Sonnet).
- No live Google or Zeffy run; external calls were tested with mocked responses.

## Known limitations (follow-up, not blocking)
- No Coach screen shows membership sync stops (owner decision); they appear in logs and the table only.
- Push rows that got stuck before this release are not cleaned up (owner decision).
- Zeffy is still limited above 10,000 payments per fetch and above 5000 students.
- The raw invite token in scheduler arguments is pre-existing; planned for Wave 2.

## Release steps
1. Owner approves; PR #95 is merged into main on GitHub.
2. Clean worktree equal to origin/main (`git pull --ff-only`).
3. `bunx convex deploy` from main to production.
4. Notify other sessions to merge origin/main before their next development sync.

## Rollback
- Revert the commit (or the merge commit) on main and redeploy main.
- The `membershipSyncStops` table is additive and can stay unused.
- No data migration to undo.
