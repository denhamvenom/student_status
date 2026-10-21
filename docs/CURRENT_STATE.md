# Current integration handoff

## Calendar cadence and fixed event roster - development review ready

Active checkout: student-status-readiness-design. Branch perf/reduce-database-reads-2026-10-21; earlier optimization checkpoint de46487 is already published. Preserve sibling worktrees and unrelated untracked .tmp-adult-tests.

Latest owner clarification: roster names stay fixed during an event; only clock-in/out status changes live. Implemented a memory-only roster snapshot daily while idle and once on event selection. Calendar now syncs at 6 AM and 3 PM Chicago time with a manual Refresh button. Device selection stays subscribed for cross-tab changes. Existing attendance/history and kiosk read optimizations remain. No schema/index/dependency changes. Details and measurement limits: [USAGE_OPTIMIZATION.md](USAGE_OPTIMIZATION.md).

Development third-bandicoot-18 synced. Final Astra review found no blockers. Source lint, strict types, both builds and all 628 integrated tests passed. Restricted test-module loading failed; full suite passed outside that restriction without assertion changes. Real signed-in localhost verified manual refresh success and cooldown recovery; phone/dark and desktop/light checked. Snapshot tests verify daily reads, event freeze across midnight, switching, retry and late-response fencing. Earlier two-client clock-in/out/report/automatic-close evidence remains; these live hooks are unchanged.

Local apps: localhost:5173 Student Status and localhost:5174 Timeclock. Ignored tmp/attendance-live wrapper displays actual authenticated report components with synthetic development data; account-specific review URL/screenshots remain out of Git. Development season2027–28 lacks a verified kickoff, so existing unavailable season-total state remains; session evidence works.

Next: owner localhost review, then separate explicit release authorization. No schema changes or production deployment authorized. Production amicable-eel-413 stays on v0.1.0-onboarding.11; merging main automatically deploys both frontends. Reviewed work is published on this development branch with a draft PR linked in the chat; never merge for documentation.
