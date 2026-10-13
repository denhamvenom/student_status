# Current integration handoff

Updated October 13, 2026. Read COMPLETION_WORKFLOW.md; finish coherent workflows and batch verification.

## Workspace and boundaries

- App: student-status-readiness-design; branch feature/student-status-completion; draft PR10. Latest published policy checkpoint729340d; current Finance integration is local pending publication.
- Development only: daniel-eiland / denham-venom-student-status / dev:third-bandicoot-18. Reviewed Finance functions synchronized13:21:10. No production/main merge authorized.
- Synthetic records only. Student records, secrets, account-specific screenshots/exports never Git. Real signing and automatic retention deletion remain gated.
- Full G1-G7 goal remains active through readiness for Coach visual approval. No broad outcome closed. Use DEVELOPMENT_CHECKLIST and single VISUAL_CHECKS queue; rough percentages are not measured completion.

## Current deliverable: connected Coach Finance

Implemented/source-reviewed: native paginated team account table with separate personal Paid and fundraising Credits, fundraising-only Travel account, guarded preparation/recovery, readable typed financial history with real coverage dates and fee identity, and bounded historical backfill. V4 source projections preserve financial provenance; old jobs continue through persisted trusted markers, new commands require verified projections. Team totals fail unavailable on unsafe sums.

Main screen now puts accounts first; account details/editors stay outside the dismissible payment-only dialog. Record payment preserves existing exact cents/idempotency and prevents dialog closure during submission. Financial query sections have independent retry boundaries.

Validation: full lint/types/289tests across54files/build passed before final UI/fee-identity refinements; final strict types, scoped lint,13UI tests and build pass, backend owner9targeted tests after fee identity pass. Astra final batch review clear. Two500-member tests have reviewed per-test15second budgets after isolated pass confirmed concurrent5second timeouts. Bundle1045.90KB warning remains follow-up, not a completion claim.

Live: development sync13:21:10; all six fictional accounts prepared and historical coverage completed through Coach UI, preserving original totals. One fictional cent recorded through named payment dialog, with close/submit disabled while pending, success feedback and focus returned to row Record. Paid1.00→1.01, due9.00→8.99; team applied31.00→31.01. Account details and responsive reference comparisons remain to verify. Use browser DOM snapshots when AX intermittently reports stale Connecting state; do not restart services merely on that observation.

## Parallel ownership / next work

- Root owns integration, Git, sync and live verification. Current Finance backend is frozen/source-clear.
- Sol season owner has only isolated current-season student lookup/helper test compiled. Approved family-link season-index migration/helper/writer work waits for root schema handoff after this Finance checkpoint; existing Parent callers unchanged.
- Next financial slice remains scoped export/import/payment correction; season carryover/historical corrections, attendance kickoff/category integration, outstanding role journeys and visual matrix remain required.
- Timeclock owns apps/timeclock in its separate worktree. Cutover constraints recorded in SEASON_ADMIN_IMPLEMENTATION; concurrent Group/physical-device/ordinary Mentor checks remain open. Preserve reserved tab/auth/origin.

## Decisions

Whole Team later additions: upcoming only, preserving withdrawals. Departure funds normally nonrefundable; explicit Coach-reviewed personal-to-team transfer requires audit but no family authorization; exceptional family refund request and actual payout remain separate. Archive does not sweep funds. Retention is five years from latest actual archive; no deletion. Official FIRST kickoff starts build season; Outreach classification awaits user response. See FINANCE_AND_CONSENT_DECISIONS and SEASON_ADMIN_IMPLEMENTATION for details.
