# Current integration handoff

## October 19 parent email and one-hour resend candidate

Workspace: Development Version/student-status-bulk-invite. Branch: feature/parent-email-invitations. User confirmed receipt of the authorized Resend connectivity test and requested student resending after one hour. Automatic email, Share/Copy and server-enforced resend are complete locally. Lint, application/backend types and build passed. Regression run passed 481/482 tests with one pre-existing bulk-fee timeout; isolated fee/invitation rerun passed 30/30, covering the failed case and all 21 parent tests. Actual-component synthetic browser checks passed at 1440px light/390px dark. Astra review found no blockers. Google login and exact invited email remain required. Sender: notifications@team8044.org; Reply-To: coach@team8044.org.

Current main4d21466 was merged into this branch, preserving the released charge-screen fixes. The parallel audit chat is implementing fee-payment CSV support in student-status-readiness-design (PR19). It is the agreed sole shared development sync owner after importing this completed parent-email branch. Do not independently sync this checkout to third-bandicoot-18: that could overwrite the other feature. No production deploy or main merge has occurred for parent email.

Resend domain verified; sending-only restricted credential is stored only in ignored .env.resend.local and development server settings. Development automatic sending remains false. The successful connectivity test did not create a parent invitation or prove its real Google redemption. Local automated tests use synthetic data and mock email delivery. Production setup and a real invitation/OAuth rehearsal remain separate release checks. See [feature/configuration/evidence](PARENT_INVITATION_EMAIL.md).

## Production baseline — October 19

Bulk Invite release completed with explicit owner authorization: Convex production amicable-eel-413, PR17 merge f7c205c, both Cloudflare builds succeeded. Five-digit individual codes require Coach approval; ordinary team codes use six digits. Coach sign-in, roster, Bulk Invite queue and Timeclock sign-in checked. One regular team code was generated; no requests, students or bulk batches were created during release. Owner subsequently reported the first real student joined successfully. See [release receipt](BULK_INVITE_RELEASE_2026-10-19.md).

Timeclock includes active students with reviewed first/last names regardless of linked Google account. Bulk Invite creates these fields, so imported unconnected students can clock through a Coach/Mentor-signed-in station. Existing attendance stays on their student record when linked.

Development remains third-bandicoot-18; production is amicable-eel-413. Main merges automatically deploy both frontends. Root owns integration/Git/backend/releases, Sol implementation and Astra review. Keep student records, credentials, snapshots and account-specific browser evidence out of Git. Earlier production cleanup details are in PRODUCTION_CHANGEOVER_2026-10-18.md; physical-device concurrency/reconnection and recovery restore drills remain unproven. Actual signing remains disabled.
