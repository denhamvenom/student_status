# Deployment and recovery

Read [HANDOFF.md](../HANDOFF.md) for current status and unresolved operational risks. Production actions require explicit authorization for the intended scope; historical receipts do not authorize a new deployment.

## Applications and targets

Both frontends use Cloudflare Workers Static Assets with SPA fallback. Convex owns authentication, authorization, stored files, domain records and scheduled work.

| Component | Configuration or target |
| --- | --- |
| Student Status | Root `wrangler.jsonc`; Worker `denham-venom-student-status`; root `dist/` |
| Timeclock | `apps/timeclock/wrangler.jsonc`; Worker `denham-venom-timeclock`; its own `dist/` |
| Development backend | Project `denham-venom-student-status`, deployment `third-bandicoot-18` (VERIFY current account/configuration before sync) |
| Production backend | `amicable-eel-413`, recorded in release receipts (VERIFY before every operation) |
| Production frontends | `students.team8044.org` and `timeclock.team8044.org` (VERIFY) |

Both checked-in Worker configurations disable workers.dev and version preview URLs. Security headers and local assets live in each app's public directory.

## Publication behavior

Repository evidence records main-only Cloudflare Git builds for both frontends (VERIFY dashboard settings and exact build configuration before release). A push or merge to main can publish both websites, including a documentation-only commit. Local edits, commits, builds and packaging checks do not themselves publish.

GitHub Pages is the preserved demo reference on `demo-reference-2026-10-17`, not the application deployment (VERIFY current Pages setting before changing it). Do not repoint it to application main. See [repository workflow](REPOSITORY.md).

The production Google client/publication and controlled onboarding were completed according to the [hosting](releases/HOSTING_RELEASE_LOG.md) and [onboarding](releases/PRODUCTION_ONBOARDING_RELEASE.md) receipts (VERIFY current settings). Do not repeat bootstrap, grant accounts, enable signing or alter secrets merely because an older plan says those steps remain pending.

## Prepare an authorized release

1. Inspect branch, diff, exact reviewed source and requested release scope. Confirm the Cloudflare account, both Workers, Convex target and previous deployed versions without exposing credentials.
2. Run checks appropriate to changes: root `bun run check`, and `bun run check:timeclock` for shared contracts or Timeclock changes. Documentation-only work needs diff/reference review. Use `bun run cloudflare:check` / `bun run cloudflare:timeclock` for relevant packaging dry-runs.
3. Set each frontend's public `VITE_CONVEX_URL` before building; built assets cannot be retargeted by changing dashboard variables afterward. Keep server secrets out of VITE variables.
4. If backend changes are included, synchronize only the explicitly approved deployment and review schema/index effects. Frontend publication does not deploy Convex. Preserve old/new contract compatibility during rollout.
5. Publish only with authorization, then verify exact backend/source revision, both required build outcomes, served assets, relevant redirects and minimal role-scoped smoke behavior. Use synthetic checks where possible; do not manufacture real financial/consent writes as evidence.
6. Record exact versions, performed checks, limitations and rollback scope in `docs/releases/`. Mark unobserved behavior `(VERIFY)`; a cron definition alone does not prove scheduled execution.

## Configuration and signing boundaries

Google origins/redirect callbacks and allowed Student Status/Timeclock destinations are explicit auth configuration. Browser sessions remain origin-local; a common backend does not grant cross-role access.

Real PDF signing is guarded by server `PERMISSION_REAL_SIGNING_ENABLED=true` plus an exact matching `PERMISSION_REAL_SIGNING_CLOUD_URL`; development synthetic signing remains separately scoped. Verify actual configuration and owner approval before any real signing operation. The approved PDF workflow replaces active Medication Choices; old signed evidence remains immutable.

Calendar and Zeffy scheduling use UTC triggers plus America/Chicago slot guards. Calendar is intended for 6 AM/3 PM Central plus manual refresh; Zeffy for 7 AM/7 PM Central when enabled. Check deployed settings and execution evidence rather than inferring operation from source (VERIFY).

## Recovery and open risks

Capture the prior code, Worker versions and compatible backend baseline before a release. On failed validation, stop rollout and choose a scoped rollback/forward fix; do not erase new data or remove additive auth/schema evidence to simulate reversal. Frontend rollback does not reverse financial entries, signatures, imports or external Calendar changes.

An approved backup plan/cost, file-inclusive backups, isolated restore drill, restoration of environment/code and scheduled work, failure alerts and retention/export/hold procedures remain unverified (VERIFY). Manual release exports are not proof of a recurring backup or tested recovery. Automatic retention deletion remains unauthorized. See HANDOFF.md for the security/test/device follow-ups and [release receipts](releases/) for historical recovery evidence.

## Preserved build and bootstrap safeguards

The initial hosting packet recorded both builds from repository root with Bun 1.4.3 and frozen bun.lock: Student Status uses `bun run build`, Timeclock uses `bun run build:timeclock`; each deploy selects its own Wrangler configuration. Verify live build settings before changing them. Both require the public production endpoint at build time; never add server secrets to build variables.

Use narrowly scoped Workers build permissions for the intended account and only required account-discovery access; manage domains separately and limit any zone access to the approved zone. No new paid feature or broader resource permission is implied by an existing release approval.

First-Coach production bootstrap is an exceptional, explicitly authorized empty-target procedure guarded by exact deployment and opt-in settings; use the verified designated application Coach, not an infrastructure administrator by assumption. Preserve existing identities/seasons and approved season inputs; never delete them to rerun bootstrap. Remove temporary bootstrap enablement immediately after a successful approved invocation. Do not rerun completed launch setup from historical notes.

After application main changes, never restore the demo by pointing Pages at application main; use the unchanged preserved reference branch. On partial rollout failure, stop remaining deployment work, preserve data and evaluate code/config compatibility before rollback. Recovery is not permission to restore over production or erase post-release writes.
