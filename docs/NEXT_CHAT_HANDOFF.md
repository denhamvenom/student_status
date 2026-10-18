# Continue production Parent readiness

Current branch fix/setup-signout-recovery-2026-10-18. Production frontends f4bd7dc (approved PR13), shared Convex amicable-eel-413 remains PR12/8c22d50. Real Coach, production season and all configuration preserved. Coach, Student, Mentor and Travel role logins verified. Timeclock Mentor login and authenticated footer now verified. No events, money, attendance or real signatures created.

Parent Google login and invitation accepted after owner explicitly approved simulated Parent relationship and test-only authority attestation. Exact records and this authorization are in ignored private-data/launch-testing-2026-10-18/ledger.json. Parent dashboard still fails setup summary after reload. Read-only preflight proves familyLinkSeasonBackfill absent and one synthetic family link present. Source requires completed readiness before Parent season-scoped pages. Do not bypass it.

Recovery fix: src/LiveApp.tsx adds Sign out alongside Reload in SetupEntryGate error state, using normal auth action, busy protection and error feedback. Sol scoped ESLint, TypeScript/build and diff checks pass. Astra final source review passed. No backend changes. Await concrete release approval before merge; main builds both websites automatically.

Then sign out Parent normally, sign in actual Coach, open Settings family maintenance and start existing familyLinkSeasonMigration.start. Target production amicable-eel-413. It validates each link against the student's season, fills missing season IDs, verifies in a second pass and records complete; mismatches fail closed. Requires concrete production authorization. Preserve permanent migration readiness/audit, Coach and season; synthetic link remains in cleanup ledger. Recheck Parent setup/dashboard after completion. Do not invent missing personal profile details.

Private auth/session dependencies are dynamic and must be refreshed before exact cleanup. Cleanup gates remain disabled, no deletion authorized or run. Paid backups deferred/recovery unproven per prior owner decisions.
