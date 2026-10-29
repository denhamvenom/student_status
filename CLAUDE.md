<!-- Claude Code project instructions. Mirrors AGENTS.md (copied 2026-10-25 when primary development moved from Codex to Claude). Keep the shared sections below in sync with AGENTS.md when either changes. -->

# Claude session notes

- Repository root: `C:\dev\denham-venom\student-status-app`. The enclosing `C:\dev\denham-venom` folder holds this repository plus sibling worktrees and is not itself the app repository.
- Start-of-session reading order: HANDOFF.md, this file, `docs/REPOSITORY.md`, `docs/DEVELOPMENT.md`. Read `docs/DECISIONS.md` before parent linking, consent, finance, rooms or retention changes; consult `docs/BACKLOG.md` only for related work. CHANGELOG.md and `docs/releases/` are history.
- Session role (owner decision, 2026-10-25): the main Claude session is the project lead and integration owner. It may delegate to subagents; subagents are helpers that must not stage, commit, push, merge or synchronize Convex, and must report changed files back to the main session. Codex sessions, if used, are helpers under the same rules. Integration ownership still grants no production, main-merge, publish or deploy authority; those need the owner's explicit approval each time.
- Project skills live in `.agents/skills/` (tracked). When this file names a skill, read its `SKILL.md` there and follow it: `student-status-context-checkpoint` (handoff/new window) and `student-status-prototype-verification` (visual evidence). The `convex-*` bundles in `.agents/skills/` and `.claude/skills/` are ignored vendor copies.
- Remote-session environment: Claude may reach this checkout through a Linux shell where the folder is mounted, not through Windows. That shell has Node and Git but no Bun, PowerShell, gh or Convex CLI login; `node_modules` was installed on Windows and must not be reinstalled in place. Run `bun run check` in a separate copy (or ask the owner to run it on Windows) and report which environment produced each result. In that shell, deletion is off by default, so Git write operations need the owner's delete permission first.
- Markdown files use LF line endings (`.gitattributes`); `.ps1` uses CRLF.

# Project instructions (shared with AGENTS.md)

## Project overview

Student Status helps Team 8044 Coaches, Mentors, Travel Leads, Parents and Students manage accounts, events, travel readiness, attendance, permission forms and student funds. Timeclock gives Coaches and Mentors a shared clock-in/out console whose attendance feeds Student Status; each role sees only the records and actions it is allowed to access.

## Start and handoff

- At the start of every session, read HANDOFF.md before exploring code. Only open files relevant to the current task.
- Verify the actual repository, branch and dirty state; preserve unrelated work and stay within this repository unless I expand scope.
- HANDOFF.md is the short current status. Dated plans, audits and release receipts are historical; my later explicit decisions take precedence.
- Read docs/DECISIONS.md before changing anything involving parent linking, consent, finance, rooms, or retention.
- Read docs/BACKLOG.md only when I ask for backlog work or the current task relates to an item in it; do not read it at every session start.
- Do not create new markdown or notes files unless I ask. Progress notes go in HANDOFF.md. New release receipts go in docs/releases/.
- When I say 'handoff', 'new window', or 'time for a new context window', or I am ending a session, use the existing student-status-context-checkpoint skill; do not create a replacement skill.

## Stack and commands

- Bun; React Router 7 Data Mode SPA; Vite; strict TypeScript; Tailwind 4; shadcn Base UI. Convex is the only domain backend.
- Keep the approved architecture; do not add frameworks, databases or infrastructure without a task requirement.
- Student Status stays at repository root: `bun run dev`; Timeclock: `bun run dev:timeclock`.
- `bun run check` runs lint, types, tests and Student Status build; `bun run check:timeclock` checks Timeclock.
- `bun run cloudflare:check` and `bun run cloudflare:timeclock` are packaging dry-runs.
- `start.ps1 -Mode Dev` and `bun run dev:backend` synchronize Convex; frontend-only work must not start a backend watcher.

## Code map

- App entry/navigation: `src/main.tsx`, `src/LiveApp.tsx`, `src/AppShell.tsx`.
- Accounts/auth: `src/SignIn.tsx`, `convex/accounts.ts`, `convex/auth.ts`, `convex/lib/access.ts`.
- Parent linking: `src/ParentInvites.tsx`, `convex/parentInvites.ts`, `convex/parentInviteEmail.ts`, `convex/parentEmailAuth.ts`.
- Setup/FIRST: `src/SetupWizard.tsx`, `src/StaffSetupWizard.tsx`, `src/FirstRegistration.tsx`, `convex/setupWizard.ts`, `convex/firstRegistration.ts`.
- Events: `src/features/operations/EventOperations.tsx`, `convex/admin.ts`, `convex/eventOperations.ts`, `convex/eventEnrollment.ts`.
- Rooms/transport: `src/features/operations/RoomOperations.tsx`, `src/Travel.tsx`, `convex/rooms.ts`, `convex/travel.ts`.
- Reports: `src/DashboardReports.tsx`, `src/TeamReports.tsx`, `convex/dashboardReports.ts`, `convex/teamReports.ts`.
- Finance: `src/CoachFinanceWorkspace.tsx`, `convex/finance.ts`, `convex/financeOperations.ts`, `convex/financialSources.ts`, `convex/lib/money.ts`.
- Zeffy: `src/ZeffySync.tsx`, `convex/zeffy.ts`, `convex/zeffyActions.ts`, `convex/lib/zeffy.ts`.
- Season/history: `src/SeasonAdministration.tsx`, `convex/seasonAdmin.ts`, `convex/seasonTransition.ts`, `convex/seasonHistory.ts`.
- Consent/PDF: `src/PermissionWorkflow.tsx`, `src/SecurePermissionPdf.tsx`, `src/lib/field-trip-pdf.ts`, `convex/permissionsV2.ts`, `convex/permissionsV2Pdf.ts`.
- Calendar sync: `src/features/operations/EventCalendarOperations.tsx`, `convex/eventCalendar.ts`, `convex/calendar.ts`, `convex/calendarState.ts`, `convex/crons.ts`.
- Timeclock frontend: `apps/timeclock/src/main.tsx`, `apps/timeclock/src/rosterSnapshot.ts`, `apps/timeclock/src/eventClock.ts`.
- Timeclock backend: `convex/timeclock.ts`, `convex/timeclockRoster.ts`, `convex/timeclockPinControl.ts`, `convex/timeclockHistoryImport.ts`.
- Shared UI: `src/components/ui/`, `src/styles.css`, `src/shadcn.css`; Timeclock-specific controls: `apps/timeclock/src/components/ui/`.
- Schema/generated contracts: `convex/schema.ts`, `convex/_generated/`; deterministic domain helpers: `convex/lib/`.

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
- Announce and verify the exact deployment before any sync. Production actions require my explicit authorization; prior release receipts grant no new authority.

## Timeclock

- `apps/timeclock/` and Student Status share root `convex/`, authentication, attendance and Calendar contracts.
- The current main session owns integration of shared schema, generated API, auth, Calendar, dependencies and lockfile; coordinate changes through it and do not run competing backend syncs.
- Frontend-only Timeclock work uses its own Vite app and existing API types. Consult `docs/TIMECLOCK_BACKEND_HANDOFF.md` only for relevant contracts; reconcile its historical notes with current code.
- Shared-device operators should be ordinary Mentors; a PIN does not remove the backend privileges of a Coach session.

## Delivery, design and testing

- Finish usable workflows, including failure/recovery and required access checks. Preserve agreed requirements; record optional refinements once in HANDOFF.md.
- Reuse approved labels, tokens and Base UI components. My latest decisions precede the preserved prototype; additions inherit its visual language without losing approved behavior.
- My visual reference is https://denhamvenom.github.io/student_status/; do not assume sibling checkouts or design archives exist or open them without scope authorization.
- For prototype/visual evidence work, use the existing student-status-prototype-verification skill. Compare representative changed phone/desktop and light/dark states; distinguish observed behavior from source or fixture evidence.
- Tests: Only write tests that protect real app behavior or reproduce a fixed bug. Do not test framework or library behavior, do not write snapshot tests, and do not write tests that just mirror the current code. Prefer table-driven tests over near-duplicates.
- Review coherent workflows and concrete blockers; re-review changed areas, and after two correction rounds reassess the smallest resolution rather than repeating whole-app reviews.
- Target checks to real risks; run integrated checks at coherent milestones and repeat only for relevant changes or unresolved failures. Documentation-only work needs diff and reference review, not application tests.
- Separate implemented, reviewed, tested, user-accepted, published and production-verified claims. Use `(VERIFY)` only where confirmation of actual production status matters; do not mark ordinary implementation facts, policies or known testing gaps.

## Git and releases

- As of October 25, 2026, the main Claude Code session (see CLAUDE.md) is the project lead and integration owner. Codex and other sessions are helpers unless I say otherwise.
- Follow the branch/workflow I request; otherwise consult `docs/REPOSITORY.md`. The integration owner is the current main session; parallel or helper sessions must not sync the backend or write to Git unless I explicitly say so.
- Review staged content for private data and secrets; preserve published history and verify pushes before claiming remote backup.
- Main is connected to automatic frontend builds. Permission to edit or commit locally is not permission to push main, merge, publish or deploy.
- Keep release scope, validation limitations and rollback evidence in `docs/releases/`; do not duplicate progress narratives across old trackers.
