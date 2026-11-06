# Release 2026-11-06: automatic withdrawal, Put back on event, Undo

Status: synced to development, not deployed to production. No owner approval for production yet.

Branch / PR / commit: `feat/auto-withdrawal-undo`, [PR #73](https://github.com/denhamvenom/student_status/pull/73) (open against main, not merged), commit `c2c571f`.

## What changed
1. Automatic withdrawal: takes effect immediately (approved $0 `full` row with the automatic reason, `autoWithdraw` audit including `shiftSignupsCleared`, no Coach digest) when the event has no fee, no charges with amount owed or applied, no pending request, no room membership or request, no team-transport seat, and is not Whole Team or Coach-assigned (`signupMode` `assigned`). Otherwise unchanged: pending review.
2. Coach and Travel Lead "Put back on event" (`withdrawals.putBackOnEvent`) in Event operations > Signups and capacity > Withdrawn. Travel Lead is refused on assigned events. Refused for Mentors-only, full or waitlisted events and requests in review. Marks the withdrawal reinstated, does not reverse money (warning shown), dismisses Whole Team leave notices, adds the event fee only if no charge exists.
3. Student Undo (`withdrawals.undoWithdrawal`) of their own automatic withdrawal until the earlier of signup close and event start. Needs audience access and capacity. Restores the prior status (no waitlist promotion). Max 3 undos per event. Rooms and shifts are not restored. Parents cannot undo.
4. Shared fail-closed reader `convex/lib/withdrawalState.ts` (`withdrawalHistory`, `activeApprovedWithdrawal`). More than 100 rows throws an "Ask a Coach" error, which can block the Coach event signups list or that student's Home.
5. Schema: `withdrawalRequests` gains optional `priorParticipation`, `reinstatedAt`, `reinstatedBy`, `reinstatedByStudent`.

## Validation
- Security review, 2 rounds: all findings closed.
- Tests: withdrawals + studentHome 79/79; participation-related 207/207.
- Lint, typecheck, build passed.
- Full `bun run check` failed only on the known flaky `convex/feeBulk.test.ts` 30s timeout (passes alone, 9/9); `bulkInvites.test.ts` timed out once similarly. Not a clean full suite.

## Not done
- Browser and persona verification of the withdrawal screens: blocked, development Student sign-in needs `DEVELOPER_SIGN_IN_KEY`.
- Merge to main; production deploy (needs owner approval).

## Deployment evidence
| Item | Value |
| --- | --- |
| Branch / PR / merge commit | `feat/auto-withdrawal-undo` at `c2c571f`; PR #73 open against main, not merged; merge commit pending |
| Dev Convex sync (schema valid, no index deletions) | 2026-11-06, `bunx convex dev --once` to `third-bandicoot-18` (dev): functions ready, schema accepted with existing `withdrawalRequests` rows |
| Production Convex (owner approval, dry run, deploy) | _Pending_ (needs owner approval) |
| Worker `denham-venom-student-status` deployed / rollback | _Pending_ |
| Post-release checks | _Pending_; browser/persona checks blocked (development Student sign-in) |

## Rollback
Revert the commit. The new `withdrawalRequests` fields are optional, so existing rows stay valid and the schema change is backward compatible; Convex functions are forward-fixed by redeploying the reverted code. Withdrawals created or reinstated while the feature was live remain as data.

## Not yet verified
No signed-in walkthrough as Student, Coach or Travel Lead, on development or production.
