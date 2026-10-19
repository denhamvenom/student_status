# Current integration handoff

## Active development candidate - October 19

Workspace: Development Version/student-status-readiness-design. Branch: feature/development-review-fixtures-2026-10-18; existing PR19. Root owns Git and the sole shared development sync. Production merge/deployment remains separately authorized.

Implemented charge flow: Add charge -> Review -> Confirm charges, original reason once, automatic student-list loading, and Close details. The owner separately authorized posting the existing production fee; that operation completed with no held rows. Private account evidence remains outside Git. Earlier prepared-only observations are superseded.

Implemented fee-specific Bulk Payment CSV: fee selection; All/Paid/Unpaid assessed-student export; blank amount skipping; authoritative review; new receipts allocated directly to the selected fee; stale/overpayment checks; durable cross-actor replay and partial recovery. See [workflow and evidence](FEE_PAYMENT_CSV.md). Focused backend/CSV/regression checks, types and source review pass. Synthetic actual-component desktop/light and phone/dark review passed. Combined lint/typecheck/build passed. Full suite passed 493 of 495 cases; two existing large-fixture tests timed out under parallel load, then both unchanged suites passed 35/35 with one worker. All 495 cases passed across those runs. Development sync to third-bandicoot-18 succeeded with backend typecheck; email sending remained disabled. No production deployment.

Parent-email branch through 01ec5fe is integrated additively: automatic parent invitations, Share/Copy, and one-hour student resend. Source/schema/API merged without source conflicts; documentation preserves both features. See [email feature and evidence](PARENT_INVITATION_EMAIL.md). Development email settings exist with sending disabled; keep disabled. Real invitation/Google redemption and physical sharing remain unverified. No parent-email production deployment.

## Production baseline

Main 4d21466 (PR18) has both production frontend builds verified. Bulk Invite was released through PR17; see [release evidence](BULK_INVITE_RELEASE_2026-10-19.md). The October 18 synthetic cleanup is historical: real student records have since been created. Never rerun that cleanup. Credentials and real settings remain intact.

Development target: third-bandicoot-18. Production target: amicable-eel-413. Do not publish development synthetic records or private evidence. No production release of PR19 changes is authorized by the current implementation request. Next: publish the reviewed development checkpoint and update PR19; main/production release remains separate. Current visual gaps remain in [VISUAL_CHECKS.md](VISUAL_CHECKS.md).
