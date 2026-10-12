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
- Parent invitations and guardian verification; four-step consent wizard, correction targeting, immutable wording content, re-sign lifecycle and Coach paper acceptance.
- Medication authorization currently remains a profile value; unlike permission signing, it does not enforce approved wording/version or seasonal signature. Keep it synthetic-only until that consent workflow exists.
- Transport model and interface for buses, independent travelers, extra adults and trailer towing; driver management; complete room invitation/cancellation and adult room placement/finalization interface.
- Financial charge editing/voiding, refunds and adjustments, Coach priority controls, fundraiser creation/allocation, bulk import/export and detailed audit UI. Charged-event withdrawal currently requires reconciliation that is not yet offered end to end.
- Attendance source/import matching, unavailable/stale states, future-versus-held meetings, build-season categories and meeting administration. Existing counts are not a verified Time Clock integration.
- Adult invitations/role management, full Mentor readiness report, six-step season close, read-only archive/corrections and role-filtered PDF exports.
- Replace generic configuration placeholders with accurate specific missing-work descriptions. A configured OAuth connection alone does not complete those workflows.
- Shared frontend/domain contract consolidation, more specific route recovery beyond the root error boundary, grouped desktop navigation and a focus-managed More sheet.

## Release boundaries

Review disposition: **initial development milestone accepted within its limited scope of synthetic data and supervised development accounts**. The targeted blocking findings above are closed; this is not a full security certification. The product remains unsuitable for production student health/financial records, real consent, travel clearance or season close. Production deployment is not authorized. Final development synchronization, build and Cloudflare dry-run success are recorded as the integrating agent's delivery evidence; the dry run did not publish a site.
