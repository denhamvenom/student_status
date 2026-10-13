# Student Status Development Checklist

Updated October 13, 2026

### Current completion status

G3 (Whole Team functional enrollment) is complete after Astra review. Published source/evidence checkpoint: 80815b0; latest development sync15:54:24. Finance, season, supported historical corrections, selected export and retention/lifecycle rehearsals are complete within their recorded scope. G1, G2 and G4–G7 remain open for remaining account/role journeys, representative visual comparisons and final integrated review. Coach and Parent sessions are accessible; Student and ordinary Mentor sessions still need browser connection. The hosted prototype renders, but its version must be reconciled with the immutable design reference. See CURRENT_STATE.md and GOAL_ACCEPTANCE.md. Production, real signing and deletion remain gated.

### Latest decisions and active work

- [x] Agree: build season begins automatically on the official FIRST kickoff calendar day (America/Chicago). Kickoff phase reporting is implemented, reviewed and synchronized; scoped Parent report readiness is live-verified.
- [x] Implement and source-review shared fee priorities, historical identity review, immutable bulk scopes, recovery controls, Mentor profile/driver ownership review, and retention preview/holds. Synced to development October 13 at 12:30:56 after lint, types, 266 tests and build passed; final enrollment retry guard passed its targeted regression.
- [ ] Complete essential live rehearsal and representative visual checks for the newly synchronized administration/profile controls. Implementation and source clearance do not close this item.
- [x] Integrate reviewed Timeclock dialog focus and narrow-screen fixes; its local lint/types/build pass. Live Group race and physical-device evidence remain open.

- [x] Agree: fundraising reductions affecting spent/transferred credits wait for Coach resolution without changing balances (October 13).
- [x] Agree: reactivation followed by another archive restarts five-year retention from the latest archive date; automatic deletion remains unauthorized.
- [x] Implement and source-review the latest-archive clock with before/after audit evidence; 13 focused account/profile tests pass; development synchronization is complete. Live archive/reactivation/rearchive checks remain pending.
- [ ] Complete the ordinary Mentor-only Google rehearsal using the newly supplied owner-controlled test account. Identity and role assignment remain to be verified; account details stay outside this checklist.
- [x] Implement, review and publish materialized financial balances, bounded allocation jobs and fundraiser posting; development sync and fictional posting/rebuild are verified. Remaining financial workflows and live cases are listed below.

The app has a working foundation, Google sign-in, and a tested parent-invitation process. Several other features have working pieces, but the full app is not ready for real student records or public launch.

This checklist is the plain-language progress guide. The phases below show the recommended order of remaining work, not promised delivery dates. Some independent work can happen at the same time.

**How to read it:** A checked box means the specific step is complete. For software, that means implemented and verified within our development environment. Items explicitly labeled Agree record a confirmed decision, not a built feature. An unchecked box means work remains. All testing so far uses fictional student information, including tests with owner-controlled Google accounts.

## Phase 1 Establish the foundation

**Status: Completed for development.**

- [x] Preserve the original prototype and handoff files.
- [x] Create a separate development app with the agreed React, TypeScript and Convex stack.
- [x] Apply team branding and support phone/desktop layouts and light/dark appearance.
- [x] Connect the development database and Google sign-in.
- [x] Establish server-side checks for account roles and access to student information.
- [x] Connect GitHub, preserve the old demo, and exclude secrets and local build files.
- [x] Establish focused commits, draft pull requests, review notes, and ongoing project documentation.
- [x] Make the privacy rule explicit: student records never belong in GitHub, whether public or private.
- [x] Prepare Cloudflare hosting configuration and verify local packaging without publishing.

**Still separate:** Production hosting, production accounts and release approval belong to Phase 8. The existing public demo remains unchanged.

## Phase 2 Connect students and parents

**Status: Parent invitations completed and tested; wider account setup still needs work.**

- [x] Let students sign in with Google and submit a team join request.
- [x] Let the Coach approve a student account.
- [x] Let a student create a parent invitation for a specific email address.
- [x] Require the parent to use that Google email and confirm their relationship and authority.
- [x] Make invitations single-use and valid for seven days.
- [x] Support multiple parents per student and multiple students per parent.
- [x] Add the Coach's Allow new parent invitations control in Join Requests.
- [x] Preserve outstanding valid invitations and existing parent access when new invitations are paused.
- [x] Let the Coach revoke access, restore it, and resolve invitation problems.
- [x] Test the real Google sign-in round trip with separate student and parent test accounts.
- [x] Verify wrong-account rejection, used-link rejection, and immediate loss of student views after revocation.
- [ ] Finish first-time student profile setup, including required fields and initial rooming-category rules.
- [ ] Finish account corrections, archived-student matching and reactivation workflows.
- [ ] Build the complete adult invitation and role-management screens.

**Current invitation delivery:** The student copies and shares a link. The app does not send email. Parent linking does not sign any permission or medication form.

## Phase 3 Complete events and financial handling

**Status: Withdrawal requests, reviewed internal returns and categorized charge entry are implemented and tested for development. Other finance workflows remain.**

- [x] Connect basic event creation, event views and selected participation actions to the database.
- [x] Connect basic payment recording and financial summaries.
- [x] Connect FIRST requirement completion and readiness updates.
- [x] Finish signup approval, chronological manual waitlists, deadline editing and custom requirement editing.
- [ ] Finish broader required-event assignment and a complete end-to-end event rehearsal.
- [x] Build the student withdrawal request and Coach or Travel Lead decision screen.
- [x] Implement Approve withdrawal and return payment to available funds.
- [x] Implement Approve withdrawal and retain non-refundable payment, with a clear note.
- [x] Implement partial return of event payments, showing how much was paid and allowing a return up to the full eligible paid amount.
- [x] Automatically cancel unpaid extra fees, such as an unpaid lunch fee, when withdrawal is approved.
- [x] Implement Deny withdrawal, preserving participation and payment status.
- [x] Release the student's event/room place when a withdrawal is approved, while preserving history.
- [x] Add Record money returned beside payment recording, restricted to available personal payments and authorized financial staff.
- [ ] Finish charge corrections, cancellations, adjustments, payment priorities and financial history review.
- [ ] Finish fundraiser creation and allocation of funds to students.
- [x] Preserve separate personal-payment and fundraising sources through implemented allocations and withdrawal returns.
- [x] Extend source checks to recorded payouts and same-season fundraising transfers.
- [x] Extend source checks to season carryover, including paired amounts, source roots, retries and automatic target allocation; synthetic checks passed. Live cutover remains unverified.
- [x] Add fundraising-credit transfers to an active student in the same season, with reasons and automatic recipient allocation.
- [x] Implement reviewed season carryover and source-preserving recorded moves into team funds. Team-account management is outside scope; no live activation occurred.
- [x] Test withdrawal decisions for duplicate submissions, stale approval, correct balances, source tracking and role restrictions.
- [ ] Test remaining financial workflows as they are implemented.

**Decisions needed before completing this phase:**

- [x] Agree that unpaid main event/travel balances remain owed unless the approver explicitly cancels them; paid extras are included in the eligible return amount.
- [x] Build the explicit unpaid main-fee cancellation choice and record the decision.
- [x] Agree that returned funds automatically pay other outstanding charges in their assigned order.
- [x] Agree to distinguish personal payments from fundraising credits; fundraising credits can transfer to students, carry over or move into the team account. Family cash/check payouts of fundraising credit are not authorized.
- [x] Agree: Coach or Travel Lead with explicit finance permission; active recipients in the same season; reason required.

**Already agreed:** Returning an event payment to available funds is an internal account change. Giving someone money back is a separate financial record. The app records that payout; it does not transfer money.

## Phase 4 Build permission and health forms

**Status: Synthetic signing, Coach acceptance, correction/resubmission, re-signing, paper recording and manifest/health export have live development evidence. Remaining role/grant and representative visual checks stay open; real signing remains disabled pending final wording/products/policy approval.**

- [x] Review the old permission slip as a reference.
- [x] Provide basic profile/health fields for synthetic development testing.
- [x] Keep real permission signing blocked while wording and the workflow are unfinished.
- [x] Agree to name Denham Springs High School and FIRST Team 8044, Denham Venom.
- [x] Agree that permission-form wording includes authorization for minor first aid as appropriate.
- [x] Prepare a read-only [permission and medication draft](PERMISSION_FORM_DRAFT.md) for Coach review.
- [ ] Approve the final permission wording and responsibilities.
- [x] Agree that the Coach approves the final permission wording and medication-administration policy before real signatures.
- [x] Agree on Pain, Allergy and Cold categories, each with Allow / Contact me first / Do not allow; nothing preselected.
- [ ] Define which products/ingredients and exceptions each medication category covers.
- [x] Build and rehearse the synthetic parent form and signature process, separate from account linking. Real signing remains gated.
- [x] Save and verify an immutable synthetic submission snapshot of wording, covered events and signed information, retaining the original through correction/resubmission.
- [ ] Build correction requests, re-signing and Coach recording of paper forms.
- [ ] Add Coach export of permission/health packets.
- [ ] Add the separate Coach-controlled permission allowing a Travel Lead to export those packets.
- [ ] Verify that other roles cannot retrieve restricted health information or exports.

**Important distinction:** Existing health fields are not a completed, approved medication-consent system.

## Phase 5 Complete travel and event readiness

**Status: Drivers, vehicle assignments and transportation readiness are implemented and tested. Complete room management remains.**

- [x] Separate student requirements, transportation and adult room placement in readiness calculations.
- [x] Provide limited room-group and assignment-request actions.
- [x] Finish student room invitations, acceptance, cancellation, leaving and assignment requests, with server-enforced deadlines.
- [x] Finish adult room assignments, moves, finalization and recorded fifth-person exceptions; prohibit six occupants and mixed categories.
- [x] Finish driver and vehicle management, passenger seats and event assignments.
- [x] Add bus seats, independently traveling students, additional adults and trailer/towing requirements.
- [x] Make approved withdrawals release room places and update transportation demand.
- [ ] Finish consistent room updates for other roster changes and adult room actions.
- [ ] Complete the Coach/Travel Lead event workspace and restricted Mentor reports.
- [ ] Rehearse a complete fictional trip from signup through ready-to-travel review.

## Phase 6 Connect attendance

**Status: Shared Timeclock backend and separate frontend are implemented and integrated in development. Family attendance loads; controlled Group-mode concurrency, physical-device and remaining reporting/visual checks remain.**

- [x] Approve the shared policies and keep Timeclock separate from travel fees/participation.
- [x] Prepare an independent Timeclock workspace on port 5174, with one shared Convex backend.
- [x] Restrict operations to active Coaches/Mentors; keep attendance corrections Coach-only.
- [x] Add reviewed first/last-name fields, minimized roster display and a Coach review API without guessing old names.
- [x] Implement individual/group clocking, explicit PIN transfers, duplicate protection and one open interval per student.
- [x] Provide live per-student IN/OUT/no-activity state and other-event conflicts to the Timeclock frontend.
- [x] Implement half-hour extensions, exact server auto-close, schedule changes and cancellations with retained history.
- [x] Derive attendance from one uninterrupted scheduled hour; keep early/extended time separate.
- [x] Add append-only Coach correction and evidence APIs; preserve legacy boolean evidence.
- [x] Connect the dedicated read-only Calendar identity and verify deployed minute polling.
- [x] Verify Google Mentor sign-in at the Timeclock origin and preserve prior Student/Parent roles.
- [x] Pass 77 automated tests, root/workspace checks and both Cloudflare packaging dry-runs; obtain Astra source review.
- [x] Implement Timeclock frontend, including cross-tab console coordination and PIN-protected controls, on separate feature/timeclock-frontend branch (c73a6a3, draft PR #6).
- [ ] Integrate/rehearse the Timeclock frontend with live reviewed synthetic roster names and multiple devices.
- [ ] Complete Coach structured-name review for existing roster records before real clocking.
- [x] Build Coach per-session/student Timeclock summaries, original evidence and correction screens.
- [x] Build the Coach structured-name review screen.
- [ ] Finish broader season attendance reports and family-facing Timeclock summaries.
- [ ] Rehearse the complete multi-device interface with synthetic students.
- [ ] Plan historical Sheets import and expand bounded queries if team scale requires it.

See [the concrete frontend handoff](TIMECLOCK_BACKEND_HANDOFF.md). Student Status family attendance now loads aggregate-backed verified totals with legacy evidence distinguished; remaining rehearsal and visual comparisons are still open. No production release is authorized.

## Phase 7 Finish administration and reporting

**Status: Six-step season administration and read-only archived-season browsing are implemented and reviewed in development. Controlled historical corrections, essential live/visual evidence and broader reporting remain.**

- [x] Connect basic Coach roster edits such as subteam and Travel Team status.
- [x] Agree that the Coach manages application accounts.
- [x] Agree to retain archived records for five years from the date the Coach archives the student account.
- [ ] Finish account/role administration and separate financial and health-export permissions.
- [ ] Finish roster archival, reactivation and correction screens.
- [x] Build the full six-step end-of-season review, balance decisions, mapped new-season profiles, typed confirmation, durable progress/recovery and safe final activation; reviewed synthetic development candidate, not a live activation claim.
- [x] Build Coach-only read-only archived-season roster and held-balance browsing.
- [ ] Complete controlled historical correction handling with warned, reasoned, audited changes.
- [ ] Finish reports and exports with the correct restrictions for each role.
- [ ] Define and implement record deletion after the retention period, including backups and any holds.

**Decisions needed:** Confirm what the five-year policy covers and how downloaded exports, backups, holds and reactivated accounts are handled. The start date is now confirmed as account archival.

## Phase 8 Prepare and approve launch

**Status: Not started as a release. No production deployment is authorized.**

- [ ] Confirm the long-term organizational ownership and administrators for GitHub, Convex, Google and Cloudflare.
- [ ] Confirm the production domain and separate production configuration.
- [ ] Complete the privacy, permission, medication, retention and access policies.
- [ ] Finish all required workflows and replace unfinished placeholder screens.
- [ ] Review access restrictions across every role and sensitive operation.
- [ ] Test complete student, parent, Coach, Travel Lead and Mentor journeys on phone and desktop.
- [ ] Compare every completed role view against the preserved original design prototype: navigation, layout, typography, purple/gold branding, logos, spacing, controls and interaction states on phone/desktop and light/dark themes.
- [ ] Record intentional design differences, correct unintended visual regressions, and obtain Coach review of the polished interface before launch.
- [ ] Address remaining usability, accessibility, loading/error handling and performance issues.
- [ ] Review current limits on financial-history entries, invitations and parent links against expected team usage; expand them safely where needed.
- [ ] Establish monitoring, backup/restore testing and a rollback procedure.
- [ ] Plan the transition from the existing GitHub Pages demo before merging changes that affect it.
- [ ] Obtain explicit approval for production deployment.
- [ ] Publish an approved version with release notes, then perform a controlled launch check.

## How we will work through each phase

- [ ] Confirm the phase's rules and any unresolved decisions.
- [ ] Have Astra manage or review major work; use Sol agents for independent implementation tasks.
- [ ] Build a complete usable workflow, including errors and permission checks.
- [ ] Test with fictional records, including attempts that must be rejected.
- [ ] Complete review and address findings.
- [ ] Commit and verify the GitHub push; update the pull request and this checklist.
- [ ] Demonstrate the result and identify the next step.

These are repeating steps for each future milestone, not unfinished tasks in the completed invitation milestone. Update this checklist whenever scope or verified status changes. Keep account emails, student records, tokens and secrets out of it.

## Current evidence and next step

The October 12 fictional rehearsal and later follow-up passed 101 automated tests across 18 files, lint, strict types and build. Live Coach, Student and Parent checks verified approval/manual promotion, waitlist withdrawal with reactive parent updates, fictional personal payout/fundraising transfer, room finalization, vehicle capacity, and Timeclock automatic closure plus an audited correction preserving the original. Later ordinary Mentor and Travel Lead checks verified limited navigation, read-only finance and a saved transport adjustment. See [the rehearsal report](REHEARSAL_2026-10-12.md) for the exact coverage and fixes.

**Current priority:** Frontend work resumed; complete remaining role/state checks in VISUAL_CHECKS.md after the modal/section/invitation checkpoint. Representative screen and frontend rollout were approved; remaining conformance and evidence gaps are in FRONTEND_CONFORMANCE_LOG.md. Whole Team includes every active member and automatically includes later joiners in upcoming events (implemented and regression-tested; remaining live/visual evidence pending). See CURRENT_STATE.md for scope and boundaries.

Current frontend publication is draft PR #9 on feature/student-status-readiness-design (verified baseline 43a254b before the context audit). PR #7 is the earlier operations milestone. Timeclock remains separately coordinated. No main merge or production deployment is authorized.

## Operations milestone checkpoint — October 12, 2026

Agreed decisions: chronological waitlist order with manual Coach/Travel promotion; student room changes stop at the deadline while adult corrections require an audit reason; financial editors may transfer available fundraising credits to active students within the same season, with a reason. Cash/check refunds are separate recorded payouts from available personal payments.

- [x] Coach structured-name review and Timeclock attendance/correction screens.
- [x] Event approval, ordered waitlist, requirements and rooming workflows.
- [x] Source-preserving payout records, fundraising transfers and readable history.
- [x] Astra final review; 90 tests across 15 suites; lint, types, builds and packaging checks; development sync.
- [x] Smoke-check live Coach attendance/name review, payout/transfer forms and event/room workspace after browser connectivity recovered; event/finance phone layouts have no horizontal overflow.
- [x] Rehearse live Coach/Student/Parent waitlist withdrawal and reactive family status.
- [x] Rehearse a closed Timeclock session and audited correction while retaining original evidence.
- [x] Rehearse fictional Coach payout/transfer, room assignment/finalization and transport capacity.
- [x] Add integrated role/finance/withdrawal tests and guarded fictional fixture creation.
- [ ] Finish live paid-withdrawal, student room-invitation, broader Travel/Mentor and independent-device journeys; automated coverage is not live acceptance.
- [x] Publish and verify implementation checkpoint `d33c701` on `feature/student-status-operations`, draft [PR #7](https://github.com/denhamvenom/student_status/pull/7), based on `feature/timeclock-backend`.

Work runs in isolated `student-status-operations` / `feature/student-status-operations`. Timeclock frontend owns its separate worktree and `apps/timeclock`; one Student Status owner integrates shared backend and schema changes. Production, real signatures, automatic deletion and main merges remain outside this authorization.

Timeclock parallel handoff: frontend owner reports Astra review, 34 synthetic intercepted-browser scenarios, 77 baseline backend tests, root/workspace checks and packaging dry run passed. This evidence is owner-reported; full live multi-device rehearsal remains pending. Student Status operations does not modify apps/timeclock.

### Same-day Mentor and Travel Lead follow-up

- [x] Ordinary Google-signed-in Mentor created a three-minute fictional Timeclock event and clocked a fictional test student in and out; Student Status showed limited Mentor navigation.
- [x] Apply the owner-authorized, audited development Travel Lead grant to that existing Mentor without financial editing; verify reactive navigation, no Coach Attendance or Users & Roles entry, and no finance payment or payout controls. Returning to Timeclock kept Mentor access and showed the fictional session auto-closed; screenshot evidence stayed outside Git.
- [x] Load Travel Lead event, transport and room controls; save fictional additional-adult demand from zero to one and back, observing four seats for three riders and then four seats for two riders.
- [x] Rerun the full local check outside the Windows sandbox after its known Vitest temporary-file failure: 101 tests in 18 files, lint, types and build pass.
- [ ] Rehearse paid withdrawal, student room invitation, PIN-protected Timeclock actions and independent-device conflict handling live.

## Design alignment audit — current priority

- [x] Agree that features added after the prototype must follow its overall design system and look and feel, while preserving approved product requirements.
- [x] Preserve unfinished local development in local checkpoint `d47d85d`, tagged `pre-design-fix-2026-10-12`; not published or release validated.
- [x] Extract and inventory the read-only design reference; identify its version and reference conflicts. `design-reference/` is ignored and preserved unchanged.
- [x] Consolidate visual comparisons for available Coach, Student, Parent and Travel screens at phone/desktop in both themes, with Astra review and parallel Sol image review. The report explicitly distinguishes valid observations, invalid captures, unimplemented screens and unavailable states; this is not visual acceptance.
- [x] Complete `design-drift-report.md` with role/state coverage, prioritized findings, added-feature styling guidance and separate functional dependencies.
- [ ] Close remaining evidence limits during correction verification: ordinary Mentor-only account, active room invitations/paid withdrawal, multiple linked children, invitation variants, and invalid Student Parents desktop captures. No permissions or domain records were changed to manufacture those states.
- [x] Coach authorized representative corrections and then approved wider frontend rollout.
- [ ] Implement approved shared labels, tokens/components and screen corrections; preserve backend and access rules.
- [ ] Recompare corrected screens, document intentional differences and obtain final visual review.
- [x] Append design-conformance instructions to existing AGENTS.md.
- [x] Publish and verify the broader reviewed frontend checkpoint `2bb7eee` in draft PR9.

No backend work, Timeclock changes, real consent, production deployment or main merge is included in this design task. Newer features without an exact prototype screen inherit its typography, colors, spacing, layout patterns and component states; do not invent a separate visual style.

## Representative design review — Coach Readiness

- [x] Coach authorized one representative screen, then review before wider rollout.
- [x] Prepare Coach Readiness at 390px and 1440px in both themes, with explicit existing-data limitations.
- [x] Validate four visual comparisons, navigation/event selection/keyboard behavior, Astra review, lint/types, 101 tests and build. See [the representative review](READINESS_DESIGN_REVIEW.md).
- [x] Coach approved representative Readiness and authorized applying its design across the app.

This branch excludes paused backend drafts and earlier broad frontend drafts. No backend, Timeclock or production changes are authorized.

Representative Readiness checkpoint `ed69bbb` is published and verified in draft [PR #9](https://github.com/denhamvenom/student_status/pull/9). Coach approved the representative screen; broader conformance verification is in progress.

## Approved frontend rollout — October 12

- [x] Coach approved representative Readiness and authorized frontend conformance across the app.
- [ ] Complete existing-data presentation and verify role/viewport/theme coverage.
- [x] Update [the work log](FRONTEND_CONFORMANCE_LOG.md), evidence limitations and Git checkpoints for this implementation pass.

Backend-dependent gaps remain separately deferred; no production action is authorized.

### Frontend implementation checkpoint

- [x] Implement shared role shell, reference copy helpers and consistent Base UI tokens/controls.
- [x] Implement existing-data presentation changes for Status, Finances, roster, event setup/workspace, Drivers, invitations, permission draft, attendance, rooms and withdrawals.
- [x] Astra final source review and full check: 101 tests, lint, strict types and build. Cloudflare dry run packaged successfully without upload (optional sandbox log-write warning).
- [x] Compare New Event audience at phone/desktop in both themes; verify open-capacity control, six-step navigation and Cancel without saving.
- [ ] Finish remaining role/state/theme checks in VISUAL_CHECKS.md. Live-app shared-label extraction is recorded complete in the later conformance follow-up; inspect specific residual copy during checks.
- [ ] Coach final visual acceptance of the broader app.

### Copy and responsive verification follow-up

- [x] Consolidate live route, role navigation and operation wording into shared copy modules; preserve domain values and later approved policies.
- [x] Add Status All events link, missing-subteam fallback and roster no-matches state.
- [x] Correct 4px small-control corners and verify event anchor offsets below sticky navigation at phone/desktop.
- [x] Review additional Student/Parent layouts, desktop driver forms and lower finance controls; record exact capture/state limits in FRONTEND_CONFORMANCE_LOG.md.
- [x] Astra final source review and complete local check: 101 tests, lint/types/build pass.
- [ ] Finish restricted/unavailable-state rehearsals and remaining viewport slices; full pixel parity and final Coach acceptance are not claimed.
- [ ] Resolve flagged backend dependencies in a separately authorized phase.
- [x] Publish and verify follow-up checkpoint `d43fac3` in existing draft PR9.

- [x] Review dark event transport/rooming viewport slices and clarify completed-room Finalized action while preserving required re-finalization.


## October 13 context checkpoint

- [x] Agree: Whole Team includes every active team member, including automatic inclusion when new members join after event creation.
- [ ] Implement and verify that rule after backend-phase authorization; inspect lifecycle and financial interactions first.
- [x] Audit context recovery, add CURRENT_STATE.md, correct stale approval/current-branch/startup guidance, and distinguish historical reports from current status.
- [x] Create repository-local context-checkpoint and prototype-verification skills; validate their SKILL.md format.


## October 13 workflow checkpoint

- [x] Route future agents to the two tracked project skills through AGENTS.md; vendor skill bundles remain ignored.
- [x] Consolidate outstanding comparisons in [VISUAL_CHECKS.md](VISUAL_CHECKS.md); older conformance matrices remain historical evidence.
- [ ] Complete the remaining checks in that table. Consolidation does not count as new browser verification or Coach acceptance.

Shared live-app copy extraction is recorded in the October 12 conformance follow-up. Earlier broad shared-label migration tasks are superseded by that evidence; future checks should identify specific residual literals rather than repeat the completed migration. Legacy fixture-only preview remains outside this live-app pass.


## October 13 frontend alignment checkpoint

- [x] Use both project skills; Sol implements separate files and Astra accepts final source review.
- [x] Implement reference-sized New Event modal, collapsible event sections and invitation sharing/accepted confirmation; preserve backend contracts.
- [x] Review final Basics modal phone/desktop light/dark, Cancel/Escape focus, section expansion/anchors and additional driver/finance slices.
- [ ] Finish remaining cells in VISUAL_CHECKS.md, including invitation success and date-entry/submission rehearsal. No whole-app parity claim.
- [x] Historical visual-pass follow-up resolved: expired Timeclock fixture corrected; final October13 integration suite126/126 passes.
- [ ] Authorize a local QR dependency if QR sharing is required; no remote token-sharing service or fake QR added.

No production deployment, main merge, real consent or domain-record mutation occurred in this visual pass.

## Active seven-item completion goal — October 13

User authorized completing all allowable frontend/backend work through readiness for visual approval, with Astra/Sol parallel work and Timeclock coordination. See GOAL_ACCEPTANCE.md. This supersedes earlier frontend-only implementation boundaries for this goal, while privacy, real-signing approval, no production and no main merge remain.

- [x] Confirm later Whole Team additions apply only to upcoming events.
- [x] Fix existing expired Timeclock test with scoped fixed clock; isolated concurrency test passes.
- [ ] Complete Whole Team integration/scale review/dev verification; local fixtures alone do not close item3.
- [ ] Complete report/query UI and scalable team/attendance summaries; null gross-raised data is not completion.
- [ ] Integrate Timeclock frontend checkpoint753b236 and its sanitized rehearsal evidence on completion branch.
- [ ] Complete remaining requirements G1–G7 in GOAL_ACCEPTANCE.md; explicitly announce each only after full evidence.

### October 13 enrollment and reporting integration (local)
- [x] Implement Whole Team creation snapshot and durable one-member enrollment with atomic fee/cursor rollback and Coach retry.
- [x] Verify upcoming-only activation, preserved prior participation, 500-member creation and 100-upcoming-event financial batching in focused synthetic tests.
- [x] Guard participation, finance, rooms and transport while enrollment is unfinished; show enrollment progress instead of false readiness.
- [x] Implement per-student finance summaries, resumable coverage-verified rebuild, readable roster counts and Coach rebuild UI.
- [ ] Complete aggregate component and scalable corrected-attendance projections; existing bounded report implementation is interim.
- [ ] Run live development rehearsal and prototype comparisons for new enrollment/report surfaces.
- [x] Publish reviewed integration checkpoint `f52d996`; remote verified and draft PR10 created.

No G1–G7 completion is claimed by these substeps. Real signing, production and main remain gated.

Validation at this incremental checkpoint: lint, strict typecheck, Vite build and22test files/126tests pass. Astra source review accepted; build retains an833KB chunk warning. No new live backend sync or browser acceptance is claimed.

### October 13 next integration wave (historical interim snapshot; superseded below)
- [x] Merge reviewed Timeclock frontend753b236 into completion branch; combined Timeclock lint/types/build pass. No main merge.
- [x] Implement initial profile setup, locked room category, revision-checked ordinary edits and Coach correction requests; frontend integration present locally.
- [x] Implement verified adult invitation and role/grant backend; frontend work in progress.
- [ ] Finish reviewed aggregate and attendance worker integration, including failure rollback and request bounds.
- [ ] Verify account/profile/adult invitation screens against prototype and exercise synthetic live journeys.
- [ ] Complete permission signing/receipts/corrections/export behind real-signing gate; current first account slice does not close G5.
Interim synthetic regression suite135/135 passed before final attendance worker tests. At that interim snapshot the wave was not yet published or live-synchronized; the reviewed account/report checkpoint below supersedes this status.

Review checkpoint: combined lint/build and145/145 tests across25files passed before final review fixes. Attendance page size is now bounded at10; Astra is checking total fanout. Adult invitation fragment/token-free OAuth handling and paginated, duplicate-protected correction requests are being finalized. Source validation does not close live or visual checks.

### October 13 reviewed account/report wave
- [x] Resolve Astra findings: fragment-only adult links/token-free OAuth, duplicate-protected paginated corrections, bounded attendance pagination including expanded native pages.
- [x] Validate152 tests across26files, lint/types/build. Sandbox temporary-file import failure required outside-sandbox rerun; mixed-encoding label fixed. Build retains867KB bundle warning.
- [x] Sync reviewed source to development third-bandicoot-18; aggregate components installed successfully.
- [ ] Exercise live profile/account/report journeys and finish four-combination visual evidence.
- [x] Publish reviewed wave4a9ff62 and verify remote commit; update draft PR10 scope.
No numbered G1–G7 item is complete from this incremental checkpoint.

### Permission workflow slice (reviewed and development-synchronized)
- [x] Add reviewed additive schema for exact wording versions, prepared drafts, immutable submissions, event coverage and signature requests; preserve paper signer/recorder distinction.
- [x] Implement development-only fictional consent fixture and explicit verified test-Parent linkage; 6 tests pass for provenance, safe retries, wrong-deployment denial, rejected identity adoption, verified-account requirements, and no revoked-access restoration. Reviewed and synchronized to development October 13.
- [x] Integrate permission backend/UI, authoritative readiness coverage, electronic fixture linking and negative-access/snapshot tests. Combined backend suite169/169 and frontend export suite5/5 pass; Astra backend/UI source review clear.
- [x] Review, lint, typecheck, build and synchronize to development at08:45 October13; real signing stays blocked. Bundle warning is917KB.
- [ ] Complete live synthetic signing, receipt, correction/re-signing, paper and export rehearsal and four-combination prototype checks.
Parent Status/Attendance live pages now load in the user-opened browser. Coach rebuild discovered4sessions; Parent verified totals and individual session minutes now load. This is live behavior evidence with a private screenshot, not completed four-combination visual comparison. Shared family copy encoding corrected.
- [x] Pass full bun run check with174tests/29files; complete live fictional Parent form submission, Coach acceptance and reactive receipt status. Empty event selection rejected; all medication choices initially unselected. Correction/re-sign/paper/export and visual matrix remain open.
- [x] Publish and remotely verify permission checkpoint11d04d2; update draft PR10. Final badge-only CSS correction verified in the live receipt screenshot after the full check.

### Active financial integration evidence — October 13
- [x] Verify focused reader behavior: pending financial jobs withhold totals; older charges/history remain paginated and access-controlled beyond 500 ledger entries.
- [x] Verify focused report rebuild and application boundaries against the new financial projection contracts.
- [ ] Finish and review every financial writer, durable operation, fundraiser posting/correction/history and all related regression migrations before full validation and development synchronization.
- [ ] Rehearse these financial changes live and compare their finished screens to the prototype in all required viewport/theme combinations.

### October 13 financial integration verification update

- Whole Team regression coverage passes 10/10 with rebuilt source balances and scheduled allocation across 100 upcoming events.
- Full serial suite reached 187/193 passing across 34 files. Six failures identified legacy financial fixtures in withdrawal and travel tests; this is not a passing full checkpoint. Travel fixture migration subsequently passed with financial-reader and app tests (17/17 combined). Withdrawal migration remains assigned to the financial implementation owner.
- Astra review identified immutable retry identity, partial-operation audit accuracy, and gross-only fundraising timestamps; corrections are in progress. Readiness now refuses to claim completion when event evidence exceeds its supported read bound. Financial detail queries cap native page read budgets.
- Development client type generation succeeded. Financial application synchronization, reviewed Git publication, live financial rehearsal and prototype visual comparison remain pending. G1–G7 remain open.

October 13 10:00 update: all 194 tests across 34 files, lint, strict types and build passed. Withdrawal and travel fixture migrations are now verified. Financial code is awaiting final Astra review, development synchronization and live/visual rehearsal; none of G1–G7 closes on automated evidence alone. Subsequent finance first-page loading guard passed typecheck and scoped lint.

October 13 10:08 publication/live update: financial checkpoint b66450d is verified on the remote development branch and synchronized to dev:third-bandicoot-18. Astra cleared the incremental source review. The additional fundraising grant-revocation regression passes (four fundraiser tests). Corrected fictional permission replacement accepted by Coach and reflected as Accepted in Parent coverage/history. Original corrected receipt remains separate. Re-sign/paper/export, financial rebuild/rehearsal and visual matrix remain open.

Progress estimates toward visual-approval readiness (scope estimates, not checked-box arithmetic): G1 85%, G2 55%, G3 90%, G4 85%, G5 80%, G6 55%, G7 50%; approximately72% overall. All seven outcomes remain open.


October 13 follow-up: missing-account finance preparation fix passed eight backend tests, UI preparation guards passed typecheck/lint, and development sync succeeded10:21:13. Team overview now includes genuine Gross Raised and incoming transfers; pending fundraiser source reversal progress is explicit. Seven focused UI tests pass. Live Coach rebuild verification and follow-up publication remain pending.

October 13 live financial rebuild now verified: Coach can open Finances, start report rebuild and view loaded synthetic totals/history. Unknown legacy gross proceeds remain explicitly unavailable. Remaining: actual fundraiser posting/held-retry browser journeys and phone/desktop light/dark comparison; administration/season/retention work remains open.

### October 13 progress report during parallel administration work

- [x] Publish and remotely verify financial recovery checkpoint `f9282db`.
- [x] Rehearse fictional fundraiser posting in the Coach browser: $10.01 gross produces $2.51 team proceeds and $7.50 student travel credit; one committed, zero held, completed history visible.
- [x] Identify and locally fix the fundraiser posting form's missing explicit submit type; scoped lint passes and the posting journey succeeds. This fix is not yet a published checkpoint; retry behavior remains to be rehearsed.
- [ ] Complete parallel charge correction/cancellation and fundraising-to-team implementation, focused tests, Astra review and integration. Current source changes are work in progress, not synchronized or accepted.
- [ ] Finish shared fee priorities, season transition/carryover and retention preview/holds, then remaining live role and visual evidence.

Checklist-linked estimates remain G1 frontend 85%, G2 visual evidence 55%, G3 Whole Team 90%, G4 dashboards 85%, G5 accounts/permissions 80%, G6 administration 55%, G7 final verification 50%: approximately 72% toward readiness for user visual approval. These are scope estimates, not checkbox counts or production readiness. All seven broad outcomes remain open. Ordinary Mentor verification still requires the authorized test account's onboarding/sign-in; real signing, production, main merge and automatic deletion remain gated.

October 13 continuation: fundraiser submit fix published and remotely verified as04c14d7. Parent live view reconciles gross raised1001 cents, travel share750 cents and available fundraising750 cents; team portion does not enter student balance. Phone dark top inspected at390x844; remaining themes/lower states stay open. Current charge/team-transfer types generated and strict typecheck passes; source review/tests remain in progress, no full application sync claimed. Timeclock coordinator notified to continue authorized verification.

### October 13 reviewed charge and team-transfer slice
- [x] Implement source-preserving single-charge adjustment/cancellation with immutable original obligation, bounded release jobs, reasons, history, stale/replay guards and Coach-only corrections.
- [x] Implement fundraising-to-team recording with original-source lineage and explicit team destination; personal payments and gross proceeds are not converted or invented.
- [x] Integrate charge detail/history/progress/retry and exact-cent previews into Finance; preserve readable evidence while balances update and distinguish original versus effective amounts in withdrawals.
- [x] Resolve Astra findings for native pagination, archived-event correction/retry restrictions, exact-cent range/display and source-release progress labels.
- [x] Pass full check216/216 across38files, lint/types/build; final affected backend8 and UI9 tests plus scoped lint pass. Timeclock lint/types/build passes.
- [x] Synchronize reviewed source to dev:third-bandicoot-18 at10:54:14. No production deployment.
- [ ] Complete new charge/team-transfer live journeys and prototype visual comparisons. Shared fee priorities/bulk fees, historical correction mode, season transition/carryover and retention controls remain open; no G1–G7 completion follows from this slice.

### October 13 checklist-linked progress checkpoint

Current estimates toward readiness for user visual approval: G1 frontend 85%, G2 visual evidence 55%, G3 Whole Team 90%, G4 dashboards/attendance 90%, G5 accounts/permissions 80%, G6 administration 65%, G7 final verification 55%; approximately 74% overall. These are scope estimates, not checkbox arithmetic or production readiness. Earlier estimates are historical; all seven outcomes remain open.

- [x] Publish reviewed charge/team-transfer checkpoint `1c55fc5` to the development branch (remote verification recorded at publication).
- [x] Verify a fictional fundraising-to-team transfer live: available credit decreased by the recorded amount, original gross proceeds and earned travel share stayed unchanged, and the operation completed with readable history. This records a transfer; it does not execute a bank payment.
- [x] Verify live charge correction/cancellation and the held fundraising-reduction preview. Durable failed-job retry and remaining negative journeys stay open.
- [ ] Finish shared season fee priorities and bulk fees. Sol backend and UI implementation continue in parallel, with Astra review required before integration/synchronization.
- [ ] Finish season carryover, retention controls, remaining account/permission journeys, ordinary Mentor access and the visual matrix.

Last integrated validation remains 216 tests across 38 files plus lint, types and build at the reviewed charge/team checkpoint; newly developing shared-fee work is not covered by that result. No production deployment or main merge.

October 13 live policy check: a fictional attempt to reduce a previously transferred fundraising award was held at preview. The UI explained that original credit was spent/transferred, disabled posting and retained committed gross/team/travel amounts. This verifies the preventive preview; no held posting job was created and worker retry is not claimed. The draft returned to the committed amount afterward. Private evidence remains outside Git.

### October 13 live charge correction and prototype checkpoint

- [x] Rehearse a fictional fully funded charge reduction and cancellation: original $2.00 preserved, adjustment -$0.75, cancellation $1.25, final effective/applied/due all zero; $2.00 total returned to the same fundraising source and both reasons retained.
- [x] Verify transferred fundraising-credit reduction is held at preview, with posting disabled and committed totals unchanged. This does not claim worker retry coverage.
- [ ] Align Coach Finance with the freshly rendered prototype: primary team-wide student table, grouped record/add/bulk/import/export actions, shared fee order and recent changes. Current aggregate cards and one-student selection are not a substitute for that layout. Source-separated row/report/import contracts remain required.
- [ ] Complete the independently assigned non-destructive retention review and hold workflow; no deletion functionality is authorized.

Overall scope estimate remains approximately 74%; the new successful financial rehearsals do not close the remaining visual/administration scope. Timeclock concurrent Group rehearsal awaits its existing authorized operator sign-in; physical-device testing still needs a reachable approved origin. Sol agents continue shared-fee backend, shared-fee UI and retention modules with separate ownership. Last full integrated check remains the 216-test published checkpoint, not a claim about unfinished new source.

### October 13 permission rehearsal and parallel review checkpoint

Checklist-linked scope estimates remain G1 85%, G2 55%, G3 90%, G4 90%, G5 80%, G6 65%, G7 55%; approximately 74% toward readiness for user visual approval. These are estimates, not checkbox arithmetic or production readiness. No broad outcome is closed.

- [x] Verify a new signature request, Parent replacement submission and Coach acceptance using fictional records; earlier receipts remain separate and unchanged.
- [x] Verify default manifest export omits full snapshots/health, while separately selected health export includes the snapshot. Downloaded files remain private and outside Git. This does not prove every role/grant variant.
- [x] Verify fictional paper recording and Coach acceptance, including distinct signer/recorder, signed/recorded times, record reference and explicit medication choices. Real consent remains disabled.
- [x] Complete incremental Astra source review of retention preview/holds after stale-reactivation and pagination fixes. Owner-reported 11 focused tests, types and lint pass.
- [ ] Mount retention controls, integrate the shared-fee contracts, run combined validation and synchronize reviewed development source before live/visual checks.
- [ ] Complete Coach Finance prototype structure, shared fees/bulk operations, remaining accounts/roles, season carryover and visual matrix.

Shared-fee backend and UI continue in parallel. Bulk preparation will preserve an immutable paginated review scope before committing financial changes. Last full integrated result remains 216 tests at the published charge/team-transfer checkpoint, not verification of the unfinished shared-fee/retention wave.

October 13 follow-up: retention route connected under Coach Admin with a local query retry boundary; Astra integration review clear, 11 focused tests/types/scoped lint pass. It remains unsynchronized and live/visual unverified. Permission exports now show truthful completed collection/download-request feedback, verified live after five collector tests and review. Shared-fee work resumed after usage reset; isolated Mentor/Travel profile completion assigned in parallel. No change to overall 74% estimate.


October 13 visual continuation: restored Parent Attendance metric-card hierarchy and shared child-context bar; source-reviewed, scoped lint/types and4existingreport/draft tests pass. Inspected phone light/dark and desktop dark against rendered reference, plus live desktop light. Rejected stale resized reference capture; full matrix remains open. Explicit remaining report contracts: Offseason/Build-season separation and Outreach categorization. Adult own-profile/reconciliation is now in isolated implementation; fee backend/UI source review underway. Overall estimate remains74%.


- [x] Verify live zero-fee Whole Team event creation through all six wizard steps: all six active fictional students automatically confirmed. Native date entry works through the date control. Later-member live addition and four-combination states remain open.
- [x] Agree build season begins on the official FIRST kickoff day automatically; current2027 date/source verified. Calendar helper implementation assigned; attendance grouping is not yet complete.

Shared-fee Astra review found recovery/mapping/cancellation issues under correction; no source clearance or development sync is claimed for that wave. Adult profile reconciliation/audit fixes are ready for rereview. Production and automatic deletion remain unauthorized.

## Current progress report - October 13, after administration publication

Approximately76% toward readiness for user visual approval. Scope estimates, not checkbox arithmetic or production readiness: G1 frontend85%, G2 visual checks55%, G3 WholeTeam90%, G4 dashboards/attendance90%, G5 accounts/permissions85%, G6 financial/season administration70%, G7 integrated verification60%. All seven remain open. This supersedes earlier progress estimates.

Completed incremental evidence: reviewed fee/profile/retention source published0319966, handoff4beb330 remotely verified; development synchronized12:30:56; full266tests/48files lint/types/build pass, final13UI and1backend focused tests pass. Live explicit historical lunch mapping preserved charge1000/applied100/due900cents and reduced ambiguous queue by one. Mentor profile/retention complete live/four-view rehearsal still pending.

Active: source-separated Coach financial table and change feed backend; table presentation4focused tests pass and Astra presentation review is clear, but it is not integrated/live. Recent-change presentation2focused tests pass; Astra review is pending. Season transition contract drafted. Latest Coach correction supersedes family-authorization requirement: departing funds normally non-refundable; Coach records any team transfer with audit, family can request exception, actual cash/check refund separate. No automatic transfer merely from archiving.

Remaining before visual approval: full conditional phone/desktop light/dark comparisons; later-join/reactivation WholeTeam live check; ordinary Mentor-only access; new fee/profile/retention live workflows; attendance kickoff/category report integration; financial table/feed/export, historical corrections and season carryover; final combined rehearsal and Astra review. Production remains separate.

October 13 scope audit: verified the active goal still explicitly requires all G1-G7 through readiness for user visual approval. Current financial backend work is part of G6 and supports G1/G4; it does not replace the visual queue, role rehearsal, attendance integration or season transition requirements. Sol reports28focused v4 backend tests passing; feed/backfill remains in progress and unsynchronized. Overall estimate stays76%; all seven remain open.

October 13 Finance presentation checkpoint: Astra cleared unmounted table and history components after recording-time progress wording, method-neutral refund wording and actual nullable coverage dates were corrected. Eight focused tests across two files and scoped lint pass13:00:44. Live query integration, full backend review and four-view prototype verification remain open; no G1/G6 closure.

- [x] Rehearse reasoned shared-fee priority reorder with fictional records; confirm new order and unchanged previously applied amounts/team balances. Both ambiguous historical mappings resolved explicitly.
- [ ] Complete shared-fee bulk/held recovery live checks and the required four-view comparisons. The priority rehearsal does not close the full administration/visual scope.

October13 in-progress integration: unmounted Finance wrappers preserve native20-row pagination, independent query recovery and server history-preparation permissions. Eleven focused UI tests pass13:07:01. Wrapper review and backend freeze are pending; no runtime integration claim. Season-scoped identity helpers/tests advance independently under Sol ownership without switching current callers.

October13 integration verification:12focused Finance UI tests pass. Full lint/types pass; integrated tests286/288 with two500-member5-second timeouts. Both files pass isolated21/21; do not call the full suite green or claim build completion. Astra backend findings remain under correction, including legacy-job continuation and complete history coverage. Timeclock season-cutover requirements recorded; no G1-G7 closure.

### Completion-first process adopted — October 13

- [x] Add mandatory completion-first policy to AGENTS.md and docs/COMPLETION_WORKFLOW.md: usable workflow milestones, concrete blocking criteria, batched reviews/tests and less context churn.
- [ ] Deliver the connected Finance workflow and its necessary evidence before optional polish. All seven goal outcomes remain open.

### Connected Finance milestone — October 13

- [x] Integrate the source-separated Coach account table, guarded account preparation, named payment dialog, independent query recovery and readable historical feed with fee identity. Astra batch review clear; synchronized development13:21:10.
- [x] Verify all six fictional accounts prepare without changing balances; historical coverage completes with real timestamps and identified fee-order changes. Verify a fictional one-cent payment updates the row and team totals, with submission/close guards and success feedback.
- [ ] Complete Finance responsive reference comparisons and account-detail action rehearsal; scoped export/import/payment corrections remain required.

Full integrated289tests/54files lint/types/build passed before final refinements; final13UI tests, strict types, scoped lint/build and owner9backend tests after refinement pass. Bundle-size warning remains a follow-up. This completes a connected slice, not G1/G6/G7 in full.

October 13 completion-first batch in progress: scoped Finance export backend and in-memory collector implemented; four collector tests pass. Download UI, consolidated review, live rehearsal and publication remain pending. Finance account/fee sidebar hierarchy updated in source, visual checks pending. Season-link migration is under review; current Parent access has not switched. No G1-G7 completion claimed.

October 13 export integration: CSV/manifest controls connected, including local retry and cancellation. Full lint/types/304 tests/production build pass; build bundle warning remains follow-up. Astra backend/collector review clear and both final UI corrections applied. Desktop dark Finance hierarchy/spacing visually inspected at actual1440x1000; phone/light/lower controls and live export remain pending. Development sync is in progress; no G1-G7 closure.
Development export/link synchronization completed13:42:46. Live migration and export rehearsal remain pending; Parent consumers have not switched.

October13 live Finance export: all six fictional active members prepared; downloaded CSV has four charge rows and exact totals matching the screen (4000cents effective,3101personal applied,899due). Manifest/selected scope/error/cancel live checks remain open. Coach settings now mounts the reviewed-backend family-link maintenance UI; UI review and live migration pending. Season draft/roster UI proceeds in parallel.

- [x] Development family-link maintenance: Coach UI completed both passes with zero unresolved links; Parent consumer cutover remains in progress.
- [x] Finance export manifest rehearsal: all six fictional members retained, including zero-charge members; four charge records reconcile with CSV. Selected scope and remaining visual cells stay open.

Historical 14:04 milestone: October13 Coach direction was to complete functional workflows with essential risk-based verification. Representative visual coverage replaces exhaustive state/viewport permutations; no new test-count target. Season draft/roster source review cleared; integration and remaining transition steps continue.

- [x] Integrate reviewed season-scoped Parent roster/selection/retry and Coach season draft/returning-roster screen. Development sync14:04:07. Lint/types, unaffected suites, corrected invitation suite and build pass. Full season activation/carryover remains unfinished.

- [x] Implement local Timeclock transition guards: pause new sessions, clock-in/transfer/extension/correction and Calendar changes during transition; preserve clock-out and scheduled closure. Affected Timeclock/calendar checks and scoped lint pass. This historical root-only checkpoint preceded the combined season sync recorded below; it does not complete G6/G7.


### October 13 six-step season candidate checkpoint

- [x] Complete all six Coach steps, saved confirmation decisions, source-separated carry/hold/team choices and per-charge carry/write-off reasons.
- [x] Implement durable progress, pre-application return-to-review and resumable application; preserve original student/account/session IDs and historical evidence.
- [x] Integrate automatic target allocation, monetary pair verification, shared writer locks, revocation preservation and Timeclock/calendar cutover fences.
- [x] Astra review the coherent source batch; integrated lint, strict types and 319 tests passed. Build passed after the root encoding correction; development synchronization completed 14:21:33.
- [x] Publish the reviewed season batch: `214cdfb`, pushed and remote verified; draft PR10 updated.
- [x] Narrow live Coach smoke: `/season` loaded six-step navigation and the new-season form, with Save disabled until input. Current `2026–27 Development` remained unchanged; no draft save or activation was attempted.
- [ ] Rehearse the synchronized season candidate with synthetic data and complete representative visual comparison. No live activation has been performed.
- [x] Implement and source-review historical roster/attendance and supported prepared-account charge corrections; published and development-synchronized. Linked balances remain held.
- [ ] Complete scoped live historical-correction journeys and representative visual checks.

These implementation and verification claims do not close G1-G7, authorize production or imply live cutover approval.

### Outreach naming decision — October 13
- [x] Agreed: events with Outreach in their title are outreach events (case-insensitive).
- [x] Connect title-based outreach classification to attendance reporting in local source; review passed. Combined sync/live evidence remains below.

### Published payment/attendance/historical candidate — October 13
- [x] Implement and source-review kickoff-based Offseason/Build reporting with existing weekday rules.
- [x] Implement and source-review Outreach title classification; old unclassified projections require the existing report rebuild.
- [x] Implement and source-review Coach historical attendance correction with expiring access, original evidence, audit and retry protection; focused check verifies report rebuild completes.
- [x] Complete combined validation, Astra source review, publication and development sync for the supported batch.
- [ ] Complete remaining payment/historical live journeys and representative visual evidence.
- [x] Implement, source-review, publish and development-synchronize payment bulk/CSV entry and source-preserving receipt corrections; live entry/correction evidence remains pending.
- [x] Implement, source-review, publish and development-synchronize historical roster name/subteam corrections with Coach-scoped access and before/after audit; live correction evidence remains pending.
- [x] Implement and source-review supported prepared-account historical charge corrections; development sync complete. Linked financial records remain held under the approved contract.

October13 batch verification: integrated lint/types/324tests/build passed, Astra cleared payment/attendance/historical attendance/roster, and development sync completed14:43:39. Publication subsequently completed in `687f2bf`; latest supported follow-up is `ba7477f`. Remaining live/visual evidence is scoped below. No season activation or production deployment occurred.

### Build meeting naming decision — October 13
- [x] Agreed: titles containing Build identify Build meetings; calendar dates distinguish weekdays from Saturdays. Case-insensitive title matching and team-local calendar dates apply.
- [x] Implement/source-review/publish Build weekday/Saturday counts using Chicago calendar dates; development sync 14:54:21 and existing coverage rebuild completed. Outreach remains title-classified; Sunday Build meetings stay separate.

Historical finance candidate: prepared archived accounts without downstream carry/transfer lineage support audited charge correction/cancellation and source-preserving reallocation. Focused checks and Astra review pass; published in `ba7477f` and synchronized at 14:54:21. Linked balances and legacy unprepared projections remain held and are not claimed complete.

October13 historical-finance/Build checkpoint: scoped implementation and Astra review complete; focused checks/types/build pass; development sync14:54:21. Supported archived charge corrections preserve source/audit evidence. Linked financial records remain held under the approved contract, not silently changed. Published in `ba7477f`, remote verified. Scoped Parent report readiness is verified below; remaining payment/historical/season live and representative visual evidence stays open. Prior synthetic signing/resigning/paper/export evidence is accepted and should not be repeated.
- [x] Publish reviewed Build/historical finance checkpoint ba7477f; remote verified and draft PR10 updated.
- [x] Run Coach development attendance coverage rebuild:4sessions processed.
- [x] Observe Parent phase/Build/Outreach cards after coverage rebuild: updated 2:56 PM, loaded without updating/retry. Switching two existing fictional children changed session totals (one-minute rehearsals versus zero). This is scoped report/child-context evidence, not full G4.
- [ ] Verify no-linked Parent context and remaining authorized role journeys; complete representative visual acceptance.

October 13 live season draft rehearsal: all six fictional roster decisions saved, five returning profile reviews saved, reset boundaries saved, one unpaid charge disposition and six available-source dispositions visible in Confirm. No transition activation or financial application yet. Confirmation exposes raw internal choice labels; a bounded shared-copy correction is in progress before visual approval.

Season confirmation wording correction: shared readable labels implemented and browser-verified; scoped lint/typecheck passed and Astra cleared the two-file change. Coach explicitly approved synthetic activation after open-session/lock checks; activation remains pending preflight.

October 13 live season activation completed with explicit Coach approval and clean development preflight (zero open sessions/occupied locks/dangling intervals/financial conflicts). Old season is locked with six preserved historical students; five returners and existing Parent links carried to new season. Held departing sources preserved. Remaining balance/history correction and visual checks still gate full G7 closure.

October 13 readiness/historical checkpoint: future activation now initializes zero financial summaries and empty attendance coverage. Astra cleared both fixes; focused existing transition checks, lint/types/build passed; dev sync completed15:20:40. Current synthetic projections repaired via Coach maintenance. Historical roster correction saved live under timed Coach access; separate current-season profile verified unchanged, then access returned to read-only. Full G7 still requires remaining scoped historical/visual checks.

October 13 payment rehearsal: CSV import recorded one simulated cent with exact account match and All receipts recorded status; team available funds rose by one cent. Receipt correction previewed and saved zero effective value while preserving the original receipt and separate correction history; totals returned exactly to the prior values, no payout. These live G6 substeps are complete. Selected-account export prepared one member and reported download requested; browser download observation timed out and no resulting file was verified, so final download remains open.

- [x] October 13 live historical attendance correction: Coach saved an audited replacement in the archived synthetic season; original interval and earlier correction stayed visible, success disabled duplicate submission, and correction mode returned to read-only. This closes the supported historical attendance rehearsal substep; historical charge correction remains open.

- [x] October 13 Coach roster archive/reactivate controls: implemented using existing backend, scoped lint/types pass and Astra cleared. Live synthetic member archive changed active count 5 to 4; a future zero-fee Whole Team event included four. Reactivation restored active count to five and automatically added the member exactly once to that event. Account sign-in lifecycle and rearchive retention remain separate pending evidence.

- [x] October 13 retention preview/hold rehearsal: rearchived a fictional current-season profile, observed its archive and five-year review date, placed and released a reasoned hold with both audit entries visible, and restored the profile active. Deletion stayed disabled. Existing latest-archive regression evidence supports timestamp-reset semantics; the UI displays calendar dates only.

- [x] October 13 selected-scope Finance export: actual downloaded JSON manifest verified with selected scope, one expected fictional member, zero charges, scope hash and collection bounds. The earlier missing-file claim was a CSV-only search limitation; no export code change or repeat needed.
- [x] October 13 supported historical financial correction: isolated development-only archived fixture, original one-dollar charge retained, effective and paid amounts corrected to ninety-nine cents, one cent released to personal available funds, zero due, no payout. UI reported reconciliation and correction access returned to read-only. Existing transferred-source account correctly refused the same adjustment. Helper guard/idempotency suite five cases, scoped lint/types and Astra review passed; development sync 15:54:24.

- [x] Record the Coach's hosted-reference clarification: use the public prototype for visual styling, preserve added features and later decisions, and flag conflicts instead of deleting functionality. Project instructions now enforce this boundary.

- [x] Finance phone payment action now matches the hosted prototype's full-width primary Record payment treatment; rendered verification and Astra review complete. Existing financial functionality and desktop controls preserved.

- [x] Representative phone-light inspection of lower Finance import/review, source totals, export explanation and history cards completed. No additional financial transactions or tests needed; account-details/sidebar and role boundaries remain separate.
