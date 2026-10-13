# Current integration handoff

Updated October 13, 2026. Verify Git and deployment state before continuing. This is the current entry point; historical evidence remains in linked records.

## Published and synchronized

- Checkout: `student-status-readiness-design`, branch `feature/student-status-completion`. HEAD `0990bd4` records documentation for implementation checkpoint `4a9ff62`; root verified the published branch. Draft [PR #10](https://github.com/denhamvenom/student_status/pull/10) remains open. No main merge or production deployment.
- Published code includes durable Whole Team enrollment, finance summaries/aggregates, materialized attendance reporting, integrated Timeclock checkpoint `753b236` through merge `3946b88`, student profile setup/corrections, and adult invitations/access controls.
- Root verified 152 tests across 26 files, lint, types and build for that checkpoint. Development synchronization succeeded October 13 at 08:06 to `dev:third-bandicoot-18`. These results do not certify subsequent uncommitted permission work.
- Astra source findings for the published wave are resolved. Live multi-role and full visual evidence remain incomplete. Prior smaller test counts describe older milestones only.

## Reviewed permission checkpoint — development synchronized

The synthetic permission backend and UI are implemented and source-reviewed: immutable versions/snapshots, electronic preparation/signing, paper provenance, review/correction/re-sign, current coverage without historical acceptance fallback, receipts and bounded paginated exports. Root reports backend 169 tests across 28 files and UI collector five tests in one file passed separately; lint/types/build pass. Build retains a roughly 917 KB bundle warning. Development sync succeeded October 13 at 08:45:38. Commit/push is pending at this handoff; no new commit hash is asserted.

The development-only fixture and authorized verified Parent link were created live. Registration uses module-created fictional IDs; no account roles changed and revoked access is not restored. Fixture tests cover this boundary. Real permission signing remains server-blocked.

Ownership: root handles schema, generated code, readiness/routing, fixtures, Git and synchronization. Sol `whole_team_goal` owns consent backend/helpers/tests; Sol `dashboard_goal` owns permission UI/copy; Astra `goal_manager` coordinates requirements and source review, editing only assigned documentation. Current consent source is frozen for checkpoint publication/live rehearsal. The finance/administration document is a proposal for the next wave, not implementation evidence.

## Goal and policy

G1–G7 remain open: frontend alignment, visual checks, Whole Team, dashboard data, accounts/permission forms, administration/reporting/fundraising/season/retention, and final multi-role verification. Target: **READY FOR USER VISUAL APPROVAL**. That user approval remains a separate gate. Full scope and evidence requirements are in [GOAL_ACCEPTANCE.md](GOAL_ACCEPTANCE.md) and [DEVELOPMENT_CHECKLIST.md](DEVELOPMENT_CHECKLIST.md).

Whole Team includes all active students at event creation; later joining/reactivated members are added only to upcoming nonarchived events. Preserve existing participation/withdrawal and financial dispositions. The implementation is published; its remaining live/visual checks keep G3 open.

Build the complete synthetic permission workflow while retaining server denial of real signing. Exact medication/administration wording still requires user approval. No main merge, production deployment, real signing or automatic retention deletion is authorized. Retention review/hold scaffolding must not invent unresolved policy. Gross fundraising Raised remains unavailable until its authoritative source model exists; awarded travel credit is not gross proceeds.

## Current live evidence and next checks

The user opened an actual Coach session and root verified its role. A Coach-triggered attendance rebuild discovered four sessions; the Parent view now loads verified totals and session minutes. A private screenshot records this observation. Earlier updating-state DOM evidence remains valid for that earlier state. The separate staff tab was a Travel Lead; do not infer role from tab labels.

Live electronic/paper permission journeys and the four phone/desktop × light/dark visual combinations remain pending. No visual conformance or final acceptance is claimed. Continue these synthetic journeys after checkpoint publication; keep screenshots and account-specific evidence outside Git. Separate-device and deterministic live-race evidence remain limited.

## Evidence map

- [ACCOUNTS_PERMISSION_IMPLEMENTATION.md](ACCOUNTS_PERMISSION_IMPLEMENTATION.md): frozen next-slice schema and consent invariants; distinguish proposed contracts from implemented code.
- [ATTENDANCE_REPORT_IMPLEMENTATION.md](ATTENDANCE_REPORT_IMPLEMENTATION.md): materialized reporting, native pagination bounds and evidence limits.
- [VISUAL_CHECKS.md](VISUAL_CHECKS.md) and [FRONTEND_CONFORMANCE_LOG.md](FRONTEND_CONFORMANCE_LOG.md): current visual matrix and frontend evidence. Root design-drift report is historical.
- [REVIEW.md](REVIEW.md), [REHEARSAL_2026-10-12.md](REHEARSAL_2026-10-12.md), [TIMECLOCK_BACKEND_HANDOFF.md](TIMECLOCK_BACKEND_HANDOFF.md), [TIMECLOCK_COORDINATION.md](TIMECLOCK_COORDINATION.md): dated review/rehearsal evidence; handoffs are snapshots.
- [PLAN.md](PLAN.md), [ARCHITECTURE.md](ARCHITECTURE.md), [FINANCE_AND_CONSENT_DECISIONS.md](FINANCE_AND_CONSENT_DECISIONS.md), [REPOSITORY.md](REPOSITORY.md), [DEVELOPMENT.md](DEVELOPMENT.md): product, policy, repository and runtime context. Later user decisions take precedence.

Latest verification: full bun run check174/174 across29files passes. Live fictional Parent submission and Coach acceptance now verified, including reactive receipt status. Remaining consent evidence is correction/re-signing, paper/export and four-combination comparison. Implementation checkpoint publication is being prepared.
