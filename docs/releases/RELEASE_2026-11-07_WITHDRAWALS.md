# Release 2026-11-07: automatic withdrawal, Put back on event, Undo, M5 notices; parallel-work guard

Owner approved the release on 2026-11-07. PR #73 `feat/auto-withdrawal-undo` merged with a merge commit as main `3d27afd` (branch head `65add32`, main merged in so Mentor Home is included). PR #77 `chore/parallel-work-guard` (commit `0bb8d30`, docs/tooling only) merged as main `377b2d9`.

## Scope
- Automatic withdrawal: no fee, no owed/applied charges, no room and no team-transport seat takes effect immediately (approved $0 row, `autoWithdraw` audit, no Coach digest). Whole Team and Coach-assigned events still go to review.
- Coach/Travel Lead **Put back on event** (Event operations > Signups and capacity > Withdrawn).
- Student **Undo** of their own automatic withdrawal until signup close or event start; follows the normal signup rules (audience, capacity); max 3 per event; rooms and shifts not restored; Parents cannot undo.
- Put back and Undo leave charges unchanged (money is not reversed). The fee rule is deferred (Coach note).
- M5 notices: "Student dropped out" / "Student signed up" for the creator of a Mentor meeting.
- Shared fail-closed withdrawal history reader `convex/lib/withdrawalState.ts`; history reads are capped.
- Schema: optional `priorParticipation`, `reinstatedAt`, `reinstatedBy`, `reinstatedByStudent` on `withdrawalRequests` (additive; no new index).
- Guard (PR #77): `.claude/hooks/parallel-work-guard.mjs`, `.claude/settings.json`, `.gitignore`, AGENTS.md, CLAUDE.md, docs/REPOSITORY.md. No `convex/` or app code, so no Convex deploy for it.

## Release steps
1. Pushed the reviewed head to the PR branch as a fast-forward, updated the PR body, merged PR #73 at 21:52:48 UTC.
2. Updated a clean `wt-release` to `origin/main` `3d27afd` (clean, equal to origin/main).
3. `CONVEX_DEPLOYMENT=prod:amicable-eel-413 npx convex deploy --dry-run`: target `amicable-eel-413`, "No indexes are deleted by this push", schema valid, no index added. It again listed "Change the server's version for Node.js actions" with no detail (also in earlier releases; no `convex.json` or Convex version change in the diff).
4. `npx convex deploy -y` to `amicable-eel-413`: functions deployed, finished about 21:54:25 UTC. Merge-to-deploy window about 1 minute 37 seconds. No new indexes, so nothing to backfill.
5. PR #77 merged after confirming its diff has no `convex/` file.

## Versions
| Item | Deployed (after PR #73) | Before |
| --- | --- | --- |
| Convex production `amicable-eel-413` | source main `3d27afd` | forward-fix only |
| Worker `denham-venom-student-status` | `ef0afe46-008e-458c-89ec-4cc1e4a6f7f4` (21:54:14 UTC) | `b41cd589-fb15-42b4-a981-cdabbde96913` |
| Worker `denham-venom-timeclock` | `26b44c33-e715-4a4f-b68a-24eb1bda3fb7` (21:53:39 UTC) | `c1f2358a-9d56-4989-ae04-5112e4e850bb` |

The PR #77 merge (docs/tooling only) triggers a further Workers Build with identical app code.

## Checks
- Before merge: lint, typechecks, builds and timeclock checks pass; tests 2438/2439, the one failure being the known `feeBulk` load timeout that passes alone. Security review, 2 rounds: findings closed.
- After deploy: https://students.team8044.org and https://timeclock.team8044.org returned 200 and the student site served a bundle (`assets/index-DgSFLLsy.js`).

## Known gaps
- Put back on event and Undo do not reverse or adjust charges; the fee rule is deferred (Coach note).
- No signed-in production walkthrough (Student, Coach, Travel Lead) of withdraw, Put back and Undo yet; development Student sign-in was blocked.
- Dashboard check still open: Node actions (push, email) after the reported Node.js action version change.
- Usability follow-ups are in [BACKLOG.md](../BACKLOG.md).
- Fail-closed reader: more than 100 withdrawal rows for one student/event shows an "Ask a Coach" error.

## Limits and rollback
Frontend: restore the "Before" Worker versions or revert the merge. Backend: forward-fix only; do not delete withdrawal or reinstatement records. Not reversible: notices already sent, withdrawals and Undo already recorded.
