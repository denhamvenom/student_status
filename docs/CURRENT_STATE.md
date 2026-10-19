# Current integration handoff

## October 19 charge-details close control

Added Close details while charge details are loading or open. Closing only dismisses the panel locally; it does not cancel, confirm or change charges. View charge details reopens it. A dismissed automatically selected job stays hidden, while a different new automatic job can still appear. No backend changes. Focused fee tests (14), source lint, typecheck and build validation recorded for this frontend checkpoint; live UI verification remains pending. Production read-only inspection confirmed the reported missing fee was still prepared, not committed; no financial action was taken. No student-specific evidence is stored here.


## October 19 charge review wording

Implemented frontend-only simplification: View charge details; Review students and charges; explicit eight-character Reason input guidance; student names, planned/current amounts and readable saved/pending/review status replace internal revisions and processing counters. New unposted charges no longer produce false load errors. Missing existing charges still need review; held rows retain their explanation. Partial money release amounts and all confirmation/retry safeguards remain. No backend or production data changes.

Validation: integrated lint/typecheck, 425 tests and build passed (existing bundle-size warning); final held-row wording refinement passed 14 focused tests and source lint. Independent review found the held-row case and it was corrected. Rendered-markup evidence only; fresh authenticated browser/phone/theme comparison remains pending. Owner authorized PR18 merge and production frontend deployment on October 19; deployment verification is in progress.

## Bulk Invite notes carried from PR17 (historical pre-merge status)

October 19 owner change supersedes direct linking: five-digit Bulk Invite codes submit connection requests; only a Coach can connect the verified Google account to the existing student. Six-digit ordinary team requests remain separate. Local backend, student waiting/retry UI and Coach approval queue implemented; 26 backend cases and isolated actual-component browser tests pass, including concurrency, 100 students, daily limits and stale requests. See BULK_INVITE.md. No backend sync (including development) is authorized for this revision. Local frontend server stopped to avoid mixing new UI with the old deployed API. Real Google redemption remains deferred by owner; no production deployment or main merge.

## Bulk Invite local candidate - October 18

October 19 update: development-only sync and Coach browser rehearsal passed. Individual Bulk Invite codes now have five digits; regular Coach team codes have six digits, with separate signup routing and collision checks. Targeted automated signup/redemption tests, lint, types and build passed. Real Google redemption explicitly deferred by owner. No production deployment or main merge. See BULK_INVITE.md for evidence and limits.

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
