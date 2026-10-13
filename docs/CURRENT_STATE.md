# Current integration handoff

Updated October 13, 2026. Verify Git and deployment before continuing.

## Checkout and boundaries

- App: student-status-readiness-design; branch feature/student-status-completion. Latest published checkpoint ac40821 (archive retention); draft PR #10 remains open. No main merge or production deployment authorized.
- Development only: dev:third-bandicoot-18, team daniel-eiland. Last full application sync was permission checkpoint 11d04d2 at 08:45. Later client type generation succeeded; it is not a full financial application sync.
- Synthetic student data only. Real permission signing and automatic retention deletion remain blocked. Student records, secrets, screenshots and exports never enter GitHub.
- G1–G7 remain open. Full scope: GOAL_ACCEPTANCE.md; human checklist: DEVELOPMENT_CHECKLIST.md; visual queue: VISUAL_CHECKS.md.

## Active financial checkpoint

The local financial source model, bounded rebuild/allocation/withdrawal/transfer jobs, paginated evidence, fundraiser creation/preview/posting/history/retry/splits/closure and matching UI are implemented. They are not yet published or fully synchronized to development.

Full bun run check passed 194 tests across 34 files, lint, strict types and build at 10:00. The build reports a roughly 947 KB bundle warning. The subsequent FinancePage first-page loading guard passed strict types and scoped lint. Earlier 187/193 failures were legacy fixture mismatches corrected before the full passing run; do not treat them as current failures.

Astra final review is pending. Review corrections implemented: immutable fundraiser creator identity across retries, actual committed operation audit balances plus completion audit, gross-only fundraising timestamps, causal ledger rebuild ordering, native pagination read bounds and explicit readiness overflow review. Source owners report their changes frozen for review.

Root owns schema/generated files, financial readers/report rebuilds/aggregates, integration, Git, sync and browser evidence. Sol whole_team_goal owns financial writers/workers/tests; Sol dashboard_goal owns fundraising and operation UI; Astra goal_manager reviews. Next: close review findings, publish a reviewed checkpoint, synchronize development, rebuild historical development balances and perform synthetic live/visual rehearsal. Do not mix ownership or claim browser evidence from tests.

## Live permission and role evidence

Parent signing, Coach acceptance, correction/resubmission and original receipt immutability are verified with fictional records. Replacement acceptance, re-sign request, paper/export, and phone/desktop × light/dark comparisons remain pending. The user-opened Coach session is verified; the separate staff session is Travel Lead. Attendance rebuild found four sessions and Parent totals loaded.

Ordinary Mentor-only test identity was supplied privately but Google test-user setup, first sign-in and assignment remain pending. Existing Mentor+Travel, Student and Parent roles stay unchanged. Timeclock coordinator confirms its integrated frontend has no new known defect; controlled concurrent Group-mode rehearsal and physical-device/origin evidence remain open. Preserve its reserved browser tab; backend/auth changes remain root-owned.

## Confirmed policy

- Whole Team: every active member at creation; later join/reactivation adds members only to upcoming events while preserving prior withdrawals and financial decisions.
- Reduced fundraising awards whose credits were spent/transferred: hold for Coach resolution with existing balances unchanged.
- Five-year retention starts from the most recent archive following reactivation. Automatic deletion remains unauthorized.
- Gross Raised means actual fundraiser proceeds; historical awarded travel credit must not be mislabeled as gross.

## Evidence map

GOAL_ACCEPTANCE.md and DEVELOPMENT_CHECKLIST.md define remaining outcomes. FINANCE_ADMIN_IMPLEMENTATION.md records financial contracts and review. FINANCE_AND_CONSENT_DECISIONS.md holds product policy. REVIEW.md records dated verification. VISUAL_CHECKS.md and FRONTEND_CONFORMANCE_LOG.md track prototype evidence. ACCOUNTS_PERMISSION_IMPLEMENTATION.md and ATTENDANCE_REPORT_IMPLEMENTATION.md describe existing contracts. TIMECLOCK_BACKEND_HANDOFF.md and TIMECLOCK_COORDINATION.md contain dated integration history; later confirmed decisions supersede historical proposals. REPOSITORY.md governs Git publication.
