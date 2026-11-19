# Venom Media coding rules

These rules apply to `apps/media` (Venom Media) on top of the root `AGENTS.md`, which still governs everything else: privacy, Git, Convex sync, releases and testing policy. They are not repeated here.

## Where to look

- Visual design: the Venom Media DESIGN.md is authoritative for `apps/media`. It lives in the sibling plan repo at `../venom-media/DESIGN.md` (relative to the app repo root).
- Every user-facing change passes the DESIGN.md section 11 review gate.
- Wording: `docs/LANGUAGE.md`. Error messages: `docs/ACTIONABLE_ERRORS.md`.

## How to work here

- Read the relevant code first and search for an existing helper before writing one. Duplicate utilities drift apart.
- Make the change that was asked for. If you spot something else worth fixing, mention it instead of folding it into the diff.
- Match the surrounding code: naming, comment density, idiom.
- When a requirement is ambiguous, state your assumption, or ask if a wrong guess would be expensive to undo.
- Two strikes: if the same fix fails twice, stop and report what you tried and what you think is happening (this matches the root rule about two correction rounds).

## Design principles

The stack is strict TypeScript, React 19, Base UI and Convex. Convex validators (`v`) are the runtime schema at function boundaries; do not add zod or another schema library.

**State**
- **No implicit state machines.** With more than two modes (idle/loading/error/done, draft/submitted/approved), use one explicit state value with named transitions, not several booleans or status strings spread across files.
- **Make illegal states unrepresentable.** Values that cannot be true together should not be separate fields; data that exists in only one state lives inside that state (`{ status: "error", message }`).
- **Single source of truth.** Derive values instead of storing a copy that needs syncing.
- **Exhaustive handling.** Branch over closed sets (unions, enums) with an exhaustiveness check so a new case breaks the build, not the runtime.

**Data at the edges**
- **Parse, don't validate.** Untrusted input (arguments, files, env vars, stored JSON, third-party responses) is parsed once at the boundary with `v` validators into typed values. A type cast is not validation.
- **The client is not a trust boundary.** Authorization and validation happen on the server; secrets stay out of client code and the repo.
- **Times are epoch milliseconds (UTC).** Store them as `v.number()`, as the existing schema does, and convert to local time only for display. Do not parse ambiguous date text such as 04/05/2026.

**Errors and side effects**
- **Fail loudly; no silent fallbacks.** Avoid empty `catch`, catch-log-and-continue, or default values that stand in for missing config or a failed call. Handle the error or let it propagate with context (what failed, where).
- **Clean up on every exit path.** Release listeners, timers, locks and other acquired resources in `finally` or disposal, not only on the happy path.
- **Assume async events race.** Double submits, out-of-order responses and retries happen; keep a stale response from overwriting a newer one and make retried writes idempotent.

**Scope and dependencies**
- **YAGNI.** Skip abstractions with one implementation, options nothing reads, and flags for hypothetical needs.
- **Verify before you depend.** Check that a package exists and read its API in the installed version, not from memory. Ask before adding a dependency; prefer the platform.

## Codebase consistency

- **Delete, don't deprecate (inside `apps/media`).** Update every caller in the same change and delete the old path: no shims, unused exports or commented-out code.
- **Shared code is different.** Root `convex/`, shared auth, schema, dependencies and the lockfile are used by Venom Status and Timeclock. Changes there go through the integration owner per the root `AGENTS.md`, and stored formats or external APIs change only with owner sign-off.
- **Surface conflicting patterns; don't blend them.** If the codebase does one thing two ways, point it out and follow the one the owner chooses rather than inventing a third.

## Tests and verification

- **Tests check behavior; they don't define it.** Do not weaken an assertion, skip a test or special-case an input to get green. If a test looks wrong, say so and explain why. Tests use Vitest.
- **No tautological tests.** Expected values come from the requirement, not from running the code. Mock only at system edges (network, clock, filesystem).
- **A flaky test is a bug.** Find the cause instead of adding sleeps, retries or skips.
- **Evidence, not claims.** Done means you ran the check and saw it pass. Say what you ran and what you did not verify.

## Safety and data

- **Persisted shape changes ship with a migration.** A change to stored data includes a migration for existing documents, and writes that must succeed together go in one mutation.
- **Logs carry IDs, not people.** Logs and error messages hold IDs and context, not names, emails, grades, tokens or raw request bodies.
- Irreversible and outward-facing actions follow the root `AGENTS.md` and the parallel-work guard hook; this file adds no separate rule for them.
- **Accessible by default.** Use semantic elements instead of clickable divs, labels on inputs, visible focus and readable contrast, so the UI works with keyboard and screen readers.

## Deferred to M3 (when the app boots)

- Type-aware lint rules (`no-empty`, `no-floating-promises`, `switch-exhaustiveness-check`) scoped to `apps/media` only, not the whole repo.
- A media verification skill in `.agents/skills/` once the app boots: either a Media section in `student-status-prototype-verification` or a new `.agents/skills/media-verify/`. Not under `.claude/skills/`.
- Decide then whether to add a secret scanner.
- No per-turn typecheck or test hook; the root rule is to run checks at milestones.
