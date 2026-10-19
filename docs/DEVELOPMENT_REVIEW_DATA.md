# Development reviewer dataset — October 18, 2026

Owner requested a richer existing development dataset and a full navigation/interpretation guide. Target is dev:third-bandicoot-18 only. Production and main remain unchanged. Application code remains based on released 68179f7; the only new backend capability is the internal development-bound reviewer fixture.

## Implemented and verified

Added six fictional, unlinked students and two events with exact provenance in reviewerRehearsal.ensure. Existing active-season Whole Team membership adds the five active students through the normal helper; inactive student excluded. No auth identity, family grant, Parent attestation or signature is fabricated. Existing account, family-link, permission-submission and season records compare unchanged before/after.

The examples supply partial payment (100 dollars charged, 60 applied, 40 due), unpaid charge (100 due), separate personal/fundraising credits (25/15 dollars), zero balance, active/inactive roster, completed/incomplete basics, unconfirmed fictional structured health data, FIRST verified/needs-completion/awaiting states, pending/waitlisted/confirmed participation, assigned/unassigned rooms, independent travel and approved fictional vehicle. The trip is zero-fee: the review charges are separate obligations. Capacity four includes the pending reservation.

The existing active season is a future synthetic rollover season beginning June 2027. New event/deadline dates are within it. Prior consent/attendance examples sometimes predate that season: preserved historical display evidence, not current-season date-eligibility proof. No new past attendance created. Existing electronic/paper receipts, finance corrections/transfers, closed/corrected attendance, season carryover and retention history remain available.

After capture: 19 students total, 12 in active season; 9 events; 52 ledger entries; 800 domain records across 90 tables. 82 new domain records, zero removed. Existing changes: one future Whole Team event count and unrelated Calendar cron freshness. Component aggregate data is maintained by normal financial helpers and is outside the domain record index.

## Reviewer deliverables (private, ignored)

- private-data/rehearsal-preview/REVIEWER_GUIDE.html: exact names, routes, role account directory, balances, event/participation lists, supporting history and limitations. Share only with authorized reviewers.
- private-data/rehearsal-preview/reviewer-record-index.csv: every captured domain record, ID, related IDs and local path where applicable; excludes auth secrets and component internals.
- reviewer-before-2026-10-18.json / reviewer-after-2026-10-18.json: private baseline and resulting snapshot, not a complete database backup.
- reviewer-cleanup-ledger-2026-10-18.json: exact added rows and changed existing before/after state; unrelated Calendar changes classified separately. Not an executable deletion plan. Refresh after reviewer writes and account for shared aggregates before removing anything. The narrower production account cleanup tool does not support this richer fixture.

## Validation and limits

Independent Astra source review accepted the final helper; three focused fixture tests pass, including development/Coach guards, correct source-backed finances, marker idempotence, existing record preservation, profile readiness and season dates. Focused lint and Convex typecheck passed; synchronized only to development. Actual saved records checked against expected balances, capacity, season dates, identity boundaries and before/after preservation. No repeat whole-app suite or frontend build was needed for a data-only development helper.

Google development sign-in still needs a fresh browser check. New unlinked records are for adult inspection; Student/Parent journeys use existing authorized linked accounts. No extra-grant Travel Lead or uninvited browser identity was created; reuse existing focused authorization evidence unless a specific live grant test is authorized. Physical concurrency/reconnection remains deferred and nonblocking. No production changes, real signing, messages, real money or deletion occurred.
