# Mentor/Staff invitation email

## October 20 - Mentor/Staff invitation email production release

Owner authorized production publication, including documentation. Reviewed source78dd107 deployed successfully to production Convex amicable-eel-413 with backend typecheck/schema validation and the additive adultInvitations email/date index; no indexes deleted. No migrations, record edits, environment changes, real test invitations or emails were performed. Production email sender/reply/origin and enabled setting were verified; development sending stays disabled.

Coach invitations now queue private email links with delivery statuses and guarded one-hour resend. Google or email-code sign-in and explicit invitation acceptance remain. Old invitations are not automatically emailed. Parent workflows and student Google login are preserved.

Evidence:535 tests/101 files, focused31 account/mail checks, lint/types/build and independent review passed on the unchanged implementation. Synthetic actual-component desktop/light and phone/dark checks passed. Source, workflow, plan, checklist and verification documentation are included in the release PR. Exact main revision and both automatic Cloudflare build outcomes are recorded on the release PR and immutable release notes after publication. Real-inbox delivery/acceptance remains unverified.


Coach flow: enter the invited email and role, then Send invitation. The app queues a private invitation email; no shareable token is returned to the browser. The recipient signs in with Google or an email code at the invited address and explicitly accepts the invitation before access is granted.

The list distinguishes queued, sent, failed and not sent. Sent means the provider accepted the message, not that inbox delivery was confirmed. Resend is available after one hour for pending unexpired invitations; it replaces the private token and extends expiry to seven days. Creating again or revoking cannot bypass the cooldown. Expired invitations require a new invitation. Old invitations remain valid until their original expiry/revocation; they are never automatically emailed by this upgrade.

Delivery reuses existing parent email configuration, sender and reply-to. Development sending remains disabled and create/resend returns an honest configuration error. Parent flows and their email behavior are unchanged. Scheduled delivery uses three bounded attempts, stable provider idempotency per token generation, a 20-minute stalled-queue check, and active Coach/invitation checks. Old callbacks cannot change the state of a later resend. New schema fields are optional and the email/date index is additive; no backfill, existing-record edit or real email is required to install this feature.

Verification: synthetic provider-mocked backend tests cover send, retries, disabled config, authorization, token rotation, stale jobs, revocation and cooldown bypass. Independent source review cleared after correcting revoke/recreate cooldown. Actual frontend components with mocked hooks show queued/sent/failed/not-sent states, send success, retained input on failure, resend errors and disabled cooldown. Desktop light and phone dark inspected; phone measured390px viewport/375px document width (scrollbar), no horizontal overflow. No real inbox round trip performed.

Publication: production backend deployed October20 under owner authorization; website publication and exact build outcomes are tracked in the release PR. No production records or settings changed.
