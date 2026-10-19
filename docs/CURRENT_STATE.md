# Current integration handoff

## October 18 production changeover authorized

Owner explicitly authorized fixing stale tests, publishing development changes, removing all production synthetic data and all non-Coach application accounts/sign-ins, preserving the verified permanent Coach and real settings/credentials, then releasing the upgrades. Full live student onboarding is deferred to tomorrow by owner. Credentials must remain in place and must not be copied locally.

Private production data/storage recovery export saved; original Coach identity matched the private initialization ledger. Inventory: four other accounts, one test student, related invitations/links/auth/zero-money summaries; no event/payment/signature records. Real calendar occurrences and Coach/season/FIRST/family-readiness records remain preserved. Exact manifest, snapshots and account identities are ignored private evidence only.

The four stale assertions are fixed. Full application check passed with 423 tests before the final invitation-acceptance regression test; that final focused maintenance suite passes 5/5 and typecheck passes. Timeclock checks pass. Lint now excludes ignored private operator files; shipping source remains checked. Cleanup tests 7/7 cover exact fingerprints, protected Coach auth/session chain, signed orphan verifier cleanup and 63 unrelated real calendar rows. Temporary maintenance gate protects Google login, ordinary access, join requests and invitation acceptance. Development sync passed before the final invitation guard; final sync/release verification remains pending.

Production cleanup/deployment has not yet executed. Existing credentials, FIRST/Calendar settings, real season and Coach must remain. Planned sequence: publish reviewed feature checkpoint; deploy necessary maintenance/cleanup backend under Coach-only maintenance; revoke old join code; refresh backup/manifest; preview and atomically remove reviewed test rows; disable cleanup switches; merge matching frontend release and verify both hosts and remaining production records. Remove temporary maintenance closure after verification so normal onboarding can proceed; no new team code is created until requested.

See [production changeover report](PRODUCTION_CHANGEOVER_2026-10-18.md) for execution evidence. Earlier development-only stop instructions and retained-test-account notes below are historical and superseded by this authorization.

## October 18 Batch 4 workflow changes

Batch 4 implementation, independent review and role spot-checks are complete on `feature/development-review-fixtures-2026-10-18`. See [Batch 4 report](audit-2026-10-18/batch-4-report.md) and [copy inventory](audit-2026-10-18/batch-4-copy-inventory.md). Owner clarified the only selectable subteams: Build, Electrical, Machining, Programming, Business/Media. Owner explicitly deferred stored-record conversion; no production access or backfill. Final development backend sync, build/typecheck, source lint and 18 focused tests passed. Full suite before that last update: 412 passed, four existing stale assertions; full lint nine existing private-helper errors. Coach confirmation Cancel and staff Money tools/New event checks passed without shared-data writes. Parent Money/Home and event signup guidance checked. Student Home money, read-only independent travel, Whole Team leave confirmation and Cancel checked; participation stayed confirmed. This report accompanies the reviewed development checkpoint. Stop after Batch 4. No main merge or production rollout.

October 18: controlled footer/account rehearsal completed and verified; accepted operational deferrals are recorded below. Current branch feature/development-review-fixtures-2026-10-18. Root owns Git/backend/releases; Sol implementation and Astra review.

## Verified production state

- Both websites deploy approved PR14 at 68179f7; shared Convex amicable-eel-413 remains PR12/8c22d50. Google External/In production and verified branding/public URLs are saved. Existing credentials preserved.
- Permanent real Coach and approved 2026â€“2027 season preserved; temporary bootstrap gates removed. All four requested test roles established via actual Google identities and supported join/invitation flows. Parent simulated relationship/attestation explicitly approved and logged privately; own synthetic child setup/dashboard verified.
- Travel Lead has no finance editing or health export. Mentor Timeclock Google login and signed-in footer verified. All footer links remain accessible; earlier local Chrome block no longer reproduces, with no protection changes.
- PR13 explicit ordinary-login destination verified live; PR14 error-screen Sign out verified live. Coach family maintenance completed with zero unresolved links; one correctly scoped link checked in both passes. Preserve permanent readiness record and Coach audits.
- Private ignored ledger holds exact synthetic identities, records and dependencies. Latest bounded inventory: 38 selected rows, all scanned tables <=40. Exact cleanup tool tested/deployed but disabled; no cleanup preview or deletion executed. Refresh dynamic auth data and prepare reviewed manifest before removal. Four test accounts remain intentionally present.

## Remaining rollout boundaries

The previously supplied FIRST invitation is saved for the live season and matches private owner inputs exactly. Calendar sync verified fresh (44 seconds old, no error). On October 18 the owner explicitly deferred physical tablet/two-phone concurrency/reconnection testing and stated it must not block rollout. Enrollment timing remains an owner operational decision. Student/Parent personal profile fields remain incomplete intentionally; no invented birth dates/contact/health information. Real signing disabled; backups deferred and recovery unproven. These are not covered by the completed account/footer evidence. No event, attendance, payment or signature rehearsal was performed. See PRODUCTION_ONBOARDING_RELEASE.md and PRODUCTION_ONBOARDING_PLAN.md.

## Local rehearsal alignment â€” October 18

Owner requested updating local development only. Freshly fetched origin/main is 68179f77212aef7c4f177b333271156389868a2d; local application/backend/dependency source matches that release exactly. Newer local differences are handoff documentation only. Existing dev:third-bandicoot-18 synchronized successfully with Convex typechecking; no reseed, reset, production sync, credential copying, or production configuration changes. Student Status local settings already target development; added ignored apps/timeclock/.env.local with the same public development endpoint. Existing development records remain separate from production. Google login and role preparation for the final rehearsal still require a fresh browser check; this synchronization does not claim that check passed.

Validation: both application TypeScript checks and local Vite builds passed. Student Status retains its existing large-bundle warning; no build failure. No source change or repeated full test suite was needed because application source matches the already-reviewed release.

## Development review dataset ready

October 18 owner-authorized enrichment completed only on third-bandicoot-18. Six new unlinked fictional students and two events added; 12 current-season students, 19 total, 9 events, 52 ledger entries. Existing accounts/family links/receipts/season settings preserved. See DEVELOPMENT_REVIEW_DATA.md for validation, private reviewer HTML/CSV and exact cleanup ledger. Do not use production account cleanup for this richer dataset. Fresh local Google login remains to be checked; fixture population is not full browser evidence. Current synthetic season dates begin June 2027; inherited older attendance/consent dates have an explicit caveat. No production or main changes.
