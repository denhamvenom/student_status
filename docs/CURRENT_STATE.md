# Current integration handoff

Updated October 13, 2026. Verify the actual Git/worktree state before using this snapshot. This short entry point links evidence rather than replacing it.

- Active checkout: `student-status-readiness-design`; branch `feature/student-status-readiness-design`; draft PR #9. Baseline before this documentation audit: `43a254b`.
- Current task: context audit and recording the Whole Team decision. Application development has not resumed in this checkpoint.
- Frontend conformance authorized; next backend phase requires separate authorization. No main merge, production deployment or real signing authorized. Preserve sibling worktrees and paused backend drafts.
- Astra coordinates/reviews; Sol implements independent file-owned tasks. One integration owner handles Git and shared backend changes.

## Latest decision

Whole Team means every active team member. New members joining after event creation are automatically included in that event too. Confirmed October 13; supersedes the proposed creation-time snapshot/manual-add recommendation. Decision recorded, implementation and verification pending. Whole Team remains unavailable in the current UI.

Before implementing, inspect existing event lifecycle, membership, charging and participation contracts. Surface unresolved cases such as past/closed events or reactivation rather than inventing exclusions, fees or withdrawal reversals.

## Context map

- Current human progress: [DEVELOPMENT_CHECKLIST.md](DEVELOPMENT_CHECKLIST.md).
- Product/architecture: [PLAN.md](PLAN.md), [ARCHITECTURE.md](ARCHITECTURE.md), [FINANCE_AND_CONSENT_DECISIONS.md](FINANCE_AND_CONSENT_DECISIONS.md).
- Latest frontend evidence/limits: [FRONTEND_CONFORMANCE_LOG.md](FRONTEND_CONFORMANCE_LOG.md). Root design-drift-report is a historical pre-correction baseline.
- Backend evidence: relevant dated sections of [REVIEW.md](REVIEW.md) and [REHEARSAL_2026-10-12.md](REHEARSAL_2026-10-12.md). Older test counts describe their milestones only.
- Timeclock: [TIMECLOCK_BACKEND_HANDOFF.md](TIMECLOCK_BACKEND_HANDOFF.md), [TIMECLOCK_COORDINATION.md](TIMECLOCK_COORDINATION.md). Verify current other-worktree status before shared changes; handoffs are snapshots.
- Git/privacy: [REPOSITORY.md](REPOSITORY.md). Runtime: [DEVELOPMENT.md](DEVELOPMENT.md), using the verified active checkout.

## Remaining work

Frontend: modal/section presentation, shared copy and outstanding role/state/viewport checks. Backend dependencies: Whole Team, aggregate finance/roster, family Attendance, missing readiness/form/admin contracts. Inspect existing contracts before assuming each gap requires new schema.

Last recorded full check: 101 tests across 18 files plus lint/types/build. Later label adjustment reran lint/types/build. No fresh application checks were run for this documentation audit. Visual coverage remains partial/scaled, not whole-app pixel parity. Keep screenshots and account-specific evidence outside Git.

At milestones update this handoff's scope, decision pointers, validation limits and publication status. Do not copy long histories into it.
