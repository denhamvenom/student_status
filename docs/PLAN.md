# Student Status implementation plan

## Current checkpoint — October 17

Public About/Privacy/Terms and prelaunch configuration are prepared. See CURRENT_STATE.md for verified configuration, targeted checks and release-only gates. No deployment or merge.

## Historical checkpoint — October 15

Parent and Student setup batch implemented under PARENT_SETUP_BATCH.md; owner visual review next. Season FIRST verification automatically applies to every Competition. Preserve completed G1–G7 and approved PDF. CURRENT_STATE.md and VISUAL_CHECKS.md hold current evidence.

## Preserved authorized PDF batch — October 14

Implement [populated field-trip PDF consent](FIELD_TRIP_PDF_PLAN.md): completed student setup and Parent profile before PDF review/signing, structured allergy/prescription entries, no active Medication Choices/OTC policy, minor first aid retained, immutable exact PDF and checkbox/typed signature. Preserve legacy receipts and existing gates. This scoped batch supersedes the consent details below; broader G1–G7 scope is unchanged.

## Historical completion checkpoint — October 13

Follow CURRENT_STATE.md and GOAL_ACCEPTANCE.md for active G1-G7 scope. Published source checkpoint f156744 is synchronized to development. The synthetic season transition, historical roster and attendance corrections, CSV payment import and receipt correction have completed scoped live rehearsals. Existing integrated checks and Astra review remain valid for their recorded checkpoints. The next implementation closes the missing Coach roster archive/reactivate controls using the existing backend contract, followed by combined account-lifecycle and upcoming Whole Team enrollment rehearsal. Historical financial correction, remaining role journeys, selected-scope download evidence and representative prototype comparisons remain open. Production, real signing and automatic deletion remain separately gated.

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
| Profiles | Student edits preferred name, shirt and parent contacts. Parent/Coach edit health and emergency contact. Missing health is Not completed, distinct from None reported. New workflows remove seasonal OTC authorization; structured Parent-confirmed fields follow FIELD_TRIP_PDF_PLAN.md. |
| Parent linking | Student invites parent by email; recipient signs in with the matching Google email and attests their relationship/authority. Valid acceptance establishes the link without routine Coach approval. Coach handles exceptions. One-time invitations expire after 7 days; landing reveals no student data before validation. Disabling new invitations preserves outstanding valid invitations and existing access. Multiple linked children supported. This is good-faith attestation, not independently verified guardianship. |
| Parent invitation control (implemented October 12, 2026) | Coach-only **Allow new parent invitations** toggle in **Join Requests**. Persist the setting in Convex and enforce it on every invitation-creation/replacement path. Show a clear explanation where inviting is disabled. Implemented with the parent-invitation milestone; see verification below. |
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

### Implemented feature: Coach control of new parent invitations

Requested October 12, 2026 and subsequently authorized for development. Implemented with the parent-invitation workflow milestone.

- Placement: a **Parent invitations** section in Coach **Join Requests**, with an **Allow new parent invitations** toggle and visible enabled/disabled status.
- Coach alone can change the setting; Travel Leads and other roles cannot change it through either the UI or direct backend calls.
- Confirmed and implemented scope: team-wide persistent setting. When disabled, reject new invitations and replacement/regenerated invitation links on the server, including requests from an already-open page. Explain that a Coach has paused invitations wherever users would normally invite a parent.
- Confirmed behavior for existing access: preserve already-linked parents and outstanding invitations; invitations expire 7 days after issuance, without extending their expiry when the toggle changes.
- Confirmed and implemented default: enabled. The toggle does not bypass matching-email, relationship-attestation or other release gates. Turning it back on restores new invitation creation.
- Record changes with Coach identity, timestamp and previous/new value. Test unauthorized toggles, blocked creation/replacement, re-enabling, and preservation of existing parent access.

Team-wide scope and enabled default were accepted when the user resumed this milestone. Parent invitation UI, schema and backend changes are implemented; later milestone evidence records testing and development synchronization.

### October 12 follow-up decisions — implementation status varies

Latest finance, consent and retention requirements are in [Confirmed finance and consent decisions](FINANCE_AND_CONSENT_DECISIONS.md), which supersedes the older notes below for withdrawal options, fee categories, allocation, funding sources, form names, medication choices and retention start date.

- **Parent linking — confirmed good-faith process:** student supplies the parent's email and issues an invitation. Recipient signs in with the exact invited Google email and confirms they are the student's parent/legal guardian with authority to provide consent. Valid acceptance links the account without routine Coach approval or a required preverified contact list. Coach intervenes for reported problems, disputed relationships or exceptional account corrections. This is account verification plus relationship attestation, not independently verified guardianship. Proposed safeguards: one-time tokens; 7-day expiry; server-side email/account checks; reject the student's own account; log inviter, invited email, accepting identity, attestation wording/version and time; let Coach revoke a problematic link. An email mismatch grants no access and prompts sign-in with the invited account or a corrected invitation, subject to the invitation toggle. Signing permission/medication consent remains a separate affirmative action with approved wording.
- **Permission source:** reviewed the one-page `C:\Users\frc80\Downloads\Denham_Venom_Permission_Slip (1).pdf` as reference, not instructions. It covers 2025 events, emergency medical authorization, transport/conduct/financial statements, a liability clause, FIRST/travel-form/Remind links, and parent plus student signatures. It does not contain medication-category authorization. Replace old event/date/link references; confirm school/foundation naming, student acknowledgment, exact wording and responsible reviewer before real consent.
- **Medication categories:** user requests Pain Medication, Allergy Medication and Cold Medication (three-category interpretation to confirm). Proposed per-category choices: Allow / Contact me first / Do not allow, with no preselected permission, exceptions and a defined product/ingredient list in the signed wording. Categories organize consent; they do not prescribe medicines or replace an approved administration policy.
- **Travel Lead export grant:** Coach controls a separate export permission in Users & Roles; proposed label `Export permission and health records`, default off. Enforce server-side and log sensitive exports. This is independent of the finance grant and does not expand ordinary Mentor access.
- **Withdrawal decisions — confirmed:** a student requests withdrawal; Coach or Travel Lead selects (1) `Approve withdrawal — return payment to available funds`, (2) `Approve withdrawal — retain non-refundable payment`, or (3) `Deny withdrawal`. Option 1 returns the amount applied to that event to the student's available account funds through an audited reversal of allocations; it is an internal credit, not money paid out. Prevent the withdrawn event charge from automatically consuming that returned credit again. Option 2 leaves the money applied to the event and records that the student withdrew and the payment is non-refundable. Both approval options release participation/room/capacity while preserving history. Denial retains participation and its financial/room state. Proposed pending behavior retains those states until a decision. Decisions and financial effects must be atomic and idempotent. The user authorizes Coach/Travel Lead to make this withdrawal disposition; it does not grant permission to record external cash/check refunds. Remaining edge decisions: unpaid or partly paid event charges, and whether returned available funds should immediately auto-apply to other outstanding charges.
- **External refund recording — confirmed:** giving money back by check/cash or another external method is a separate action, recorded only by an authorized financial editor in the finance area beside `Add funds`/`Record payment`. Proposed label: `Record money returned (cash/check refund)`. Existing financial-editor scope is Coach or Travel Lead with the separate financial-edit grant. This entry reduces funds held for the student; the app does not transfer money. Preserve original payments and internal event-credit reversals, appending the payout entry rather than rewriting history. Proposed required fields: amount, date, reason, method/reference; derive actor and timestamp server-side. Validate available refundable funds, allocation effects and duplicate submissions. Do not display an approved event-credit reversal as an external refund awaiting payment. Restricted fundraising-credit payout eligibility remains open.
- **Attendance:** future separate clock app/subdomain, common Convex backend. Use account email for initial matching, stable student/account IDs thereafter; do not expose health/finance data to clock-only capabilities. Shared backend means a shared project/deployment contract, not merely both apps using Convex. Separate-origin authentication and aggregated attendance rules remain design work. Do not build clock-in/out UI in Student Status.
- **Account management and retention:** Coach manages application accounts. Archived records retained for 5 years. Proposed start date is archival, pending user confirmation; deletion scope, backups, downloaded exports and any holds must be defined before implementing purge. Do not treat this business retention decision as a legal sufficiency determination.

Confirmed follow-up: unpaid main event/travel balances remain owed unless explicitly cancelled, paid extras are included in the return amount, and the Coach approves final permission/medication wording. Fundraising-transfer authority and detailed form wording remain to be settled. Auto-allocation, funding-source separation, form names, medication choices and archival-based five-year retention have now been confirmed; see the linked decision record. Parent linking, withdrawal payment disposition and separate financial-area cash/check refund recording are now decided. The parent-linking and invitation-control subset was subsequently authorized and implemented; financial, consent, attendance and retention changes above remain planned.

Implement and validate complete vertical slices before widening menus: (1) role-scoped status/event participation, (2) requirement mutations/readiness, (3) charges/credit/audit, (4) rooming/transport, (5) approval/profile/forms, (6) remaining administration. Shared calculations belong in pure domain modules reused by synthetic fixtures and server code, while authorization belongs exclusively on the server.

## Production gates

- Final permission and medication authorization wording/version and retention policy.
- Real multi-account Google OAuth invitation acceptance was rehearsed successfully in development using owner-controlled test identities and a fictional student. Production identity/privacy/consent gates still apply.
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

## Parent invitation milestone — completed for synthetic development

User authorized development of the parent invitation workflow with the proposed defaults: one team-wide Coach toggle enabled by default, multiple parents per student, and multiple students per parent. Scope includes seven-day one-time invitations, matching Google identity, affirmative relationship/authority attestation, automatic linking, Coach exception revocation, and scoped frontend/backend verification. Existing valid invitations and links survive disabling new invitations. Linking does not sign travel or medication consent.

Astra owns project/security review; separate Sol agents own backend/tests and frontend. The integrating agent owns documentation, validation, and Git checkpoints. Email delivery is not configured: initial UI must clearly provide a link to share manually and must not claim an email was sent. Only synthetic data is used; production and main/GitHub Pages publication remain unauthorized. Implementation is complete for synthetic development; final verification evidence follows.


### Parent invitation delivery evidence

Final integration: lint, strict typechecking, all **19 backend tests**, and Vite build pass. Thirteen browser checks cover student/Coach/parent fixture layouts at 390 and 1440 pixels in light/dark plus the missing-token live landing. Real signed-in Coach Join Requests displays the enabled setting and scoped synthetic student selector. Convex development synchronization with typechecking succeeded on third-bandicoot-18. Astra accepted the synthetic-development milestone after final source review. The existing bundle-size advisory remains.

Implemented Coach resolution for revoked invitations and family links; history lists retain actionable older invitations. Server preview/acceptance use authoritative time; acceptance snapshots exact versioned attestation. OAuth redirect excludes the token, using temporary same-tab storage for the round trip. Child lists exclude prior seasons and update after link revocation. No automatic emails are sent.

Live additional-account Google OAuth invitation acceptance was subsequently rehearsed successfully; Google remains in Testing mode. Bounded history/access-list limits and complete production readiness remain documented limitations. No real student records, production deployments, main changes or release tags were created. This milestone is published on feature/parent-invitations in a draft PR based on setup/development-app, leaving the setup PR and live demo unchanged.

### Live invitation rehearsal completed

The real two-account Google OAuth rehearsal passed in development: student join/Coach approval, invitation creation, paused-new-invitation behavior, wrong-account rejection, matching-parent acceptance through Google redirect, one-time replay rejection, reactive Coach revocation and restoration. The fictional student and parent link remain for further testing; new invitations were restored to enabled. Refer to REVIEW.md. Test-account addresses and invitation tokens are excluded from GitHub.

## Human-readable progress guide

See [Development checklist](DEVELOPMENT_CHECKLIST.md) for verified completed work, remaining workflows and user decisions organized into the expected development phases. Keep it current with milestone evidence; it supplements this technical acceptance plan and does not authorize new work or production deployment.

## Active milestone October 12 withdrawals travel and consent draft

Implemented and verified for development on `feature/withdrawals-and-travel`, based on the parent invitation milestone. Astra coordinates shared contracts and performs final review; Sol owners implement withdrawals, transport, and permission drafting in separate files. Root owns schema integration, live routes, verification and Git. No production deployment or main merge.

Scope: reviewed full/partial/no-return withdrawal decisions, source-preserving reallocation and fee cancellation; drivers, vehicle assignments, independent travel, bus/adult counts and towing readiness; read-only permission wording for Coach approval with signing blocked. Complete room-management, cash/check payout recording, fundraising transfers and real consent/export workflows remain separate unless explicitly verified in this milestone.


Verification: 32 backend tests, lint, strict TypeScript and build pass; Astra final source review accepted after fixing stale approvals, archived-event review, bounded-history rollback, old withdrawal bypasses and reenrollment capacity. Development synced to third-bandicoot-18. Live Coach browser checks verified driver/vehicle/settings/independent travel, categorized extra charge with automatic credit application, empty withdrawal queue, and draft form. Source provenance is explicit for new allocations; ambiguous old allocations fail closed for financial review. Approved-withdrawal reenrollment remains blocked until a deliberate new-fee workflow is built. Full multi-account withdrawal rehearsal remains pending. See REVIEW.md and DEVELOPMENT_CHECKLIST.md.

## Timeclock coordination October 12

[Timeclock coordination handoff](TIMECLOCK_COORDINATION.md) records verified current entities, a proposed additive multi-app layout, shared attendance/calendar/auth contracts, single-backend ownership and unresolved policies. Planning only; no Timeclock implementation, schema/folder/account changes or deployment. The Timeclock chat must agree the contract before implementation.

## Timeclock backend foundation — October 12

The owner approved the remaining Timeclock policies. Implemented on isolated `feature/timeclock-backend` from verified coordination baseline `5eacf42`, preserving the original checkout and draft PR stack. Shared schema/attendance/calendar/auth belongs to this integration chat; separate `apps/timeclock/` scaffold only, full frontend delegated to the later Timeclock chat. See [concrete backend handoff](TIMECLOCK_BACKEND_HANDOFF.md).

Astra final source review accepted synthetic development after timing/race/reconciliation findings were fixed. Root checks passed 73 tests, lint/types/build; workspace check/build and both Cloudflare packaging dry-runs passed. Development synchronized successfully. Dedicated read-only Calendar identity configured privately, sharing completed by owner, HTTP200 read verified and deployed minute poll observed successful. Existing roles preserved; Mentor Google sign-in and reactive access after verified provisioning passed. Full UI/reporting/import and production remain pending.

Timeclock integration follow-up: reactive per-student selected-event status and other-event conflicts now have a dedicated minimal query, `timeclockRoster.clockStatus`. Astra reviewed; 77 tests plus root checks passed. Port5174 handed over safely to the frontend chat. Existing synthetic names still require explicit Coach review; no automatic surname inference or live reseeding.

## Operations milestone now in progress — October 12, 2026

Agreed decisions: chronological waitlist order with manual Coach/Travel promotion; student room changes stop at the deadline while adult corrections require an audit reason; financial editors may transfer available fundraising credits to active students within the same season, with a reason. Cash/check refunds are separate recorded payouts from available personal payments.

- [x] Coach structured-name review and Timeclock attendance/correction screens.
- [x] Event approval, ordered waitlist, requirements and rooming workflows.
- [x] Source-preserving payout records, fundraising transfers and readable history.
- [x] Astra final review, 90 automated tests, Coach browser smoke checks, development sync and GitHub checkpoint `d33c701` / draft PR #7. Full multi-role rehearsal remains pending.

Work runs in isolated `student-status-operations` / `feature/student-status-operations`. Timeclock frontend owns its separate worktree and `apps/timeclock`; one Student Status owner integrates shared backend and schema changes. Production, real signatures, automatic deletion and main merges remain outside this authorization.

### Operations implementation evidence

Implemented Coach structured-name review and per-session attendance/correction UI; manual ordered event approvals/waitlist, requirement/deadline editing, private student room invitations and audited adult assignments/finalization; personal-only payout records and same-season source-preserving fundraising transfers. Astra accepted final source for synthetic development. Integrated lint/types/build and 90 tests across 15 suites passed; both app packaging dry runs and preserved Timeclock workspace checks passed. Development sync to the approved personal deployment succeeded. Browser connectivity recovered. Live Coach attendance/name review, payout/transfer forms and event/room workspace smoke checks passed; event/finance phone layouts showed no horizontal overflow. Full live multi-role transaction rehearsal and closed-session correction UI rehearsal remain pending (mutations are covered by automated tests). No production action or real consent enabled. See DEVELOPMENT_CHECKLIST and REVIEW for remaining scope.


## Fictional rehearsal follow-up — October 12, 2026

See [the rehearsal report](REHEARSAL_2026-10-12.md) for the current evidence, superseding earlier pending statements for the live closed-session correction and Coach financial/room/transport checks. Coach, Student and Parent live journeys passed within the documented scope. Fixed duplicate React sibling keys and financial draft leakage between students, preserved payment/charge retry keys, clarified waitlist withdrawal wording, and denied attendance correction writes to archived seasons. Added guarded fictional fixtures and integrated multi-role tests. Full root checks passed 97 tests across 17 suites, lint, strict types and build. Remaining live Travel/Mentor, independent-device, paid-withdrawal and room-invitation journeys are explicitly open; family Attendance still needs implementation. No real records, real signatures or production release.

## Representative design review

Coach authorized one screen before broader corrections. The isolated Coach Readiness candidate uses the existing backend with screen-scoped presentation. All four viewport/theme comparisons, Astra review and local checks are recorded in [READINESS_DESIGN_REVIEW.md](READINESS_DESIGN_REVIEW.md). Coach subsequently accepted this representative screen and authorized the frontend rollout below. Paused backend drafts and production remain excluded.

## October 12 approved frontend rollout

Coach approved representative Readiness and authorized frontend alignment across existing screens. Work runs on `feature/student-status-readiness-design`, draft PR9, excluding paused backend draft ancestry. See `FRONTEND_CONFORMANCE_LOG.md` for implementation, review and evidence limits. Sol agents own separate presentation areas; Astra reviews integration. Whole Team backend semantics, aggregate Coach finance views, missing states and real consent remain separate dependencies. No production or main merge authorization.

### Copy and visual-check follow-up

Live-app copy consolidation and sticky-anchor/empty-state corrections completed with Astra review and101 passing tests. Updated available-role visual checks distinguish scaled viewport evidence from pixel parity and unsupported states. See FRONTEND_CONFORMANCE_LOG.md for the current table and explicit backend dependency list. Legacy fixture-only preview, new backend work and production remain outside this pass.

## October 13 Whole Team decision and context audit

Whole Team includes every active team member; new members joining after creation are automatically included in that event too. This supersedes the suggested creation-time snapshot/manual addition. Agreed only: implementation and verification remain pending separate backend-phase authorization. Inspect event lifecycle, membership and financial interactions before implementation; do not silently invent closed-event or reactivation policy. Start future work with CURRENT_STATE.md; older workspace/pause statements in this plan are historical snapshots.

## October 13 reusable workflow checkpoint

Created the two first-party project skills under .agents/skills and linked them from AGENTS.md. VISUAL_CHECKS.md owns current outstanding visual comparisons; FRONTEND_CONFORMANCE_LOG.md retains dated evidence. No application/backend implementation or new browser verification is part of this checkpoint.

Validation for this workflow checkpoint: both skills passed the skill-creator format validator. Astra read-only scenario review confirmed correct handling of stale worktree instructions, partial/wrong-theme screenshots, unavailable Mentor-only identity and unimplemented Whole Team. No blocking findings; clarified unexpected clipping versus intentional viewport slices. Documentation diff checked; no application tests/browser checks rerun.

## October 13 frontend continuation

Modal/event sections/invitation presentation implemented with existing contracts; staff personal participation labels removed. Both workflow skills used, parallel Sol ownership and Astra source review completed. See FRONTEND_CONFORMANCE_LOG.md and VISUAL_CHECKS.md for scoped browser evidence. Whole Team and other backend dependencies remain unimplemented. Full check100/101 due to expired existing Timeclock fixture; isolated failure confirmed and separately flagged. No production authorization.

## Seven-item goal authorization — October 13

Complete all allowable frontend/backend checklist work to readiness for Coach visual approval. Current integration branch feature/student-status-completion derives from5343092. GOAL_ACCEPTANCE.md maps requirements/evidence without reducing scope. Upcoming-only Whole Team additions confirmed by user. Real wording approval/signing, retention deletion policy, production/main remain gates. Maintain one owner for shared schema/generated/deployment and coordinate Timeclock branch753b236. Local WholeTeam/reporting candidates need scale corrections before acceptance; do not claim fixture-only success as completion.

## Accounts and report integration review — October 13

Whole Team source checkpoint is published; upcoming-only live rehearsal remains pending. Timeclock frontend753b236 is integrated locally through3946b88, with combined Timeclock checks passing. Account setup/corrections/adult management and aggregate-backed finance/attendance are now implemented locally. Final review fixes cover token handling, query fanout and correction queue scaling. Combined145tests/lint/build passed before those fixes; rerun affected checks and review before development sync. Permission signing, administration, full visual matrix and final multirole acceptance remain open in GOAL_ACCEPTANCE.md.

## October 13 administration and live financial continuation

Published fundraiser submit correction04c14d7 and verified Parent gross/travel/available reconciliation. Current charge correction/cancellation and fundraising-to-team slice is in parallel backend/UI implementation with Astra review; generated types and strict typecheck pass. Complete this slice's integrated validation before development synchronization. Shared season-wide fees/priorities, season transition/carryover and retention preview/holds remain required, followed by outstanding live roles and VISUAL_CHECKS. Skills remain mandatory at context and visual checkpoints. No G1–G7 closure or production authorization follows from this milestone.

Charge/team-transfer slice now reviewed, integrated, validated and synchronized to development10:54:14. Proceed with live verification and shared season-wide fee definitions/priorities/custom-fee workflows in separately owned files. Preserve source history and explicit historical-correction restriction; season transition/carryover and retention remain subsequent required outcomes.

October 13 continuation: charge adjustment and cancellation now verified live with fictional records, preserving original amounts/reasons and returning credit to its original source. Fresh rendered Coach Finance comparison identifies primary student table/top action/recent-change structure still required beyond shared fees; Astra contract inventory is in FINANCE_ADMIN_IMPLEMENTATION.md. Sol retention owner is assigned new non-destructive review/hold backend/UI modules; the shared-fee owner remains the sole schema editor and root owns generated/route integration, Git and sync. No deletion, production or main merge.

October 13 permission continuation: live synthetic re-sign request/replacement/acceptance, paper provenance/acceptance and minimized-versus-health exports verified. Retention source review is clear after stale-reactivation/read-budget fixes; route integration and live/visual verification remain required. Shared-fee bulk work uses durable zero-money preparation with immutable paginated scope, review fences and explicit commit; do not mark unfinished contracts accepted. Overall scope estimate remains approximately 74%.

Next parallel slice: finish immutable shared-fee bulk preparation/review/commit; independently complete Mentor/Travel own-profile route from prototype and auth-derived identity. Retention integration is source-ready awaiting coherent development sync. Coach finance table/feed/export contract is now specified in FINANCE_ADMIN_IMPLEMENTATION, including separate applied personal/fundraising totals and fundraising-only Travel account column.


October13: Whole Team zero-fee creation live journey confirmed all six active fictional members. Next G3 proof remains later joining/reactivation and full visual states. Attendance build boundary now follows officially verified FIRST kickoff day automatically (2027Jan9), with unknown years explicit rather than guessed; Outreach classification awaits user response. Isolated season-calendar helper can proceed in parallel with shared fee review fixes and adult profile rereview.

## October 13 administration integration checkpoint

Shared fees, retention preview/holds and Mentor profile/Coach driver reconciliation are source-reviewed and synchronized to development at12:30:56. Full integrated check passed266tests/48files, lint/types/build; final UI recovery13tests and archived enrollment retry1test passed separately. Timeclock usability commit0df2fb1 is integrated as59f58d3 with a root lint-compatible window.innerWidth assertion follow-up. Complete live/visual evidence next; finance team table/change feed/export, historical correction/season carryover and attendance season/category integration remain required. Official kickoff helper is tested but not yet wired to reports. No production or real signatures/deletion authorized.

## October 13 source-separated Finance continuation

Continue the reviewed FINANCE_ADMIN_IMPLEMENTATION contract: Sol owns shared schema and all monetary writer/projection changes; root owns the unmounted Finance table/feed presentation and later integration; Astra reviews each slice before synchronization. The table presentation has four focused tests and source clearance; the feed has two focused tests and review pending. Backend owner reports28focused v4 tests passing, with feed emission/backfill still in progress. No new development sync is claimed. Reviewed SEASON_ADMIN_IMPLEMENTATION is planning only, including the superseding no-family-authorization departure policy. Preserve all G1-G7 acceptance requirements and the single VISUAL_CHECKS queue.

## Completion-first working policy — October 13

The Coach requested explicit protection against minutiae and context churn. Follow COMPLETION_WORKFLOW.md for workflow-sized delivery, blocking-versus-follow-up decisions, convergent reviews, proportionate verification and concise handoffs. Finish connected Finance next; retain all G1-G7 requirements and privacy/production gates. This supersedes habits of fragment-sized repeated reviews and per-step narrative updates, not required acceptance evidence.

October13 connected Finance milestone: source-separated table/history and recovery/payment integration reviewed, tested and synchronized to development13:21:10. Fictional account preparation/history/payment reconciliation verified. Next complete scoped export and remaining financial workflows while independent season-link migration proceeds; retain visual/role acceptance queue. See CURRENT_STATE and checklist for exact validation limits.

October13 completion-first update: Coach explicitly reduced verification scope to essential risk-based checks and representative visual coverage; exhaustive state/viewport matrices are superseded. Parent season pagination and Coach season draft/roster are source-reviewed and integrating. Family-link maintenance is live-complete with zero unresolved links. Finish full season transition/carryover and outstanding financial/attendance workflows; use CURRENT_STATE for the checkpoint.
