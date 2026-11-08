<!-- Claude Code project instructions. AGENTS.md is the single source for the shared project instructions and is imported at the end of this file; edit shared rules there, not here. Only Claude Code session notes and the Convex-managed block live in this file. -->

# Claude session notes

- Repository root: `C:\dev\denham-venom\student-status-app`. The enclosing `C:\dev\denham-venom` folder holds this repository plus sibling worktrees and is not itself the app repository.
- Start-of-session reading order: HANDOFF.md, this file, `docs/REPOSITORY.md`, `docs/DEVELOPMENT.md`. Read `docs/DECISIONS.md` before parent linking, consent, finance, rooms or retention changes; consult `docs/BACKLOG.md` only for related work. CHANGELOG.md and `docs/releases/` are history.
- Session role (owner decision, 2026-10-25): the main Claude session is the project lead and integration owner. It may delegate to subagents; subagents are helpers that must not stage, commit, push, merge or synchronize Convex, and must report changed files back to the main session. Codex sessions, if used, are helpers under the same rules. Integration ownership still grants no production, main-merge, publish or deploy authority; those need the owner's explicit approval each time.
- Project skills live in `.agents/skills/` (tracked). When this file names a skill, read its `SKILL.md` there and follow it: `student-status-context-checkpoint` (handoff/new window) and `student-status-prototype-verification` (visual evidence). The `convex-*` bundles in `.agents/skills/` and `.claude/skills/` are ignored vendor copies.
- Remote-session environment: Claude may reach this checkout through a Linux shell where the folder is mounted, not through Windows. That shell has Node and Git but no Bun, PowerShell, gh or Convex CLI login; `node_modules` was installed on Windows and must not be reinstalled in place. Run `bun run check` in a separate copy (or ask the owner to run it on Windows) and report which environment produced each result. In that shell, deletion is off by default, so Git write operations need the owner's delete permission first.
- Markdown files use LF line endings (`.gitattributes`); `.ps1` uses CRLF.

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.
Before working on Convex code, always read `convex/_generated/ai/guidelines.md`; its API and pattern rules take precedence over training assumptions.
Optional vendor guidance can be installed with `npx convex ai-files install`; review resulting instruction edits and keep downloaded bundles out of Git.
<!-- convex-ai-end -->

# Project instructions (imported from AGENTS.md)

@AGENTS.md
