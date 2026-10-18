# Repository workflow

Repository: https://github.com/denhamvenom/student_status

This app directory is the Git working tree. The enclosing Logistics Work directory, root npm starter and sibling design handoff are not part of this repository.

The original four standalone demo HTML files are preserved byte-for-byte under `demo/`, from main commit `c7b1209`. Application source lives at repository root. `demo/index.html` opens the archived prototype; its companion pages remain alongside it.

## Publication boundary

Student records must never be stored in Git or GitHub, regardless of whether the repository is public or private. This includes commits, issues, pull requests, comments, attachments, and CI logs or artifacts. Never commit real student records, signed forms, health information, exports, database snapshots, OAuth credentials or environment values. Use synthetic student data only in fixtures, tests and documentation. `.gitignore` excludes common local artifacts but cannot detect sensitive content saved under arbitrary filenames. Review staged changes before every push.

As of the approved October 17 release, GitHub Pages publishes demo-reference-2026-10-17/root at original main 18ef1c2. Never point Pages at application main. PR10/PR11 are merged; main release 60505b4 deployed to production Convex. Both Cloudflare Workers and HTTPS domains are deployed and verified at the same revision. Main-only builds now automatically deploy both Workers, so subsequent merges remain release-controlled. Do not merge progress documentation merely to publish evidence or move the approved release SHA.

## Included and excluded

Commit source, public brand assets, docs, package.json, bun.lock, blank .env.example, project instructions, and Convex generated API/type files. Exclude dependencies, dist, local environment files, credentials, local Convex/Wrangler state, browser results, exports and downloaded agent-skill bundles.

On a new workstation: `bun install --frozen-lockfile`, connect the approved development deployment as documented in DEVELOPMENT.md, then `bun run dev`. Run `bun run check` before submitting code. Optional local agent guidance can be installed using `bunx convex ai-files install`; review any resulting project-instruction edits.

Use feature branches and pull requests. Keep backend and frontend changes together when they share a contract. Do not force-push main or rewrite the preserved demo history.


## Ongoing version control

- Maintain GitHub history throughout development. Inspect the current branch, working tree and remote state before starting; preserve other agents' and users' uncommitted work.
- Make focused commits at meaningful, reviewable checkpoints. Commit messages must describe the actual change; do not bundle unrelated work or claim unfinished features are complete.
- Review staged files for secrets and student data before every commit. Run checks appropriate to the change and record actual results and unresolved limitations. Documentation-only changes require diff review, not an unnecessary application test run.
- Push completed, reviewed checkpoints to the appropriate development branch and keep its pull request title, description and validation evidence aligned with the current scope. If a push is blocked, report what remains local. Do not claim work is backed up until the push is verified.
- Update the project plan and relevant implementation documentation in the same checkpoint. Distinguish proposed, implemented, tested and released work; record remaining work for the next agent.
- Coordinate parallel agents through one integration owner for staging, commits and pushes in a shared working tree. Do not stage another agent's unfinished files or overwrite their changes.
- Preserve published history: use follow-up commits for corrections; do not amend published commits, force-push or move published tags without explicit authorization.
- Use commit IDs for development checkpoints. Assign intentional semantic version numbers and matching immutable tags to approved releases, with release notes describing changes, checks and known limitations. Do not label ordinary development checkpoints as production releases or bump versions for every commit.
- Version control does not authorize merging into a deploying branch, publishing a release or deploying production. Existing main/GitHub Pages and production approval boundaries remain in force.
