# Production onboarding release candidate — October 18, 2026

## Proposed deployment scope

- Footer-only About/Privacy/Terms navigation in Student Status and Timeclock, preserving public content/URLs and consent workflows.
- Explicit workers_dev:false and preview_urls:false in both Worker configurations to preserve current hosting settings across updates.
- Internal-only, disabled-by-default synthetic account rehearsal cleanup preview/commit. Exact target, opt-in, manifest IDs and unchanged reviewed fingerprint required. Restricted to early account-only rehearsal; rejects unexpected dependencies or material domain activity. Actual cleanup execution is a separate operation after manifest review.

Target: existing production Convex amicable-eel-413 and existing denham-venom-student-status / denham-venom-timeclock Workers. Main-only builds publish both websites. No credentials/Calendar/PIN change, no signing enablement, no schema migration, no paid upgrade. Existing live release 60505b4 remains until approval. Preserve the real Coach/season initialized October 18.

## Validation

Footer/config focused build/type/lint/layout evidence and Astra source review passed. Cleanup tests 4/4, focused ESLint and TypeScript passed; root independently ran Convex-specific TypeScript successfully. Astra consolidated source review passed after concrete fixes. Positive fixture uses actual Student join approval and Parent invitation acceptance, including exact join-code audit removal and all ten finance aggregate leaves. Unrelated aggregate preservation follows exact student-ID scope but was not separately exercised. Local codegen completed; new backend code not yet deployed. Ready for controlled release approval; identify exact commit in Git/PR rather than self-referential file content.

## After release

Confirm both successful builds and unchanged disabled URL settings, public footer and policy navigation, then run supported role invitation/join flows with verified account holders. Keep precise private creation/dependency ledger. Parent authority attestation needs an honest synthetic-test procedure. Initial scope excludes event participation, attendance, money and signing until their cleanup paths are reviewed.
