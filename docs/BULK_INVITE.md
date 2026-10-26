# Bulk Invite - local implementation

## Coach approval requirement — October 19

Owner superseded automatic account linking: keep five-digit individual codes, but require Coach approval before connecting any Google account to a precreated student record. Code entry submits an account-connection request. A pending request grants no student access and does not reserve or consume the invitation. Coaches review the intended student alongside the verified Google account name/email and explicitly approve or decline. Student names must not be disclosed by code preview before approval.

Approval must revalidate the current invitation version, expiry, active season/student, verified Google identity and account/email conflicts. Replacement or revocation invalidates prior requests. Successful approval links the same student record and preserves existing Coach assignments and finances. Six-digit general team requests retain their existing approval path.

This revision is local-source-only: do not sync even the development backend until separately authorized. The local frontend server was stopped to avoid mixing the new interface with the old deployed API. Earlier direct-linking descriptions and deployment evidence are historical and do not apply to this revision.

Verification: 26 backend cases pass, including no preapproval profile/finance access, Coach-only decisions, simultaneous competing requests/approvals (exactly one link), 100-student import, shared daily/minute attempt limits, identity/email collisions, inactive/cross-season/expired/stale invitations, decline/new-code retry, and preservation of assignments/charges. Stale requests do not strand applicants or consume the live-request allowance; Coach queue stale entries remain manually declinable, with approval safely refused.

Actual React components passed an isolated browser harness with mocked backend responses: delayed five-to-six and five-to-different-five preview switching, ordinary six-digit request routing, no student-name display, waiting and decline/retry, Coach identity confirmation, cancel without write, mutation error/retry, approval and decline. Desktop 1440 light and phone 390 dark reviewed; no phone overflow. Three presentation regression tests also pass. Harness/screenshots are ignored under .test-temp/approval-ui. This is not live backend or Google OAuth verification, which remains explicitly deferred by owner. Independent source review found no remaining concrete blocker in the revised approval path.

## October 19 development rehearsal

Regular Coach team codes now generate six digits (100000–999999), distinct from five-digit individual invitations. Allocation checks all stored team codes and retries collisions, including revoked/expired codes. Frontend routing recognizes six digits as the existing name-entry/join-request workflow; five digits retain direct linking. Existing prefixed codes remain compatible. Tests prove cross-type rejection, a pending team request followed by individual redemption, revoked team-code rejection, collision retries, and frontend format routing. Fifteen targeted tests, lint, types and build passed; development sync passed and Coach browser generation displayed a six-digit code with the selected one-week expiry. Owner deferred real Google redemption in favor of automated tests.

Synced only to development `third-bandicoot-18`; local frontend at localhost:5173. Coach browser checks passed: template download, rejection of a missing last name, four-row upload with one repeated name defaulting to skip, three created students, code export, replacement, revocation, and an updated export omitting the revoked code. All three students appeared as Not connected, with zero balance due, no Travel Team status, and no upcoming enrolled events. Coach assigned Build to one unconnected student successfully. Connected filtering excluded all three.

Owner requested exactly five digits. New invitations and replacements now use random 10000–99999 codes (avoids spreadsheet leading-zero loss), reserved transactionally in bulkInviteCodeReservations so collisions retry and replaced codes cannot be reissued. Existing long codes remain readable for compatibility; both remaining unused rehearsal codes were replaced and the resulting two-row CSV verified. Verified Google authentication and per-account limits (10 calls/minute, 30/day across preview/redemption) remain required. The finite pool supports 90,000 lifetime allocations; reservations must not be deleted to recycle codes. Five-digit codes have less guessing resistance than the original format.

Updated synthetic tests: 16 passed across backend invitations, roster pagination and CSV, including forced random collisions, old-code rejection and five-digit redemption. TypeScript and lint passed. Real Google redemption with an unconnected test account remains pending; automated redemption uses mocked verified Google identities. No production changes or main merge.

Implemented on feature/bulk-invite from main checkpoint 46d526a. No production deployment, main merge, or live student import was performed.

## Coach workflow

Join Requests has a Coach-only Bulk Invite tab. Download a First Name/Last Name CSV template, upload up to 100 students (128 KB), review duplicates, and confirm. Matching existing unconnected records can receive codes without creating duplicate student records. Connected and archived matches are not silently linked or reactivated. Submission keys prevent duplicate creation on retry.

The batch creates ordinary active student records, with unknown email represented by an empty string until verified Google redemption. It initializes zero-balance financial records without creating charges, event enrollment, or Travel Team status. Coaches retain normal roster management permissions. Existing general invitation/approval behavior remains unchanged.

Download names and unused codes; each code is a random single-use bearer invitation. Give each code privately to its named student. Only Coaches can manage or read codes. Codes expire at the earlier recorded/current season end, or become unusable when the season closes if no date is set. Revoking/replacing preserves the student. Replacement invalidates all other pending codes for that student; stale Coach confirmations are rejected. Used/revoked/replaced code text is cleared.

Students sign in with verified Google and enter the individual code in the existing invitation box. The UI shows the named student when validation succeeds. Redemption links the existing record, resolves a current pending request, and continues normal setup without resetting Coach data. Already linked accounts need Coach help. Attempts are rate limited. Ordinary team-code signup remains available.

Membership's connection filter runs on the server before pagination. Exact displayed totals refer to the selected connection group when fully loaded; partial lists are explicitly labeled. Batch connected counts are separate from unredeemed invitations.

## Storage and boundaries

New bulkInviteBatches and bulkStudentInvites tables plus a students season/active/userId index. No existing student backfill is required. Code hashes support lookup; unused code text is retained in protected backend records for Coach re-download. Codes are excluded from audit payloads and general roster responses. Re-download exports omit expired/used codes, including a click-time expiry check for an old browser tab.

Per-file import: 100 students. Duplicate matching stops safely above 1,000 season records. The batch list shows the latest 100 batches. Existing batch details remain bounded to 100 invitations. These limits are explicit operational bounds, not an unlimited bulk service.

## Verification

Final local checks: lint, TypeScript, all 436 tests in 92 files, the Student Status build, and Timeclock lint/typecheck/build passed. Convex-specific TypeScript compile passed. Initial sandbox test runs hit missing temporary transform files; the final suite ran successfully outside that sandbox restriction. No deployment commands were used.

Local Convex tests use synthetic identities and in-memory data. CSV tests cover quoted values, Unicode BOM, malformed rows/size limits and spreadsheet-formula-safe exports. Roster tests cover server-side filtering across pages. Browser verification uses the actual BulkInvite component with mocked hooks and no backend: template download, upload, confirmation, batch display and code download; 1440px light and 390px dark layouts, no page overflow with full-length codes. Screenshots and harness remain ignored under .test-temp/bulk-ui.

Independent Astra source review found no remaining blockers after code-replacement, expiry, stale-confirmation and busy-form fixes. This is not live Google OAuth or deployed Convex verification.

## Release sequence - not executed

1. Rehearse on the separate development backend with synthetic accounts and real Google sign-in; verify existing general signup and Timeclock compatibility.
2. Prepare the reviewed exact release candidate and production recovery plan; obtain production approval.
3. Deploy the backward-compatible backend before exposing the UI. Merging main automatically deploys both frontends, so merge only as part of that approved release.
4. Verify a small Coach-selected batch before importing the full roster. Keep all real names, codes, exports and recovery snapshots outside Git.
5. If an issue arises, stop imports and revoke affected unused invitations; preserve imported records, claimed accounts and Coach assignments. Do not remove populated tables as a rollback.

Final approval-revision validation: all 459 tests in 94 files, application lint/typecheck/build, Convex-specific typecheck, and Timeclock lint/typecheck/build passed. Existing application bundle-size warning remains non-fatal. No deployment performed.

October 25 owner decision (supersedes the five-digit choice above): every invitation code is six digits. Team codes and individual invitations share one namespace (`convex/lib/invitationCodes.ts`): allocation checks both `joinCodes` and the permanent `bulkInviteCodeReservations`, so the two kinds never collide and no value is reissued. The join page has one "Invitation code" field; `bulkInvites.checkInvitationCode` tells the page whether the code is a team code (then it asks for first and last name) or an individual invitation (then it requests the account connection with no name). Wrong codes count toward the same five-strike, 15-minute lockout as `requestJoin`, plus the existing per-account limits. Outstanding five-digit and older prefixed codes are still accepted until they expire or are revoked. Backend tests cover cross-kind collisions, legacy acceptance and the shared lockout; a real Google join with an unconnected test account has not been done.
