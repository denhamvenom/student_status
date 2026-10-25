# Backlog

Read this only when the owner requests backlog work or the current task relates to an item here. Missing test protection is not proof of a production bug; accepted deferrals do not reopen completed work.

## Security/Recovery

- Recovery: choose an approved budget/plan without relying on historical pricing; include stored PDF files, secure backup/export storage, alerts and seven-day recovery-window proposal separately from five-year retention; prove isolated restore including code/config and pending scheduled work. Manual launch snapshots do not close this gap.
- Security/operations: exhaustive history secret scan and dependency vulnerability inventory remain unperformed; verify production config/ownership/least privilege and branch protection/build settings. Measure actual load/I/O, PDF/draft storage and billing before cost promises; abandoned draft cleanup needs reference-safe design and approval.
- **Confirmed October 22 by owner — Zeffy schedule:** an automatic run completed successfully without pressing Run now. The scheduled-execution evidence gap is closed by owner confirmation; no additional credit or inspection was performed in this documentation update. Existing 7 AM/7 PM America/Chicago schedule remains unchanged.
- **Deferred October 22 by owner — production signing:** the owner is not ready for real PDF signing. Do not enable it; resume only on explicit instruction. This decision does not assert or change the current deployment flag and does not reopen approved PDF wording.
- **Confirmed October 22 by owner — parent inbox flow:** the live invitation/email-code sign-in flow from a real inbox completed successfully. That evidence gap is closed by owner confirmation; this documentation update did not send an invitation or perform a sign-in.
- Production ownership, least privilege, branch protection and main-connected build settings need operational confirmation before relevant changes. A push to main can deploy both websites; local edits do not authorize a push, merge, deployment or data operation.
- Retention, shared identities, holds, exports and responsible organization/contact policy are in [DECISIONS.md](DECISIONS.md#retention); disposal/backup coverage is not established.

## Testing

- October 23 transportation release: live synthetic development API checks and component tests passed, including both driver-assignment guards and switching modes. Remaining check: signed-in Coach event creation/settings at phone 390px and desktop 1440px in light/dark, dropdown save/reload and hidden ride controls; requires a development Coach session. Production asset/traffic verification is complete in v0.1.0-onboarding.16; no production test-data writes are needed.

- October 25 screen baseline (development, developer sign-in, `749005e`; evidence outside Git): (a) Parent → Student profile and Forms: `permissionsV2:profile` rejects developer accounts ("A verified parent account is required"), and `ParentRosterBoundary` then replaces the whole app, menu included, with the unrelated "Linked students could not be loaded" message. The real Parent profile/permission-form screens remain uncaptured and need a verified parent session. (b) Coach `/season` overflows horizontally at 390px. (c) Rooming that does not apply is shown as an error with an unhelpful "Try again". (d) Desktop sign-in draws a stray focus outline around its heading. (e) After-states of saving/sending controls were not captured. Wording findings and term decisions are tracked in the owner's Language Dictionary workbook.
- Remaining regression priorities from the October 21 test audit: multi-page payment correction with failure/duplicate/retry and exact cents; finance component-failure rollback and old-season namespace removal; actual mounted Timeclock midnight/freeze/live-status/stale-response wiring; independent mixed-operation conservation; fundraiser lifecycle, season hold/writeOff, transition/retention role denials, invalid backend amounts/dates, CSV DST/leap/invalid dates, readiness print branches, confirmation/double-submit/retry/dialog/Calendar Refresh interactions. Reconcile source before adding tests; the approved cleanup fixed only its stated subset.
- Keep the >500-record pagination/cancellation boundaries; do not remove synthetic fixtures just to reduce runtime. Historical suite counts are checkpoint evidence. Live subscription delivery, physical devices and real-inbox acceptance are not established by static rendering, helper tests or source review.
- Preserve accepted visual evidence; do not reopen completed G1–G7/approved PDF/rollout decisions merely because old tables say pending. Confirm any genuinely remaining Pay-device issue and CSV display deferral with the owner.
- The approved conservative cleanup added adult privilege and Parent travel ownership denials. Do not continue to list those specific protections as missing; reconcile the remaining audit gaps with source before adding tests.
- Recorded verification failures/limits include Windows temporary-module ENOENT, long fee-cancellation test timeouts and an intermittent bulk-invitation daily-limit assertion. No fresh suite was run in the documentation work; do not weaken assertions or present targeted reruns as a clean full-suite result.
- **Confirmed October 22 by owner — Timeclock physical devices:** the requested tablet/two-phone concurrent clocking and reconnection checks passed. The earlier physical-device evidence gap is closed by owner confirmation; no new rehearsal was run here. Preserve accepted single-device role/sign-in evidence and use an ordinary Mentor, not a shared Coach session. The older same-computer click attempt was inconclusive and is not the evidence for this confirmation.
- Historical context: the owner deferred physical-device checks on October 18 without blocking rollout; the October 22 success confirmation supersedes their deferred status. Mounted frontend regression gaps above remain separate from the successful device rehearsal.
- The original Pay contrast report was not reproduced. Released gold/dark styling has representative candidate evidence; root cause on the reporting device remains unconfirmed. CSV cents headings remain deferred.

### October 18 audit follow-ups

Historical reports identified the following separate bug list, explicitly not repaired by the final wording batch. Reconcile with later source/releases before claiming a current defect or starting changes:

| Reported issue | Retained follow-up |
| --- | --- |
| Waitlist display and Promote use different dates | Verify one chronological queue invariant across display, eligibility and reenrollment. |
| Bulk-payment deduplication differs by retrying Coach | Verify cross-editor replay identity and exact no-double-credit behavior; later payment CSV work may supersede the original path. |
| Seeded event date appears one day early | Separate date-only/all-day data from timestamps; check preserved fixture dates against later Central/exclusive-end formatting fixes before changing records. |
| Whole Team fixture student shows Not registered | Check eligibility/fixture provenance and the durable enrollment state; do not repair by reseeding or silent enrollment. |
| Existing independent-travel flag has unknown setter | The flag alone has no setter/timestamp proof; inspect available audit evidence only under authorized operational scope. |

The batch reports say server-backed waiting/declined states, join revalidation, roster/archive controls, grouped navigation, Travel Lead event/join access, Parent/Coach-only independent travel and Whole Team leave notices were implemented. Preserve those decisions in DECISIONS; do not reopen them merely because the older audit lists them as bugs.

Stored subteam conversion was explicitly deferred: no development conversion or production key comparison was performed by that batch. Preserve the final Business/Media spelling and migration mapping in DECISIONS; require fresh preview, revision checks, audit and explicit data-write authorization before conversion.

Remaining representative evidence from those reports: live Parent independent-travel checkbox/save on an eligible event, actual Whole Team leave (the observed confirmation was cancelled), hard-to-undo action confirmation including original reason and changed targets, charge-tool full-list review, collapsed/Close details layouts, and unobserved light/state combinations. Retain these as scoped evidence limits; later accepted visual closure and owner-confirmed inbox/device checks remain closed. Adult-Student FIRST had code/Parent-only evidence; the October 18 Mentor report was missing, and its Coach phone pass was 500px rather than 390px. No exhaustive role/device certification follows from that audit.

Additional test-quality gaps retained from the October 21 audit: meaningful health canaries rather than empty absence assertions; independent expected CSV/conservation outputs; precise rejected-operation/no-change checks instead of swallowed errors; avoid tying behavior to worker page size; verify PDF text/placement rather than page count alone. Some approved assertion fixes already landed; reconcile source before expanding tests or changing counts.

Development reviewer-fixture safeguards: the richer synthetic dataset helper is development/Coach-bound and does not fabricate auth roles, Parent links/attestations or signatures. Keep private reviewer guide/index/before-after/cleanup-ledger artifacts ignored; historical record counts are not current inventory. Refresh exact provenance/dependencies and shared aggregates before any approved cleanup; the narrower production account-cleanup tool does not cover this richer dataset. Do not reset/reseed, broaden grants or run conversion just to reproduce screenshots. Past synthetic-season/date mismatches are display evidence, not current-season eligibility proof.

## Docs Cleanup

Phase 2 removed consolidated notes and obsolete plans. The following KEEP content updates remain deferred; reference repairs do not authorize a broader content rewrite. Mechanical reference fixes from the receipt moves did not reopen their content.

- .agents/skills/student-status-prototype-verification/SKILL.md: reconcile its old visual-matrix/log update rules with the short HANDOFF and conditional BACKLOG; remove assumed sibling access.
- convex/_generated/ai/guidelines.md: review generator-managed version/header against pinned Convex 1.46.0; do not hand-edit generic APIs merely from memory.
- docs/ACTIONABLE_ERRORS.md; docs/ADULT_INVITATION_EMAIL.md: replace superseded development-only framing, trim repeated release narrative, retain failure/privacy contracts.
- docs/ATTENDANCE_REPORT_IMPLEMENTATION.md; docs/EVENT_CALENDAR_SYNC.md: reconcile current query/worker/calendar contracts and historical verification/status statements.
- docs/BULK_INVITE.md: retain Coach approval rules; remove obsolete local-only/no-sync/no-release statements.
- docs/GOAL_ACCEPTANCE.md: retain G1–G7 requirements/accepted limits; distinguish historical development gates from later production receipts.
- docs/GOOGLE_PRODUCTION_SETUP.md; docs/REPOSITORY.md: reconcile historical setup/initial-release identifiers with current procedure; do not change actual provider settings.
- docs/MENTOR_PROFILE_FUNDRAISERS.md: distinguish saved-link Connected status from later Zeffy donation verification/import.
- docs/ROSTER_SORTING.md; docs/STAFF_SETUP_WIZARD.md; docs/STUDENT_GRADE_DROPDOWN.md: retain behavior, remove superseded pending/development-only framing.
- docs/SEASON_ADMIN_IMPLEMENTATION.md: retain durable contracts/unsupported historical correction holds; reconcile dated verification claims.
- docs/USAGE_OPTIMIZATION.md: retain measured evidence/limits, reconcile released cadence and roster freeze.
- docs/TIMECLOCK_BACKEND_HANDOFF.md: preserve detailed API contracts, update scaffold/sign-out, polling/query arguments, production status and owner/worktree assumptions.
- docs/ZEFFY_SYNC.md: preserve limits/replay/provenance; reconcile old unobserved-schedule and implementation/release statements with the owner-confirmed successful automatic run on October 22.
- docs/DEVELOPMENT.md was classified KEEP in the audit but its content update is deferred by Phase 1 scope: replace old checkout paths, manual-invite/consent status and milestone narrative; keep valid commands.
- docs/REHEARSAL_2026-10-12.md and docs/releases/ receipts remain historical evidence; any current-status clarification is deferred. Phase 1 reference-only repairs do not reopen their content.
- Retained MERGE source: docs/ACCOUNTS_PERMISSION_IMPLEMENTATION.md still has unique detailed version-1 compatibility, schema/coverage and paper-signature contracts; consolidate those against current code before removing it. Its old status paragraphs do not override the current signing deferral.
- Retained MERGE source: docs/FINANCE_ADMIN_IMPLEMENTATION.md still has unique financial locks, bounded worker/recovery, projections and export contracts; consolidate those before removing it. Do not interpret its historical next-slice lists as current authorization.
- The existing checkpoint skill now uses the short HANDOFF, conditional BACKLOG and domain DECISIONS. The temporary Phase 2 plan was removed when cleanup completed; preserve historical release receipts, CLAUDE's AGENTS pointer and the four demo references.
