# Controlled hosting release — approval packet, October 17, 2026

Status: prepared for approval; no release action executed. This packet authorizes nothing by itself.

## Exact candidate and fresh evidence

- Reviewed candidate: `75f1f31ee2f160cbaa4d3a99964a87b9ee34fca2` on feature/student-status-completion. Its application/configuration files are unchanged from accepted application checkpoint `87134fb441aadc70598739fc05d61fa2258ab360`; only documentation differs. This packet adds documentation only.
- Remote main and live Pages source: `18ef1c27b35f7a30a3c6edeb572d8eb452301538`. GitHub API confirms Pages main/root at https://denhamvenom.github.io/student_status/.
- PR10 is draft, targets feature/student-status-readiness-design and is mergeable into THAT branch. It is not a main release PR.
- Main is not an ancestor of the candidate. Read-only merge simulation finds index.html content conflict and modify/delete conflicts for flow-index.html, handheld-spec.html and review-guide.html. These are demo/application-root differences, not permission to discard the current demo.
- Proposed reference branch demo-reference-2026-10-17 does not exist remotely as of this review. Create it from the exact main SHA above, without modification, only after approval.
- Working tree was clean at start. Both Wrangler configurations confirm static SPA assets and approved Worker names. No application checks repeated for this documentation-only packet.
- Google production setup is completed per GOOGLE_PRODUCTION_SETUP.md. Hosting absence and Cloudflare account/connection observations come from the earlier prelaunch inspection; recheck target account, Worker absence and DNS immediately before creation. This packet does not claim a new Cloudflare inventory read.

## Approval requested: preserve demo, integrate and host

Approve the following ordered batch. Stop at any failed gate; do not improvise broader access, paid services or destructive recovery.

1. Create demo-reference-2026-10-17 at `18ef1c27b35f7a30a3c6edeb572d8eb452301538`. Switch Pages source to that branch/root, wait for its build, and verify the existing public demo URL and four reference pages. Do not merge main until this succeeds.
2. Complete PR10 into its existing integration target, then prepare the main release PR. Resolve only the identified demo/root conflicts by retaining candidate index.html and candidate deletions of the other three root demo files. Preserve the latest demo byte-for-byte on its reference branch; keep the existing demo/ archive unchanged. Require the resulting application tree to match the reviewed candidate outside docs. Any additional source difference or unexpected conflict returns for review. Merge the reviewed release PR only after the Pages gate. No force push or published-history rewrite. Attach every created PR to the chat.
3. Record the resulting main release SHA before deploying. A future merge SHA cannot be honestly precomputed here; approval is bounded to the candidate's exact application tree plus reviewed documentation and merge metadata. Both frontends and backend must use that resulting SHA. No unrelated commits may be included.
4. Deploy Convex backend once to production amicable-eel-413 in project denham-venom-student-status, team daniel-eiland. Verify the target before running the installed production deployment command. Use existing approved configuration. No dev sync, seed, data import, user/season bootstrap or real signing. If deployment would require a destructive schema/data action, stop.
5. Create the two Cloudflare Workers using the matrix below in the existing approved account containing team8044.org. Verify the account and repository connection before submission. The reviewed creation flow submits Deploy; approval of this batch explicitly includes that first deployment and attachment of the two custom domains. Enable main builds only; previews off. A main build trigger means future main merges can deploy, so subsequent merges remain release-controlled.
6. Verify both HTTPS domains, root/deep-link reloads, About/Privacy/Terms and both apps' backend targets. Record build IDs, deployed revision and any failures. Do not declare production login verified from a page-load check.

## Frontend build matrix

| Setting | Student Status | Timeclock |
| --- | --- | --- |
| Worker | denham-venom-student-status | denham-venom-timeclock |
| Domain | students.team8044.org | timeclock.team8044.org |
| Repository | denhamvenom/student_status | same |
| Branch / root | main / repository root | same |
| Bun | BUN_VERSION=1.4.3 | same |
| Build | bun install --frozen-lockfile && bun run build | bun install --frozen-lockfile && bun run build:timeclock |
| Deploy | bunx wrangler deploy --config wrangler.jsonc | bunx wrangler deploy --config apps/timeclock/wrangler.jsonc |
| Assets | root dist | apps/timeclock/dist |
| Public backend variable | VITE_CONVEX_URL=https://amicable-eel-413.convex.cloud | same |
| Preview builds | disabled | disabled |

Build-time typechecks/builds are necessary artifact generation, not a request to repeat every accepted test. Use the locked dependency versions. No Convex deploy key, Google secret, signing key, calendar credential or PIN belongs in frontend builds.

## Permissions and costs

Use the existing repository installation. A build token should be limited to Workers Scripts edit for the intended Cloudflare account and only required account-discovery permissions. Manage custom domains separately; if zone route access is required, limit it to team8044.org. No KV/R2 permissions, all-zone access or broad account grants are approved. Exact selectable permissions must be checked in the live form before saving; request a revised decision if Cloudflare cannot support the proposed scope. Browser action-time confirmations/handoffs may still be required for security-sensitive grants or credential entry.

Use current plans; no paid upgrade, subscription or billing change. If deployment requires a paid feature or unexpected resource, stop and explain. Existing production settings, support email, Calendar service account, season values and PIN approvals remain settled.

## Failure and rollback

- Before main merge: if the reference Pages switch fails, return Pages to original main/root while main still points to the original demo, and verify it. Stop release integration.
- After main changes: never point Pages back to application main. Restore Pages to the preserved reference branch. Keep the reference branch unchanged.
- First backend/frontend deployment has no previous production version. On partial release failure, stop remaining deployment/automatic builds and withdraw newly added public routes or use a reviewed maintenance response. Do not delete project data or pretend code rollback reverses writes. Keep bootstrap and real signing disabled.
- For later releases, record prior Worker versions and compatible backend revision before changes. Assess data compatibility before reverting backend code. No database restore is included; recovery remains unproven and paid backups deferred.

## Gates after hosting — not included in this batch

1. Register the now-live Google About/Privacy/Terms URLs; verify domain ownership and provider callback handling; complete applicable branding verification and separately approve OAuth publication. No custom auth domain, paid feature or credential rotation is implied.
2. Verify real-origin Google sign-in for the approved Coach and representative intended account types. Separately approve guarded empty-target first-Coach/season initialization, immediate flag removal and FIRST configuration. Values are already approved: 2026–2027, competition year 2027, January 9 midnight America/Chicago.
3. Focused live onboarding/roles, invitation returns, calendar freshness, tablet/two-phone concurrency and reconnection. Do not repeat accepted development audits unless a concrete failure warrants it. No synthetic production records or fabricated signatures.
4. Owner opens enrollment after checks. Real signing requires its separate readiness gate. Keep unproven recovery and deferred paid backups explicit.

## Decision

Approve or amend the ordered hosting batch above: exact-demo preservation and Pages switch, reviewed integration/main merge, one production backend deployment, both Cloudflare deployments/custom domains and narrowly scoped build access. Google publication, bootstrap, enrollment and real signing remain subsequent decisions. This request is necessary because the owner has explicitly withheld deployment/merge authorization until review of a concrete packet.
