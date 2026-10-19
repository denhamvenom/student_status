# Current integration handoff

## Current local sign-in milestone — October 19

Checkout: student-status-readiness-design; branch feature/development-review-fixtures-2026-10-18. Production baseline is main 5fa254c (PR22). This milestone is development only: no main merge or production deployment. The parent-invitation chat confirmed shared backend ownership and held synchronization.

Implemented Student / Parent or team staff chooser with existing design components. Students see Google only; adults can choose Google or email. Active approved Coach/Mentor identities and valid adult invitations can use email; invitation acceptance remains explicit. Server guards prevent email-authenticated adults from entering student enrollment, including pending-request approval races. Existing parent invitation behavior is preserved.

Verification: 522 tests / 100 files passed, final focused approval regression suite 44 passed, lint and application build/typecheck passed. Independent security review clear. Convex development third-bandicoot-18 synced successfully with backend typecheck and additive adult identity index. Development email and Calendar write configuration unchanged. Mock-hook browser checks covered both choices, Back, Google error recovery, code-entry focus and one-minute resend timer. Desktop light and narrow dark presentation inspected; no real email or new Google sign-in was exercised. See FRONTEND_CONFORMANCE_LOG.md and VISUAL_CHECKS.md for evidence limits.

Next: Coach review on localhost:5173; real-inbox sign-in remains unverified while development sending is disabled. Production promotion requires separate authorization. Earlier workspace ownership below is historical.

## Historical release and acceptance notes

## Private parent sign-in production release - October 19

Owner authorized production publication of the combined parent sign-in and legal-name/Money work. Source 15f2dcc deployed successfully to Convex production amicable-eel-413 with backend typecheck, schema validation and additive indexes; no indexes deleted. Production sender/reply/origin and existing auth credentials were verified without exposing or changing secrets. Production email remains enabled; development sending stays disabled. Calendar write guard is preserved.

Validation: all 509 tests in 99 files passed, lint and application/backend types passed, Student Status and Timeclock builds passed. Independent auth review and synthetic actual-component desktop/light and phone/dark checks passed. Local Coach Money showed full legal names and scrolling. No real invitation, email, Calendar event or financial write was created during release checks. Real-inbox end-to-end private sign-in remains unverified.

The release PR publishes all source and documentation together; exact main revision and both automatic website build outcomes will be recorded in its release evidence. The previous Share/Copy workflow is superseded by inbox-only parent sign-in, explicit Continue and separate relationship attestation; student Google login and one-hour resend remain. Legacy invitations cannot become login credentials. See [current parent workflow](PRIVATE_PARENT_SIGN_IN.md).

Rollback: use a coordinated code fix or rollback of both frontend/backend. Do not delete new parent auth records or indexes; these may hold live accounts after release. Disabling PARENT_INVITE_EMAIL_ENABLED stops new mail and new invitations but does not revoke existing sessions or already-sent links. Do not overwrite later shared releases.

## Current workspace and coordination

Branch feature/parent-email-invitations, checkout student-status-bulk-invite. Root owns production release; audit chat has clean matching local preview and holds synchronization. Main baseline b1f730a; combined names/Money checkpoint 2bd052a included. Current implementation/test evidence: [private parent sign-in](PRIVATE_PARENT_SIGN_IN.md), [visual checks](VISUAL_CHECKS.md), [release history](RELEASE_2026-10-19.md). Student records, credentials and private captures remain outside Git.
