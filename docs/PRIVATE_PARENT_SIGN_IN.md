# Private parent email sign-in

## Owner-approved local scope

Replace student Share/Copy invitation controls with delivery status and the existing one-hour resend. Only the parent inbox receives the private sign-in link. Student Google login remains unchanged. This work covers parents; mentor/staff email login is not enabled by this feature.

Intended flow: student enters parent email, server queues an invitation, parent opens email and explicitly presses Continue, then confirms parent/legal-guardian relationship. Opening a URL alone must not consume the credential. The private sign-in credential lasts 24 hours; the invitation lasts seven days. Expired sign-in links and returning parents use a six-digit email code with ten-minute expiry and sending/attempt limits. Google remains available to existing parents. No new role or family access is granted merely by receiving or opening an email.

Security acceptance: public student create/resend responses contain no credential; old student-visible links never become login credentials; replacement/revocation/expiry prevent sign-in and acceptance; parent credentials cannot grant student/staff access; existing verified parent accounts and family links remain attached to their original identity. Secrets and synthetic browser captures remain ignored.

## Coordination and release boundary

Implementation is in student-status-bulk-invite, branch feature/parent-email-invitations. The audit chat is releasing Calendar work independently. Integrate its final main checkpoint before shared development synchronization. No production deployment, production email change, or real invitation sending is authorized for this local implementation. Development email stays disabled until a separately agreed real-mail rehearsal.

## Verification

Implementation and test evidence pending. Tests must exercise secret-free student responses, explicit-use single-use authentication, cross-browser link use, short-code failure/rate limits, safe account linking, Google student regressions, parent permissions, and desktop/phone UI.

## Implementation decisions

The application uses a dedicated parent credentials provider within the existing Convex Auth session system. It does not create a second session/token system or rotate existing Google keys. Private invitation records carry a version marker, a one-day sign-in expiry and one-use state; the public create/resend response includes only invitation ID and expiry. The seven-day acceptance credential is delivered only by email for new invitations. Legacy invitations have no private-login version and cannot create a login session.

Parent email identities are explicitly restricted to parent use, including after a future role change. Existing verified parent identities are reused; student/staff or ambiguous identities are refused. Student join paths retain Google verification. Parent invitation acceptance and permission workflows accept verified parent email identity as well as the existing Google route. Authentication alone never signs consent or bypasses family-link revocation.

Email-code responses intentionally do not disclose whether an address belongs to a parent. Codes are six digits, expire in ten minutes, allow five attempts and are limited to one request per minute and five per hour per email. Only the most recent code is accepted. An unaccepted private invitation can supply context for code fallback while it remains valid. Actual provider delivery and browser Google switching require a later explicitly authorized inbox rehearsal.
