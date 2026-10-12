# Parent invitations

## Scope

This milestone links parent accounts to students. It does not sign permission slips, authorize medication, or independently verify guardianship. The approved process assumes good faith: the recipient verifies control of the invited Google email and explicitly attests that they are the student's parent or legal guardian with authority to provide consent.

## Implemented workflow

1. An active student opens Parents and enters the parent's Google email.
2. The app creates a one-time invitation valid for seven days. It gives the student a link to share manually; no email is sent by the app.
3. The recipient opens the link and signs in with the invited Google account. Before recipient validation, the landing page must not disclose student details.
4. The recipient states their relationship and affirms their authority. Successful acceptance creates a parent account if needed and links that account to this student.
5. A parent may link to multiple students; a student may have multiple linked parents. Access is always checked against the selected student's active link on the server.

## Coach controls and exceptions

Join Requests contains a team-wide Allow new parent invitations control, enabled by default. Turning it off blocks new and replacement invitations. Existing unexpired invitations retain their original expiry, and established links remain active.

The Coach can revoke an invitation or family link when there is a problem. A revoked link cannot be restored by a student sending another invitation; Coach resolution is required. Existing student, Coach, Mentor, or inactive accounts must not be silently converted to parent accounts. Those role conflicts require a Coach-supported resolution outside self-service linking.

## Security and operating boundaries

- The server derives identity from the authenticated Google account and checks verified-email evidence, exact normalized invited email, student/season availability, token state and expiry.
- Email normalization is limited to trimming and case normalization; do not treat Gmail dot or plus aliases as interchangeable.
- Invitation tokens are capabilities: keep them out of request paths, query strings, logs, analytics, Git and screenshots shared externally. Hash tokens at rest; return a newly created raw token only to its authorized creator. During Google sign-in only, a scoped sessionStorage entry carries the token across the same-tab round trip; it is removed after return, success or cancellation. It contains no student data, and the OAuth redirect URL contains no invitation token.
- Acceptance consumes the invitation and creates the link atomically. No permission, health or financial consent is created by acceptance.
- Coach changes and acceptance attestation are audited. Sensitive app data remains in Convex, never in GitHub regardless of repository visibility.
- The Google OAuth project remains in Testing mode. Additional real test identities require Google test-user configuration; synthetic server tests do not prove a real second-account OAuth round trip.
- Development uses synthetic records. This milestone does not authorize production deployment.

## Implementation evidence

Lint, typechecking, 19 backend tests and build pass; 13 browser checks pass. The authenticated Coach panel was inspected in development, and Convex sync succeeded on third-bandicoot-18. Astra accepted this milestone for synthetic development. Backend tests cover expiry/replay, wrong/unverified identity, role conflicts, disabled issuance with valid acceptance, replacement/revocation and Coach resolution, exact attestation version, multi-parent/multi-child links, archived child filtering and revoke-one/revoke-all access denial. Browser fixture checks are layout evidence, not live multi-account OAuth proof.

### Development limits

The recent invitation list shows the newest 100 rows plus separately fetched actionable pending/revoked rows, with explicit overflow guards. Family/access lists are bounded at 100. Larger-scale pagination remains future work. A real additional-account OAuth acceptance rehearsal and production configuration remain outstanding; no production approval is implied.
