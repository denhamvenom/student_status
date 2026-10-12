# Fictional operations rehearsal — October 12, 2026

This is development evidence for the Student Status operations milestone. Every student, event, amount and ledger entry used here is fictional. The checks below have different levels of evidence: local automated tests use mocked Convex identities, while the live observations were reported by the integrating session using the development app. Neither constitutes a production release test.

## Automated checks

`convex/financeOperations.test.ts` has six focused cases. They exercise personal-payment-only payout limits and idempotency; mixed-source fundraising transfer and conservation; unauthorized, cross-season, inactive and overdrawn requests; atomic rollback when recipient allocation fails; preserved fundraising source after a return; and competing spends against one available balance.

`convex/operationsRehearsal.test.ts` has two integrated cases using fictional `example.invalid` users and mocked Convex identities. They run the public signup, approval, room, charge, payment, fundraiser, withdrawal, payout and transfer APIs in sequence. Assertions cover pending capacity, manual waitlist promotion, room release, partial internal return and priority reallocation, source-preserving recipient allocation, linked-parent scope and revocation, and Mentor/Travel Lead/financial-grant boundaries. `convex/developmentRehearsal.test.ts` has four guard cases for the fictional fixture: exact development URL, active Coach and owned season, repeat idempotency, and collision refusal. These tests do not sign in through Google or open a browser.

Final full local check: `bun run check` passed ESLint, strict TypeScript, all **97 tests in 17 files**, and the Vite production build. The first sandboxed run failed with Windows temporary-file `ENOENT` errors across unrelated tests; rerunning the unchanged check outside that sandbox passed. Vite reported a nonblocking bundle-size warning. No deployment occurred as part of this check.

## Development app observations reported by the integrating session

The integrating session reported creating the guarded fictional fixture and using the live Coach UI to approve the pending signup, inspect capacity, and manually promote the waitlisted student after the place became available. Coach created a fictional Boys room, assigned the two confirmed participants, and finalized it with two occupants. Coach assigned an existing synthetic van with four passenger seats for two riders; the shortage warning cleared. It reported recording a fictional $10 cash/check payout and a $5 same-season fundraising transfer, with the resulting history and balances visible. The finance UI's orphaned DOM issue was repaired during that check. Payment and charge forms were then changed to reuse an idempotency key on uncertain retries and lock their inputs during a pending request; those changes passed the final source checks, but still need a dedicated live retry rehearsal.

The integrating session also reported a live Timeclock session auto-closing at the three-minute limit while retaining an original interval of about 2.9 minutes and a separate one-minute correction. Original clock evidence and correction history remained distinct in that observation. A Google-signed-in Student used an existing account to sign up when capacity two was full and entered the waitlist. A Parent in a separate Chrome profile saw the waitlisted status update on event detail. The Student requested withdrawal; Coach approved a zero-paid waitlist withdrawal, the pending queue changed from one to zero, and the Parent view reactively changed to Withdrawn. No account role changes were made. The parent-linked account could also read its student's finances and event information; the parent Attendance route still showed a placeholder rather than a completed attendance view.

No student, event, account or deployment identifiers are included in this report. The live observations above are reported integration evidence, not independently repeated in this document's automated test run.

## Remaining rehearsal scope

The live Student/Parent check above covered a zero-paid waitlist withdrawal, not a paid confirmed-event withdrawal with allocation return. Live Travel Lead and ordinary Mentor journeys still need separate authorized accounts and browser checks, including denial boundaries after permission changes. Multi-device timing and conflict behavior remains unverified here. The fictional fixture creates no student login or parent link, so it cannot supply that evidence by itself. Parent Attendance needs implementation before its route can be counted as a working family workflow. Real OAuth role changes, production consent and production data remain outside this rehearsal.


## Reviewed checkpoint

Astra accepted the final source for synthetic development with no blocking findings, independently rerunning 21 changed-backend tests. The full suite contains 97 passing tests. Final React key edits also passed strict types, build and Cloudflare packaging dry-run. The reviewed backend synchronized successfully to the existing development deployment only. No production or main action occurred.

Live regression: switching the financial student cleared the unsaved payment amount/reason; exactly one charge panel and one financial-operations panel remained. Navigating away left zero such panels. Event administration retained the finalized room and assigned synthetic vehicle. Payment/charge uncertain-response retries remain source-reviewed and backend-idempotency-tested; no live network-failure injection was performed.
