# Timeclock backend handoff

Status: implemented in development; frontend scaffold only. Final Git checkpoint and PR are recorded in the publication section below. This document is the contract for the separate frontend chat, not permission to deploy production.

## Ownership and starting point

The integration worktree is `Development Version/student-status-timeclock-foundation`, branch `feature/timeclock-backend`, based on freshly fetched `origin/docs/timeclock-coordination` at `5eacf42`. The original `student-status-app` checkout and the stacked draft PRs were preserved. No main merge.

Student Status stays at root (`src/`, root Vite config, `dist/`, port 5173). Timeclock lives in `apps/timeclock/` with its own package, Vite/TypeScript config, `dist/`, Wrangler configuration, and port 5174. Intended future hostname: `timeclock.frc8044.org`; no domain or production deployment was configured. There is exactly one root `convex/`. No shared package was necessary for this foundation.

The Timeclock chat may implement its frontend under `apps/timeclock/` on a separate branch/worktree from the published checkpoint. Root dependencies, lockfile, schema, backend, generated files, auth, scheduling and shared attendance contracts belong to this Student Status integration owner. Request coordinated dependency/API changes; do not independently edit or synchronize the shared backend. Never switch another chat's checkout. Only this integration owner may run backend synchronization.

## Commands

Run from repository root:

```sh
bun install --frozen-lockfile
bun run dev                 # Student Status frontend only
bun run dev:timeclock       # separate frontend only
bun run check               # root lint, types, backend tests, root build
bun run check:timeclock     # workspace lint, strict types, build
bun run build:timeclock
bun run cloudflare:check    # root packaging dry-run
bun run cloudflare:timeclock # workspace packaging dry-run
```

Set `VITE_CONVEX_URL` in each app's ignored `.env.local`; the workspace has a blank `.env.example`. Only the public Convex endpoint is exposed to Vite. Keep account addresses, keys, PIN, and student records out of Git/GitHub, PRs, screenshots and test artifacts. Tests use fictional records and run with `edge-runtime`. Windows temporary module ENOENT is an environment issue; rerun outside the sandbox without weakening tests.

Only the integration owner uses `bunx convex dev --once` after verifying/announcing `daniel-eiland / denham-venom-student-status / dev:third-bandicoot-18`. Do not run `start.ps1 -Mode Dev` or `dev:backend` from the frontend chat; that would start a competing backend watcher.

## Auth and server configuration

Existing Google identity integration is shared, requesting only basic identity. Calendar authorization is separate. OAuth redirects accept only the configured Student Status origin with `/` or `/invite-parent`, and configured Timeclock origin with `/`. Arbitrary origins, protocol-relative destinations, backslashes, credentials, fragments and other paths are denied. Both use the same existing Convex Google callback.

`SITE_URL` remains the Student Status origin; `TIMECLOCK_SITE_URL` is the Timeclock origin. Development uses localhost ports 5173 and 5174. Use `localhost` for sign-in, not the Vite terminal's 127.0.0.1 spelling, because redirects are exact. No production or preview origin is allowlisted.

Student Status keeps its existing deployment-URL storage namespace to preserve current sessions. Timeclock uses explicit `timeclock:<deployment-url>` namespace. Both use origin-local storage; no shared cookies, token forwarding or copied auth storage. App origins are not authorization scopes: every backend API checks the current active role. Normal session expiry and revocation remain functional. No new timeout was introduced: installed Convex Auth defaults are 30 days total and 30 days inactivity; both deployment override variables were verified absent.

Server-only variables:

- `TIMECLOCK_OPERATOR_PIN`
- `TIMECLOCK_CALENDAR_ID`
- `TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_EMAIL`
- `TIMECLOCK_CALENDAR_SERVICE_ACCOUNT_PRIVATE_KEY` (PEM)
- `TIMECLOCK_SITE_URL`

Existing Google client/signing variables remain unchanged. Never put server variables in `VITE_` settings. Development PIN and Calendar configuration are set privately. The dedicated service account has no project-wide data roles and the owner shared the selected calendar read-only. Direct Calendar read returned HTTP 200. Deployed minute polling subsequently completed successfully with stored occurrences and no sync error. No Calendar write scopes, attendee lists, descriptions, or credentials are sent to the frontend.

The Mentor Google test-user entry was added with owner approval. Provisioning requires first verified Google sign-in and is guarded to this development deployment; `internal.bootstrap.provisionDevelopmentMentor` refuses to change an existing Student, Parent, Coach or inactive role. Live account verification status is recorded below.

## API types and common behavior

Use `api` from root `convex/_generated/api` and `Id` from `convex/_generated/dataModel`. Derive argument/return types with Convex `FunctionArgs` and `FunctionReturnType`; do not duplicate domain interfaces. Backend definitions are `convex/timeclock.ts`, `timeclockRoster.ts`, `calendarState.ts`, `timeclockPinControl.ts`; pure calculation rules are `convex/lib/timeclock.ts` (server ownership, no need to import into UI).

Times are epoch milliseconds. Session, occurrence, interval, correction and student IDs are typed Convex IDs. Public operations require active Coach or Mentor, including Mentor + travelLead; Student, Parent and inactive identities are denied. Coach-only APIs are noted below. Existing legacy attendance writes are now Coach-only even for Travel Leads.

Clock command results use `ok`, optional `code`, and operation-specific fields listed below. Expected state failures return structured results so expiry settlement and PIN failure throttling commit. Auth/argument validation and query capacity errors throw: handle these as visible errors without logging sensitive arguments. Use a fresh random `key` (12–128 URL-safe characters) for a new command; retry the exact same request with the same key after network uncertainty. A key is scoped to actor and cannot be reused for changed arguments (`KEY_REUSED`). Failed command results are also remembered; after fixing input/PIN or refreshing stale state, start a new command key. PIN is excluded from stored command fingerprints/results.

### Roster

- `timeclockRoster.operatorStatus({})` → `{allowed, role: 'coach'|'mentor'|null}`; safe access screen.
- `timeclockRoster.list({})` → `{students: [{studentId,displayName,subteam:string|null,collision:boolean}],unreviewedCount}`. Active season/active students only, sorted server-side by full surname, showing chosen first name + surname initial. Subteam appears only for duplicate display names. Flag unresolved collisions visibly rather than inventing or revealing more identity fields.
- Coach only: `namesForReview({})` gives student ID, legal name, optional structured names and review flag. `reviewNames({studentId,firstName,lastName,reason})` → null, audited. Existing names are never guessed by splitting legalName; unreviewed students are excluded and clock commands reject them. Newly approved joins preserve supplied structured names as unreviewed. Full Coach migration UI remains frontend work.

### Events and console

- `timeclock.todayEvents({asOf})` → array of `{occurrenceId,title,allDay,scheduledStart:number|null,scheduledEnd:number|null,effectiveEnd:number|null,sessionId:Id|null,state:'unopened'|'open'|'closed'|'cancelled',available,revision,needsReview}`. Refresh the client `asOf` on date boundaries/periodically; backend mutations use server time.
- `openOccurrence({occurrenceId,allDayEnd?,key})` → `{ok,sessionId?,existing?,code?}`. First confirmed all-day opening establishes a shared start at server time and selected end. Concurrent devices reuse it. Past all-day events cannot be opened.
- `createUnscheduled({title,durationMs,key})` → `{ok,occurrenceId?,sessionId?,code?}`. Positive duration and nonempty short title establish a shared scheduled window at creation.
- `consoleStatus({profileId})` → `{revision,selectedSessionId:Id|null,session:null|{state:'open',scheduledStart,scheduledEnd,effectiveEnd,revision}}`.
- `selectConsole({profileId,expectedRevision,selectedSessionId?,pin?})` → `{ok,revision?,selectedSessionId?,code?}`. Omit selection to clear. Leaving a live selected event requires PIN. Stale revisions return `STALE_CONSOLE` with current state.

Frontend must create one random 16–128 character `profileId` per browser profile, stored as a nonsensitive local preference. Coordinate initial creation across tabs (e.g. Web Locks + localStorage), subscribe to `consoleStatus` in every tab, and use server-selected session rather than per-tab state. A closed session projects null selection; return to event selection. Local storage clearing cannot be prevented. Full console behavior is not implemented in this scaffold.

### Clocking, transfer and extension

- `previewGroup({sessionId,studentIds})` → `{ok:true,sessionRevision,expected:[{studentId,intervalId:Id|null,sessionId:Id|null}],conflicts:[{studentId,sessionId,intervalId?}]}` or `{ok:false,code}`.
- `clockGroup({sessionId,mode:'in'|'out'|'transfer',expectedRevision,expected,pin?,key})` → `{ok,at?,count?,code?,studentId?,revision?,limit?}`. Send preview expected entries unchanged. A one-student group is the individual operation. Transfer requires explicit user confirmation and server PIN. Mixed groups can transfer conflicts and clock free students in atomically; no silent transfer. Stale state rejects the entire requested group. Already elapsed source sessions are settled and require a fresh preview.
- `clockOutAll({sessionId,expectedRevision,key})` → `{ok,at?,count?,code?}`. Acts on the current server set in one transaction. Ordinary in/out has no PIN requirement.
- `extend({sessionId,halfHours,expectedRevision,pin,key})` → `{ok,effectiveEnd?,extensionMs?,revision?,code?}`. Integer half-hours, total maximum eight per event, only while open, including existing extension time. No reopening.
- `timeclockPinControl.authorizeSignOutControl({pin})` → `{ok:true}` or `{ok:false,code:'PIN_INVALID'|'PIN_RATE_LIMITED'|'PIN_UNCONFIGURED'}`. Gate the in-app button, then call normal auth signOut only after success. The scaffold intentionally contains no operator sign-out button yet. Do not wrap or disable underlying token revocation, expiry, or browser storage controls.

Typical codes: `EXPIRED`, `FINISHED`, `UNAVAILABLE`, `STALE_SESSION`, `STALE_STUDENT`, `TRANSFER_REQUIRED`, `TRANSFER_CONFLICT`, `ALREADY_IN`, `NOT_IN_EVENT`, `PIN_REQUIRED`, `PIN_INVALID`, `PIN_RATE_LIMITED`, `PIN_UNCONFIGURED`, `INVALID_GROUP`, `EVENT_CAPACITY`, `GROUP_TOO_LARGE`, `EXTENSION_LIMIT`, `INVALID_WINDOW`, `KEY_REUSED`. Re-query/preview after stale state. Show PIN retry feedback without persisting entered PIN. Failed PIN attempts are rate-limited per authorized operator using the Convex rate-limiter component.

### Attendance and Coach correction

- Coach-only `summary({sessionId,studentId,asOf})` → null or `{sessionId,studentId,state,totalMs,earlyMs,scheduledMs,extendedMs,longestScheduledMs,qualifies,intervalCount,needsReview}`.
- Coach-only `correctionEvidence({sessionId,studentId})` → `{intervals,corrections}` with immutable original IDs/times/actors and appended correction IDs/targets/kind/times/reason/actor/time. Generated types are authoritative.
- Coach-only `correctInterval({sessionId,studentId,kind:'add'|'replace'|'void',originalIntervalId?,targetCorrectionId?,inAt?,outAt?,reason,key})` → `{ok,correctionId?,code?}`. Closed/cancelled sessions only. Add has no target; replace/void targets an original interval OR an added correction's ID. Corrections append evidence; do not mutate original history. Reason 5–1000 characters. Corrected intervals cannot overlap other effective intervals, including other events. There is no manual threshold override. Errors include `SESSION_OPEN`, `REASON_REQUIRED`, `INVALID_CORRECTION`, `INVALID_CORRECTION_TARGET`, `INVALID_INTERVAL`, `INVALID_TIME`, `OVERLAP`, `CROSS_EVENT_OVERLAP`, `HISTORY_LIMIT`.

One uninterrupted scheduled overlap of at least 3,600,000 ms qualifies; separate visits never combine. Total, early, scheduled and extended time are distinct. Extensions never contribute to qualification. Open summaries are provisional; closed schedule windows are frozen against later Calendar changes. Student Status reporting/admin UI integration is a later milestone; legacy boolean attendance remains identified legacy evidence, with no fabricated intervals. Travel participants, fees and readiness are untouched by clocking.

## Lifecycle and operational bounds

Server-scheduled jobs close at exact effective end, even when execution is late; revision/end checks neutralize stale jobs after extension/rescheduling. Clock mutations settle expired sessions and return a structured rejection without undoing closure. Calendar cancellation closes active intervals at detection, flags review and preserves history. A changed scheduled end moved into the past stops an open event at detection; it does not rewrite previous interval times. Open future revisions preserve added extension duration; established all-day windows remain fixed and flagged for review if Calendar changes. Finished sessions never reopen automatically.

Calendar polling runs once per minute with freshness/error projection `calendarState.status({now})` → `{configured,lastSuccessAt,lastAttemptAt,stale,error}`. Three minutes without successful refresh is stale. During outages, already-open events use the last confirmed schedule. Refreshes use pagination, sync tokens, one full retry on HTTP410, and generation fencing. Full synchronization reconciles missing occurrences; it does not delete history. Initial/full scan begins 60 days in the past. Bounds: 20 Calendar pages and 100 reconciliation batches per run; errors are surfaced rather than claimed successful.

Technical limits fail closed: 100 students per atomic command and simultaneously open per event; 100 open-session records in the today view; 500 season roster records; 500 candidate timed/all-day selection records; 500 original/correction history records per bounded view and cross-event correction scan. These are implementation limits, not new team attendance policies. Large recurring calendars or long history may need indexed pagination work before production. Full frontend, reporting, historical Sheets import, monitoring/retention and production readiness remain separate work.

## Verification and publication

Astra accepted source for synthetic development after reported blockers were fixed. Sol implemented core and Calendar/auth in parallel; root integrated scaffold, roster, dependencies and configuration. Root check passed: lint, strict types, 73 tests across 12 files, and Student Status build. Workspace lint/types/build and both Wrangler dry-runs passed. Existing Student Status bundle-size advisory remains. Tests cover roles/minimization, PIN throttling, idempotency, simultaneous cross-event clocking, all-or-nothing groups/transfers, exact late closure, stale jobs, half-hour extension, schedule revision/cancellation, all-day concurrency, 60-minute boundaries/DST, append-only corrections, OAuth allowlist, Calendar HTTP410 recovery and generation fencing. They are automated synthetic tests, not a complete live multi-device UI rehearsal.

Development synchronization succeeded with the rate-limiter component. The actual scheduled Calendar refresh was observed successful after synchronization. Actual Google sign-in returned to localhost:5174, initially denied the unprovisioned account, and reactively showed Connected as Mentor after verified development provisioning. Read-only database inspection confirmed existing Coach/Student/Parent roles stayed unchanged. Existing Student Status Coach pages remained usable against the updated backend; a fresh Coach Google OAuth round trip also passed at localhost:5173 after the auth change. No production operation, main merge, real student import, or full Timeclock interface was performed.

## Published frontend baseline

Implementation checkpoint: `c39c7f77d0c30fe784cb8bfcd313d4cbaea6b425`, published on `feature/timeclock-backend`. [Draft PR 5](https://github.com/denhamvenom/student_status/pull/5) targets `docs/timeclock-coordination`. Branch frontend implementation from this exact implementation commit (the subsequent documentation-only checkpoint adds this publication record):

```sh
git fetch origin
git worktree add -b feature/timeclock-frontend ../student-status-timeclock-ui c39c7f77d0c30fe784cb8bfcd313d4cbaea6b425
```

Use a different unique branch/directory if those already exist. Never reset an existing frontend branch. Read this handoff and AGENTS.md first; limit frontend edits to apps/timeclock and coordinate shared changes. Copy only the public endpoint into its ignored workspace .env.local, run locked install and dev:timeclock. Do not run a backend watcher or deployment. Root shared backend is already synchronized in development. The existing real Mentor tester works; existing synthetic roster names still need Coach review before Timeclock clocking. Test fixtures are self-contained in convex/*.test.ts and must not be imported into the live database automatically. Do not rerun bootstrap:seedSynthetic against populated development data.
