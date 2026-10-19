# Current integration handoff

## October 19 Resend connection and real delivery test

Owner authorized connecting the key to development and one real test email. Resend domain team8044.org verified; sending-only domain-restricted key stored in ignored .env.resend.local. Four server settings installed only on development third-bandicoot-18: key, sender notifications@team8044.org, reply address coach@team8044.org, and automatic sending=false. One direct provider connectivity test to the owner's designated recipient was reported delivered by Resend. This was not a student/parent invitation and does not prove Google redemption. No code sync, main merge, production environment change or deployment occurred. Automatic invitation sending and the application-origin setting still require development integration before a full invitation rehearsal. Earlier local-only restrictions below are superseded only for these explicitly authorized settings and test-email actions. Private receipt/screenshot remain ignored under .test-temp/resend-setup/.

## Parent email invitations — October 19 local candidate

Workspace: Development Version/student-status-bulk-invite. Branch: feature/parent-email-invitations. Owner requested automatic email plus Share invitation while keeping Google login; local implementation/testing only. Do not sync either backend, merge main, deploy, send real mail or create production requests without further authorization.

Implemented Resend invitation delivery with explicit server configuration, safe status, per-recipient/hour and per-student/day limits, three-attempt retries and a 20-minute stalled-job timeout. Share/Copy controls preserve exact invited Google-email acceptance. Full 478-test suite across 95 files, lint, application/backend types and build pass. Actual-component mocked browser checks pass at 1440px light and 390px dark. Astra scoped review closed without blockers. The first full test run hit the known sandbox temporary-file ENOENT issue; unsandboxed rerun passed unchanged tests.

Next: verified sender/domain/key and trusted origin setup, followed by an explicitly authorized real-email and Google-link rehearsal. Native phone sharing is only simulated. No real email, cloud sync or production change occurred. See [feature/configuration/evidence](PARENT_INVITATION_EMAIL.md) and [human checklist](DEVELOPMENT_CHECKLIST.md). Screenshots and test harness remain ignored under .test-temp/parent-email-ui/.

## Production baseline — October 19

Bulk Invite release completed with explicit owner authorization: Convex production amicable-eel-413, PR17 merge f7c205c, both Cloudflare builds succeeded. Five-digit individual codes require Coach approval; ordinary team codes use six digits. Coach sign-in, roster, Bulk Invite queue and Timeclock sign-in checked. One regular team code was generated; no requests, students or bulk batches were created during release. Owner subsequently reported the first real student joined successfully. See [release receipt](BULK_INVITE_RELEASE_2026-10-19.md).

Timeclock includes active students with reviewed first/last names regardless of linked Google account. Bulk Invite creates these fields, so imported unconnected students can clock through a Coach/Mentor-signed-in station. Existing attendance stays on their student record when linked.

Development remains third-bandicoot-18; production is amicable-eel-413. Main merges automatically deploy both frontends. Root owns integration/Git/backend/releases, Sol implementation and Astra review. Keep student records, credentials, snapshots and account-specific browser evidence out of Git. Earlier production cleanup details are in PRODUCTION_CHANGEOVER_2026-10-18.md; physical-device concurrency/reconnection and recovery restore drills remain unproven. Actual signing remains disabled.
