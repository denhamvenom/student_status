# Parent invitations and sign-in

This is the current source contract for `convex/parentInvites.ts`, `parentInviteEmail.ts`, `parentEmailAuth.ts`, and `src/ParentInvites.tsx`. Production delivery and real-inbox journeys need their own evidence; current configuration was not inspected in this documentation pass (VERIFY).

## Workflow

1. An active student enters the parent's email in Parents or the setup flow. The server validates identity, active season/student and the Coach-controlled invitation setting.
2. The app creates a single-use invitation valid for seven days and queues a private email when sending is enabled. Student-facing results show delivery status, not the raw link/token; the earlier Share/Copy invitation workflow is superseded.
3. The recipient opens the inbox link. A supported one-time private email sign-in can establish the invited email identity; Google sign-in and emailed codes remain supported alternatives where eligible. A sign-in code never grants a student role or bypasses invitation/access checks.
4. The recipient explicitly supplies the relationship and attests parent/legal-guardian authority. Valid acceptance creates the family link atomically. Email control plus good-faith attestation is not independent proof of guardianship.
5. A parent may link to multiple children and a child may have multiple linked parents. Every read/write rechecks the exact active family link and current-season scope. Revocation removes that access.

Account linking is separate from travel consent, PDF signing and health-profile confirmation. Completed setup and Parent-confirmed structured profile are prerequisites for the populated PDF workflow; see [architecture](ARCHITECTURE.md).

## Coach controls and resend

The team-wide Allow new parent invitations setting is enabled by default. Turning it off blocks issuance and replacement/resend paths while preserving existing links and valid outstanding invitations.

Coach resolution supports invitation revocation, family-link revocation/restoration and controlled replacement. Student requests cannot bypass a revoked-link hold. Existing conflicting student/staff/inactive accounts are not silently converted to parents.

Student resend waits one hour from the applicable last request/sent time, rechecks permission/state, and replaces the invitation through the supported server path. Show the wait and ask the recipient to check inbox/spam; do not expose a share link to work around delivery trouble. Email workers revalidate invitation state and use guarded retries; queued/sent/failed status is not proof that the recipient read or accepted an email.

## Identity and privacy

- Normalize email by trimming and case normalization; do not equate Gmail dots or plus aliases. Verify the invited identity server-side; a wrong email or role conflict grants no child data.
- Hash invitation tokens at rest. The private link uses a URL fragment. Never put raw tokens in Git, analytics, logs, screenshots, public response lists or student-visible copy controls.
- The supported Google round trip may use scoped temporary same-tab sessionStorage for the token, cleared after recovery/completion. It contains no student records; OAuth redirect URLs must not contain invitation tokens.
- One-time login consumption and invitation acceptance are distinct guarded steps. Login/code throttling, token expiry/replay checks and matching identity remain server-enforced.
- Preserve exact relationship/attestation version and time plus Coach audit history. Linking never fabricates a signed form or independent guardianship verification.
- Parent email-auth markers cannot become staff/student authority. Staff email access has its own approved-account restrictions.

## Configuration and evidence limits

Sending uses server-only email configuration and the approved site origin; credentials never enter frontend VITE settings. Release records describe production sending enabled and development sending disabled (VERIFY current deployment). Do not send an email or change configuration merely to inspect documentation.

The [private parent sign-in record](PRIVATE_PARENT_SIGN_IN.md) and [October 19 release receipt](releases/RELEASE_2026-10-19.md) preserve implementation and release evidence. Earlier synthetic and Google rehearsals do not close the later real-inbox end-to-end evidence gap (VERIFY). Confirm only with an authorized recipient and agreed test scope.
