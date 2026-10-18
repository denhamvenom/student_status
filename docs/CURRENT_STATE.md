# Current integration handoff

## October 17 — controlled hosting release in progress

Owner approved the ordered RELEASE_APPROVAL_PACKET.md hosting batch on October 17. Pages preservation, PR10/PR11 merges and production backend deployment are complete. Main release is `60505b4e04976598956bc1353a53e7d4daf63b9d`, whose entire tree matches packet checkpoint `574c910`. Cloudflare Workers/custom domains are pending dashboard sign-in and narrow build access. See [HOSTING_RELEASE_LOG.md](HOSTING_RELEASE_LOG.md). Earlier no-approval/no-merge/no-deployment claims below describe historical checkpoints.

Current checkout: docs/controlled-hosting-progress-2026-10-17, documentation only. Do not merge this branch merely to publish the handoff or change the approved frontend build SHA. PR10 and PR11 are merged. Application files still match accepted checkpoint 87134fb.

Pages uses demo-reference-2026-10-17/root at original main 18ef1c27b35f7a30a3c6edeb572d8eb452301538. Build succeeded; all four live demo files exactly matched original Git blobs. Production Convex amicable-eel-413 deployed successfully from 60505b4; typecheck/schema validation passed and no indexes were deleted. Astra independently verified the release merge tree/parents. No broad tests repeated.

Next: owner signs in to the open Cloudflare dashboard, then finish the packet's two Workers/custom domains and focused hosting checks. Connector denied token-permission inspection. No target Workers/build triggers/custom domains created. Recheck inventories and main SHA before submission. Do not repeat backend deployment without a concrete reason.

## Completed configuration and boundaries

- Google project denham-venom-production under Foundation; shared Web client, exact production callback and basic identity scopes. External/Testing. Owner privately replaced both credentials; exact in-memory comparison passed without output. Public URLs await hosting. See GOOGLE_PRODUCTION_SETUP.md.
- Existing student-status-511411 retains development login and Calendar service account. Production has ten expected settings; prior Calendar read/signing-pair validation/PIN presence accepted. Do not regenerate or request secrets.
- Public About/Privacy/Terms linked from both apps. Approved organization/retention policy in PRELAUNCH_DECISIONS.md.
- Season 2026–2027, year 2027, January 9 midnight America/Chicago (1799474400000) approved. FIRST inputs private, not applied.
- No OAuth publication, bootstrap, data import, enrollment or real signing. Bootstrap/signing gates unset; automatic deletion off. Real-origin sign-in, onboarding, calendar freshness and physical concurrency remain later checks. Paid backups deferred; recovery unproven.

Completed settings and owner decisions need no repeat approval. Browser action-time security-grant confirmation may still apply when creating build access. Accepted development evidence remains in VISUAL_CHECKS.md and prior reviews.
