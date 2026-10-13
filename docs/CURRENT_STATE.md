# Current integration handoff

Updated October 13, 2026. Verify Git and deployment before continuing.

## Checkout and boundaries

- App: student-status-readiness-design; branch feature/student-status-completion. Latest remotely verified checkpoint f9282db (financial recovery and genuine fundraising totals); draft PR #10 remains open. No main merge or production deployment authorized.
- Development only: dev:third-bandicoot-18, team daniel-eiland. Full financial synchronization succeeded October 13 at 10:08:14; financial recovery follow-up synchronized at 10:21:13. Current administration changes are local work in progress.
- Synthetic student data only. Real permission signing and automatic retention deletion remain blocked. Student records, secrets, screenshots and exports never enter GitHub.
- G1–G7 remain open. Full scope: GOAL_ACCEPTANCE.md; human checklist: DEVELOPMENT_CHECKLIST.md; visual queue: VISUAL_CHECKS.md.

## Active financial checkpoint

The financial source model, bounded rebuild/allocation/withdrawal/transfer jobs, paginated evidence, fundraiser creation/preview/posting/history/retry/splits/closure and matching UI are implemented and published. Coach financial rebuild is now verified live. Fictional fundraiser posting is verified: 1001 cents gross, 251 team and 750 student travel, completed with one committed row and no held rows. A missing explicit submit type was fixed locally in posting/retry forms; only posting has live verification so far.

Full bun run check passed 194 tests across 34 files, lint, strict types and build at 10:00. The build reports a roughly 947 KB bundle warning. The subsequent FinancePage first-page loading guard passed strict types and scoped lint. Earlier 187/193 failures were legacy fixture mismatches corrected before the full passing run; do not treat them as current failures.

Astra source review cleared this incremental checkpoint. Review corrections implemented: immutable fundraiser creator identity across retries, actual committed operation audit balances plus completion audit, gross-only fundraising timestamps, causal ledger rebuild ordering, native pagination read bounds and explicit readiness overflow review. Source owners report their changes frozen for review.

Current administration ownership: Sol whole_team_goal owns schema and monetary writers/helpers/workers/tests, including charge corrections and team transfers. Sol dashboard_goal owns ChargeAdministration, FinanceOperations and scoped FinancePage/AdminFinance integration, plus the Withdrawals retry submit fix. Root owns generated files, Git, sync, browser evidence, documentation and the two Fundraising submit fixes. Astra goal_manager reviews and maintains the finance contract plan. Wait for backend contract freeze before codegen; do not sync unfinished source. Shared season-wide fee priorities, custom fees, season transition/carryover and retention controls remain required after this slice. Do not mix ownership or claim browser evidence from tests.

## Live permission and role evidence

Parent signing, Coach acceptance, correction/resubmission and original receipt immutability are verified with fictional records. Replacement acceptance is now verified in Coach and Parent views. Re-sign request, paper/export, and phone/desktop × light/dark comparisons remain pending. The user-opened Coach session is verified; the separate staff session is Travel Lead. Attendance rebuild found four sessions and Parent totals loaded.

Ordinary Mentor-only test identity was supplied privately but Google test-user setup, first sign-in and assignment remain pending. Existing Mentor+Travel, Student and Parent roles stay unchanged. Timeclock coordinator confirms its integrated frontend has no new known defect; controlled concurrent Group-mode rehearsal and physical-device/origin evidence remain open. Preserve its reserved browser tab; backend/auth changes remain root-owned.

## Confirmed policy

- Whole Team: every active member at creation; later join/reactivation adds members only to upcoming events while preserving prior withdrawals and financial decisions.
- Reduced fundraising awards whose credits were spent/transferred: hold for Coach resolution with existing balances unchanged.
- Five-year retention starts from the most recent archive following reactivation. Automatic deletion remains unauthorized.
- Gross Raised means actual fundraiser proceeds; historical awarded travel credit must not be mislabeled as gross.

## Evidence map

GOAL_ACCEPTANCE.md and DEVELOPMENT_CHECKLIST.md define remaining outcomes. FINANCE_ADMIN_IMPLEMENTATION.md records financial contracts and review. FINANCE_AND_CONSENT_DECISIONS.md holds product policy. REVIEW.md records dated verification. VISUAL_CHECKS.md and FRONTEND_CONFORMANCE_LOG.md track prototype evidence. ACCOUNTS_PERMISSION_IMPLEMENTATION.md and ATTENDANCE_REPORT_IMPLEMENTATION.md describe existing contracts. TIMECLOCK_BACKEND_HANDOFF.md and TIMECLOCK_COORDINATION.md contain dated integration history; later confirmed decisions supersede historical proposals. REPOSITORY.md governs Git publication.


Resolved follow-up: live finance route crashed when historical accounts lacked financial projections. Reviewed fix returns unavailable/null preparation state, preserves Coach rebuild access, and is published in f9282db and synchronized to development at10:21:13. Backend8 and UI7 focused tests plus types/lint pass. Next G6 contract includes prototype season-wide fee definitions/priorities, not only per-student ordering.

Live follow-up resolved: Coach financial report rebuild completed and synthetic balances/history loaded. Legacy Gross Raised is explicitly unavailable where source gross is unknown. Subsequent work can use these prepared development accounts. Astra cleared incremental UI/report changes; retain separate pending visual and fundraiser posting evidence.
