# Current integration handoff

Updated October 13, 2026. Follow COMPLETION_WORKFLOW.md: finish functional workflows, use essential risk-based checks, and compare representative visuals. The Coach's latest direction supersedes exhaustive state/viewport permutations.

## Workspace and boundaries

- student-status-readiness-design; feature/student-status-completion; draft PR10. Latest published checkpoint `314a4a9` (Timeclock integration), pushed and remote verified. The reviewed six-step season batch is synchronized to development but remains uncommitted.
- Development only: daniel-eiland / denham-venom-student-status / dev:third-bandicoot-18. Latest full development sync completed 14:21:33. No live season activation was performed. No production/main merge, real signing or deletion is authorized.
- Synthetic records only. Student records, secrets, screenshots and downloads stay outside Git.
- All G1-G7 outcomes remain open. DEVELOPMENT_CHECKLIST is the human progress guide; VISUAL_CHECKS is the single current visual queue.

## Completed workflows and evidence

- Finance account table, source-separated totals, payment modal, history/fee priorities and export UI are connected. Live fictional one-cent payment reconciled Paid 1.00→1.01 and Due 9.00→8.99.
- CSV verified: four charge rows, effective 4000 / personal applied 3101 / fundraising applied 0 / due 899 cents. Manifest includes all six fictional members, including zero-charge members. Selected account details and scoped export preparation matched; final scoped download was interrupted by HMR. Do not repeat all-active export proof.
- Coach family-link maintenance completed both passes, four checks and zero unresolved links. Parent consumers now use season-scoped pagination; ownStudent resolves the current-season profile while preserving historical IDs.
- Six-step Coach season candidate implemented: new season, returning/departing roster, account archival choices, per-charge carry/write-off, source-preserving carry/hold/team dispositions, retain/reset review and explicit typed-name confirmation. Confirmation shows saved decisions; durable progress exposes failures, return-to-review before application and resumable application afterward.
- Transition preserves historical IDs, creates mapped new profiles, keeps the source active until final verification, automatically allocates carried credit against carried debt, and verifies paired monetary evidence. Shared writer locks preserve security revocation and clock-out. Timeclock moves only future sessionless occurrences and invalidates calendar generation atomically with activation.
- Coach read-only archived-season roster and held-balance browsing is implemented. Controlled historical correction mode remains pending.
- Narrow live Coach smoke: `/season` loaded all six navigation steps and the new-season form; Save stayed disabled without required inputs. Current `2026–27 Development` remained unchanged. No draft save or activation was attempted; this is not full visual acceptance.
- Astra reviewed the coherent season batch. Integrated lint, strict types and 319 tests passed; build passed after the root encoding correction. Development synchronization completed 14:21:33. These are source/automated/development-sync claims, not live cutover or visual approval.

## Ownership and next work

- Root owns Git, publication, development synchronization and the representative live/visual check. Publish the coherent reviewed season checkpoint; do not claim the uncommitted batch is already published.
- Season implementation and money owners remain available for concrete integration findings. No additional test matrix is requested.
- Remaining required work includes import/payment correction, controlled historical corrections, attendance kickoff/category reporting integration, outstanding role journeys, essential synthetic live season rehearsal and representative design comparisons. No G1-G7 closure or test-count target is implied.
- Timeclock owns apps/timeclock in its separate worktree. Preserve original student/session IDs and account-level operator roles; root owns shared backend/auth contracts. No live season activation has occurred.

## Decisions and browser handoff

Whole Team later additions apply to upcoming events only and preserve withdrawals. Departing funds are normally nonrefundable; an explicit Coach-reviewed personal-to-team move needs an audit but no family authorization. Archive never sweeps funds. Exceptional refund approval and actual payout are separate. Retention runs five years from the latest account archive; no deletion. Official FIRST kickoff starts build season; Outreach classification remains unanswered.

Coach Chrome3 tab976035137; Parent Chrome4 tab976035127 (IDs remapped after runtime reset). Coach is currently on `/season`. HMR may stale AX indexes; use fresh semantic DOM locators. Browser evidence is private under visualizations/frontend-oct13, never Git.
