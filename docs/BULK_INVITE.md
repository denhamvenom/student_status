# Bulk Invite - local implementation

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
