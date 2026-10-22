# Denham Venom Student Status

Team 8044's student, family, travel and financial application, with a separate Timeclock operator app in the same repository. Both are React/Vite SPAs backed by one Convex deployment.

Read [HANDOFF.md](HANDOFF.md) first for current work, verification limits and the documentation cleanup backlog. Read [AGENTS.md](AGENTS.md) before making changes. Historical notes are not current instructions.

## Applications and local startup

Install dependencies from the repository root with `bun install --frozen-lockfile`.

| Application | Frontend command | Local address | Production address recorded in release evidence |
| --- | --- | --- | --- |
| Student Status | `bun run dev` | http://localhost:5173 | https://students.team8044.org (VERIFY) |
| Timeclock | `bun run dev:timeclock` | http://localhost:5174 | https://timeclock.team8044.org (VERIFY) |

Each frontend needs the intended public `VITE_CONVEX_URL` in its ignored local environment file; use the blank examples. Neither frontend command deploys the backend. `start.ps1 -Mode Dev` and `bun run dev:backend` do synchronize Convex, so verify the target before using them. Never reseed an existing database to get a preview working.

Students sign in with Google. Parents and approved staff can use Google or supported email-code access; parent invitations are delivered privately to the invited inbox. Authentication alone never grants a role or student link. See [parent invitations](docs/PARENT_INVITATIONS.md).

The development-only `?review=student` fixture preview (also parent, coach, travelLead, mentor) uses synthetic data. It is a legacy display reference, not proof of live authorization or current authenticated workflows.

## Checks and release boundaries

- `bun run check`: lint, strict types, tests and Student Status build.
- `bun run check:timeclock`: Timeclock lint, types/build.
- `bun run cloudflare:check` and `bun run cloudflare:timeclock`: packaging dry-runs, not publication.

Main is connected to automatic Cloudflare builds for both frontends according to repository release evidence (VERIFY). Do not push main or merge without release authorization. Convex backend synchronization is a separate operation; frontend build variables must target the intended deployment. See [deployment](docs/DEPLOYMENT.md).

## Documentation

- [Current handoff and backlog](HANDOFF.md)
- [Completed-work history](CHANGELOG.md)
- [Architecture and domain rules](docs/ARCHITECTURE.md)
- [Repository and privacy workflow](docs/REPOSITORY.md)
- [Release receipts](docs/releases/)
- [Timeclock contracts](docs/TIMECLOCK_BACKEND_HANDOFF.md)
- [Zeffy donation import](docs/ZEFFY_SYNC.md)

Use synthetic records in tests and documentation; real student records, signed PDFs, exports and secrets never belong in Git/GitHub. The four files in `demo/` preserve the original prototype and its reference guides; later explicit decisions supersede conflicting prototype behavior. Fonts and brand assets are bundled locally.

Production addresses and deployment claims above are recorded repository evidence, not a fresh production check during this documentation pass.
