# Student Status Development Checklist

Updated October 12, 2026

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
- [ ] Extend source checks to season carryover.
- [x] Add fundraising-credit transfers to an active student in the same season, with reasons and automatic recipient allocation.
- [ ] Add carryover and recorded transfers into the team account. Do not build team-account management.
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

**Status: A read-only permission draft is prepared for Coach review; signing remains disabled.**

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
- [ ] Build the parent form and signature process, separate from account linking.
- [ ] Save an unchangeable copy of the exact wording, covered events and information that was signed.
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

**Status: Shared Timeclock backend implemented and reviewed in development. Separate frontend scaffold is ready; the complete clock interface and reporting screens remain.**

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

See [the concrete frontend handoff](TIMECLOCK_BACKEND_HANDOFF.md). Current Student Status attendance displays remain legacy evidence until its reporting UI is connected. No production release is authorized.

## Phase 7 Finish administration and reporting

**Status: Basic roster controls exist; season administration and exports remain.**

- [x] Connect basic Coach roster edits such as subteam and Travel Team status.
- [x] Agree that the Coach manages application accounts.
- [x] Agree to retain archived records for five years from the date the Coach archives the student account.
- [ ] Finish account/role administration and separate financial and health-export permissions.
- [ ] Finish roster archival, reactivation and correction screens.
- [ ] Build end-of-season review, balance decisions and creation of the next season.
- [ ] Build read-only historical records with controlled correction handling.
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

**Current priority:** Audit design drift against Design_Comparison.zip and obtain Coach approval of the drift report before frontend corrections. Product development and rehearsals remain paused; unfinished family Attendance and Who’s Going changes are preserved locally. Permission wording still needs Coach approval before real signatures. Real consent, health-export permissions, rollover/retention and production readiness remain separate unfinished work.

Current development publication is [draft PR #7](https://github.com/denhamvenom/student_status/pull/7), `feature/student-status-operations`, stacked on `feature/timeclock-backend`. The separate Timeclock frontend is draft PR #6. This integration owner retains shared backend/deployment ownership. No main merge or production deployment is authorized.

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
- [ ] Finish remaining role/state/theme matrix and shared-label migration; see the precise evidence limits in FRONTEND_CONFORMANCE_LOG.md.
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
