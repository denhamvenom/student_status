# Current integration handoff

## Private parent sign-in production release - October 19

Owner authorized production publication of the combined parent sign-in and legal-name/Money work. Source 15f2dcc deployed successfully to Convex production amicable-eel-413 with backend typecheck, schema validation and additive indexes; no indexes deleted. Production sender/reply/origin and existing auth credentials were verified without exposing or changing secrets. Production email remains enabled; development sending stays disabled. Calendar write guard is preserved.

Validation: all 509 tests in 99 files passed, lint and application/backend types passed, Student Status and Timeclock builds passed. Independent auth review and synthetic actual-component desktop/light and phone/dark checks passed. Local Coach Money showed full legal names and scrolling. No real invitation, email, Calendar event or financial write was created during release checks. Real-inbox end-to-end private sign-in remains unverified.

The release PR publishes all source and documentation together; exact main revision and both automatic website build outcomes will be recorded in its release evidence. The previous Share/Copy workflow is superseded by inbox-only parent sign-in, explicit Continue and separate relationship attestation; student Google login and one-hour resend remain. Legacy invitations cannot become login credentials. See [current parent workflow](PRIVATE_PARENT_SIGN_IN.md).

Rollback: use a coordinated code fix or rollback of both frontend/backend. Do not delete new parent auth records or indexes; these may hold live accounts after release. Disabling PARENT_INVITE_EMAIL_ENABLED stops new mail and new invitations but does not revoke existing sessions or already-sent links. Do not overwrite later shared releases.

## Current workspace and coordination

Branch feature/parent-email-invitations, checkout student-status-bulk-invite. Root owns production release; audit chat has clean matching local preview and holds synchronization. Main baseline b1f730a; combined names/Money checkpoint 2bd052a included. Current implementation/test evidence: [private parent sign-in](PRIVATE_PARENT_SIGN_IN.md), [visual checks](VISUAL_CHECKS.md), [release history](RELEASE_2026-10-19.md). Student records, credentials and private captures remain outside Git.
