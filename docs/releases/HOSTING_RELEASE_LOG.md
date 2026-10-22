# Controlled hosting release evidence — October 17, 2026

The owner-approved October 17 controlled hosting release is complete. Main `60505b4e04976598956bc1353a53e7d4daf63b9d` is deployed to shared production Convex and both Cloudflare Workers; its entire tree matches approved packet checkpoint `574c910`. [Student Status](https://students.team8044.org) and [Timeclock](https://timeclock.team8044.org) passed focused hosting checks. See [HOSTING_RELEASE_LOG.md](HOSTING_RELEASE_LOG.md). OAuth publication, production sign-in acceptance, bootstrap, enrollment and real signing remain separate gates.

Release identifier: `v0.1.0-hosting.1`, an immutable hosting prerelease tag at the deployed main revision. This is not enrollment or OAuth launch acceptance.

## Completed frontend release

| Website | Build ID | Deployed Worker version |
| --- | --- | --- |
| Student Status | `31cfb766-3c41-4c89-a35b-57f5d6e55360` | `baa2e310-f446-414a-9c71-62baad2edd83` |
| Timeclock | `7a5b2586-0b02-47fe-810b-8a66a40acf94` | `597db35f-ceda-452b-8943-8ffd298a1d7d` |

Both builds succeeded at exact main `60505b4e04976598956bc1353a53e7d4daf63b9d`. Student Status deployed October 18 00:53:52 UTC; Timeclock 00:55:05 UTC (October 17 Chicago). Workers are `denham-venom-student-status` and `denham-venom-timeclock` in Team 8044. Existing unrelated Worker preserved. Active free team8044.org zone; exact new hostnames were empty before attachment. Custom domains and managed HTTPS are active.

Existing GitHub installation connected repo denhamvenom/student_status, root `/`, main only, one trigger per Worker, no preview builds. Bun 1.4.3 and VITE_CONVEX_URL=https://amicable-eel-413.convex.cloud. Commands: Student `bun install --frozen-lockfile && bun run build`, then `bunx wrangler deploy --config wrangler.jsonc`; Timeclock `bun install --frozen-lockfile && bun run build:timeclock`, then `bunx wrangler deploy --config apps/timeclock/wrangler.jsonc`. No frontend OAuth/Convex secrets added.

Owner approved the temporary Workers Builds Configuration: Edit addition. Registered the existing token privately, then removed that extra permission immediately. Final dashboard shows only Workers Scripts: Edit for Team 8044, Active until revoked. Build-token UUID `71e5e916-22f9-4505-9fa8-e96861d496d2`. Private ignored transfer file deleted, browser secret variables cleared; token value never printed or committed.

## Focused verification and limitations

- Both HTTPS roots return 200 and render the expected signed-out apps in Chrome. Entry bundles contain the production backend URL and no development deployment name.
- Student About/Privacy/Terms render correctly; direct SPA routes and reloads work. Timeclock `/hosting-check` reload renders the signed-out app; its public links target the correct Student Status pages.
- Wrangler enabled default workers.dev/preview URL settings because configuration omits explicit flags. After deployment both were disabled through Cloudflare and fresh reads verified false for both Workers. Custom domains stay enabled. The next controlled deployment must preserve this explicitly; no source change or redundant redeploy was made.
- No Google sign-in, Coach bootstrap, enrollment or real signing attempted. Page loading is hosting proof only. Google remains External/Testing; live public URL registration and publication are later gates.
- Astra independently verified main matches the approved tree and documentation branch changes no application files; final review found no current-hosting blocker using the integration owner's external evidence. No repeated broad application tests.
- Screenshots of both live apps and final token metadata saved outside Git. No secrets or student records included in release documentation.

Main now automatically deploys both frontends on future changes. Keep progress documentation on its own branch; do not merge merely to publish evidence. Existing development configuration preserved. Paid backups deferred; recovery unproven.

## Historical execution record

Intermediate pending statements below are superseded by the completed status above.


Owner approved the ordered ../DEPLOYMENT.md batch. This is a partial hosting release, not enrollment or production-login acceptance.

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

## Scoped token created; registration permission pending

Owner explicitly approved token creation. Dashboard confirmed Denham Venom production builds created and Active with Workers Scripts: Edit for Team 8044 only. Token value was not displayed in tool output or committed. A private ignored transfer file retains it temporarily for registration; remove after successful transfer.

Both existing and fresh setup wizards list only registered build tokens. The prepared original form was preserved after auto-review rejected reloading it; a separate wizard was opened. A proposed process-to-connector secret transfer was rejected because it serialized the secret through command output; that command did not run. Safer verification and registration occurred entirely inside one process with only status output. Registration returned HTTP403. Official create-build-token API requires Workers CI Write, exposed in the UI as Workers Builds Configuration: Edit.

Prepared (not saved) addition of Workers Builds Configuration: Edit limited to Team 8044. Requested owner approval to add it temporarily, register the existing token, and immediately remove it. No wider storage/database/zone grant is proposed. No frontend deployment occurred. Resume at Update token only after this specific approval; then register privately, reduce permissions, remove transfer file, and finish approved hosting. See https://developers.cloudflare.com/api/resources/workers_builds/subresources/tokens/methods/create/.
