# Production onboarding release candidate — October 18, 2026

## Approved and deployed scope

- Footer-only About/Privacy/Terms navigation in Student Status and Timeclock, preserving public content/URLs and consent workflows.
- Explicit workers_dev:false and preview_urls:false in both Worker configurations to preserve current hosting settings across updates.
- Internal-only, disabled-by-default synthetic account rehearsal cleanup preview/commit. Exact target, opt-in, manifest IDs and unchanged reviewed fingerprint required. Restricted to early account-only rehearsal; rejects unexpected dependencies or material domain activity. Actual cleanup execution is a separate operation after manifest review.

Target: existing production Convex amicable-eel-413 and existing denham-venom-student-status / denham-venom-timeclock Workers. Main-only builds publish both websites. No credentials/Calendar/PIN change, no signing enablement, no schema migration, no paid upgrade. Owner approved PR12 at eff37ec. Merged release 8c22d50f54422912169c10a9721d7580c71a5bb1 matches that candidate tree and is deployed. Preserve the real Coach/season initialized October 18.

## Validation

Footer/config focused build/type/lint/layout evidence and Astra source review passed. Cleanup tests 4/4, focused ESLint and TypeScript passed; root independently ran Convex-specific TypeScript successfully. Astra consolidated source review passed after concrete fixes. Positive fixture uses actual Student join approval and Parent invitation acceptance, including exact join-code audit removal and all ten finance aggregate leaves. Unrelated aggregate preservation follows exact student-ID scope but was not separately exercised. Local codegen completed; new backend code not yet deployed. Release approved and deployed as recorded below.

## After release

Confirm both successful builds and unchanged disabled URL settings, public footer and policy navigation, then run supported role invitation/join flows with verified account holders. Keep precise private creation/dependency ledger. Parent authority attestation needs an honest synthetic-test procedure. Initial scope excludes event participation, attendance, money and signing until their cleanup paths are reviewed.

## Execution evidence

October 18: PR12 merged with exact-head guard; remote main 8c22d50f54422912169c10a9721d7580c71a5bb1, no tree difference from eff37ec. Convex deployed from detached merged SHA to amicable-eel-413; typecheck/schema validation passed, no indexes deleted. Cleanup, real-signing and bootstrap enablement names confirmed absent afterward.

Cloudflare automatic main builds both succeeded from the same merged SHA:

| App | Build UUID | Deployed UTC |
| --- | --- | --- |
| Student Status | 81e501cf-0646-4c5f-9441-3b55a954dcb0 | 2026-10-18 14:15:34 |
| Timeclock | 931a0598-adca-40e0-a8f1-74189d0c9ece | 2026-10-18 14:15:35 |

Fresh Worker reads confirm workers.dev and version preview URLs remain disabled for both; custom domains unchanged. Live Student Status About shows one footer with the three links, header Sign in only. Timeclock server returns HTTPS200, but Chrome returned ERR_BLOCKED_BY_CLIENT on refresh and fresh tab; owner asked to resolve local browser access. Do not classify that as a failed deploy or alter browser protections. Authenticated Timeclock verification still pending.

Documentation continues on docs/onboarding-progress-2026-10-18 without triggering another main build. Synthetic account grants are awaiting browser-required bundled action-time approval; no synthetic role records created yet. Real Coach/season preserved.


### October 18 approved test-role checkpoint

Production release `8c22d50` is deployed; immutable tag `v0.1.0-onboarding.1` verified remotely. Owner approved all four test-role grants. Mentor Google login, invitation acceptance and live role dashboard verified. Travel Lead invitation created with financial editing and health export disabled; account-holder Google password entry remains necessary. Student Google login, Coach approval and own setup screen verified; Parent invitation created for that synthetic Student, acceptance pending. Exact invitation and Mentor account identifiers are in the ignored private ledger; no emails, cleanup or real signing executed. Owner confirms Timeclock works on phone; Chrome ERR_BLOCKED_BY_CLIENT remains a local, unidentified blocker. This supersedes earlier pending-release/access-approval statements.


## PR13 sign-in follow-up released October 18

Owner explicitly approved candidate 5c2a9f42118311c9eefdd3ecb7758ca9001b2cc8. PR13 merged at f4bd7dc8eeaa6bca7584ca55bff949339070debb; exact tree comparison was empty. Student build 264e93be-1507-4114-bb90-3d19efcbd191 succeeded at 15:08:41Z; Timeclock build f3603601-8556-4779-b377-7ab79fde6b1e succeeded at 15:09:19Z, both from that merge SHA. No backend deployment.

Travel invitation accepted using the approved Google identity; dashboard and read-only permission check confirm Travel Lead without finance editing or health export. After loading the released site, sign-out and ordinary Google login returned directly to the root Travel dashboard. Parent invitation acceptance remains pending. Private ledger updated. No cleanup or real signing. Release tag: v0.1.0-onboarding.2.
