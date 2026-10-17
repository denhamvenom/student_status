# Next chat: finish prelaunch configuration

Read AGENTS.md, CURRENT_STATE.md and LAUNCH_CONFIGURATION_PLAN.md first. Work in this checkout on feature/student-status-completion. Preserve existing work; do not reset or scaffold. User requests a context-suitability check at every phase. Two agents completed the current bounded implementation/review; do not repeat broad audits.

## Completed

- Google project moved to Foundation with approved roles. Google sign-in stays External; status Testing, publication disabled pending branding.
- Organizational Convex Admin accepted and verified. Approved production is amicable-eel-413, still never deployed.
- Six production settings installed: SITE_URL, TIMECLOCK_SITE_URL, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET, JWT_PRIVATE_KEY, JWKS. Google credentials entered by owner. Signing keys generated privately, then stored pair tested in memory for matching RS256 sign/verify. Never reveal values. No backend code deployed.
- Google shared branding name Denham Venom saved. Authorized domains include development callback, team8044.org and production callback. Production client created by owner from the reviewed form; development client retained.
- Cloudflare existing denhamvenom integration lists student_status. Both app Workers/domains remain uncreated. UI creation ends in Deploy, so no submission. Unsaved browser form is not durable configuration; use recorded build matrix.
- Timeclock DEVELOPMENT suffix now Vite DEV-only. Student Status already does this. Both builds/typechecks and Timeclock lint passed; production Timeclock artifact lacks suffix. Existing Student Status bundle-size warning remains. Independent review found no new auth/bootstrap blocker.
- Current remote main verified as 18ef1c27b35f7a30a3c6edeb572d8eb452301538. Remote development caf8ce3 at last verification; local later work is not pushed. Preserve current Pages demo before any main merge, not an older archived copy.

## Owner inputs

Season 2026–2027 starts January 9, 2027 (Saturday kickoff). Support is admin@team8044.org. FIRST enrollment link and supplied QR are saved in ignored private-data/launch/owner-inputs.json and QRCodeFIRSTInvite.png. Do not place enrollment token/QR or account evidence in Git. Input supplied, not applied to a production season. Determine exact startsAt consistently in America/Chicago; no event time was supplied.

## Finish before launch approval

1. Finish truthful public home/privacy material. PRIVACY_NOTICE_DRAFT.md is an owner-review draft with support address; retention coverage/holds/exports remain undecided. No public privacy route created or published. Five-year retention from archival agreed; auto deletion off; backups/paid upgrade deferred.
2. Google support dropdown in original Owner session offers only that account and no groups, so admin support selection remains unresolved. Organizational developer contact added separately and verified saved. Use proper existing admin session/Google-supported identity eligibility, do not grant extra security roles without approval. Preserve External and do not publish OAuth yet.
3. Confirm approved production calendar integration and set its three private settings; obtain owner-entered production operator PIN. Never copy keys or PIN to chat/Git. No calendar/PIN settings installed in this phase.
4. Finish exact Cloudflare token/build/Bun version setup only when it can be saved without unauthorized deployment; otherwise include it in launch approval. Both apps share repository root install and production Convex URL. No Convex deploy token in frontend build. Preview builds initially disabled.
5. Prepare/review Pages preservation transition and release commit. No main merge, public app deployment or real signing authorized yet.

## After explicit launch approval

Deploy backend once and both frontends from approved revision; attach domains and verify HTTPS. Verified Coach Google sign-in precedes guarded empty-target first-Coach bootstrap; disable bootstrap immediately afterward. Set supplied FIRST link/QR in season settings through approved workflow. Validate real-origin sign-in/sign-out/invitation return, role boundaries, calendar freshness, tablet/two-phone concurrent/reconnect behavior. Shared devices use ordinary Mentor, never Coach. Keep real signing closed until its separate approval; do not create fake consent records. Code rollback never implies database rollback.

Browser tabs may have closed or reconnected. Inspect current browser inventory before acting; do not trust cached IDs or unsaved forms. No need to repeat credential generation or completed infrastructure moves.
