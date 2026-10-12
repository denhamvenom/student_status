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

**Status: Basic event and payment tools exist. Recommended next development milestone.**

- [x] Connect basic event creation, event views and selected participation actions to the database.
- [x] Connect basic payment recording and financial summaries.
- [x] Connect FIRST requirement completion and readiness updates.
- [ ] Finish event signup approvals, waitlists, deadlines, required-event assignment and requirement editing.
- [ ] Build the student withdrawal request and Coach or Travel Lead decision screen.
- [ ] Implement Approve withdrawal and return payment to available funds.
- [ ] Implement Approve withdrawal and retain non-refundable payment, with a clear note.
- [ ] Implement partial return of event payments, showing how much was paid and allowing a return up to the full eligible paid amount.
- [ ] Automatically cancel unpaid extra fees, such as an unpaid lunch fee, when withdrawal is approved.
- [ ] Implement Deny withdrawal, preserving participation and payment status.
- [ ] Release the student's event/room place when a withdrawal is approved, while preserving history.
- [ ] Add Record money returned beside payment recording for actual cash/check refunds by authorized financial staff.
- [ ] Finish charge corrections, cancellations, adjustments, payment priorities and financial history review.
- [ ] Finish fundraiser creation and allocation of funds to students.
- [ ] Preserve separate personal-payment and fundraising sources through all allocations and returns.
- [ ] Add fundraising-credit transfers to another student, carryover and recorded transfers into the team account. Do not build team-account management.
- [ ] Test all financial changes for duplicate submissions, correct balances and role restrictions.

**Decisions needed before completing this phase:**

- [x] Agree that unpaid main event/travel balances remain owed unless the approver explicitly cancels them; paid extras are included in the eligible return amount.
- [ ] Build the explicit unpaid main-fee cancellation choice and record the decision.
- [x] Agree that returned funds automatically pay other outstanding charges in their assigned order.
- [x] Agree to distinguish personal payments from fundraising credits; fundraising credits can transfer to students, carry over or move into the team account. Family cash/check payouts of fundraising credit are not authorized.
- [ ] Define who can authorize fundraising transfers and any recipient restrictions.

**Already agreed:** Returning an event payment to available funds is an internal account change. Giving someone money back is a separate financial record. The app records that payout; it does not transfer money.

## Phase 4 Build permission and health forms

**Status: Basic profile fields exist; the consent process is unfinished.**

- [x] Review the old permission slip as a reference.
- [x] Provide basic profile/health fields for synthetic development testing.
- [x] Keep real permission signing blocked while wording and the workflow are unfinished.
- [x] Agree to name Denham Springs High School and FIRST Team 8044, Denham Venom.
- [x] Agree that permission-form wording includes authorization for minor first aid as appropriate.
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

**Status: Readiness calculations and limited room actions exist; travel operations are incomplete.**

- [x] Separate student requirements, transportation and adult room placement in readiness calculations.
- [x] Provide limited room-group and assignment-request actions.
- [ ] Finish student room invitations, acceptance, cancellation and leaving a group.
- [ ] Finish adult room assignments, moves, finalization and recorded fifth-person exceptions.
- [ ] Finish driver and vehicle management, passenger seats and event assignments.
- [ ] Add bus seats, independently traveling students, additional adults and trailer/towing requirements.
- [ ] Make roster/participation changes update affected rooms and readiness consistently.
- [ ] Complete the Coach/Travel Lead event workspace and restricted Mentor reports.
- [ ] Rehearse a complete fictional trip from signup through ready-to-travel review.

## Phase 6 Connect attendance

**Status: Integration remains to be designed and built.**

- [x] Agree that clock-in/out belongs in a separate app on another subdomain.
- [x] Agree that both apps will use a shared Convex backend and stable student identities.
- [ ] Define exactly how the two apps share identity and attendance records without sharing unnecessary access.
- [ ] Define meeting types, attendance totals, cancelled meetings and missing/stale-data behavior.
- [ ] Build the separate clock app or coordinate its implementation as a separate project scope.
- [ ] Connect Student Status to the attendance results and test account matching.
- [ ] Verify that attendance-only access cannot retrieve health or financial information.

**Decision needed:** Confirm who will build the clock app and when its data contract will be ready. The attendance values currently displayed are not proof of a completed clock-system connection.

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

The latest code milestone passed 19 backend tests, 13 browser checks, typechecking, lint and build. The later real Google-account rehearsal also passed. Astra accepted the invitation milestone for synthetic development. These results do not certify the unfinished product for production.

**Recommended next step:** Implement the now-defined withdrawal and internal-return workflow. Draft permission wording for Coach approval and independent event/travel tasks can proceed in parallel. Fundraising-transfer permissions must be settled before enabling those separate actions. See [confirmed finance and consent decisions](FINANCE_AND_CONSENT_DECISIONS.md).

For technical detail, see [the implementation plan](PLAN.md), [review evidence](REVIEW.md), and [parent invitation workflow](PARENT_INVITATIONS.md). GitHub currently has [setup PR 1](https://github.com/denhamvenom/student_status/pull/1) and [parent invitations PR 2](https://github.com/denhamvenom/student_status/pull/2), both drafts; this checklist does not authorize their merge.
