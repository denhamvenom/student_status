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

## Parallel sessions

Several Claude Code and Codex sessions may work at the same time. `C:\dev\denham-venom\student-status-app` is the shared checkout: its branch and working tree belong to every session in it, so a branch switch there moves all of them and a stash, reset or restore there destroys their uncommitted edits.

### One worktree per feature

```
cd C:\dev\denham-venom\student-status-app
git fetch origin
git worktree add ../wt-<feature> -b feat/<feature> origin/main
cd ../wt-<feature>
bun install --frozen-lockfile
```

Copy the ignored `.env.local` from the shared checkout only if the worktree needs the development backend. Claude Code worktrees under `.claude/worktrees/` count as separate worktrees too. After the branch is merged: `git worktree remove ../wt-<feature>`, then `git branch -d feat/<feature>`.

In the shared folder, read-only Git commands, `git worktree add/list/remove`, and staging your own explicit paths (when the owner assigned work there) are fine. Do not run `git checkout` (including `-b` and `-- <file>`), `git switch`, `git stash`, `git reset --hard`, `git restore` or `git clean` there.

### Development Convex sync

`convex dev` (also `--once`, `bun run dev:backend` and `start.ps1 -Mode Dev`) uploads the entire working-tree `convex/` folder to the development deployment and replaces whatever was synced last, including another feature's functions or another session's uncommitted edits. Before a sync:

1. Work in your own worktree and commit there; `git status --porcelain` must be empty.
2. `git fetch origin`, then rebase or merge `origin/main` so the branch includes current main.
3. Announce the target deployment (from `.env.local`) to the owner and other sessions; only one sync runs at a time.
4. Expect the next session's sync to replace yours; re-sync before relying on the backend again.

### Production releases

Only with the owner's explicit approval each time, one feature at a time:

1. The owner approves and the PR is merged into main on GitHub.
2. Update a clean main checkout. A dedicated release worktree works well: create it once with `git worktree add ../wt-release main` (Git refuses if main is checked out in another worktree), then `cd ../wt-release; git pull --ff-only` before every release.
3. Run `bunx convex deploy` there; HEAD must equal `origin/main` and the tree must be clean.
4. Notify the other sessions; each rebases or merges `origin/main` before its next development sync.

Never deploy a feature branch: production would lose every function that other merged features shipped.

### Guard hook (Claude Code)

`.claude/settings.json` registers `.claude/hooks/parallel-work-guard.mjs` (Node built-ins only) as a `PreToolUse` hook for the Bash and PowerShell tools. It reads the tool call from stdin, follows `cd`/`Set-Location`, `git -C`, nested `bash -c`/`pwsh -Command` and `package.json` scripts, and blocks the call (exit 2, reason shown to Claude) when:

- `convex deploy` runs anywhere other than a clean `main` whose HEAD equals the local `origin/main` ref. The hook does not fetch; run `git fetch origin` first.
- `convex dev`, `bun run dev:backend` or `start.ps1 -Mode Dev` runs with a non-empty `git status --porcelain`, or on a branch that does not contain the local `origin/main`.
- `git checkout`, `git switch`, `git stash` (except `list`/`show`), `git reset --hard|--merge|--keep`, `git restore` (except `--staged` only) or `git clean` (except dry runs) targets the shared checkout. Other worktrees are not affected.

Option checks accept the spellings Git and PowerShell accept: `--opt=value`, abbreviated long options (`--ha`), bundled short flags (`-fdn`, `-SW`), and `-Mode:Dev`, `-Mode=Dev`, `-M Dev` or a positional `Dev` for `start.ps1`.

It fails open (exit 0 with a warning) on unparseable input or internal errors. It cannot check owner approval or deployment announcements, and Codex or other tools do not run Claude Code hooks, so the rules above still apply by hand. Claude Code worktrees keep using the shared checkout's hook. `.gitignore` keeps `.claude/` ignored except `.claude/settings.json` and `.claude/hooks/`, so sessions started inside another worktree get the hook once those files are committed and that worktree's branch includes them. Sessions started in the enclosing `C:\dev\denham-venom` folder use `C:\dev\denham-venom\.claude\settings.json` (outside this repository), which runs the same script by absolute path. Set `STUDENT_STATUS_SHARED_CHECKOUT` to override the shared path (for example, from the Linux-mounted remote shell). Check the hook by piping a sample payload; exit code 2 means blocked:

```
echo '{"cwd":"C:/dev/denham-venom/student-status-app","tool_name":"Bash","tool_input":{"command":"git stash"}}' | node .claude/hooks/parallel-work-guard.mjs; echo $?
```
