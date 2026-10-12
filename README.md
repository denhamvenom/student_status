# Denham Venom Student Status

Development application for Team 8044. React/Vite SPA with a Convex backend, prepared for Cloudflare Workers Static Assets. This is a development workspace with fictional student data, not a production system.

## Run

From this folder: `bun install --frozen-lockfile`, then `bun run dev`. Open http://localhost:5173 and sign in with the configured Google test account. `start.ps1 -Mode Dev` also starts Convex development sync. The absolute-path launcher works from any directory; see [development instructions](docs/DEVELOPMENT.md).

For disconnected UI review, use http://localhost:5173/?review=student. Other roles: parent, coach, travelLead, mentor. Review is development-only and does not modify the database.

## Status

The original standalone prototype is preserved in `demo/`. See [repository workflow](docs/REPOSITORY.md) for GitHub Pages and production-deployment boundaries.

- [Plan and acceptance matrix](docs/PLAN.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Parent invitations](docs/PARENT_INVITATIONS.md)
- [Astra milestone review](docs/REVIEW.md)
- [Development and Google configuration](docs/DEVELOPMENT.md)
- [Deployment boundaries](docs/DEPLOYMENT.md)

`bun run check` runs lint, strict types, backend tests and build. `bun run cloudflare:check` packages locally without publishing. A production release needs separate authorization and completion of the documented privacy, consent and workflow gates.

The sibling design handoff and existing root npm starter are preserved. Brand assets are copied from the handoff; Anton is locally bundled through Fontsource. No Google Fonts network request is required.
