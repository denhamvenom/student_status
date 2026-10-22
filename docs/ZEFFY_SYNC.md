# Zeffy donation import

## Agreed behavior

- Read the existing student fundraiser links maintained in Money tools. Match them to the Zeffy campaign URL, allowing the optional locale prefix, `www` host and tracking query parameters. Never match by donor email or student display name.
- Credit completed, supported USD online peer-to-peer donations dollar for dollar as fundraising funds. Reuse the existing ledger, source projections and charge-priority allocation. Owed amounts stop at zero; unused credit remains available.
- Retain imported payment IDs and campaign/student/season associations. Repeated checks must not create another credit. New yearly links are resolved from the existing link fields; previously recorded campaign ownership is not silently reassigned.
- The active season may be fundraising before its configured start date. The saved link and season ownership determine attribution; the season start date is not an import cutoff.
- Hold unmatched, ambiguous, historical-season, changed, refunded or disputed donations for Coach review. This version does not automatically reverse credited money or transfer it between seasons.
- Check at 7 AM and 7 PM America/Chicago, with daylight saving changes. The scheduled backend job does not depend on a browser, chat or workstation remaining open.
- Keep Zeffy credentials server-side in `ZEFFY_API_KEY`. Do not retain donor names, donor email addresses, card data, receipts or complete provider payloads in the integration tables.

## Validation and release boundary

The owner cannot use the development deployment for a realistic rehearsal. Validation therefore consists of local synthetic financial/authorization tests, local UI inspection, and read-only live data checks. No development database copy, seed or test credit is required.

Read-only source-system checks confirmed that a real payment carries a stable campaign ID, its campaign URL resolves to exactly one existing current-season student link after normalization, and the student's account is ready for financial allocation. Account-specific evidence stays outside Git. These checks do not prove that a production credit has been posted.

Before activation:

1. Finish local validation and independent review. Publish the reviewed feature branch and PR; do not merge a deploying branch without approval.
2. Obtain approval for the production backend/frontend release and activation. Add `ZEFFY_API_KEY` securely to the production deployment; the existing development setting does not propagate automatically.
3. Deploy with automatic checks initially disabled. Review the Coach's live donation preview before enabling checks.
4. Enable checks, run the first import, verify the ledger and account summary, then run again to prove the same donation is skipped.
5. Confirm the scheduled job is active and observe its next result. Do not claim scheduled execution was verified merely because the cron definition exists.

If an import fails, preserve existing ledger entries and payment IDs. Inspect the last run/error and review items before retrying. Disabling automatic checks is the operational pause; it does not remove already recorded credits.

## Evidence

Implemented and independently reviewed. Strict TypeScript, source lint and application build passed. Actual-component synthetic browser checks at 390px/dark and 1280px/light found no page errors or horizontal overflow; the enable confirmation opened and canceled correctly. Screenshots and harness remain ignored local evidence.

The initial full-suite attempt hit Windows sandbox temporary-module ENOENT errors before 91 suites could run. Rerunning with a workspace temporary directory reached 635 passing tests and four failures: three unchanged suites timed out under concurrent load, and the new rollback fixture omitted provider fields while implementation was still being finalized. The fixture was corrected; the four affected suites passed 25/25 on a single-worker rerun. The final nine Zeffy tests cover real allocation/overpayment, duplicate/relink/refund holds, preseason and historical ownership, status safety, role denial, interrupted-run recovery, mapping before the first donation, and per-payment rollback with later-payment progress. No test assertions or timeouts were weakened.

The read-only live preflight used the candidate URL/eligibility helpers against records held only in memory. It verified one eligible donation and its expected before/after balance. This is a preflight, not a deployed-action or production credit test. Convex code generation read development metadata and generated local bindings; no backend deployment or development database rehearsal occurred.

Owner approved production release and activation on October 21. PR34 merged as `07d3223`; production backend and website are deployed. The key was copied securely and verified without printing it. Live preview found one eligible payment and no review items. First import credited one payment; a second run credited zero and skipped one. Ledger provenance and resulting allocation were verified privately. Automatic checks are enabled. Actual scheduled execution remains unobserved; next intended slot is October 22 at 7 AM Central. Attempts to inspect scheduler system records through the application CLI did not expose the cron registry, so they are not scheduler verification. The deployed source contains the DST-aware cron and action gate. The integration defaults off for new deployments. Provider list reads stop with an explicit failure beyond 100 pages/10,000 records, and the preview snapshot has a 5,000-record safety bound; those bounds require a future pagination strategy if reached. Existing manual fundraiser campaign totals remain separate from Zeffy receipts; student source/raised/account projections include Zeffy provenance.

Provider reference: https://support.zeffy.com/get-started-with-the-zeffy-api-yourg
