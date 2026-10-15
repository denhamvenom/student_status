# Parent and Student setup usability batch

Approved for planning October 14, 2026; Student wizard and initial subteam selection added October 15, 2026. **PLANNED — development is on hold until the user explicitly instructs us to begin.** Document approval does not authorize implementation, backend changes, account changes or deployment.

## Purpose and placement

Simplify completion of shared student information through complementary Parent and Student wizards. Keep this existing filename as the canonical batch document. Insert this bounded batch after the completed second-round corrections (cb0d47f) and before final owner visual approval. Preserve original G1–G7 outcomes and valid evidence; do not reopen completed work. No replacement goal is needed.

## Experience

Use the Create Event visual language in a centered full-page card, responsive to phones: clear section heading, progress, Back, Save and continue, and Finish later. This is not a dismissible modal. After sign-in, route linked Parents to the first incomplete applicable section. Complete records go to Home. Multiple students get a simple per-student list: Complete information, Awaiting verification, or Complete. Pending FIRST verification does not trap the Parent in setup.

| Step | Scope |
| --- | --- |
| 1. Student details | Prefill existing values. Allow linked Parents to complete missing parent-editable student information, explicitly including T-shirt size and rooming category. Preserve Coach-controlled fields and existing category choices. |
| 2. Contacts | Existing required parent/guardian and emergency-contact fields. Distinguish each Parent's account information from the shared student's information. |
| 3. Medical | Existing allergies, prescriptions, physician, insurance and related required fields. Explicit None where applicable; conditional follow-up questions only where existing requirements need them. |
| 4. FIRST registration and Consent & Release | Brief instructions, official link, and a checkbox reporting both FIRST team acceptance and current-season Consent & Release completion. Shared student/season status; only Coach verification clears Competition readiness. Accommodate students aged 18 or older reporting their own completion. |

Finish with a short saved-information summary and Go to Home. Explain any pending verification or student/Coach-owned task. Do not equate setup completion with travel clearance. Do not introduce an additional blanket legal acknowledgment or new required questions.

## Student first-login wizard — added October 15

Use the same full-page card, save/resume and Finish later behavior as Parent setup, with three shorter steps. Route a Student to the first incomplete applicable section; prefill or skip answers already provided by a Parent. Do not repeat Google email entry or ask the Student to re-enter Parent medical information.

| Step | Scope |
| --- | --- |
| 1. About you | Confirm legal/preferred name, grade and date of birth using existing values. Preserve existing protected-name correction rules. Reuse the dateOfBirth in the existing consent profile through a narrowly scoped update; do not create a second birthday field or grant access to the full medical section. |
| 2. Team details | T-shirt size, rooming category and initial subteam selection. Show assigned travel-team membership without making it Student-editable. |
| 3. Parent connection / FIRST | For minors, reuse the existing Parent invitation/linking process or show the existing connection; show FIRST status and Parent instructions only. Eligible students aged 18 or older may access the FIRST invitation and report completion themselves. |

Initial Student subteam choices, in this order: **Build, Electrical, Programming, Machining, Business**. Student chooses one initial subteam when unassigned; an existing assignment is prefilled and is not silently overwritten during setup. Coach can correct/change the assignment or add an assignment for a student who has none. This supersedes the earlier suggestion that only the Coach could make the initial selection. It does not introduce a multi-subteam model or a new taxonomy-management feature. Preserve existing legacy assignments; do not automatically rename Mechanical or bulk-reassign students. Reuse existing Coach controls where possible.

Completion summary distinguishes Student setup from Parent tasks and Competition clearance. A minor can finish their part while Parent contacts/medical/FIRST steps remain outstanding. Event-specific transportation, roommate selection, payments and permission signing stay outside initial setup.

## FIRST invitation and age routing

Coach maintains the FIRST-provided invitation link once per season in team settings, with an optional upload of the FIRST-provided QR image as an alternative. User clarified October 15 that the invitation is a link: there is no separate invitation-code field. Present an Open FIRST team invitation button and a Copy link action; the QR must represent the same invitation. Label it FIRST team invitation to distinguish it from the app's invitation. Do not require a QR scan on the same phone. Missing/invalid invitation has a Contact your Coach recovery message; no automated FIRST integration.

For students 17 or younger, expose the FIRST invitation and completion-report action to linked Parents/guardians, not the Student. The Student sees status and Parent guidance. Eligible students aged 18 or older who can legally sign may receive the invitation and report their own completion. Reuse the existing profile birth date; missing/invalid/future birth dates must not grant adult controls. Enforce recipient/action rules on the server as well as in the UI, without exposing the full medical profile to determine eligibility. Age routing must handle the eighteenth birthday without duplicating the season task. Opening the invitation never marks the task complete; Coach verification remains required.

## Shared information and saving

- Reuse existing profile fields, validation and completeness rules rather than maintain a competing copy of the profile.
- Save each completed step; show Saved only after a successful save. Preserve entered values and explain a failed save.
- Resume from actual missing information, not a per-parent visited-step counter.
- Skip shared sections already completed by the student or another Parent. Keep existing answers accessible and editable in Profile within authorization rules.
- A later Parent must not silently overwrite newer changes from another session. Use the smallest compatible conflict/reload handling when necessary.
- No linked student remains the existing safe recovery state; no auto-linking or broader access.

## Season-wide FIRST requirement — clarified October 14

One combined task per student per season: **FIRST registration and Consent & Release**. Complete only when the Coach verifies BOTH acceptance onto the team in FIRST and the current-season Consent & Release. Parent or eligible adult Student self-report requests verification; it cannot clear readiness.

States: **Needs completion → Awaiting Coach verification → Verified for this season**. A Coach can reopen an incorrect verification; all affected current-season Competition readiness must then reflect the open requirement. Preserve who reported/verified and when. A new season requires fresh verification; do not carry it forward automatically.

Every event whose type is Competition automatically uses this shared requirement, including existing and newly created Competition events. The Coach does not add, enable or complete it separately per event. Missing/unverified status blocks ready/cleared status for participating students, not sign-in, profile access or saving setup. Outreach and Team events do not inherit this automatic blocker; preserve their existing explicit requirements and historical records.

| Surface / role | Planned behavior |
| --- | --- |
| Parent setup and Home | Instructions, shared season status and completion report; no repeated task for another linked Parent after verification. Pending verification allows leaving setup. |
| Student Home | One season task, with what remains or Awaiting Coach verification. Direct minors to Parent guidance; allow students aged 18 or older to report their own FIRST completion. Do not duplicate the action once per Competition. |
| Coach student record | One season-level verification control confirming both team acceptance and Consent & Release, plus reopen/correction handling. |
| Coach roster | Clear shared status so students needing verification can be identified. Reuse existing roster layout. |
| Competition readiness and Reports | Read the same authoritative student/season status for every Competition; no independent event-level FIRST completion toggle. |
| Create Event | Competition automatically includes the requirement; present it as automatic rather than an optional requirement the Coach must remember. |

Current source baseline: events.firstRequired and requirementCompletions keyed by event/student currently drive FIRST readiness in convex/lib/readModels.ts. That is event-specific, not this planned combined season check. Preserve old completions as historical evidence; never silently promote them into season verification. During implementation, reconcile active-event behavior with the new shared status without rewriting historical receipts or inventing completion. Existing firstRequired data may remain for compatibility/non-Competition behavior; Competition enforcement must not depend on that optional flag.

Show an official instructions link and short guidance: Parent FIRST account, My Roles / Parent/Guardian, select or add youth, Acknowledgement Forms / Consent & Release, apply to FIRST Robotics Competition Team 8044 if needed. Existing official guidance also permits youth aged 18 or older to register/sign themselves. Recheck instructions when implementing because FIRST navigation can change. Reference: https://www.firstinspires.org/programs/youth-registration (consulted October 14, 2026).

The minimum durable status and readiness changes may need a small backward-compatible schema/API extension. This is a scoped exception to the earlier no-planned-schema-change statement, not authorization to implement now. Inspect existing capabilities first; do not add a FIRST integration, proof-upload requirement or extra verification roles. Allow only the narrowly scoped Student profile/subteam and age-eligible reporting permissions specified in this batch. Consequential authorization/readiness changes receive Astra review.

## Explicit exclusions

Permission-slip review, PDF generation, signing and blanket all-events consent are excluded from this wizard. Existing approved PDF wording/layout, coverage rules, signature requirements and historical receipts remain unchanged and separate. No Medication Choices, extra policies, general redesign, payment changes, Timeclock changes, account reassignment, production deployment, main merge or destructive retention. CSV cents headings remain deferred.

## Implementation sequence — only after start instruction

1. Inspect existing fields/completeness, Parent update authorization and event classification; resolve only necessary gaps.
2. Reuse forms in the four-step Parent and three-step Student flows with saving/resume, shared completeness and Parent multiple-student selection; implement initial subteam selection and existing Coach correction access.
3. Implement the combined season-wide FIRST task across Parent, Student and Coach surfaces, automatic Competition enforcement, Reports and Create Event; preserve legacy evidence.
4. Perform focused verification, consequential review, update evidence and publish a coherent development checkpoint for owner visual review.

## Finish conditions and verification

- Linked Parents can supply missing T-shirt size, rooming category and all other authorized required information without searching across pages.
- Students complete the shorter wizard, initially choose one of Build/Electrical/Programming/Machining/Business, and retain saved progress. Coach can correct or fill the assignment; legacy assignments and Coach overrides are preserved.
- Parent and Student share the existing birth date and profile values without extending Student access to medical fields. Minor, adult, missing-date and eighteenth-birthday cases route FIRST invitation/report controls correctly.
- Completed shared information is prefilled/skipped for a second Parent; each Parent's personal account data remains correctly scoped.
- Save/resume, multiple students, save failures and conflicting updates preserve information and clearly explain recovery.
- Self-report cannot clear readiness. Both FIRST team acceptance and Consent & Release must be Coach-verified once per student/season; every Competition automatically reflects that status without event setup.
- Parent/Student Home, Coach roster/student record, Competition readiness and Reports agree. Verify-once covers multiple Competitions; reopening blocks them again; next season begins unverified. Outreach/Team behavior and historical records remain intact.
- Existing event-level FIRST completions are not silently treated as season-wide verification.
- The approved PDF and current signing workflow are unchanged.
- Representative phone/desktop visuals match existing components and language. Review changed steps in light/dark, without restarting the whole application review.
- Focused tests cover Student initial-subteam versus Coach correction authorization, legacy assignment preservation, age-based invitation/report access, shared birthday isolation, changed completeness/access, second-parent/resume, multi-student isolation, concurrent-save handling and FIRST verification/readiness: both prerequisites, self-report denial, cross-role consistency, multiple Competitions, automatic new/existing Competition applicability, reopening, season rollover and legacy evidence preservation. Reuse valid checks; integrated validation once at the completed milestone, repeated only after a relevant failure/fix. No fabricated records or expanded access for convenience.
- Final owner visual approval remains open after this batch. Separate launch gates remain unchanged.
