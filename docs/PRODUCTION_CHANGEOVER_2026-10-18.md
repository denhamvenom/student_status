# Production changeover — October 18, 2026

## October 18 production changeover completed

Owner-authorized production cleanup and release completed. Application source `09289d4` was pushed to the development branch, deployed to Convex production `amicable-eel-413`, and merged through PR15 as `d3d2e9e368dbbb52d6031ebae0dc5007c11f356b`. Both production websites built and deployed that merge successfully; its tree exactly matches the reviewed source.

The verified permanent Coach is the sole remaining application user and Google auth account. All four other accounts/sign-ins, the one synthetic student and their reviewed dependencies were deleted atomically. Fresh snapshot checks found zero students, no remaining removed-identity references, no stored files and no report aggregate entries. Real season/FIRST/family-readiness settings, Coach identity and 63 calendar occurrences were preserved. Normal calendar sync timestamps advanced; configuration did not change. Credentials were neither changed nor exported. Private recovery exports remain ignored and outside Git.

Temporary cleanup switches and Coach-only maintenance restriction are removed. The old team join code was revoked and deleted; no replacement was created. Student Status and Timeclock public sign-in pages load; Coach backend access passes. A fresh Coach browser login is requested separately. Full student onboarding remains deferred by the owner to tomorrow; real signing remains disabled. Production needs no old-subteam conversion because there are zero student records.

The four stale tests are fixed. Full application check passed 423 tests before the final invitation regression; final maintenance suite passed 5/5 plus typecheck/lint. Timeclock checks and production backend compile passed. See [execution evidence](PRODUCTION_CHANGEOVER_2026-10-18.md). Earlier restrictions and pending-cleanup statements below are historical, superseded by this authorized release.

## Execution receipt

- Recovery snapshot archive passed integrity testing; refreshed pre-cleanup and post-cleanup snapshots are stored privately, ignored by Git. No credential export was performed.
- Reviewed cleanup fingerprint: `350fefcdc4e1924e796b73bd09b352d2dbfaff909911f54581489e4223b1dff2`. The atomic commit matched the preview exactly.
- Deleted: 4 application users, 4 auth users, 4 Google account links, 2 auth sessions, 21 refresh tokens, 3 orphan verifiers, 1 student, 1 family link, 2 adult invitations, 1 parent invitation, 1 join request, 1 revoked join code, 1 empty financial account, 1 empty finance summary and 9 related audit rows. A non-identifying cleanup audit receipt remains alongside 4 real setup/readiness audit records.
- Ten synthetic aggregate entries removed; empty aggregate containers remain. No event, payment, attendance, signature or storage rows existed to remove.
- Student Status Cloudflare build `f9637016-5c05-40af-aadb-7e955541d971`: success on release merge `d3d2e9e368dbbb52d6031ebae0dc5007c11f356b`.
- Timeclock Cloudflare build `fcec2fae-4af8-4c6e-8c62-7c7ddb594e7b`: success on the same merge.
- Live browser sign-in pages verified at https://students.team8044.org and https://timeclock.team8044.org. A direct script HTTP probe received 403; normal browser page loads succeeded. No protection was disabled.
- Backend Coach read verified active after cleanup. Fresh interactive Coach login remains distinct from this backend check.

## Limits and next use

No new test accounts or students were created in production during verification. Normal new Google sign-ins can create a pending identity, but deleted accounts have no retained team role or family link. A new team code must be created by Coach for the next student enrollment session. Full student journey is intentionally deferred to tomorrow. Existing signing restrictions and previously accepted device-testing deferrals remain.
