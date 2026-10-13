# Current integration handoff

Updated October 13, 2026. Follow COMPLETION_WORKFLOW.md: functional workflows first, essential risk-based checks, representative visual comparisons. Exhaustive state/viewport permutations are superseded by the Coach's latest direction.

## Workspace and boundaries

- student-status-readiness-design; feature/student-status-completion; draft PR10. Latest published c9e2caa (Finance export/link migration), remote verified. Current Parent/season integration is reviewed and synchronized to development14:04:07; publication pending below.
- Development only: daniel-eiland / denham-venom-student-status / dev:third-bandicoot-18. Latest full sync14:04:07. No production/main merge, real signing or deletion authorized.
- Synthetic records only. Records, secrets, screenshots and downloads stay outside Git.
- Full G1-G7 scope remains active; none is fully closed. DEVELOPMENT_CHECKLIST is the human guide; VISUAL_CHECKS is the single visual queue.

## Completed current workflows / evidence

- Finance account table, source-separated totals, payment modal, history/fee priorities and export UI are connected. Prior integrated check passed at c9e2caa. Live fictional one-cent payment reconciled Paid1.00→1.01 and Due9.00→8.99.
- CSV verified: four charge rows, effective4000 / personal applied3101 / fundraising applied0 / due899 cents. Manifest includes all six fictional members, including zero-charge members. Selected account details loaded with matching balances and its scoped export prepared; final scoped download not verified because HMR reset the control. Do not repeat all-active proof.
- Family-link maintenance completed through Coach Settings: both passes, four checks, zero unresolved links. This satisfies the prerequisite for Parent consumer cutover.
- Local reviewed Parent integration uses native season-scoped pagination for all child routes; ownStudent resolves current-season profile while preserving historical IDs. Astra clear; focused checks passed.
- Local reviewed Coach /season now mounts draft creation and explicit returning/departing roster review. Astra clear; copy corrected to avoid claiming a saved draft before saving. This does not activate a season or move balances.

## Ownership / next work

- Root owns Git and one live smoke check. Integrated lint/types passed;59 test files passed, three outdated Parent assertions corrected and affected9-case suite passed; build passed. No full rerun needed for test-only assertion migration. Parent/draft sync complete.
- Sol retention owner continues six-step season transition; schema release waits for current sync. Money carryover requires coordinated financial source/writer changes, not another review-only stopping point.
- Sol whole_team_goal finished Parent integration and is available for financial primitives. Astra reviews coherent completed batches, concrete blockers only.
- Required remaining work includes import/payment correction, season carryover/activation and controlled historical corrections, attendance kickoff/category integration, outstanding role journeys and representative design checks. No test-count target.
- Timeclock owns apps/timeclock in separate worktree. Coordinator informed migration completed, no season activation. Preserve historical student/session IDs and account-level operator roles; root owns shared backend/auth contracts.

## Decisions and browser handoff

Whole Team later additions: upcoming only, preserving withdrawals. Departing funds normally nonrefundable; explicit Coach-reviewed personal-to-team transfer needs audit but no family authorization. Archive does not sweep funds. Exceptional refund approval and actual payout are separate. Retention five years from latest account archive; no deletion. Official FIRST kickoff starts build season; Outreach classification unanswered.

Coach Chrome3 tab976035137; Parent Chrome4 tab976035127 (IDs remapped after runtime reset). Coach currently Finance. Use existing bindings; HMR may stale AX indexes, use fresh semantic DOM locators. Browser evidence is private under visualizations/frontend-oct13, never Git.
