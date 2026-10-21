# Actionable errors - development verification, October 20

Branch: fix/actionable-errors-2026-10-20, based on released main 9deefe7. The old development-review-fixtures and sibling parent-email-invitations branches shared that commit; no divergent source needed merging.

## Behavior

Expected backend failures now use explicit ConvexError data, including shared contact validation. The shared frontend formatter preserves those messages, handles connection/session failures, and supplies contextual recovery text for unknown errors. Render boundaries and stored worker-status responses hide unclassified internal diagnostics. Parent invitations explain the one-hour cooldown and suggest checking inbox/spam; entered answers remain available after failure. These conventions cover the existing Student Status forms, actions and boundaries, not only invitations.

## Evidence

- Independent Astra source review completed with no unresolved blockers, including the final Coach-access guard correction.
- Broad host regression: 109 files, 587 tests; 585 initially passed. The two failures were a legacy diagnostic expectation and a Coach-access error being masked. Dashboard reports (7 tests) and family-link migration (3 tests) passed after correction. No remaining failure in this selected suite.
- Fee-bulk suite run separately: 8 passed, 1 excluded. The historical >500-charge case timed out at 30 seconds; it remains an unresolved preexisting limitation, not a passing test. Sandbox multi-file runs lost temporary files, so reliable regression runs used the host environment.
- Error formatter/public-error contracts/parent invitations: 33 tests passed. These verify public error data, privacy fallback, contact validation, Promise results and cooldown guidance.
- Scoped source lint, application typecheck and production build passed. Build retains the existing chunk-size advisory. Final touched-file lint is recorded with the checkpoint.
- Development backend third-bandicoot-18 synchronized with typecheck enabled. No production deployment or main merge.
- Actual SetupWizard component: 8 browser checks passed at 390px dark and 1440px light across cooldown, network, session and unexpected errors. Entered email stays present, retry remains enabled, and no horizontal overflow was observed. Screenshots are ignored local artifacts under test-results/error-messages.

## Local review

Real development app: http://127.0.0.1:5173

Isolated actual-component review: http://127.0.0.1:5182/setup?scenario=cooldown

The review uses a fictional student and mocked failures; enter parent@example.test and click Invite a parent. Scenario links switch error cases. This demonstrates actual UI components without sending email or modifying records. It is not evidence of a real invitation being sent. Temporary harness and screenshots stay out of Git.

## Remaining boundary

Owner localhost acceptance and explicit production authorization are pending. Development email remains disabled and Calendar writes production-only. No real student data, email deliveries or financial writes were used for verification.
