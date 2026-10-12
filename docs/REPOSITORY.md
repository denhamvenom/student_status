# Repository workflow

Repository: https://github.com/denhamvenom/student_status

This app directory is the Git working tree. The enclosing Logistics Work directory, root npm starter and sibling design handoff are not part of this repository.

The original four standalone demo HTML files are preserved byte-for-byte under `demo/`, from main commit `c7b1209`. Application source lives at repository root. `demo/index.html` opens the archived prototype; its companion pages remain alongside it.

## Publication boundary

Student records must never be stored in Git or GitHub, regardless of whether the repository is public or private. This includes commits, issues, pull requests, comments, attachments, and CI logs or artifacts. Never commit real student records, signed forms, health information, exports, database snapshots, OAuth credentials or environment values. Use synthetic student data only in fixtures, tests and documentation. `.gitignore` excludes common local artifacts but cannot detect sensitive content saved under arbitrary filenames. Review staged changes before every push.

The existing GitHub Pages site publishes `main` from `/`. Initial app setup is prepared on a separate branch and draft PR. Do not merge this reorganization into main until the Pages source has an explicit migration plan: the new root index.html is Vite source, not the existing standalone demo. Merging would change the live demo. Cloudflare and Convex production deployment remain unauthorized. No automatic deployment workflow is included.

## Included and excluded

Commit source, public brand assets, docs, package.json, bun.lock, blank .env.example, project instructions, and Convex generated API/type files. Exclude dependencies, dist, local environment files, credentials, local Convex/Wrangler state, browser results, exports and downloaded agent-skill bundles.

On a new workstation: `bun install --frozen-lockfile`, connect the approved development deployment as documented in DEVELOPMENT.md, then `bun run dev`. Run `bun run check` before submitting code. Optional local agent guidance can be installed using `bunx convex ai-files install`; review any resulting project-instruction edits.

Use feature branches and pull requests. Keep backend and frontend changes together when they share a contract. Do not force-push main or rewrite the preserved demo history.

