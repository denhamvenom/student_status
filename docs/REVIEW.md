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
