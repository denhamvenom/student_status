# Deployment boundaries

Cloudflare Workers Static Assets serves the Vite `dist` folder. Convex hosts authentication, authorization and persisted domain data. No Docker/Unraid or separate data API is part of this application.

`bun run build` performs a local build. `bun run cloudflare:check` only packages with Wrangler dry-run. Neither publishes. SPA routes resolve to index.html using the assets configuration. Security headers are in public/_headers; fonts and brand assets are local.

Before an authorized release, confirm the exact Cloudflare account/Worker and Convex deployment, Google redirect URLs, public frontend URL, secrets, guardian policy, final permission wording, export access, retention and backup procedures. Run the acceptance and negative authorization tests and Astra final review. No production credentials or actual student records should be introduced during synthetic development.

Build-time VITE_CONVEX_URL must match the intended backend. Set it before Vite build; changing Cloudflare dashboard variables after building cannot retarget an already-built SPA. Backend and frontend must be released together under an explicit approved production plan. No automatic production deployment script is included.

Google OAuth development setup and a real round trip were verified on October 12, 2026; see DEVELOPMENT.md for the project and exact callback. Production OAuth is not configured. Signed permission and guardian workflows remain blocked for real use until the documented policy gates are resolved.

On October 12, 2026, the backend synchronized successfully to `dev:third-bandicoot-18` with Convex typechecking enabled. The local Vite build and Wrangler 4.149.0 `deploy --dry-run` succeeded. No Cloudflare upload or production deployment occurred. The generated frontend currently targets the development backend and must not be treated as a production release artifact.

## Future ownership transfer

Convex supports moving the project to another team while retaining deployments, data, environment variables and deploy keys. The operator needs the appropriate transfer/receive permissions (normally admin on both teams). Dashboard addresses and team access change. Coordinate Cloudflare and Google Cloud ownership separately. Reference: https://docs.convex.dev/dashboard/projects
