# First development milestone review

Review date: October 12, 2026. Scope: source inspection of the current React/Convex application against the handoff v2 rules, server authorization and core state transitions. This review is not a production approval or a claim that the full product is complete.

## Verified evidence

- Independently reran `bun run test` after the final fixes: **10 tests passed**. Coverage includes linked-parent boundaries, Mentor private-field exclusion, pending capacity/confirmed-only charging, unauthorized finance writes, draft consent refusal, stable Convex Auth identity across sessions, persisted join lockout, assignment-request versus adult room readiness, required Travel Team assignment with debt, rejected overcapacity/downgrade transitions, archived withdrawal denial, and rollback when planned allocations exceed the ledger limit.
- Auth application records now reference stable Convex Auth user IDs. Email is loaded from the auth users table instead of assuming an email JWT claim.
- First-Coach bootstrap and synthetic seed are internal mutations restricted to the exact approved development deployment. Bootstrap requires a matching verified Google account; seed requires an empty Coach-owned season.
- Mentor roster/event projections omit health, financial fields and rooming category. Student profile access enforces current active student scope. Financial editor authority requires Coach or Mentor + Travel Lead + explicit financial grant.
- Source now connects live profile updates, inline Coach roster changes, payment recording with student selection, six-step event creation, join submission/review, FIRST completion and limited student room operations. The integrating agent verified a real Google OAuth roundtrip with the team account, development Coach bootstrap, two fictional student records and one synthetic event, and a persisted $1 synthetic ledger entry through the live browser. Those browser results are integration evidence reported by that agent; this reviewer independently verified source and tests.
- Draft permission wording blocks live consent. Synthetic review mode is development-only and clearly labeled; it does not authorize server access.
- Final baseline source review confirms next-themes wraps both app and shadcn Sonner Toaster; dark tokens respond to its class, live account preferences synchronize through `useTheme`, and theme-save success invokes a toast. Zustand stores only ephemeral More-menu state shared by live/review shells and closes it on navigation. A root React error boundary provides a reload path.
- Final integration evidence reported by the integrating agent: typecheck, lint, tests and build pass; development sync with typechecking passes; Cloudflare dry run passes without upload. The live browser also verified that marking FIRST complete changes the synthetic student's open requirements from three to two.

## Blocking correctness findings sent to owners

1. **Invalid join falsely reports success:** `PendingJoin` originally discarded a null return from `requestJoin`, so invalid/locked codes showed Waiting for approval. Require a returned request ID before displaying success.
2. **Participation transition integrity:** `setParticipation` must enforce capacity when adding pending reservations, and must not downgrade confirmed participants to pending/waitlist while retaining charges and room membership. Until audited reconciliation exists, reject these transitions. Student withdrawal must reject archived/cross-season events.
3. **Financial record limit after writes:** allocation checks the existing row count but may append enough allocation rows to exceed its own readable limit. Preflight resulting entry count and roll back the whole transaction if it would exceed the guard. This guard is a development limit; authoritative aggregate balances are the long-term design.
4. **Readiness category display:** Students chip must reflect student rows, not overall event readiness; transport-only or rooming-only issues must not label completed student requirements Open.

These findings are tracked during active implementation. Their existence here records the review evidence; final delivery should state which fixes were verified after this snapshot.

Final follow-up: **all four targeted blockers are resolved for this milestone**. PendingJoin requires a non-null request ID, and the Students chip derives from student rows. Fresh source inspection confirms active-season/archived-event withdrawal checks, capacity checks for pending reservations, rejected confirmed downgrades, and preplanned allocation row limits. The three added regression tests pass in the independently rerun ten-test suite.

## Tracked next milestone

- First-time profile onboarding, locked initial rooming category, parent contacts, correction requests, student record management and archived/reactivation matching.
- Complete optional-event approvals/waitlist management, Required-all-students UI, signup deadlines, editable/custom requirements and due dates.
- Parent invitations were delivered in the later milestone below using good-faith relationship attestation. Remaining: four-step consent wizard, correction targeting, immutable permission wording content, re-sign lifecycle and Coach paper acceptance.
- Medication authorization currently remains a profile value; unlike permission signing, it does not enforce approved wording/version or seasonal signature. Keep it synthetic-only until that consent workflow exists.
- Transport model and interface for buses, independent travelers, extra adults and trailer towing; driver management; complete room invitation/cancellation and adult room placement/finalization interface.
- Financial charge editing/voiding, refunds and adjustments, Coach priority controls, fundraiser creation/allocation, bulk import/export and detailed audit UI. Charged-event withdrawal currently requires reconciliation that is not yet offered end to end.
- Attendance source/import matching, unavailable/stale states, future-versus-held meetings, build-season categories and meeting administration. Existing counts are not a verified Time Clock integration.
- Adult invitations/role management, full Mentor readiness report, six-step season close, read-only archive/corrections and role-filtered PDF exports.
- Replace generic configuration placeholders with accurate specific missing-work descriptions. A configured OAuth connection alone does not complete those workflows.
- Shared frontend/domain contract consolidation, more specific route recovery beyond the root error boundary, grouped desktop navigation and a focus-managed More sheet.

## Release boundaries

Review disposition: **initial development milestone accepted within its limited scope of synthetic data and supervised development accounts**. The targeted blocking findings above are closed; this is not a full security certification. The product remains unsuitable for production student health/financial records, real consent, travel clearance or season close. Production deployment is not authorized. Final development synchronization, build and Cloudflare dry-run success are recorded as the integrating agent's delivery evidence; the dry run did not publish a site.


## Parent invitation milestone review — October 12, 2026

Astra reviewed the source and independently ran the 18-test revision before the final regression addition. Root subsequently ran the final lint, typecheck, **19-test** suite and build successfully, synchronized only the approved development deployment with typechecking, and passed 13 browser cases. The existing build bundle-size advisory remains. The actual signed-in Coach Join Requests panel loads the enabled setting and synthetic roster.

Resolved findings: authoritative server-time preview and acceptance; indexed replacement/revocation checks across history; actionable old invitations retained in Coach lists; verified Google-email provenance; no existing-role conversion; attestation text/version captured on the server and checkbox bound to the displayed version; clean OAuth redirect using short-lived same-tab token storage while preserving the auth callback code; usable wrong-account switching; current-season children and revoke-one/revoke-all access denial.

Disposition: **accepted for synthetic development**. The 13 browser cases cover fixture layout at phone/desktop in light/dark and a live missing-token landing; they do not prove a real multi-account acceptance round trip. The subsequent live multi-account rehearsal below closes that specific evidence gap. Invitation/access lists have documented bounds; no production deployment or full-product completion is implied.

## Live multi-account invitation rehearsal — October 12, 2026

Completed against development deployment third-bandicoot-18, using two explicitly authorized owner-controlled Google accounts and a fictional Test Student. Account emails, tokens and screenshots are not committed.

- Added both accounts to the existing Google OAuth Testing allowlist without publishing the app.
- Student completed real Google identity sign-in, submitted the ordinary join request with a short-lived team code, and received Coach approval.
- Student created a parent invitation displaying a seven-day expiry. Pausing new invitations disabled the student creation controls while preserving the issued invitation.
- Opening the invitation with the student account showed an email-mismatch rejection and no student details.
- Switching to the invited parent account completed the actual Google OAuth redirect and restored the invitation. Acceptance remained disabled until relationship and attestation were supplied, then created the parent link while new invitations remained paused.
- Parent saw only the linked fictional student. Reopening the consumed invitation rejected reuse.
- Coach revoked the link while the parent profile was open: profile content disappeared reactively and the financial view required a linked student.
- Coach restored the link with an audit reason and re-enabled new invitations. The parent financial view returned for the fictional student.

This closes the live multi-account OAuth acceptance evidence gap. Seven-day elapsed-time expiry, unrelated-student direct API denial and multiple-link combinations remain covered by automated backend tests rather than this browser rehearsal. No real student/health/financial records were used, no financial entries or signed permission/medication consents were created, and no production deployment occurred. The synthetic profile and restored test link remain available for further testing; the join code expires after 24 hours. Google grants were limited to basic identity information.


## October 12 withdrawal travel and draft milestone

Astra coordinated shared contracts and reviewed the implementation; Sol owners implemented withdrawals, travel, and permission drafting in parallel. Root integrated shared schema, financial/readiness projections and live routes. Source accepted for synthetic development after review findings were fixed.

- `bun run check`: lint, strict TypeScript, 32 backend tests across five suites, and build passed. Existing Vite chunk-size advisory remains; route code splitting is launch-performance work.
- Backend cases cover full/partial/retained/denied withdrawal decisions, paid extras, unpaid-main cancellation choice, preserved money sources, priority reallocation, duplicate/conflicting decisions, stale preview rejection, archived events, room cleanup, bounded-history atomic rollback, old bypass rejection and reenrollment restriction.
- Travel tests cover role scoping, passenger capacity excluding drivers, bus/adult/independent travelers, tow requirements, unavailable drivers, active-season checks and write limits. Mentor overall readiness includes transport without exposing operational details.
- Permission tests prove even a non-draft season version cannot enable signing and unrelated student access fails. The UI is a read-only draft, not a consent workflow.
- Development sync `bunx convex dev --once` succeeded against dev:third-bandicoot-18. No production operation performed.
- Live Coach browser verified synthetic driver creation and event assignment, trailer/adult settings, independent-travel demand decrement and restoration, extra-charge creation with automatic personal-credit allocation, the empty withdrawal queue and the read-only permission screen. Synthetic test data stays only in the development database; no student records, account identifiers or browser snapshots are committed.

Limits: no full multi-account withdrawal browser rehearsal in this milestone; no full room management, cash/check payout UI, fundraiser transfer authority, real signatures, health export grant or production readiness. Historical allocations with ambiguous source stop safely rather than inventing financial provenance. Approved-withdrawal reenrollment needs a future explicit fee review. The preexisting Travel Lead permission-snapshot access path must be hardened with the final health-access/export policy before live records.

Publication: implementation checkpoint `bd589ba` pushed to `feature/withdrawals-and-travel`; [draft PR 3](https://github.com/denhamvenom/student_status/pull/3) targets `feature/parent-invitations`. Main and production remain unchanged.

## October 12 Timeclock backend foundation

Astra final source review accepted for synthetic development after concurrency, stale-job, schedule-revision, reconciliation and data-contract findings were fixed. Sol implemented core and Calendar/auth in parallel; integration owner prepared roster/workspace and owned all configuration/deploy/Git actions. See TIMECLOCK_BACKEND_HANDOFF.md for exact API contracts and limits.

Root validation passed 73 tests across 12 suites with edge-runtime, lint, strict TypeScript and build. The separate Timeclock workspace lint/types/build passed; both Wrangler static packaging dry-runs passed without deployment. Installed rate-limiter and batch-worker component, synchronized only dev:third-bandicoot-18, and observed successful repeated minute Calendar refreshes with no error. The dedicated service account's read access returned HTTP200 after owner sharing; temporary credential files were removed after private server configuration.

Real Mentor Google OAuth returned to localhost:5174. Access was denied before provisioning and reactively allowed after development-only verified Google provisioning. Existing Coach/Student/Parent roles were checked unchanged. Root Student Status Coach pages continued loading against the updated backend, and a fresh Coach Google OAuth sign-in returned successfully to localhost:5173. These checks do not constitute a full Timeclock UI or multi-device field rehearsal.

Bounds remain 100 students per atomic command/event, 100 open sessions in today selection, and 500-record roster/selection/history scans. Full clock interface, Coach name review UI, attendance reporting, legacy import and production readiness remain pending. Secrets, account addresses and student records were excluded from committed artifacts. Main and production remain unchanged.

Publication: implementation `c39c7f77d0c30fe784cb8bfcd313d4cbaea6b425` is pushed on `feature/timeclock-backend`, with [draft PR 5](https://github.com/denhamvenom/student_status/pull/5) targeting `docs/timeclock-coordination`. The exact frontend branch baseline and ownership are in TIMECLOCK_BACKEND_HANDOFF.md. All earlier draft PRs, main/demo and production remain unchanged.

### Reactive clock status follow-up

Frontend integration identified the missing live roster-status subscription. Added `timeclockRoster.clockStatus({sessionId})` with active-season/role/reviewed-name checks and minimal operational state plus other-event conflict pointers. No private fields or schema changes. Astra reviewed the source and transition/denial tests. Root check passed 77 tests across 12 suites, lint, strict types and build. The foundation port5174 server was identified and stopped; Student Status5173 was preserved. Coach structured-name review remains an explicitly documented owner action. See the handoff for exact return type and status semantics.

Development sync of the reactive-status query succeeded on third-bandicoot-18. The final additional operational-versus-corrected-attendance test brought the passing suite to 77; strict types passed again. No schema, frontend or production changes.

## Operations milestone review — October 12, 2026

Astra final source review accepted this candidate for synthetic development with no remaining blocking findings. Independently reran 13 targeted tests: four event/room, six finance and three attendance-selector tests. Root integrated check passed lint, strict TypeScript, 90 tests across 15 suites and frontend build. Preserved Timeclock lint/type/build and both Cloudflare packaging dry runs passed; no hosting deployment occurred. Convex development sync completed successfully. Windows sandbox temporary-module ENOENT failures were environmental; unchanged suites passed outside sandbox. Build retains an existing large-chunk warning (approximately 749 kB before gzip), to address during performance work.

Verified protections include chronological manual promotion without bypassing pending-seat capacity; explicit singleton leave rather than silent displacement; every student room mutation closed after deadline; role/category/fifth/sixth limits; atomic source-preserving fundraising transfers and personal-only payouts; stable retry keys; Coach-only attendance selectors and unchanged clock APIs. Corrections retain original records and show target/actor evidence.

Limits: bounded operational lists fail closed rather than silently truncate; season rollover/team-account transfers, complete family attendance reports, real consent and retention automation remain pending. Browser connectivity subsequently recovered. Live Coach attendance/name selection, finance payout/transfer controls and event/room workspace smoke checks passed against synthetic development data. Phone-width event and finance pages showed no horizontal overflow; dark-mode rendering was inspected. Complete live multi-role mutations, light-mode regression and closed-session correction UI rehearsal remain pending; automated mutation tests are not a substitute for those acceptance steps. The room UI was also corrected to consistently use installed shadcn controls, with focused lint/typecheck passing.


## Fictional rehearsal follow-up — October 12, 2026

See [the rehearsal report](REHEARSAL_2026-10-12.md) for the current evidence, superseding earlier pending statements for the live closed-session correction and Coach financial/room/transport checks. Coach, Student and Parent live journeys passed within the documented scope. Fixed duplicate React sibling keys and financial draft leakage between students, preserved payment/charge retry keys, clarified waitlist withdrawal wording, and denied attendance correction writes to archived seasons. Added guarded fictional fixtures and integrated multi-role tests. Full root checks passed 97 tests across 17 suites, lint, strict types and build. Remaining live Travel/Mentor, independent-device, paid-withdrawal and room-invitation journeys are explicitly open; family Attendance still needs implementation. No real records, real signatures or production release.

## October 13 accounts and aggregate reporting checkpoint
Astra closed source findings for invitation token transport, correction queue growth, stale profile revisions, attendance worker rollback, dirty report gating, metadata freshness and pagination fanout. Source includes five-step setup, Coach correction queue, adult invitations/access and materialized attendance/finance reports. Tests152/152 across26files pass outside sandbox; lint/typecheck/build pass. Native sandbox test imports failed with temporary-file ENOENT and were rerun; build exposed one Windows1252 ellipsis corrected to UTF8. Development-only sync succeeded to third-bandicoot-18 with reportAggregates/batchWorker installed. Timeclock frontend merged3946b88 and its combined checks pass. Remaining limitations: actual load/byte-limit proof, full live journeys, visual matrix, gross fundraising metrics, full consent and administration workflows. No production/main/signature authorization or full-goal approval.
Live follow-up: user-opened Parent browser confirmed Status and Attendance load against synchronized development backend. Verified totals remain unavailable while rebuild is pending; legacy values and four synthetic session cards load. No false zero verified total, rebuild mutation or final visual claim. Visible caught-up label encoding corrected in shared family copy.

## October 13 synthetic permission integration (local)

Authoritative coverage now replaces historical accepted-submission fallback in readiness. Immutable typed receipts, revision-checked signing/review/re-signing, paper signer/recorder provenance, gated fixture linkage, compact acceptance metadata and bounded exports are implemented. Astra backend source review cleared the slice after scale and provenance fixes. Integrated serial regression suite passed 169/169 across 28 files; an earlier 168/169 run exposed a too-small oversized-payload test fixture, corrected before the passing run. UI export/version authoring review and final lint/build/development synchronization remain pending at this entry. No live permission journey or visual acceptance is claimed; real signing stays disabled.

Final permission checkpoint: Astra backend and UI source reviews clear; root lint, strict types and Vite build pass. Backend/integration169tests and frontend export5tests pass in separate runs. Vitest now includes source tests with the app alias. Development sync completed08:45:38. Coach attendance rebuild discovered4sessions; Parent report subsequently showed verified totals, timestamps and session minutes rather than updating placeholders. Private screenshot retained outside Git. Dedicated fictional consent subject/event created and explicitly linked to authorized verified Parent test account; role grants unchanged. Permission browser journeys and four-combination visual checks remain pending. Build emits917KB bundle warning; no production action.

Final full bun run check passed: 174 tests across29files, lint, typecheck and build. Live nonbinding consent rehearsal passed Coach draft creation, Parent child selection, empty-event validation, all four form steps with initially unselected medication choices, immutable receipt creation, Coach acceptance, and reactive Accepted coverage in the Parent browser. Private proof retained outside Git. Corrections/re-signing, paper/export live journeys and four-combination prototype comparison remain open.

### October 13 — live synthetic correction continuation
Coach sent back the fictional permission form with an emergency-contact-name correction. Parent saw the same note, supplied an updated fictional contact, and submitted a replacement nonbinding form. Current coverage became awaiting review. Opening the earlier receipt still showed the original contact and marked it historical; profile changes did not overwrite signed evidence. Replacement Coach acceptance, re-sign request, paper/export and required visual matrix remain pending. Private screenshot is outside Git.

### October 13 — financial reader integration (local work in progress)
Family/team finance totals now require ready financial-account projections; pending allocation/posting/rebuild or failure withholds verified totals. Readiness also remains open while financial processing is incomplete. Gross Raised uses recorded gross totals only, with unknown legacy sources preserving an unavailable result. Charges and transaction history have separate authorized native pagination instead of the old lifetime 500-row read limit.
Focused evidence: dashboard reports 6 tests and financial detail pagination 1 test pass together; pagination reads all 620 synthetic ledger rows plus 52 ordered charges and denies unrelated-family/ordinary-Mentor access. Report-maintenance tests 5/5 and application boundary tests 11/11 pass after adapting to explicit projection readiness. The broader evolving financial implementation is not yet fully validated, published or development-synchronized; these focused results do not replace the final full check or live/visual evidence.

## October 13 financial integration checkpoint validation

Full bun run check passed 194/194 tests across 34 files, lint, TypeScript and build. Targeted regression evidence includes 100-event Whole Team enrollment, 500-member roster, financial history beyond 500 records, interrupted/retried operations with preserved sources, immutable fundraiser retry creator, gross-only fundraising, and readiness overflow refusing completion. Subsequent first-page loading guard passed types/scoped lint. Bundle remains roughly947 KB. Final Astra review, full development application synchronization and live financial/prototype evidence remain pending; no production claim.

October 13 live follow-up: Coach accepted the corrected fictional replacement receipt; Parent current event coverage and latest receipt both show Accepted while the earlier receipt remains Needs correction. Private screenshot retained outside Git. Financial checkpoint b66450d remote hash verified; dev functions ready at10:08:14. No production deployment or real consent enabled.

October 13 live financial rehearsal found a recoverable integration defect: accounts without the new financial projection cause operationOptions to throw, taking down the finance route and hiding the Coach rebuild control. Backend/UI owners are correcting this expected state to an explicit rebuild-required result with no available balances or enabled actions. Automated source tests had not covered this route-level missing-account experience. Do not mark the financial live journey complete until the fix and rebuild are verified.

October 13 live financial recovery verified: after the development fix, the Coach finance route stayed available with a rebuild-required message and no invented balances. Coach initiated report rebuild; current-season synthetic totals and detailed history loaded successfully. Team Gross Raised correctly remained unavailable for legacy net credits without gross provenance. This verifies recovery and loaded behavior, not four-combination visual conformance. Private screenshot retained outside Git. Astra cleared the incremental UI/source follow-up; eight backend and seven UI focused tests plus types/lint pass.

October 13 fundraiser browser rehearsal: the posting control was inert because Base UI defaults a Button to type=button. Explicit submit types now connect the existing posting and retry form handlers without changing their validation or authorization. Scoped lint passes; Astra reviewed the exact two-attribute diff clear. Live fictional posting completed: 1001 cents gross = 251 team proceeds + 750 student travel credit, one committed row, no held rows, completed history visible. Private screenshot saved outside Git. Retry and spent-credit hold journeys remain unverified live; this does not close the visual matrix or G6.
