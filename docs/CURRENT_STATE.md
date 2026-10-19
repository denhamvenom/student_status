# Current integration handoff

## Bulk Invite local candidate - October 18

Branch `feature/bulk-invite` in `student-status-bulk-invite`, based on main `46d526a`. Coach Bulk Invite, CSV preview/export, individual Google-account linking, and whole-roster connection filtering implemented locally. See [feature and verification notes](BULK_INVITE.md). No deployment or main merge; live development Google-sign-in rehearsal remains separate. Earlier production evidence below is preserved.


## October 18 production changeover completed

Owner-authorized production cleanup and release completed. Application source `09289d4` was pushed to the development branch, deployed to Convex production `amicable-eel-413`, and merged through PR15 as `d3d2e9e368dbbb52d6031ebae0dc5007c11f356b`. Both production websites built and deployed that merge successfully; its tree exactly matches the reviewed source.

The verified permanent Coach is the sole remaining application user and Google auth account. All four other accounts/sign-ins, the one synthetic student and their reviewed dependencies were deleted atomically. Fresh snapshot checks found zero students, no remaining removed-identity references, no stored files and no report aggregate entries. Real season/FIRST/family-readiness settings, Coach identity and 63 calendar occurrences were preserved. Normal calendar sync timestamps advanced; configuration did not change. Credentials were neither changed nor exported. Private recovery exports remain ignored and outside Git.

Temporary cleanup switches and Coach-only maintenance restriction are removed. The old team join code was revoked and deleted; no replacement was created. Student Status and Timeclock public sign-in pages load; Coach backend access passes. The owner confirmed successful production Coach browser sign-in on October 18 and reported that everything looked good. Full student onboarding remains deferred by the owner to tomorrow; real signing remains disabled. Production needs no old-subteam conversion because there are zero student records.

The four stale tests are fixed. Full application check passed 423 tests before the final invitation regression; final maintenance suite passed 5/5 plus typecheck/lint. Timeclock checks and production backend compile passed. See [execution evidence](PRODUCTION_CHANGEOVER_2026-10-18.md). Earlier restrictions and pending-cleanup statements below are historical, superseded by this authorized release.

## Workspace and next work

Branch: `feature/development-review-fixtures-2026-10-18`; merged release PR15. Development remains `third-bandicoot-18` with separate synthetic review data; production is `amicable-eel-413`. Root owns Git/backend/releases; Sol implementation and Astra review. Keep private snapshots/manifests outside Git.

Tomorrow: owner-directed live student journey, fresh team join code when requested, and any resulting fixes. Physical tablet/two-phone concurrency/reconnection checks remain explicitly deferred. Actual signing remains disabled; event, attendance, payment and signature rehearsals are not claimed. Recovery exports passed archive integrity checks; restore drill and scheduled backups are not proven by this release.

Batch 1–4 wording/navigation/workflow evidence is under `docs/audit-2026-10-18/`. Approved subteams are Build, Electrical, Machining, Programming, Business/Media. Historical planning/release details remain in PLAN.md, DEVELOPMENT_CHECKLIST.md and PRODUCTION_ONBOARDING_RELEASE.md; later owner decisions prevail.
