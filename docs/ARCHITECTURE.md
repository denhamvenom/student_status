# Student Status architecture and shared contracts

## Boundaries

This is an isolated application. `src` owns React and presentation, shared pure domain code owns deterministic calculations, and the app's `convex` directory owns persistent state and authorization. The handoff is reference material, never runtime HTML. Existing workspace-root Convex files are untouched.

Use React Router Data Mode for navigation, nested layouts and route errors. Convex reactive queries own remote data. Zustand contains only ephemeral state such as selected child/event, filters and open sheets; do not use it as a parallel authoritative financial or identity database. next-themes applies the theme class; persisted authenticated preference may synchronize through a user preference mutation. Sonner announces completed actions and actionable failures.

Synthetic development mode must be visibly identified and isolated from authenticated persistence. A development persona is a fixture selector, never an authorization parameter. Missing server configuration must not silently send synthetic records to a real deployment or pretend Google sign-in succeeded.

## Proposed shared domain contract

Implementation may choose filenames, but frontend and backend should share one vocabulary and avoid independently invented shapes.

| Entity | Required concepts |
| --- | --- |
| Viewer | Stable authenticated subject, account email/name, status, base role, travelLead capability, financialEdit capability, linked student IDs, theme |
| Season | ID, unique name, start/end dates, active/closed state, close transaction ID |
| Student | ID, season membership, legal/preferred names, Google subject, active status, subteam, Travel Team, shirt, rooming category, setup state |
| Student private data | Parent contacts, emergency contact, health states/items, seasonal OTC authorization, scoped separately from roster projection |
| Event | ID/season, title/type, dates/destination, participation mode, capacity/deadline/withdrawal, overnight, requirements with due dates, transport and rooming settings |
| Participation | Event/student, confirmed/pending/waitlist/withdrawn/declined, ordered waitlist timestamp, independent travel flag |
| Requirement | Stable key, kind payment/permission/FIRST/custom/room, label/instructions/link, applicability, due date, adult completion evidence |
| Charge | ID/season, title, optional event, amount in integer cents, recipients, priority, active/void state |
| Financial entry | Student, type, amount cents, allocated charge amounts, source/ref, actor/time/reason and before/after audit evidence |
| Permission submission | Immutable student/season/signer identity, signed timestamp, wording version and exact snapshot, covered event IDs, health/contact snapshot; review state kept separately |
| Room group | Event/category, accepted student IDs, invitation records, finalized flag/room number, needsReview, optional fifth-person authorization note/actor/time |
| Driver/transport | Active driver with vehicle/seats/tow capability, event assignments and overrides, bus seats, extra adult passengers, trailer requirement/driver |
| Attendance | Common meeting calendar/cancel state, student observations, import source/matching status, last successful update and last attempt |
| Audit record | Actor derived from auth, action/entity, timestamp, before/after, reason, season and related student IDs |

Represent money as integer cents. Store timestamps as epoch milliseconds and calendar dates as ISO dates, with explicit America/Chicago presentation rules. Use stable IDs rather than display names for relationships. Health fields use a discriminated state (`unknown`, `none`, `reported`); empty strings never imply medical clearance.

## View models and service boundary

Queries return the least-privileged projection needed by a screen. Recommended seams:

- `viewer`: authenticated identity, permitted navigation/capabilities and linked-child summaries.
- `studentDashboard(studentId)`: finance summary, permitted events with participation/readiness, attendance summary and grouped tasks.
- `studentProfile(studentId)`: permitted profile/private fields and allowed edit actions.
- `eventDetail(eventId)`: visible event and viewer-specific participation; adult workspace returns additional scoped operational data.
- `eventReadiness(eventId)`: category results and adult-only student requirement matrix; family gets their own row; Mentor gets overall result only.
- `studentFinances(studentId)`: charges, allocations, travel balance and audit projection; no client-side reconstruction from unscoped team ledger.
- `teamRoster(filters)`, `mentorReport(filters)`: separate schemas; mentor response must not contain hidden finances/health/open-requirement reasons.

Mutation arguments contain entity IDs and requested changes, not an authoritative role, actor email, calculated readiness or available balance. Every mutation resolves the real viewer and record scope again. Return explicit domain error codes for capacity/deadline/concurrency/permission failures, mapped to useful UI copy. Expected conflicts are not success states.

Suggested command families: join/code review; student ordinary/private/correction edits; event creation/participation/requirement completion; charge/payment/credit/fundraising; parent invitation and permission submission/review; room invitation/acceptance/adult assignment; driver/event transport; attendance preview/resolve/apply; adult grants and season preview/close. Query before/after summaries should change reactively after successful writes.

## Authorization contract

Coach is the only role that manages legal identity, roster archival, subteams, Travel Team, required-event participant removal, team codes, adult grants, fee priority, fundraiser creation, attendance settings and seasons. Travel Lead is a Mentor capability with operational access; financial writes require the additional Coach-controlled grant. Parent access requires an active link to that exact student. Student access resolves to their own student record.

Student health/emergency edits and parent signing on unrelated records are denied. A parent cannot enroll or withdraw a child from optional events. Student rooming actions use their own authenticated student ID. Mentor has a dedicated restricted report projection and never receives private data to hide in React.

October 12 planned policy: Coach may export permission/health packets; Travel Lead requires a separate Coach-controlled export grant, proposed default off and independent of financialEdit. Until implemented and tested, retain the restrictive denial. Draft legal wording blocks real signature acceptance. Parent linking follows the approved good-faith process below; it does not claim independent proof of guardianship.

## October 12 parent invitations and remaining planned changes

For subsequent confirmed finance/consent/retention rules, [FINANCE_AND_CONSENT_DECISIONS.md](FINANCE_AND_CONSENT_DECISIONS.md) takes precedence over the earlier planning snapshot below. It adds partial internal returns, fee classification, priority reallocation, source-preserving fundraising transfers, named form organizations, first-aid wording and archival-based retention.

Parent invitations expire after 7 days. A Coach-only Join Requests toggle blocks creation/replacement but preserves outstanding invitations and established links. Student supplies the parent email; matching Google sign-in, a valid one-time token and explicit relationship/authority attestation establish the link without routine Coach approval. Coach handles problems and may revoke access. Resolve identity on the server, reject self-linking to the student's own account, and log acceptance plus attestation version/time. Do not expose student details on an unauthenticated invitation landing or grant access on email mismatch. Account linking does not itself sign travel or medication consent. Implemented: seven-day one-time hashed tokens, authoritative server-time preview/acceptance, versioned relationship attestation, new parent onboarding, Coach revoke/restore/allow-replacement controls, and current-season child selection. Tokens use URL fragments and temporary same-tab sessionStorage only for the Google round trip; the OAuth redirect URL contains no invitation token. Signed forms and medication consent remain separate and unimplemented. See PARENT_INVITATIONS.md.

A separate clock application on another subdomain will share the Convex backend. It owns clock-in/out actions; this app reads scoped attendance results. Initial matching uses verified email, with durable internal student IDs thereafter. A shared database does not automatically share browser sessions or authorize clock users to access health/finance functions.

Withdrawal has four Coach/Travel Lead decisions: approve and return event-applied money to available funds; approve and retain payment on the event with a non-refundable-withdrawal note; approve a partial internal return up to the full eligible paid amount; or deny and preserve participation. An approved internal return reverses the event allocation with an audit trail and prevents that event from immediately reclaiming the credit. It does not reduce money held for the student or create an external refund payable. Approved withdrawal releases participation/room/capacity atomically with its financial disposition; preserve original ledger history and enforce idempotency. Unpaid extras are canceled automatically. Unpaid main event/travel charges remain owed unless explicitly canceled. Paid extras are eligible for return; returned funds automatically apply to other charges in priority order while preserving personal-payment versus fundraising provenance.

Actual money returned by check/cash is separately recorded in the finance area by Coach or Travel Lead with the financial-edit grant. This app records the payout, never executes a money transfer. Append an audited payout entry, validate available refundable funds and duplicate submissions, and reduce the funds held for the student. Withdrawal-disposition authority does not grant this external-refund capability. Fundraising-credit cash/check payouts are not authorized. Fundraising transfer authority and recipient restrictions remain unresolved.

Coach manages application accounts; archived records are retained for 5 years. Retention starts when the Coach archives the student account; purge coverage, backups, exports, holds and reactivation still need specification. Medication consent will be categorized; exact products, wording and approval process remain open. See PLAN.md for the source permission slip and confirmed versus proposed details.

## Derived state invariants

1. Readiness has three categories: student requirements, transportation, adult rooming. Each is `ready`, `open` with reasons/count, or `notApplicable`. Participation status is independent. Attendance never gates readiness.
2. Event charge eligibility begins at confirmed participation. Pending counts toward capacity, not debt. Event required payment includes all active charges tied to that event; standalone charges do not gate the event.
3. Travel credits consume no more than available travel balance, apply in Coach priority order and audit each affected student/charge. No implicit Travel Fee or floating-point currency math.
4. A student's room selection completes with a roommate, assignment request, or finalized placement. Adult rooming remains open until placement/finalization. Groups have four occupants unless adult-authorized fifth, never six; categories never mix.
5. Invite acceptance and event signup enforce capacity in one transactional mutation. Concurrent attempts cannot overfill. Removing event participation releases room membership and flags affected room for review.
6. Signed submissions are append-only snapshots. Review status/correction requests are separate records; later events cannot retroactively enter a signed snapshot.
7. Season close is one idempotent transaction with explicit monetary dispositions and reasons. Archived queries deny ordinary-user access.

## UI and accessibility contract

Import the handed-off color/type/space/radius tokens; keep gold primary actions, purple navigation, dark header and 1200 px content width. Use the white-text logo on the header. Anton headings/navigation and Segoe UI body match the reference. No prototype black review bar, gradients, emoji, or colored left-border cards.

Under 1024 px use role-specific bottom navigation and More sheet; under 768 px tables become cards. On desktop, family top navigation and grouped Coach menus match navigation.json. Parent student selector is at least 44 px and always accompanies a Viewing banner. Status chips use text/icons as well as color. Dialog/sheet primitives manage focus, Escape, labels and return focus; busy actions disable duplicate submission. Inputs use appropriate types, 16 px text and inline validation.

## Verification strategy

Pure-domain checks cover confirmed-only billing, integer-cent allocation, capacity including pending, manual waitlist promotion, room limits/category boundaries, assignment versus adult readiness, and attendance exclusion. Server authorization checks cover wrong-user reads/writes, unlinked parents, Mentor projection, Travel Lead finance disabled, and Coach-only administration. Integration checks prove that a mutation changes every relevant summary and that failed conflicts preserve prior state. Build/typecheck plus focused browser tasks validate route errors, responsive layouts, light/dark, form labels and keyboard dialogs.

Cloudflare hosts static assets with SPA fallback; Convex supplies the reactive backend. Google OAuth callback/origin and Convex deployment configuration must be explicit. Production deployment and real records remain blocked until the gates in PLAN.md are resolved.

## Multi-app foundation

Student Status remains at root; Timeclock has an independent Bun workspace under apps/timeclock. One Convex backend owns identity, roster, event sessions, intervals, corrections and Calendar scheduling. Travel events/participants and timed attendance occurrences are separate models. Cross-tab console selection is server-backed with an opaque profile identifier; no roster/query/health/finance data is persisted in browser UI stores. Read TIMECLOCK_BACKEND_HANDOFF.md for contract and current limits. The Student Status integration owner alone synchronizes shared backend changes.
