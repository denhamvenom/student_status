# Student event display release - October 21, 2026

Owner explicitly approved releasing PR33 and verifying the actual site. Release identifier: v0.1.0-onboarding.13. Reviewed implementation: 575fe30; integrated base: 267b789 (PR32 test cleanup).

Scope: student/family dashboard, event cards and detail headings now include Central start/end times with CST/CDT; Calendar all-day dates retain exclusive-end semantics. Pay Now uses established gold/dark-text styling. No backend, schema, dependency or configuration changes. Synthetic preview theme-switch repair remains in ignored local mocks and is not production code.

Pre-integration evidence: 630 tests, source lint, strict types/build, independent Astra source review and ten synthetic actual-component browser checks (390px dark, 1440px light). Normal/hover/focus Pay styles verified. The reported original Pay issue was not reproduced in the harness; root cause remains unconfirmed. No real payment or student data writes used for checks.

Production target: Team 8044 account, denham-venom-student-status Worker, https://students.team8044.org. Main merge triggers existing builds for both frontends. No Convex deployment is required. Confirm the actual served entry and deferred LiveApp assets contain the reviewed implementation and production Convex endpoint; document any CLI fallback if automatic builds are delayed. Final execution evidence will be recorded in immutable GitHub release notes.

Rollback baseline Student Status Worker: a31339f5-3763-4572-8535-a51d41140f8c. Frontend-only rollback requires no database reversal. Existing clients may need a reload to receive the updated bundle.

Integrated release validation: 630/631 tests passed in the full run. The known intermittent bulk-invitation daily-limit assertion failed; its complete 26-test file passed on targeted rerun. Source lint, strict types, production-target build and Wrangler packaging dry-run passed. Runtime source is unchanged from the reviewed implementation; integration added approved tests/instructions and reconciled docs.

Executed: PR33 merged at 4f4b0f2aa1b2bc67163f69456c1be0dbbef5ec41. Release v0.1.0-onboarding.13 published. Automatic build remained pending, so CLI deployed the identical approved production build. Worker e4686496-6301-40a7-a065-fd109876c0c4 confirmed at 100%. Public root/sign-in rendered and entry/LiveApp JS/CSS returned 200 with exact local SHA-256 matches. Production endpoint only; fix markers present; no preview mocks. No authenticated student or payment rehearsal. Full execution notes: https://github.com/denhamvenom/student_status/releases/tag/v0.1.0-onboarding.13.
