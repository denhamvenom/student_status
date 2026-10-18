# Controlled hosting release evidence — October 17, 2026

Owner approved the ordered RELEASE_APPROVAL_PACKET.md batch. This is a partial hosting release, not enrollment or production-login acceptance.

## Completed

- Created remote demo-reference-2026-10-17 at original main `18ef1c27b35f7a30a3c6edeb572d8eb452301538`, switched Pages to branch/root, explicitly rebuilt and verified status built at that SHA. Public index.html, flow-index.html, handheld-spec.html and review-guide.html each returned HTTP200 and exact original Git blob hashes. Demo URL remains https://denhamvenom.github.io/student_status/.
- Merged PR10 into feature/student-status-readiness-design, producing `a3b4360c8ceba8573abd8d1651f5a3133a774283`.
- Release branch release/controlled-hosting-2026-10-17 merged original main with candidate root index and unchanged candidate demo archive. Commit `771d4541ea85352a18425b7c3f21eb94370b4325` has the expected two parents and entire tree `8c5c44fac756a635ea6978effba1e8a732720116`, exactly matching packet checkpoint `574c910`. Astra independently reviewed this evidence with no blockers. No application changes or repeated broad tests.
- Created/attached/merged [PR11](https://github.com/denhamvenom/student_status/pull/11). Main release is **60505b4e04976598956bc1353a53e7d4daf63b9d**. Fetched and checked out this exact revision; complete tree comparison to 574c910 passed. Pages source remained the reference branch.
- Deployed shared backend to **production amicable-eel-413**, team daniel-eiland/project denham-venom-student-status, from that exact detached release revision. Installed Convex 1.46.0 CLI explicitly announced the correct production URL. Typecheck/schema validation passed; no indexes deleted; indexes and rateLimiter/reportAggregates components installed; CLI exited 0 with deployment success. Audit message identifies release 60505b4. No bootstrap, import, seed, real signing or credential change performed.

## Deployment execution detail

Automatic approval review rejected an initially ambiguous command because local .env.local names development. Installed CLI source confirmed deploy normally resolves the project's production deployment and supports an override file. The successful command used ignored `.env.release-production` containing only `CONVEX_DEPLOYMENT=prod:amicable-eel-413`, with `--typecheck enable --codegen disable`. A prior temporary-file attempt failed before deployment because the file was unavailable. Only one successful backend push occurred. Local development selection was unchanged. CLI update notices were informational; dependencies were not upgraded.

## Cloudflare remaining

Verified account Team 8044 (`7813d12d7ceaab6aa80d7877563d175c`) and active free team8044.org zone (`9c28d2837a2c2e21cd06f11d532ee880`). Fresh Workers inventory contained only unrelated part107-practice. Build-token list was empty; exact DNS queries for students.team8044.org and timeclock.team8044.org returned no records. Dashboard session is expired. Connector token-permission inspection returned unauthorized 9109; no wider credential permissions requested or assumed.

No target Worker, build trigger, build token or custom domain created. Restore dashboard sign-in, recheck inventories/repository connection and execute the packet matrix for both Workers. Branch main must still resolve to 60505b4 before build submission. Capture build IDs, Worker versions and source revision. Preview builds off; no frontend secrets. No failed frontend deployment or public route needs rollback at this checkpoint.

Validate HTTPS roots, direct deep-link reloads, About/Privacy/Terms and built production backend URL after hosting. Page loads do not prove Google login. Do not merge progress docs into main or otherwise change the release revision merely to publish evidence.

## Remaining boundaries

OAuth remains External/Testing. Google URL registration/publication, guarded first-Coach/season bootstrap, enrollment, real signing and physical concurrency checks are later gates. Existing settings remain approved; no repeat secrets transfer. Paid backups deferred and recovery unproven. Goal remains unfinished until both hosted frontends and focused checks complete.

## Restored access and pending token confirmation

Owner restored dashboard sign-in. Verified Team 8044 and existing denhamvenom/student_status GitHub connection; remote main still60505b4. Prepared Student Status form with exact packet build/deploy commands, root path, BUN_VERSION1.4.3, production VITE_CONVEX_URL and previews disabled. No Deploy submission.

Automatic token scope includes unrelated storage/database and all-zone access, so it was not submitted. Prepared custom user-token summary named Denham Venom production builds with only Workers Scripts: Edit for Team 8044, active until revoked. Browser policy requires action-time confirmation for creating persistent security access; exact confirmation is pending. No token created. Summary screenshot remains outside Git. Continue at token summary after owner answers; then select narrow token for the builds and complete the packet. Login is no longer the blocker.
