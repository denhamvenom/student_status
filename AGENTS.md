# Project instructions

## Start and handoff

- At the start of every session, read HANDOFF.md before exploring code. Only open files relevant to the current task.
- Verify the actual repository, branch and dirty state; preserve unrelated work and stay within this repository unless the user expands scope.
- HANDOFF.md is the short current status. Dated plans, audits and release receipts are historical; later explicit user decisions take precedence.
- Read docs/DECISIONS.md before changing anything involving parent linking, consent, finance, rooms, or retention.
- Read docs/BACKLOG.md only when the user asks for backlog work or the current task relates to an item in it; do not read it at every session start.
- Do not create new markdown or notes files unless I ask. Progress notes go in HANDOFF.md. New release receipts go in docs/releases/.
- When I say 'handoff', 'new window', or 'time for a new context window', use the student-status-context-checkpoint skill.
- Also use that existing skill when the user is ending a session; do not create a replacement skill.

## Stack and commands

- Bun; React Router 7 Data Mode SPA; Vite; strict TypeScript; Tailwind 4; shadcn Base UI. Convex is the only domain backend.
- Keep the approved architecture; do not add frameworks, databases or infrastructure without a task requirement.
- Student Status stays at repository root: `bun run dev`; Timeclock: `bun run dev:timeclock`.
- `bun run check` runs lint, types, tests and Student Status build; `bun run check:timeclock` checks Timeclock.
- `bun run cloudflare:check` and `bun run cloudflare:timeclock` are packaging dry-runs.
- `start.ps1 -Mode Dev` and `bun run dev:backend` synchronize Convex; frontend-only work must not start a backend watcher.

## Convex

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.
Before working on Convex code, always read `convex/_generated/ai/guidelines.md`; its API and pattern rules take precedence over training assumptions.
Optional vendor guidance can be installed with `npx convex ai-files install`; review resulting instruction edits and keep downloaded bundles out of Git.
<!-- convex-ai-end -->

## Privacy and authorization

- Never put real student records, health/financial data, signed forms, exports, snapshots, credentials, tokens, PINs or account-specific browser evidence in Git/GitHub, including private repositories, PRs and CI artifacts.
- Use synthetic data in fixtures, tests and documentation. Keep approved operational records in the backend and private evidence outside version control.
- Derive identity and enforce role, capability and per-record access on the server. Return minimized projections; hiding a control is not authorization.
- Keep domain/query/health/finance data out of browser persistence and Zustand; UI stores hold only ephemeral state. Preserve the implemented origin-local authentication storage contract.
- Secrets belong in server deployment configuration, never frontend VITE variables. Do not print secret values.
- Announce and verify the exact deployment before any sync. Production actions require explicit user authorization; prior release receipts grant no new authority.

## Timeclock

- `apps/timeclock/` and Student Status share root `convex/`, authentication, attendance and Calendar contracts.
- Coordinate shared schema, generated API, auth, Calendar, dependencies and lockfile through one integration owner; do not run competing backend syncs.
- Frontend-only Timeclock work uses its own Vite app and existing API types. Consult `docs/TIMECLOCK_BACKEND_HANDOFF.md` only for relevant contracts; reconcile its historical notes with current code.
- Shared-device operators should be ordinary Mentors; a PIN does not remove the backend privileges of a Coach session.

## Delivery, design and testing

- Finish usable workflows, including failure/recovery and required access checks. Preserve agreed requirements; record optional refinements once in HANDOFF.md.
- Reuse approved labels, tokens and Base UI components. Latest user decisions precede the preserved prototype; additions inherit its visual language without losing approved behavior.
- The owner-selected visual reference is https://denhamvenom.github.io/student_status/; do not assume sibling checkouts or design archives exist or open them without scope authorization.
- For prototype/visual evidence work, use the existing student-status-prototype-verification skill. Compare representative changed phone/desktop and light/dark states; distinguish observed behavior from source or fixture evidence.
- Tests: Only write tests that protect real app behavior or reproduce a fixed bug. Do not test framework or library behavior, do not write snapshot tests, and do not write tests that just mirror the current code. Prefer table-driven tests over near-duplicates.
- Review coherent workflows and concrete blockers; re-review changed areas, and after two correction rounds reassess the smallest resolution rather than repeating whole-app reviews.
- Target checks to real risks; run integrated checks at coherent milestones and repeat only for relevant changes or unresolved failures. Documentation-only work needs diff and reference review, not application tests.
- Separate implemented, reviewed, tested, user-accepted, published and production-verified claims. Use `(VERIFY)` only where confirmation of actual production status matters; do not mark ordinary implementation facts, policies or known testing gaps.

## Git and releases

- Follow the user's requested branch/workflow; otherwise consult `docs/REPOSITORY.md`. One integration owner coordinates Git writes when work is shared.
- Review staged content for private data and secrets; preserve published history and verify pushes before claiming remote backup.
- Main is connected to automatic frontend builds. Permission to edit or commit locally is not permission to push main, merge, publish or deploy.
- Keep release scope, validation limitations and rollback evidence in `docs/releases/`; do not duplicate progress narratives across old trackers.
