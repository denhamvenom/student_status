# Current integration handoff

## October 17 — controlled hosting release in progress

Owner approved the ordered RELEASE_APPROVAL_PACKET.md hosting batch on October 17. Pages preservation, PR10/PR11 merges and production backend deployment are complete. Main release is `60505b4e04976598956bc1353a53e7d4daf63b9d`, whose entire tree matches packet checkpoint `574c910`. Cloudflare Workers/custom domains are pending narrow build-token creation and website deployment. See [HOSTING_RELEASE_LOG.md](HOSTING_RELEASE_LOG.md). Earlier no-approval/no-merge/no-deployment claims below describe historical checkpoints.

Current checkout: docs/controlled-hosting-progress-2026-10-17, documentation only. Do not merge this branch merely to publish the handoff or change the approved frontend build SHA. PR10 and PR11 are merged. Application files still match accepted checkpoint 87134fb.

Pages uses demo-reference-2026-10-17/root at original main 18ef1c27b35f7a30a3c6edeb572d8eb452301538. Build succeeded; all four live demo files exactly matched original Git blobs. Production Convex amicable-eel-413 deployed successfully from 60505b4; typecheck/schema validation passed and no indexes were deleted. Astra independently verified the release merge tree/parents. No broad tests repeated.

Cloudflare sign-in is restored; Team 8044 and existing denhamvenom/student_status connection verified. Main remains60505b4. Student Status creation form is prepared with the packet commands, root path, Bun1.4.3, production endpoint and previews off. Automatic token grants exceed approval and were not submitted. A separate custom-token summary is ready: Denham Venom production builds, Workers Scripts: Edit, Team 8044 only, active until revoked. Browser-required action-time confirmation was requested and remains pending; do not create until owner answers. No token/Worker/trigger/domain created. Next: create the confirmed narrow token, select it for both builds, finish hosting and checks. Do not repeat backend deployment.

## Completed configuration and boundaries

- Google project denham-venom-production under Foundation; shared Web client, exact production callback and basic identity scopes. External/Testing. Owner privately replaced both credentials; exact in-memory comparison passed without output. Public URLs await hosting. See GOOGLE_PRODUCTION_SETUP.md.
- Existing student-status-511411 retains development login and Calendar service account. Production has ten expected settings; prior Calendar read/signing-pair validation/PIN presence accepted. Do not regenerate or request secrets.
- Public About/Privacy/Terms linked from both apps. Approved organization/retention policy in PRELAUNCH_DECISIONS.md.
- Season 2026–2027, year 2027, January 9 midnight America/Chicago (1799474400000) approved. FIRST inputs private, not applied.
- No OAuth publication, bootstrap, data import, enrollment or real signing. Bootstrap/signing gates unset; automatic deletion off. Real-origin sign-in, onboarding, calendar freshness and physical concurrency remain later checks. Paid backups deferred; recovery unproven.

Completed settings and owner decisions need no repeat approval. Browser action-time security-grant confirmation may still apply when creating build access. Accepted development evidence remains in VISUAL_CHECKS.md and prior reviews.
