# Production changeover — October 18, 2026

## October 18 production changeover authorized

Owner explicitly authorized fixing stale tests, publishing development changes, removing all production synthetic data and all non-Coach application accounts/sign-ins, preserving the verified permanent Coach and real settings/credentials, then releasing the upgrades. Full live student onboarding is deferred to tomorrow by owner. Credentials must remain in place and must not be copied locally.

Private production data/storage recovery export saved; original Coach identity matched the private initialization ledger. Inventory: four other accounts, one test student, related invitations/links/auth/zero-money summaries; no event/payment/signature records. Real calendar occurrences and Coach/season/FIRST/family-readiness records remain preserved. Exact manifest, snapshots and account identities are ignored private evidence only.

The four stale assertions are fixed. Full application check passed with 423 tests before the final invitation-acceptance regression test; that final focused maintenance suite passes 5/5 and typecheck passes. Timeclock checks pass. Lint now excludes ignored private operator files; shipping source remains checked. Cleanup tests 7/7 cover exact fingerprints, protected Coach auth/session chain, signed orphan verifier cleanup and 63 unrelated real calendar rows. Temporary maintenance gate protects Google login, ordinary access, join requests and invitation acceptance. Development sync passed before the final invitation guard; final sync/release verification remains pending.

Production cleanup/deployment has not yet executed. Existing credentials, FIRST/Calendar settings, real season and Coach must remain. Planned sequence: publish reviewed feature checkpoint; deploy necessary maintenance/cleanup backend under Coach-only maintenance; revoke old join code; refresh backup/manifest; preview and atomically remove reviewed test rows; disable cleanup switches; merge matching frontend release and verify both hosts and remaining production records. Remove temporary maintenance closure after verification so normal onboarding can proceed; no new team code is created until requested.

See [production changeover report](PRODUCTION_CHANGEOVER_2026-10-18.md) for execution evidence. Earlier development-only stop instructions and retained-test-account notes below are historical and superseded by this authorization.
