# Parent invitation email and sharing

## Scope and release boundary

October 19: owner requested automatic parent invitation email and a Share invitation button, retaining Google login. Work is on `feature/parent-email-invitations` in the `student-status-bulk-invite` checkout. The owner subsequently authorized development credential setup and one connectivity test, confirmed received. Student resend is a local candidate; no production deployment or main merge has occurred. Shared development synchronization is coordinated with the audit chat, which owns that sync.

## Implemented workflow

The student enters the parent's Google email and sends an invitation. The app creates the existing single-use, seven-day invitation and queues its email when sending is configured. The student can also share the invitation through their device's share menu or copy its link. Canceling the share menu is not an error; browsers without native sharing fall back to copying.

The parent opens the link, signs in with the exact invited Google email, and completes the existing relationship/authority attestation. Sending or sharing never grants access by itself. Expired, replaced, revoked and already accepted invitations retain their existing restrictions. Email status is separate from invitation acceptance. Provider acceptance does not prove inbox delivery or that a parent read the message.

## Email configuration before a future release

The implementation uses Resend's email API. These settings belong only in the chosen Convex deployment's server environment, never `VITE_` variables, browser code or Git:

- `PARENT_INVITE_EMAIL_ENABLED`: explicit sending switch; keep off until sender and target are verified.
- `RESEND_API_KEY`: sending credential.
- `PARENT_INVITE_EMAIL_FROM`: sender using a verified domain.
- `PARENT_INVITE_EMAIL_REPLY_TO`: monitored reply address.
- `PARENT_INVITE_APP_ORIGIN`: trusted Student Status origin used to construct invitation links.

Do not point production mail at localhost or the development site. Configure the intended domain/sender in the provider and keep click tracking disabled so invitation links are not rewritten. The message contains the invitation link and instructions, not the student's health, finances or profile information. Missing configuration must show that email was not sent while preserving manual sharing.

Provider references: [send email](https://resend.com/docs/api-reference/emails/send-email), [verified domains](https://resend.com/docs/dashboard/domains/introduction), [idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Reliability and privacy

Owner-selected defaults: **Denham Venom Robotics <notifications@team8044.org>** as sender and **coach@team8044.org** as Reply-To. Both can be overridden with server settings. This routes replies to the Coach; it does not create a mailbox or forward messages addressed directly to notifications@team8044.org. Sending remains disabled until explicitly enabled with a verified sender, key and trusted origin.

Email creation is limited to three per hour per student/recipient pair and ten per day per student across recipients. Temporary provider/network failures retry up to three attempts using the same provider idempotency key; permanent failures stop. A 20-minute watchdog changes a stuck queued status to failed/unconfirmed. Revoked, replaced, expired, inactive-student and inactive-season invitations are suppressed before sending. Students can use Resend invitation after one hour for the latest pending, unexpired invitation. The server enforces the wait, including attempts through the create form. Resending creates a fresh seven-day link, replaces the old invitation and restarts the wait. Old links cannot be accepted. The screen shows the wait and replaces its Share/Copy link after success.

The domain table stores only the token hash. Scheduled action arguments necessarily carry the raw token so the email can be composed; Convex administrators with scheduled-function access can inspect those arguments under Convex's system retention. Do not log/export them. Resend necessarily receives the destination email and invitation link. Exact Google email verification remains required to redeem, even with possession of the token.

## Verification — October 19

- Full regression suite: **478 tests in 95 files passed**. The first sandboxed run failed on the documented Windows temporary-file ENOENT problem; rerunning outside that restriction passed without weakening tests.
- Application lint, TypeScript and build passed; backend TypeScript and changed-file lint passed. Existing bundle-size advisory remains non-blocking.
- Parent invitation backend suite: 18 tests, including scheduled retry exhaustion (exactly three attempts), permanent failure, missing/mismatched configuration, stale invitation suppression, stalled queue recovery, aggregate/per-recipient limits and the existing scope/Google acceptance restrictions.
- Sharing/status helper suite: 10 tests, including native share, quiet cancellation, unsupported browser copying, failure messages and status labels.
- Actual StudentParents component with mocked Convex: queued/sent/failed/not_sent transitions, safe configuration error, normalized email, native share/cancellation/failure and copy fallback exercised. Desktop 1440px light and phone 390px dark screenshots inspected; no horizontal overflow. Evidence is ignored under `.test-temp/parent-email-ui/`.
- Astra scoped review closed with no remaining blockers after timeout recovery was added. No cloud backend sync, production changes, actual emails or real student/parent requests were made.

Before release: configure and verify the sender/domain/key and trusted origin, then send an explicitly authorized test email and confirm its link survives email clients and the real Google OAuth round trip. Phone sharing was simulated in the browser; an actual device share sheet remains unverified. No delivery webhook exists: sent means the provider accepted the email, not confirmed inbox delivery or reading.

## Coordinated rollout

The parent-email branch includes main4d21466. Audit PR19 changes charge screens and is adding fee-payment CSV support separately. Source paths for those screens do not overlap invitation screens; schema, generated API and shared documentation must be merged additively. The audit chat is sole shared development sync owner after importing the reviewed parent-email commit. No independent watcher/sync may replace its backend with this checkout.

Development already has the server key, FROM and REPLY_TO settings, with PARENT_INVITE_EMAIL_ENABLED=false. Keep sending disabled for synthetic tests. The email origin intentionally requires HTTPS and must match SITE_URL when set; localhost is not a recipient-accessible rehearsal origin. An end-to-end development mail test needs an approved reachable HTTPS frontend and matching SITE_URL/PARENT_INVITE_APP_ORIGIN. Do not use the production frontend with development tokens.

For a production release, first integrate current main and both developers' intended changes, run combined checks and confirm exclusive deployment ownership. Configure production sender/key/reply address and PARENT_INVITE_APP_ORIGIN=https://students.team8044.org with sending initially disabled. Publish the compatible backend before merging frontend code; enable sending only after deployment/configuration verification. Confirm an explicitly authorized real invitation and Google round trip. The sending switch can disable email without disabling manual sharing. Do not revert shared backend code over another developer's release.

## One-hour resend verification — October 19

- Server waits one hour after the later of invitation creation and provider-confirmed send time, including normalized same-email create attempts. Pending/latest/ownership/active-season/revocation checks remain enforced. Replacement tokens use new invitation/provider idempotency IDs.
- Parent invitation suite: 21/21 passed, including deterministic just-before/exact-hour checks, latest email send time, double submission, old-token rejection and all protected states.
- Full regression: 481 of 482 passed; existing bulk-fee 500-row test hit its 30-second timeout under concurrent checks. Isolated fee + invitation rerun passed all 30 tests without changing its assertions or timeout. The Windows sandbox run first hit the documented temporary-module ENOENT issue; the full run above was outside that sandbox.
- Lint, application/backend types and build passed; existing bundle-size advisory remains. Synthetic actual-component browser tests passed countdown, server rejection, new link, Share/Copy and busy-state behavior at desktop 1440px light and phone 390px dark, with no horizontal overflow. Screenshots/harness remain ignored under .test-temp/parent-email-ui.
- Independent Astra review: no blocking findings. No production change, shared development code sync, new real invitation or additional email was made. Real email receipt is owner-confirmed for the earlier connectivity test only; actual invitation Google round trip and physical native-share sheet remain unverified.

## Combined development integration - October 19

Parent-email candidate through 01ec5fe was merged with the payment CSV work as ff29bd4. Only documentation conflicted; source, optional schema additions and generated contracts were preserved. Combined lint/typecheck/build passed. Full suite passed 493 of 495 cases; two existing large-fixture tests timed out under parallel load, then both unchanged suites passed 35/35 with one worker. All 495 cases passed across those runs. Development sync to third-bandicoot-18 succeeded with backend typecheck; email sending remained disabled. No production deployment. The integration checkout remains the sole shared backend sync owner. Real email/Google redemption remains unverified.
