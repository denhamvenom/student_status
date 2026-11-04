# Release 2026-11-04: repeating meetings end date

Owner approved ("Approved"). PR #67 `feature/series-end-date`, merged with a merge commit as main `1a02e86` (head `fbc16a6`).

## What shipped
Choose an end date when creating a repeating meeting and change it later (`eventSeries.setEndDate`, `eventSeries.endDateDetails`). No schema or index change.

## Steps
1. Built from a clean worktree of `origin/main` (`b8fd079`) with only the end-date files, so unrelated in-progress work was not deployed.
2. `bun install --frozen-lockfile`, `bun run lint`, `bun run typecheck`, `bun run build`, `bun run cloudflare:check` passed. `bunx vitest run`: 2018 of 2027 passed; the failures were known load timeouts, and those files pass alone (134/134).
3. `CONVEX_DEPLOYMENT=prod:amicable-eel-413 bunx convex deploy --dry-run`: no index deletions, schema valid. It also listed "Change the server's version for Node.js actions" with no detail shown; the deploy applied it. Worth a glance at the Convex dashboard.
4. `CONVEX_DEPLOYMENT=prod:amicable-eel-413 bunx convex deploy --yes`; `convex function-spec` lists `eventSeries.js:setEndDate` and `eventSeries.js:endDateDetails`.
5. PR merged (`--merge --match-head-commit`); both Workers Builds checks succeeded.

## Versions
| Item | Deployed | Rollback |
| --- | --- | --- |
| Convex production `amicable-eel-413` | source `fbc16a6` | forward-fix only |
| Worker `denham-venom-student-status` | `73f5b732-1fb1-4f51-9b59-500ab50431d5` | `d8aea3d8-87d7-4e0d-890a-214731850bac` |
| Worker `denham-venom-timeclock` | `7766278d-3abe-46c9-bee3-1f122e86abc9` | `d86501c6-fd16-414e-bb9a-0b2face9140a` |

## Post-release checks
- https://students.team8044.org and https://timeclock.team8044.org returned 200.
- Recent Convex production logs showed no errors.

## Not yet verified
No real shorten or extend of a live series, and no Team Calendar write with writes enabled, was performed in production.
