# Launch configuration plan — October 17, 2026

## Current October17 follow-up

Public /about, /privacy and /terms are prepared and linked from both apps. Owner-approved organization/retention policy and season values are in PRELAUNCH_DECISIONS.md. Google OAuth Config Editor project role approved/applied; admin support email saved. Calendar integration reverified HTTP200 after migration and three production settings privately installed/compared. Owner-entered production PIN presence verified. Ten expected settings present; bootstrap/signing gates remain unset. No deployment/merge/Pages switch.

Public URLs to register only after hosting: https://students.team8044.org/about, https://students.team8044.org/privacy, https://students.team8044.org/terms. Before OAuth publication resolve Google separate-project policy applicability; separate clients currently share the existing project. Read CURRENT_STATE.md for current evidence; older pending statements below are historical.

## Historical configuration sequence

The checkpoint hashes, six-setting count and pending statements in this sequence describe earlier stages. The current follow-up above and CURRENT_STATE.md supersede them; the published application/prelaunch checkpoint is `87134fb`. Preserve the sequence as execution evidence.

### Approved configuration progress

Owner approved the proposed target/client/address/build preparation batch. Saved and verified SITE_URL and TIMECLOCK_SITE_URL on production amicable-eel-413. Google Web client form prepared as Denham Venom Production with both approved origins and the exact production callback; owner reported clicking Create and privately entered the credentials. AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET were verified present on production amicable-eel-413 with no pending Save control; values were not read or exposed. Development client remains unchanged. Production JWT_PRIVATE_KEY/JWKS now generated and installed privately via the installed Convex CLI. Existing-key preflight prevented overwrite; stored values were verified in memory to parse and sign/verify as a matching RS256 pair. No values displayed or written to repository files. Google credential correctness and live OAuth round trip remain unverified.

Cloudflare existing repository access verified. Student Status form staged with root path, frozen-lockfile build, config-specific deploy command, production VITE_CONVEX_URL and previews disabled. The final action is Deploy (no save-only creation), so it was not submitted. No Worker, trigger or domain was created. Timeclock settings remain recorded below, not saved to Cloudflare. Bun pin and API token selection must be completed at launch setup. No main merge or application deployment occurred. Current chat remains suitable; no context restart required.

Initial inspection was preparation-only; the subsequently approved configuration changes are recorded above. No application deployment or main merge performed. Application baseline a7aa5e0; current local checkpoint a63c222. Both apps stay in denhamvenom/student_status. Earlier development validation remains evidence for that checkpoint, not a production test.

## Verified state

- Foundation Google project migration is complete; OAuth remains External / Testing.
- Convex organizational Admin membership accepted and verified; original administrator retained. Team remains Free. Production amicable-eel-413 has never been deployed, now has the six approved origin/OAuth/signing settings and no deploy keys, and retains default dashboard confirmation/client-log protections.
- Cloudflare team8044.org zone is active. Neither app Worker exists; exact DNS queries returned no records for students.team8044.org or timeclock.team8044.org.
- Google branding name Denham Venom saved with a success notification. Authorized domains verified: original development callback domain, team8044.org, and amicable-eel-413.convex.site. Home/privacy/terms links remain empty. Owner created a separate production client from the reviewed form; original Development client preserved. Data Access lists no configured scopes; this is not proof that runtime OAuth requests no scopes.
- Cloudflare API reads and dashboard access work. After owner login, the existing denhamvenom GitHub connection visibly listed student_status in the repository picker. No new access grant is needed for repository selection; no Worker was created or deployed.

## Approved configuration batch (remaining execution below)

Use existing production amicable-eel-413 for both apps. Configure production-specific Google OAuth credentials and Convex signing keys privately. Preserve development credentials and redirect behavior. Credential entry/creation through browser may require owner handoff; never paste secrets into chat, Git, screenshots or frontend variables.

Create a separate Google Web application client named Denham Venom Production. Register https://students.team8044.org and https://timeclock.team8044.org as JavaScript origins, and exactly https://amicable-eel-413.convex.site/api/auth/callback/google as the redirect URI. Keep existing development client untouched. Update shared branding to Denham Venom, organizational support/contact identity, and verified public home/privacy URLs. Add team8044.org and the accepted production callback domain to authorized domains, preserving development. Keep External; change Testing to Production only with launch approval after required branding is complete. Do not add Calendar OAuth scopes to user sign-in: Timeclock uses its separate read-only calendar service account.

Production Convex configuration inventory:

| Setting | Intended value or handling |
| --- | --- |
| SITE_URL | https://students.team8044.org |
| TIMECLOCK_SITE_URL | https://timeclock.team8044.org |
| AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET | New production client, transferred privately |
| JWT_PRIVATE_KEY / JWKS | Dedicated matching production signing key pair; installed Auth package confirms these names |
| TIMECLOCK_CALENDAR_ID | Owner-approved team calendar, existing integration to be verified |
| TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL / TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY | Privately configure approved calendar read-only integration; verify it still reads successfully after Google migration |
| TIMECLOCK_OPERATOR_PIN | Owner enters production PIN privately |
| PRODUCTION_BOOTSTRAP_ENABLED | Unset/false until approved first-Coach operation; remove/disable immediately afterward |
| PRODUCTION_BOOTSTRAP_CLOUD_URL | Exact production cloud URL when first-Coach operation is approved |
| PERMISSION_REAL_SIGNING_ENABLED | Unset/false until separate real-signing readiness approval |
| PERMISSION_REAL_SIGNING_CLOUD_URL | Exact production cloud URL when real signing is approved |

Convex supplies CONVEX_SITE_URL and CONVEX_CLOUD_URL; do not manually replace system deployment identity. Do not import development tables or synthetic receipts.

## Cloudflare build settings prepared for review

Use separate Workers Builds connections to the same repository, with repository root `/` for both so the shared Bun workspace/lockfile is available. Pin BUN_VERSION to locally verified 1.4.3; install with bun install --frozen-lockfile. Use locked Wrangler from the repository. Configuration model checked against https://developers.cloudflare.com/workers/ci-cd/builds/configuration/ .

| Setting | Student Status | Timeclock |
| --- | --- | --- |
| Worker | denham-venom-student-status | denham-venom-timeclock |
| Build command | bun install --frozen-lockfile && bun run build | bun install --frozen-lockfile && bun run build:timeclock |
| Deploy command, only after approval | bunx wrangler deploy --config wrangler.jsonc | bunx wrangler deploy --config apps/timeclock/wrangler.jsonc |
| Static assets (relative to config) | ./dist | ./dist |
| Custom domain | students.team8044.org | timeclock.team8044.org |
| Build variable VITE_CONVEX_URL | https://amicable-eel-413.convex.cloud | https://amicable-eel-413.convex.cloud |

Target production branch: main after approved release merge. Do not connect an active production trigger to current development work or let initial connection auto-deploy before launch authorization. Disable preview builds initially; a preview URL alone does not isolate a shared production backend. Use no Convex deploy key in either frontend build: backend release is one deliberate, separately controlled operation. GitHub installation should be limited to this repository where possible. Review required Cloudflare deployment token scope before granting it. No paid upgrade requested.

## Ordered release and GitHub Pages transition

1. Resolve public privacy/contact URLs, production wording (Timeclock DEV-only label change prepared locally), exact season start date and season-year convention. FIRST invite link still needed. Keep agreed five-year archival retention; operating coverage/holds remain unresolved and deletion stays off. Backups/paid upgrades remain explicitly deferred, not claimed complete.
2. Preserve the existing standalone demo on a dedicated immutable-reference branch created from the verified current Pages source commit. With approval, switch Pages to that branch's root and verify the original URL before merging app source to main. This preserves the demo URL while main becomes application source. Do not rely on the new Vite root as a GitHub Pages artifact.
3. Prepare and review release commit, production wording/privacy changes, required focused checks, and exact deployment target. Publish development checkpoint only after confirming no deployment trigger targets it. No main merge until Pages transition is verified.
4. After explicit launch authorization, install approved production settings, deploy backend once, deploy both frontend builds from the same approved revision, attach domains and verify HTTPS. Ensure Google production callback and branding are ready. A first deployment has no prior production version to roll back to.
5. Coach signs in using the fixed approved Coach account. Verify production is empty of application users/seasons; temporarily enable guarded first-Coach operation using owner-confirmed seasonName/year/startsAt, then disable it. Never clear records to bypass the guard.
6. Verify real-origin sign-in/sign-out and invitation returns, role restrictions, Coach enrollment approval, Parent/Student setup, calendar freshness, and physical Timeclock tablet/phone operation. Use controlled authorized accounts; no fabricated consent or financial records. Real signing remains disabled until its separate gate is satisfied.
7. Open enrollment only after smoke checks pass. Record exact backend/frontend revisions, operator, configuration inventory without values, and remaining limitations.

## Rollback and monitoring

Record previous Worker versions for each later release and compatible backend revision. Pause automatic builds during an incident; revert frontend versions together when needed. Review backend schema/data compatibility before redeploying prior code; code rollback does not undo database writes. On first-release failure, withdraw public app routes or serve an approved maintenance page rather than claiming a nonexistent previous version. Disable bootstrap and new real signing promptly if relevant; preserve existing records/receipts. No destructive restore or deletion without specific authorization.

Owner checks Convex health/errors and usage plus Cloudflare build failures and domain availability during controlled rollout. Calendar must stay within existing three-minute freshness behavior; investigate stale/error status before trusting Timeclock. No automated monitoring or recovery drill has been configured by this preparation.

## Remaining user inputs and evidence limits

Cloudflare GitHub connection verification is complete. Production PIN must be entered privately. Confirm actual season start date and year convention, provide FIRST enrollment link, and approve the public privacy/contact material before publication. Hosted configuration, production OAuth round trips, physical-device checks and recovery remain unverified. The configuration batch is approved; public deployment, main merge, publishing OAuth and enabling real signing remain distinct release actions.

Context check: this phase is sufficiently captured for continued configuration in the current chat. Recommend a fresh implementation chat if substantial application changes are needed; use this plan plus ONLINE_READINESS_HANDOFF.md as the handoff.

## Final prelaunch preparation review

Two owner-requested agents performed bounded implementation and independent review. No new auth/bootstrap code blocker found. Bootstrap supports verified pending Coach sign-in before app users/seasons exist; preserve exact-target and empty-target refusals. Shared Timeclock hardware must use ordinary Mentor identity. Google runtime login scopes are openid/profile/email; Calendar remains separate service-account read-only. Draft public notice is in PRIVACY_NOTICE_DRAFT.md and must be approved/completed before publication.

Remote main verified October17 as 18ef1c27b35f7a30a3c6edeb572d8eb452301538. Preserve the current verified Pages source, not the older demo archive commit. Pages source switch/reference branch not performed. Reverify immediately before release. Remote development branch remains caf8ce3; later local work is not published.

Owner follow-up: start date January 9, 2027 (Saturday kickoff), FIRST enrollment link/QR and admin support supplied. Enrollment artifacts stored only in ignored private-data/launch. Organizational developer contact saved in Google; support dropdown eligibility unresolved. See NEXT_CHAT_HANDOFF.md for current remaining work. Both builds/typechecks and Timeclock lint passed; independent review clear. Fresh chat recommended for next phase.
