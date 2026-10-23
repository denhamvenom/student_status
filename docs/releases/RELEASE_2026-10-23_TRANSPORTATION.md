# Transportation choices release - October 23, 2026

Owner authorized production release of PR36. Release identifier: v0.1.0-onboarding.16. Reviewed implementation: 6a03a939356c80cc0ffd151aac1beac613e8582b; prior main: b392bd0.

New events and event transportation settings offer Charter Bus, School Bus, Team Carpool, and Provide your Own. Own transportation excludes driver/seat/rider controls and transportation readiness, and rejects ride changes through current and legacy assignment APIs. Existing assignments remain preserved when switching modes. New consent snapshots use the shared transportation rule; stored signed evidence is unchanged.

Validation: lint, TypeScript, production build and 17 targeted tests passed. The legacy-path follow-up passed 14 transportation/UI tests and development sync/typecheck. Live development API checks passed creation, each mode, persisted settings, readiness exclusion, mutation rejection and assignment preservation. Synthetic test records were cancelled/deactivated. Full suite: 646 passed with two unrelated failures; their 35-test suites passed in isolation. Authenticated browser walkthrough remains unverified.

Release order: deploy backward-compatible backend to production amicable-eel-413, then merge PR36 to main to trigger existing Cloudflare builds. Verify live production assets and traffic. No migration, real record submission, invitation, payment or consent signing is part of release verification.

Prior Student Status Worker version: 3a5cd588-7f09-4637-8090-b3eaae742585 (100%). Code rollback can restore that frontend and prior main backend; it does not reverse saved event choices or audit history. Preserve new stored choices and transport-disabled flags during any rollback. Final merge SHA, deployment versions and live verification results belong in the immutable GitHub release notes.
