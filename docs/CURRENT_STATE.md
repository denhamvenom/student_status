# Current integration handoff

October 18 active goal: finish footer cleanup and controlled production role rehearsal. Current development branch `fix/google-signin-return-2026-10-18`. See [PRODUCTION_ONBOARDING_PLAN.md](PRODUCTION_ONBOARDING_PLAN.md). Root owns Git/backend/releases; Sol implementation and Astra consolidated review.

## Completed

- Production main `8c22d50` now hosts both apps and shared Convex `amicable-eel-413` after owner-approved PR12; see PRODUCTION_ONBOARDING_RELEASE.md. Exact approved tree and preserved demo verified; see [HOSTING_RELEASE_LOG.md](HOSTING_RELEASE_LOG.md). Main merges automatically deploy both frontends; do not merge casually.
- Google live /about homepage, /privacy and /terms URLs saved. Owner explicitly approved publication; Google confirms External / In production; automated branding verification passed and verified branding was published.
- Real Coach Google login succeeded. Read-only preflight confirmed verified identity and empty appUsers/seasons/events. Guarded production first-Coach operation created the approved 2026–2027 season (year 2027, startsAt 1799474400000). Both temporary bootstrap settings removed. Live Coach dashboard shows empty roster.
- Owner explicitly confirmed four other named identities are test roles on live sites: Student, ordinary Mentor, Travel Lead and Parent. Account list, baseline IDs and cleanup ledger are Git-ignored at private-data/launch-testing-2026-10-18/ledger.json. Baseline confirms none of those four identities previously existed in production. Do not put their identifiers or test records in Git.
- Footer cleanup implemented in both apps; Sol reports focused lint/types/build and representative 390 dark/1280 light checks pass with one footer and keyboard access. Astra source review passed; approved release deployed. Live Student About footer verified. Authenticated Timeclock footer not yet observed.
- Worker configs now explicitly disable workers.dev and preview URLs; local packaging dry runs completed, with sandbox-denied log-file writes only. Both successful production builds preserve these settings.

## In progress / boundaries

- Minimal internal exact-ID cleanup preview/commit implemented; four focused real-flow/refusal tests, lint/typecheck and Astra consolidated review passed. Root Convex-specific typecheck passed. Owner-approved release deployed, tool disabled. Owner approved all four test-role grants; Mentor Google sign-in, invitation acceptance and dashboard verified. Travel Lead invitation created without finance/health-export extras; its Google password step awaits account-holder participation. Student Google login, Coach approval and own setup screen verified; Parent invitation created for that synthetic Student, acceptance pending. Archival alone is not physical deletion. Initial rehearsal excludes event participation, money, attendance and signatures until cleanup scope covers their dependencies.
- Preserve the real Coach, season, existing credentials, Calendar/PIN settings and unrelated records. Test identities must use actual verified Google sign-in and supported account flows; no impersonation.
- Footer/backend release completed at 8c22d50; no cleanup execution; Mentor provisioning verified. Chrome locally blocks Timeclock (ERR_BLOCKED_BY_CLIENT), while HTTPS server returns200; owner confirms phone access works; exact local blocking component remains unidentified. Real signing disabled; paid backups deferred/recovery unproven. Existing development evidence remains valid; no whole-app re-audit.

- Follow-up fix: ordinary Google login now explicitly returns to the site root, avoiding a stale invitation redirect after account switches. Sol scoped lint/TypeScript, root production build and Astra source review passed. Not deployed. Account holder away; retain Travel password handoff and private Parent invitation.
