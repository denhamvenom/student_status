# Mentor/Staff invitation email

Coach flow: enter the invited email and role, then Send invitation. The app queues a private invitation email; no shareable token is returned to the browser. The recipient signs in with Google or an email code at the invited address and explicitly accepts the invitation before access is granted.

The list distinguishes queued, sent, failed and not sent. Sent means the provider accepted the message, not that inbox delivery was confirmed. Resend is available after one hour for pending unexpired invitations; it replaces the private token and extends expiry to seven days. Creating again or revoking cannot bypass the cooldown. Expired invitations require a new invitation. Old invitations remain valid until their original expiry/revocation; they are never automatically emailed by this upgrade.

Delivery reuses existing parent email configuration, sender and reply-to. Development sending remains disabled and create/resend returns an honest configuration error. Parent flows and their email behavior are unchanged. Scheduled delivery uses three bounded attempts, stable provider idempotency per token generation, a 20-minute stalled-queue check, and active Coach/invitation checks. Old callbacks cannot change the state of a later resend. New schema fields are optional and the email/date index is additive; no backfill, existing-record edit or real email is required to install this feature.

Verification: synthetic provider-mocked backend tests cover send, retries, disabled config, authorization, token rotation, stale jobs, revocation and cooldown bypass. Independent source review cleared after correcting revoke/recreate cooldown. Actual frontend components with mocked hooks show queued/sent/failed/not-sent states, send success, retained input on failure, resend errors and disabled cooldown. Desktop light and phone dark inspected; phone measured390px viewport/375px document width (scrollbar), no horizontal overflow. No real inbox round trip performed.

Publication: development only until a separate production release. No production data or settings changed by this implementation.
