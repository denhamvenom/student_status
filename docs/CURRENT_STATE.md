# Current integration handoff

Execution update October 17: owner approved the new Google project, shared client, scoped access and private production credential replacement. Created denham-venom-production under dsroboticsfoundation.org (organization 90524038636). IAM shows creator admin@team8044.org automatically has Owner; no manual role grant was made. OAuth wizard prepared with Denham Venom, admin support/contact and External audience; final User Data Policy acceptance awaits action-time confirmation. Client creation and credential replacement remain incomplete. No deployment, merge or OAuth publication. Prior approval-pending text below is historical for this batch.

October 17 OAuth review: owner confirmed up to 165 users (50 students, 15 mentors, up to 100 parents) and personal/school accounts. Separate production Google project is required for the planned audience. See [GOOGLE_PRODUCTION_SETUP.md](GOOGLE_PRODUCTION_SETUP.md) for the concrete approval packet: retain existing development/calendar project; propose new Denham Venom Production project and one Web client for both apps. Execution, new-project IAM and private production credential replacement await owner approval. Nothing changed in Google or production. This supersedes earlier statements that policy applicability remains unknown.

## October 17 — Google production setup ready for approval

Workspace: this repository, branch `feature/student-status-completion`, draft PR10. Application/prelaunch checkpoint `87134fb441aadc70598739fc05d61fa2258ab360` is published and remote-verified. Draft [PR10](https://github.com/denhamvenom/student_status/pull/10) targets `feature/student-status-readiness-design`, not main. A documentation-only boundary reconciliation follows that application checkpoint; verify Git before continuing. Main/Pages source remains 18ef1c27b35f7a30a3c6edeb572d8eb452301538; no merge, deployment or Pages source change.

- Public `/about`, `/privacy`, `/terms` prepared; all require no sign-in. Both Student Status signed-out screens and Timeclock link to them. Simple Terms exclude permission forms. Owner approved Foundation identity and internal retention/hold/export policy; public notice retains only concise family-facing information. Policy revision date October 17, not a launch-date claim.
- Google project remains in Foundation, External/Testing. Owner-approved project-only OAuth Config Editor applied to admin@team8044.org; support email saved with Google success confirmation. Existing developer contacts, clients and domains preserved. Public URL fields await actual hosting.
- Production amicable-eel-413 now has ten required origin/OAuth/signing/calendar/PIN setting names. Calendar source authenticated and read successfully after project move (HTTP200); three approved settings transferred privately and matching values verified in memory. Owner entered PIN; only its presence verified. Signing keys were previously validated; do not regenerate.
- Approved season: name 2026–2027, competition year 2027, start January9 at midnight America/Chicago (`1799474400000`). This is a date boundary, not an event. FIRST link/QR remain ignored private inputs, not applied to a production season.
- No first-Coach bootstrap, real signing, data import or synthetic migration. Automatic deletion off. Backups/paid upgrades deferred.

## Validation and publication

Sol: focused Student Status lint/typecheck/build and Timeclock lint/typecheck/build passed. Existing Student Status bundle-size advisory remains. Astra final targeted source review found no blocker. Root observed public navigation, desktop dark About, phone dark Terms and phone light Privacy; phone document width equals scroll width375. Local evidence only; real-domain deep links/OAuth and physical concurrency remain unverified. No broad test suite repeated for static pages.

Before development push, GitHub Pages verified main/root with only its Pages workflow; Cloudflare app Workers absent and existing Pages projects belong to unrelated repositories. Reviewed checkpoints may be pushed to this development branch, never main. Verify final remote SHA when reporting publication.

## Remaining

1. Owner release approval: preserve current demo on a dedicated reference branch and switch Pages before merging main; create/configure both Cloudflare Workers (reviewed dashboard flow submits Deploy), scoped build token, Bun1.4.3, previews off, same approved revision. See LAUNCH_CONFIGURATION_PLAN.md and PRELAUNCH_DECISIONS.md.
2. Publish pages/HTTPS; then set Google home/privacy/terms URLs and complete applicable branding/domain verification and OAuth publication. Project separation applicability is resolved; execute GOOGLE_PRODUCTION_SETUP.md only after approval. Do not silently recreate credentials or undo the approved migration.
3. Deploy backend and frontends only after approval. Verify Coach Google identity, empty-target bootstrap, immediate flag removal, FIRST configuration, role/invitation/sign-out flows, calendar freshness and tablet/two-phone concurrency/reconnection.
4. Real signing remains separately gated. Recovery and measured production volume remain outstanding, not reasons to reopen deferred paid upgrades during ordinary configuration.

Boundary documentation audit completed October 17. A fresh chat can begin the release phase from NEXT_CHAT_HANDOFF.md; no application work needs repeating. Release authorization has not been granted. Historical notes: CURRENT_STATE_HISTORY_2026-10-17.md; detailed accepted development evidence remains in VISUAL_CHECKS.md and prior reviews.
