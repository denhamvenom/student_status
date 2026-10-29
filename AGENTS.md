<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Application boundaries and handoff

- Work only in this app unless the user explicitly expands scope. Preserve the sibling design handoff, archives, root npm starter, and unrelated folders.
- Read `docs/PLAN.md`, `docs/ARCHITECTURE.md`, `docs/REVIEW.md`, and `docs/DEVELOPMENT.md` for current state. Keep implemented, verified, and pending work distinct.
- Bun; React Router 7 Data Mode SPA; Vite; strict TypeScript; Tailwind 4; shadcn Base UI. Convex is the only domain backend. Do not introduce Next.js, Radix, Docker/Unraid, or a second database.
- Current user-requested agent arrangement: Astra for project management/final reviews, Sol for parallel implementation. Give file ownership to each implementation agent.
- Development: team `daniel-eiland`, project `denham-venom-student-status`, `dev:third-bandicoot-18`. Announce/verify the target before syncing. Never deploy production without explicit user authorization.
- Use synthetic student data only. Enforce roles and field minimization on the server. Never store health/finance/query data in browser persistence or Zustand.
- `bun run check` validates lint, types, tests, and build. `bun run cloudflare:check` is packaging dry-run only. Google sign-in was verified in development; this is not production readiness.
- Google OAuth secrets live only in Convex environment settings. Do not print env values, keys, or tokens. Internal bootstrap functions are deliberately tied to the initial development deployment.
- Full product flows remain incomplete; consult the acceptance matrix and final milestone review before claiming completion.

- Student records must never enter Git or GitHub, whether public or private, including issues, pull requests, attachments and CI logs/artifacts. Use synthetic student data only in fixtures, tests and documentation. Repository visibility does not change this rule.
- Maintain accurate GitHub version history throughout development: follow docs/REPOSITORY.md, commit focused reviewed checkpoints, push and verify development-branch updates, and keep PR descriptions, validation evidence and project documentation current. One integration owner coordinates Git writes for parallel agents. Preserve published history and existing merge/release/production boundaries; never claim a local-only checkpoint is published.
- Keep docs/DEVELOPMENT_CHECKLIST.md current as the human-readable progress guide. Check off only implemented and verified work, distinguish agreed decisions from built features, and update it with each relevant milestone alongside the technical plan.

## Design conformance

- Follow `design-drift-report.md` and the immutable `design-reference/` prototype for appearance. Latest explicit user decisions override older reference behavior; use Flow index v2, prototype, shared UI copy, then design tokens for remaining design decisions.
- Use shared labels derived from `source/ui-copy.json`, semantic tokens and shared Base UI components. Preserve dynamic data and do not invent fields, options, permissions or completed workflows.
- Added features inherit the prototype's typography, palette, spacing and responsive patterns. Do not create a separate visual system for operations.
- Compare affected screens at 390px and 1440px in both themes before claiming visual completion. Record unavailable states and invalid captures honestly.
- Frontend design corrections must not change backend code, contracts, authorization or financial/consent logic. Escalate functional dependencies separately.
- Preserve these existing instructions when extending guidance. The local audit ancestry contains paused backend drafts; publish only reviewed frontend changes on a clean candidate based on the published operations/docs baseline.

## Shared Timeclock workspace ownership

Timeclock frontend work is scoped to `apps/timeclock/` in a separate branch/worktree. Student Status remains at root. Read `docs/TIMECLOCK_BACKEND_HANDOFF.md` for implemented contracts and verified baseline. Only this Student Status integration owner edits/synchronizes shared Convex, generated files, root dependency/tooling/lockfile or auth/calendar contracts. Frontend-only chats use `bun run dev:timeclock`, never a Convex watcher. Coordinate root dependency changes. No production or main merge authorization is implied by the development scaffold.
