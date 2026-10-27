# Development

This directory is the application. The sibling handoff and root npm/Convex starter are preserved references. Use Bun here; do not run a scaffold command over this folder.

## Start from any directory

Verify the active checkout in ../HANDOFF.md first; update the example path if the integration workspace changes. Review mode is the legacy fixture-only preview, not evidence that the live authenticated UI matches the prototype. Frontend-only work must not start Mode Dev, which synchronizes Convex.

Run the absolute path to `start.ps1`, for example:

```powershell
& 'C:\Users\frc80\OneDrive\Documents\2026 - 2027\Denham Venom\Logistics Work\Development Version\student-status-readiness-design\start.ps1' -Mode Review
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

Google OAuth is configured in `student-status-511411` under the authorized development Google account, external **Testing** mode. That account is the authorized test user and first development Coach. Origin: `http://localhost:5173`; callback: `https://third-bandicoot-18.convex.site/api/auth/callback/google`. The client ID/secret and signing keys are stored in Convex environment variables, not app source. A real sign-in round trip was verified October 12, 2026.

The development database contains a `2026–27 Development` season, two fictional students, one Synthetic Regional, and a $1 synthetic ledger verification entry. No real student records were imported. The account itself is a real authorized developer identity. `bootstrap:firstCoach` and `bootstrap:seedSynthetic` are internal, development-URL-bound setup functions; do not rerun the seed against populated data. `scripts/setup-dev-auth.mjs` refuses to rotate existing signing keys.

## Checks

```powershell
bun run check
bun run cloudflare:check
```

Convex generated types must be committed along with source. Normal regeneration is `bun run codegen` after dev configuration. Initial offline types were produced by the installed Convex 1.46 generator using its `--system-udfs --typecheck disable` path, inspected in CLI source; this is only a local bootstrap, not proof that backend code deployed.

Read `GOAL_ACCEPTANCE.md` for implemented versus pending work. Agents read app `AGENTS.md` and `convex/_generated/ai/guidelines.md` before changing backend code.

## Parent invitation milestone

Student Parents and Coach Join Requests now include parent invitations; see [workflow and boundaries](PARENT_INVITATIONS.md). Links are shared manually; no email service is configured. Parent acceptance requires current verified Google-email evidence. Accounts signed in before this update may need to sign out and sign back in. New invited parents can establish their parent role through valid acceptance; existing student/adult or inactive accounts are never automatically converted.

Google OAuth remains in Testing mode. Two owner-controlled test accounts were added for a successful real student/parent invitation rehearsal. The resulting student profile is fictional; account addresses and invitation tokens are deliberately excluded from repository documentation. See ../CHANGELOG.md for evidence.

Invitation layout checks: `bun scripts/parent-invites-browser-check.mjs` against the running frontend. It writes synthetic screenshots/results to ignored test-results/. Use /parents?review=student, /enroll?review=coach, and /invite-parent?review=parent for read-only fixture screens. If sandboxed Vitest fails on temporary-file ENOENT errors, rerun outside the sandbox; do not weaken tests or suppress failures.


## Withdrawal and travel development milestone

Live routes: `/withdrawals` for Coach/Travel Lead review, `/drivers` for driver management, event detail for transport and student withdrawal requests, `/events/:eventId/rooming` for student room selection or adult room operations, `/finances` for categorized charges and source balances, `/attendance` for the Coach-only attendance workspace, and `/permissions` (Coach/Travel) and `/forms` (parent) for the read-only permission draft. The event detail includes Coach/Travel Lead signup review, waitlist promotion, capacity, and requirement operations. The finance area places **Record money returned** and **Transfer fundraising credit** beside payment recording for a Coach or a Travel Lead with the separate financial-edit grant. A money-return entry records an external cash/check refund already made from unallocated personal payments; the app does not send money. Fundraising credits cannot be paid out to a family. Transfers record same-season movement to another active student and automatically apply credit to that student's outstanding charges. New optional fields preserve existing development records. Permission submission stays disabled regardless of permission-version text.

New allocation entries record the originating payment/fundraiser ID. Legacy source inference only accepts an unambiguous source; otherwise stop for financial review. Do not reset or reseed existing records to work around this. Approved-withdrawal reenrollment is blocked until an intentional new-fee flow exists.

Synthetic browser verification added one clearly named test driver and vehicle assignment, adult/trailer settings, and a fictional extra charge that consumed the existing synthetic credit. No real payments occurred. Independent travel was toggled and restored. Do not rerun bootstrap seed. See ../CHANGELOG.md for verification boundaries and ../HANDOFF.md for remaining work.

## Fictional operations rehearsal

`developmentRehearsal:ensure` is an owner-invoked internal mutation for the approved development deployment. It inserts two fictional, unlinked students, an overnight approval event with one pending signup and one waitlisted signup, and clearly labeled synthetic personal payments and fundraising credits. It checks the exact development deployment URL, the active Coach email supplied by the operator, and Coach ownership of the active season. An audit marker makes a repeat invocation return the same fixture; if reserved records have changed or exist without the marker, it stops for manual review. It never creates sign-in accounts or links a parent. Run it only after reviewing the selected development deployment and synchronizing this code there. Replace the placeholder with the authorized development Coach's email; do not paste that address into repository files:

```powershell
bunx convex run --deployment dev developmentRehearsal:ensure '{"expectedCoachEmail":"<COACH_EMAIL>"}'
```

The command returns identifiers for the fictional students and event; do not paste them into repository files. Do not run the fixture against production or rerun the original bootstrap seed. The fixture is a development aid, not a reset or a complete end-to-end rehearsal. With a real, authorized Coach session in the development app, review `/events`, the event's `/events/:eventId` operations panel, `/events/:eventId/rooming`, `/withdrawals`, `/finances`, and Coach `/attendance`. Use only fictional amounts and descriptions. Student and parent UI actions require their own authorized linked accounts; the fixture's students deliberately have no login identity.

The backend multi-role tests use mocked Convex identities and fictional `example.invalid` accounts. They exercise signup, approval, room release, withdrawal return and reallocation, payout recording, fundraising transfer, and role and family-link boundaries without touching the development database:

```powershell
bunx vitest run convex/operationsRehearsal.test.ts convex/developmentRehearsal.test.ts
```

Passing those tests does not prove real Google sign-in, multi-account browser behavior, or the live Coach workflow. Record live UI rehearsal results separately in review notes, including which routes and roles were exercised and any gaps encountered.

## Timeclock workspace

Use the [backend handoff](TIMECLOCK_BACKEND_HANDOFF.md) for commands and API contracts. Root remains Student Status; `apps/timeclock` uses port5174, independent output and Cloudflare config. Root Bun lockfile governs both workspaces. `bun run dev:timeclock` starts frontend only. The frontend chat must never start its own Convex watcher. Existing Student Status namespace is preserved; Timeclock uses a separate namespace and exact localhost redirect origin. Calendar credentials and operator PIN stay only in development server configuration.

## Developer sign-in

The development deployment can sign in to six fixed fictional accounts (Coach, Mentor, Travel Lead, Parent, Parent with staff access, Student) without Google, so every role can be tested by the owner, Claude and automated browser checks. Policy and guards: [DECISIONS.md](DECISIONS.md#developer-sign-in).

It works only on `third-bandicoot-18`, only while both server settings are present, and only in a local development build (`bun run dev`); the panel appears below the normal sign-in card. Any production build fails if any of it reaches the bundle (a Vite build check). Setup, once per development deployment:

```powershell
bunx convex env set --deployment dev DEVELOPER_SIGN_IN_ENABLED true
bunx convex env set --deployment dev DEVELOPER_SIGN_IN_KEY <random value of at least 32 characters>
bunx convex run --deployment dev developerSignIn:ensurePersonas
```

Keep the key outside Git (for example in the ignored `private-data/` folder) and paste it into the panel; the panel remembers it only for the current browser tab. Rerunning `ensurePersonas` restores the fictional accounts' grants, the Dev Student profile link, both family links and the two Parents' verified-parent records (needed for Profile and Permission forms) after testing changes them; it never touches other accounts. The fictional accounts use the reserved `developer.example.invalid` domain, cannot accept invitations, and stop working as soon as either setting is removed. Never set either value on production.

This does not test Google or parent-email sign-in. Before releasing authentication changes, still sign in once for real.

## Student Home scenarios

`developerScenarios:apply` puts the developer Student into a named state for screenshots. It refuses to run unless the backend is the development URL, developer sign-in is enabled and a season is active, and it touches only records it created (prefixed `SCENARIO`). Confirm `.env.local` names `dev:third-bandicoot-18` first.

```powershell
bunx convex run developerScenarios:apply '{"scenario":"busyWeek"}'   # also allDone, newStudent; reset when finished
```

While a scenario is active the fictional teammate Jordan is enrolled in Whole Team events. The development season has no verified kickoff, so the before-kickoff countdown is checked on the local fixture page `/__student-home-preview` (development builds only). Screenshots go outside Git with the student-status-prototype-verification skill; compare with `test-results/smoke`.
