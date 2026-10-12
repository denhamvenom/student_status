# Development

This directory is the application. The sibling handoff and root npm/Convex starter are preserved references. Use Bun here; do not run a scaffold command over this folder.

## Start from any directory

Run the absolute path to `start.ps1`, for example:

```powershell
& 'C:\Users\frc80\OneDrive\Documents\2026 - 2027\Denham Venom\Logistics Work\Development Version\student-status-app\start.ps1' -Mode Review
```

The launcher installs locked dependencies and starts the frontend. Visit http://localhost:5173/?review=student (also parent, coach, travelLead, mentor). Review data is fictional, memory-only and explicitly marked; it does not test live authorization. Production builds cannot enable the review switch. No shell profile or PATH changes are needed for this command.

Modes: `Review` starts the local UI; `Dev` runs development Convex sync plus Vite; `Check` runs lint, strict types, tests and build; `Build` creates static output only. Neither Check nor Build deploys.

## Connect development

The owner team is `daniel-eiland` (Daniel Eiland's team), explicitly approved after `frc8044` was not found as a team slug. The existing project is `denham-venom-student-status`; development deployment is `third-bandicoot-18`. Do not create another project. To reconnect this existing development project:

```powershell
bunx convex dev --configure existing --team daniel-eiland --project denham-venom-student-status --dev-deployment cloud --once
```

Configuration synchronizes backend code to the selected **development** deployment. Keep the generated `.env.local` private. `VITE_CONVEX_URL` is a public endpoint, not an authorization secret. Never put private keys, OAuth secrets or deployment keys in a `VITE_` variable.

After configuration use `start.ps1 -Mode Dev`. The launcher requires `dev:` or `local:` and rejects conflicting/key-based overrides. Do not use it for production. The app requires Google authentication plus a server-provisioned role; a Google login alone never makes someone Coach.

Google OAuth is configured in `student-status-511411` under `frc8044@gmail.com`, external **Testing** mode. That account is the authorized test user and first development Coach. Origin: `http://localhost:5173`; callback: `https://third-bandicoot-18.convex.site/api/auth/callback/google`. The client ID/secret and signing keys are stored in Convex environment variables, not app source. A real sign-in round trip was verified October 12, 2026.

The development database contains a `2026–27 Development` season, two fictional students, one Synthetic Regional, and a $1 synthetic ledger verification entry. No real student records were imported. The account itself is a real authorized developer identity. `bootstrap:firstCoach` and `bootstrap:seedSynthetic` are internal, development-URL-bound setup functions; do not rerun the seed against populated data. `scripts/setup-dev-auth.mjs` refuses to rotate existing signing keys.

## Checks

```powershell
bun run check
bun run cloudflare:check
```

Convex generated types must be committed along with source. Normal regeneration is `bun run codegen` after dev configuration. Initial offline types were produced by the installed Convex 1.46 generator using its `--system-udfs --typecheck disable` path, inspected in CLI source; this is only a local bootstrap, not proof that backend code deployed.

Read `PLAN.md` for implemented versus pending work. Agents read app `AGENTS.md` and `convex/_generated/ai/guidelines.md` before changing backend code.

## Parent invitation milestone

Student Parents and Coach Join Requests now include parent invitations; see [workflow and boundaries](PARENT_INVITATIONS.md). Links are shared manually; no email service is configured. Parent acceptance requires current verified Google-email evidence. Accounts signed in before this update may need to sign out and sign back in. New invited parents can establish their parent role through valid acceptance; existing student/adult or inactive accounts are never automatically converted.

Google OAuth remains in Testing mode with the existing authorized Coach account. A real additional-account acceptance rehearsal still requires an authorized Google test identity; synthetic backend tests and UI review are not that rehearsal.

Invitation layout checks: `bun scripts/parent-invites-browser-check.mjs` against the running frontend. It writes synthetic screenshots/results to ignored test-results/. Use /parents?review=student, /enroll?review=coach, and /invite-parent?review=parent for read-only fixture screens. If sandboxed Vitest fails on temporary-file ENOENT errors, rerun outside the sandbox; do not weaken tests or suppress failures.
