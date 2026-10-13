# Current integration handoff

Updated October 13, 2026. Verify the actual Git/worktree state before using this snapshot. This short entry point links evidence rather than replacing it.

- Active checkout: `student-status-readiness-design`; branch `feature/student-status-completion`, based on published frontend5343092/PR9. Completion branch is a new development integration branch; no main merge.
- Active goal: complete checklist1–7 until ready for Coach visual approval. Read GOAL_ACCEPTANCE.md for full requirements. Frontend and backend development are now authorized; work is ongoing in parallel. No numbered item is yet claimed fully complete.
- User now authorizes all allowable frontend/backend work and Timeclock coordination toward review readiness. No main merge, production deployment or real signing authorized. Preserve sibling worktrees and paused backend drafts.
- Astra coordinates/reviews; Sol implements independent file-owned tasks. One integration owner handles Git and shared backend changes.

## Latest decision

Whole Team means every active team member. New members joining after event creation are automatically included in that event too. Confirmed October 13; supersedes the proposed creation-time snapshot/manual-add recommendation. User confirmed upcoming events only for later joiners. Whole Team implementation/UI is local, not yet reviewed for scale or synced; do not treat it as complete.

Before implementing, inspect existing event lifecycle, membership, charging and participation contracts. Surface unresolved cases such as past/closed events or reactivation rather than inventing exclusions, fees or withdrawal reversals.

## Context map

- Current human progress: [DEVELOPMENT_CHECKLIST.md](DEVELOPMENT_CHECKLIST.md).
- Product/architecture: [PLAN.md](PLAN.md), [ARCHITECTURE.md](ARCHITECTURE.md), [FINANCE_AND_CONSENT_DECISIONS.md](FINANCE_AND_CONSENT_DECISIONS.md).
- Current outstanding visual matrix: [VISUAL_CHECKS.md](VISUAL_CHECKS.md); maintain this table rather than competing current matrices.
- Latest frontend evidence/limits: [FRONTEND_CONFORMANCE_LOG.md](FRONTEND_CONFORMANCE_LOG.md). Root design-drift-report is a historical pre-correction baseline.
- Backend evidence: relevant dated sections of [REVIEW.md](REVIEW.md) and [REHEARSAL_2026-10-12.md](REHEARSAL_2026-10-12.md). Older test counts describe their milestones only.
- Timeclock: [TIMECLOCK_BACKEND_HANDOFF.md](TIMECLOCK_BACKEND_HANDOFF.md), [TIMECLOCK_COORDINATION.md](TIMECLOCK_COORDINATION.md). Verify current other-worktree status before shared changes; handoffs are snapshots.
- Git/privacy: [REPOSITORY.md](REPOSITORY.md). Runtime: [DEVELOPMENT.md](DEVELOPMENT.md), using the verified active checkout.

## Remaining work

Frontend: modal/section/invitation presentation implemented; remaining role/state/viewport checks in VISUAL_CHECKS.md. Shared live-app copy extraction is recorded complete; flag specific residual literals during future checks rather than reopening wholesale migration. Backend dependencies: Whole Team, aggregate finance/roster, family Attendance, missing readiness/form/admin contracts. Inspect existing contracts before assuming each gap requires new schema.

Prior October13 full check100/101. Fixed-date Timeclock test now has a scoped clock spy and passes isolated test; new full suite pending. See conformance log for exact evidence; do not claim the suite is green. Visual coverage remains partial/scaled, not whole-app pixel parity. Keep screenshots and account-specific evidence outside Git.

At milestones update this handoff's scope, decision pointers, validation limits and publication status. Do not copy long histories into it.

## Active integration ownership and next evidence

- Astra goal_manager: full acceptance map and scale architecture/review. Sol whole_team_goal: enrollment/admin/event operations plus proposed batch money helper. Sol dashboard_goal: new reporting queries/tests and frontend report connections/LiveApp. Root owns schema/generated/Git/sync.
- WholeTeam small/large fixture tests pass, but review found multiplied query budgets across many events/financial histories. Address scalable enrollment before declaring item3 complete.
- Reporting queries/tests are local; aggregate finance/attendance fan-out needs scalable summaries or pagination before item4 completion. Gross Raised needs fundraising source model; do not label null complete.
- Timeclock coordinator thread01a13097-bbb3-7712-ac06-fb4737daf269 reports latest branch checkpoint753b236, own clean worktree. Branch not yet ancestor here; integrate reviewed frontend after owned files settle. Synthetic PIN/transfer/independent-browser rehearsal passed, actual separate-device and deterministic live race remain limited.
- Codegen regenerated local API on configured personaldev; CLI logged component upload. No explicit reviewed development backend sync completed for new feature slice. Do not run watcher on unfinished source.
