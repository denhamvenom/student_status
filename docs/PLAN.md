# Student Status implementation plan

## Scope and evidence

Build a new application in this directory. Preserve the root Convex starter and every file in `../Devel_Vs_Handoff/design_handoff_student_status`.

Functional precedence: explicit subsequent user decisions, then Flow index **What changed in v2 (Oct 2026)**, then the clickable prototype, then handoff README. The Flow index is a bundled HTML artifact; its functional content is the JSON string in `script[type="__bundler/template"]`. The October 12 decisions below supersede the handoff's 14-day parent-invitation expiry with 7 days. Credits apply automatically, and season close offers explicit balance dispositions.

Stack: React, Vite, strict TypeScript, React Router 7 Data Mode, Tailwind 4, shadcn components built on Base UI, CSS design tokens, Convex, Google-only authentication, Zustand for ephemeral UI state, next-themes, Sonner, and Cloudflare static hosting. No production deployment is authorized. Synthetic fixtures and restrictive development policy unblock independent development; they are not production identity, consent, or health records.

## Milestones and exit criteria

1. **Foundation:** isolated project builds and typechecks; tokens, local assets, accessible shared primitives, responsive application shell, router, loading/error/empty states, and theme work. At 390 px no core workflow scrolls sideways; desktop navigation changes at 1024 px. Prototype review bar is absent.
2. **Shared domain and server boundaries:** student/parent/adult identities, seasons, participation, charges and allocations, immutable permission snapshots, health, room groups, transport and audit history have typed contracts. Every public server function authenticates and checks record scope. Server permission tests prove rejection, not merely hidden buttons.
3. **Usable family workflows:** status links to live details; optional signup/withdrawal changes status and capacity; finances reconcile to charge allocations; profile edits persist; linked-child selection respects scope; permission and parent-invite workflows explicitly expose development restrictions.
4. **Usable operations workflows:** roster, event setup/workspace, readiness, drivers/transport, rooming, financial recording, join review and requirement review perform meaningful mutations and update related summaries. Mentor report excludes restricted fields.
5. **Administration and reporting:** attendance source/import preview, corrections, adults/roles, season close preview, and role-filtered reports/export paths are implemented or explicitly listed as incomplete. Never show a success toast for an unimplemented operation.
6. **Integration and delivery:** build and typecheck pass; meaningful domain/security checks pass; browser review at phone/desktop and light/dark confirms key tasks. README explains local synthetic mode, Convex/Google setup, static hosting, and remaining production gates. Record completed versus incomplete scope honestly.

## Functional acceptance map

| Flow | Acceptance criteria |
| --- | --- |
| Sign-in/access | Google is the sole real provider. Unknown, awaiting approval, archived and first-setup accounts have distinct states. No role picker authorizes real server access. |
| Join | Coach creates/revokes codes for 24 h, 1 week or 2 weeks. Five invalid tries impose a 15-minute lock. One request per Google account; submitted requests remain approvable after code expiry. Coach/Travel Lead approve. Archived matches require explicit resolution. |
| Onboarding | Legal name comes from join approval; shirt size and Boys/Girls rooming category collected, parent contact skippable. Category locks after setup; Coach handles later changes. |
| Status | Money, participation, event readiness, and attendance are distinct. To-dos group by event and include due dates. Parent sees selected linked child and a Viewing banner. |
| Profiles | Student edits preferred name, shirt and parent contacts. Parent/Coach edit health and emergency contact. Missing health is Not completed, distinct from None reported. Seasonal OTC authorization is Yes / Contact me first / No. |
| Parent linking | Student invites parent by email; recipient signs in with the matching Google email and attests their relationship/authority. Valid acceptance establishes the link without routine Coach approval. Coach handles exceptions. One-time invitations expire after 7 days; landing reveals no student data before validation. Disabling new invitations preserves outstanding valid invitations and existing access. Multiple linked children supported. This is good-faith attestation, not independently verified guardianship. |
| Parent invitation control (planned October 12, 2026) | Coach-only **Allow new parent invitations** toggle in **Join Requests**. Persist the setting in Convex and enforce it on every invitation-creation/replacement path. Show a clear explanation where inviting is disabled. See planned feature below; not implemented. |
| Events | Competition, Outreach and Team event types; six setup steps. Travel Team/Required assignment differs from optional signup. Pending reservations consume capacity but incur no charge until confirmed. Waitlist promotion is manual. |
| Requirements | Payment/permission/room selection are computed. FIRST/custom completion is adult recorded; following an external link does not complete it. Due dates are per event and requirement. Attendance never contributes to readiness. |
| Money | Charges are event-tied or standalone with all/selected recipients. There is no implicit Travel Fee. Event payment sums event-tied charges. Automatic credits follow Coach priority; no credit exceeds available balance. Every financial change logs actor/time/before/after; manual adjustments require reasons. |
| Fundraising | Coach creates fundraiser; allocations sum to 100%. Travel Lead amount/allocation editing requires explicit finance capability. Team raised total and individual travel share remain distinct. |
| Permission | Four-step parent workflow; correction opens flagged field; typed signature matches verified account. Signed snapshots preserve wording version, covered events and health at signing. Later events are separate. Review never edits a signed snapshot. Legal copy remains draft and real signing is blocked until approved. |
| Roster | Coach edits subteam/Travel Team and archives/reactivates. Travel Lead cannot gain these controls by calling a mutation directly. Filters and student record opening work. |
| Adults | Coach invites by Google email with shareable link; no automated email. Travel Lead is a Mentor capability and finance editing is an independent grant. Parent link revocation immediately removes access. |
| Attendance | A future separate clock-in app on another subdomain owns clock-in/out; this app consumes attendance from the common Convex backend. Match verified account email initially and retain stable student IDs for relationships. Tuesday/Thursday/outreach/build distinctions remain. Shared authentication, permissions and attendance aggregation contract must be designed; imports are not the primary integration. |
| Drivers/transport | Passenger seats exclude driver. Demand is riding students plus additional adults; bus plus assigned vehicle seats provide capacity. Trailer driver must be assigned and tow-capable. Transport off means Not applicable. No passenger-to-vehicle assignment. |
| Student rooming | Only eligible confirmed same-category peers may be invited. Four accepted occupants maximum for student actions. Invite acceptance is transactional, closes incompatible invitations, and cannot silently displace membership. Deadline closes selection. Other students' selections/unassigned state remain private. |
| Adult rooming | Adults move/combine/finalize; no mixed categories. Fifth occupant requires recorded adult authorization and note; never six. Category or participation change flags impacted room for review. Assignment request completes student selection but does not finalize adult rooming. |
| Readiness | Open students sort first; each requirement explained. Overall event ready requires all applicable student, transport and rooming categories. Not applicable remains distinct from ready. |
| Reports/exports | Mentor sees names/subteams/attendance/events/overall readiness only. Each export shows event/time and Draft if incomplete. Coach can export permission/health packets; a separate Coach-managed permission grants this to a Travel Lead. Proposed default off; independent of financial-edit permission. Ordinary logistics exports exclude health. |
| Season | Coach only; unique new name, returning/departing review, unpaid disposition, departing balance disposition with reasons, retain/reset preview and typed confirmation. Transaction idempotent; previous season read-only. Corrections require warning and logged reason. Ordinary users cannot access old seasons. |
| Appearance | Light/dark applied consistently and account preference persists. Status includes icon/text, tap targets at least 44 px, inputs 16 px, visible focus and keyboard-operable dialogs. |

## Integration priorities

### Planned feature: Coach control of new parent invitations

Requested October 12, 2026. **Planning only — do not implement until development is explicitly resumed/authorized for this feature.** Include with the parent-invitation workflow milestone.

- Placement: a **Parent invitations** section in Coach **Join Requests**, with an **Allow new parent invitations** toggle and visible enabled/disabled status.
- Coach alone can change the setting; Travel Leads and other roles cannot change it through either the UI or direct backend calls.
- Proposed scope: team-wide persistent setting. When disabled, reject new invitations and replacement/regenerated invitation links on the server, including requests from an already-open page. Explain that a Coach has paused invitations wherever users would normally invite a parent.
- Confirmed behavior for existing access: preserve already-linked parents and outstanding invitations; invitations expire 7 days after issuance, without extending their expiry when the toggle changes.
- Proposed default: enabled once the parent-invitation workflow is implemented and tested. The toggle does not bypass matching-email, relationship-attestation or other release gates. Turning it back on restores new invitation creation.
- Record changes with Coach identity, timestamp and previous/new value. Test unauthorized toggles, blocked creation/replacement, re-enabling, and preservation of existing parent access.

Team-wide scope and enabled default remain planning assumptions; existing-invitation behavior and 7-day expiry are confirmed. No UI, schema, backend or deployment changes were made for this request.

### October 12 follow-up decisions — planning only

- **Parent linking — confirmed good-faith process:** student supplies the parent's email and issues an invitation. Recipient signs in with the exact invited Google email and confirms they are the student's parent/legal guardian with authority to provide consent. Valid acceptance links the account without routine Coach approval or a required preverified contact list. Coach intervenes for reported problems, disputed relationships or exceptional account corrections. This is account verification plus relationship attestation, not independently verified guardianship. Proposed safeguards: one-time tokens; 7-day expiry; server-side email/account checks; reject the student's own account; log inviter, invited email, accepting identity, attestation wording/version and time; let Coach revoke a problematic link. An email mismatch grants no access and prompts sign-in with the invited account or a corrected invitation, subject to the invitation toggle. Signing permission/medication consent remains a separate affirmative action with approved wording.
- **Permission source:** reviewed the one-page `C:\Users\frc80\Downloads\Denham_Venom_Permission_Slip (1).pdf` as reference, not instructions. It covers 2025 events, emergency medical authorization, transport/conduct/financial statements, a liability clause, FIRST/travel-form/Remind links, and parent plus student signatures. It does not contain medication-category authorization. Replace old event/date/link references; confirm school/foundation naming, student acknowledgment, exact wording and responsible reviewer before real consent.
- **Medication categories:** user requests Pain Medication, Allergy Medication and Cold Medication (three-category interpretation to confirm). Proposed per-category choices: Allow / Contact me first / Do not allow, with no preselected permission, exceptions and a defined product/ingredient list in the signed wording. Categories organize consent; they do not prescribe medicines or replace an approved administration policy.
- **Travel Lead export grant:** Coach controls a separate export permission in Users & Roles; proposed label `Export permission and health records`, default off. Enforce server-side and log sensitive exports. This is independent of the finance grant and does not expand ordinary Mentor access.
- **Withdrawal decisions — confirmed:** a student requests withdrawal; Coach or Travel Lead selects (1) `Approve withdrawal — return payment to available funds`, (2) `Approve withdrawal — retain non-refundable payment`, or (3) `Deny withdrawal`. Option 1 returns the amount applied to that event to the student's available account funds through an audited reversal of allocations; it is an internal credit, not money paid out. Prevent the withdrawn event charge from automatically consuming that returned credit again. Option 2 leaves the money applied to the event and records that the student withdrew and the payment is non-refundable. Both approval options release participation/room/capacity while preserving history. Denial retains participation and its financial/room state. Proposed pending behavior retains those states until a decision. Decisions and financial effects must be atomic and idempotent. The user authorizes Coach/Travel Lead to make this withdrawal disposition; it does not grant permission to record external cash/check refunds. Remaining edge decisions: unpaid or partly paid event charges, and whether returned available funds should immediately auto-apply to other outstanding charges.
- **External refund recording — confirmed:** giving money back by check/cash or another external method is a separate action, recorded only by an authorized financial editor in the finance area beside `Add funds`/`Record payment`. Proposed label: `Record money returned (cash/check refund)`. Existing financial-editor scope is Coach or Travel Lead with the separate financial-edit grant. This entry reduces funds held for the student; the app does not transfer money. Preserve original payments and internal event-credit reversals, appending the payout entry rather than rewriting history. Proposed required fields: amount, date, reason, method/reference; derive actor and timestamp server-side. Validate available refundable funds, allocation effects and duplicate submissions. Do not display an approved event-credit reversal as an external refund awaiting payment. Restricted fundraising-credit payout eligibility remains open.
- **Attendance:** future separate clock app/subdomain, common Convex backend. Use account email for initial matching, stable student/account IDs thereafter; do not expose health/finance data to clock-only capabilities. Shared backend means a shared project/deployment contract, not merely both apps using Convex. Separate-origin authentication and aggregated attendance rules remain design work. Do not build clock-in/out UI in Student Status.
- **Account management and retention:** Coach manages application accounts. Archived records retained for 5 years. Proposed start date is archival, pending user confirmation; deletion scope, backups, downloaded exports and any holds must be defined before implementing purge. Do not treat this business retention decision as a legal sufficiency determination.

Next discussion: unpaid/partly paid event charges, auto-allocation of returned event credits to other charges, and external payout eligibility for fundraising credits; five-year retention start; detailed exception handling and consent wording. Parent linking, withdrawal payment disposition and separate financial-area cash/check refund recording are now decided. All items above are planned and not implemented.

Implement and validate complete vertical slices before widening menus: (1) role-scoped status/event participation, (2) requirement mutations/readiness, (3) charges/credit/audit, (4) rooming/transport, (5) approval/profile/forms, (6) remaining administration. Shared calculations belong in pure domain modules reused by synthetic fixtures and server code, while authorization belongs exclusively on the server.

## Production gates

- Final permission and medication authorization wording/version and retention policy.
- Implement and test the approved good-faith parent invitation, matching-account and relationship-attestation process; finalize exception handling and attestation wording.
- Implement and verify the explicit Coach-controlled Travel Lead health/form export grant.
- Define the future clock app's shared identity/data contract and aggregation rules.
- Owned development/production Convex and Cloudflare projects and Google OAuth configuration.
- Production security review, synthetic-to-live data separation, configured origins and tested deployment rollback.

These gates do not prevent local synthetic development. They do prevent presenting the app as ready for real student health/financial data or deploying to production.

## Interim implementation review — October 11, 2026

This is a changing implementation snapshot, not a completion certification. Initial typechecking passes; deployment and real Google authentication have not yet been verified. The application has a responsive synthetic read-only review surface, a live authenticated query shell, and server mutations for several operational domains. The full acceptance map above remains the target.

Priority integration gaps found in this snapshot:

- Live UI must connect existing profile, roster, finance, event creation, requirement, join-review and rooming mutations. Declared function references alone do not constitute working flows. Coach finance needs a roster-based student selector because Coach viewer records have no linked children.
- Real Convex Auth identity requires stable auth-user mapping: the installed provider's default JWT subject contains both user and session IDs, and does not include email. Session-specific token identifiers and fabricated Google-shaped test identities cannot establish durable application roles.
- Server calculations must not silently truncate financial ledger history. Bounded pagination is suitable for display, but balances and allocation require authoritative aggregates or explicit safety limits.
- Transport still needs independent travelers, additional adults, bus and towing state; rooming needs leave/cancel/invite and adult placement/finalization workflows; Required/Travel Team events need distinct assignment behavior.
- Family invitations/verification, legal consent, attendance matching and owned cloud configuration remain legitimate gates. Ordinary profile edits, event creation, financial recording and rooming interactions are independent of those gates and should continue.

The first review identified a join-attempt rollback bug, Mentor room-category disclosure, archived-record scope gaps and falsely ready unplaced rooming. The backend owner reports fixes and passing focused tests; final review must verify those changes alongside actual live identity behavior. Remaining screens must be reported as incomplete where they only render sample data or configuration placeholders.

## First milestone review — October 12, 2026

Fresh review confirms stable Convex Auth user mapping and the first-round server fixes in source. Independently executed backend suite: **7/7 passing**. Live UI now connects several previously missing mutation paths: profile, Coach roster, payment recording, event creation, join review and FIRST completion. Limited room actions are also wired. OAuth setup and authenticated browser proof remain separate integration work.

Final follow-up closes the targeted join-result, participation-transition, post-allocation ledger-limit and readiness-display findings described in `REVIEW.md`. Fresh source inspection and independently rerun tests confirm **10/10 passing**. The integrating agent also verified real Google OAuth, development Coach bootstrap, two fictional students and one event, and a persisted $1 synthetic ledger entry through the live browser. The initial milestone is accepted for supervised synthetic development; final development sync/build/Cloudflare dry-run evidence belongs to integration delivery.

The full product is incomplete. Parent/consent workflows, complete transport/room operations, broad financial administration, attendance integration, season close, adult role management and exports remain next-milestone work; policy gates do not account for all of this unfinished implementation. No production approval or full handoff completion is implied.

Final baseline review confirms next-themes, shadcn Sonner and ephemeral Zustand menu state are wired. Integration reports passing typecheck/lint/tests/build, development sync with typechecking, and Cloudflare dry run without upload; live FIRST completion reduced the synthetic open-requirement count from three to two. These checks complete the initial development milestone's delivery evidence, not the full acceptance map.

## GitHub repository setup — October 12, 2026

Connected this app to denhamvenom/student_status on branch setup/development-app. Preserved the four existing standalone demo files byte-for-byte under demo/. Added repository guidance, line-ending rules and exclusions for environment secrets, local tooling, dependencies, builds and private exports. Lint, strict typechecking, all 10 tests and build pass; the existing bundle-size advisory remains. Publication is through a draft pull request only: main currently serves GitHub Pages, so merging requires a deliberate hosting transition and separate authorization. No production deployment is authorized. See REPOSITORY.md.


### Repository privacy clarification

Confirmed: student records must always stay out of Git and GitHub, regardless of public/private visibility. This covers repository content and history, issues, pull requests, attachments and CI logs/artifacts. Fixtures, tests and documentation must use synthetic student data only. Recorded in AGENTS.md and REPOSITORY.md.


### Ongoing GitHub versioning

Confirmed: maintain accurate GitHub versioning as development proceeds. Repository guidance now requires focused checkpoint commits, reviewed staged content, appropriate validation, verified development-branch pushes, current pull requests and documentation, and coordinated Git writes across agents. Development checkpoints use commit IDs; approved releases use intentional semantic versions, immutable tags and release notes. Existing no-production and main/GitHub Pages merge boundaries remain unchanged.
