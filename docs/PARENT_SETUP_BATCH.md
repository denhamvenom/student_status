# Parent setup usability batch

Approved for planning October 14, 2026. **PLANNED — development is on hold until the user explicitly instructs us to begin.** Document approval does not authorize implementation, backend changes, account changes or deployment.

## Purpose and placement

Simplify completion of existing student information for linked Parents. Insert this bounded batch after the completed second-round corrections (cb0d47f) and before final owner visual approval. Preserve original G1–G7 outcomes and valid evidence; do not reopen completed work. No replacement goal is needed.

## Experience

Use the Create Event visual language in a centered full-page card, responsive to phones: clear section heading, progress, Back, Save and continue, and Finish later. This is not a dismissible modal. After sign-in, route linked Parents to the first incomplete applicable section. Complete records go to Home. Multiple students get a simple per-student list: Complete information, Awaiting verification, or Complete. Pending FIRST verification does not trap the Parent in setup.

| Step | Scope |
| --- | --- |
| 1. Student details | Prefill existing values. Allow linked Parents to complete missing parent-editable student information, explicitly including T-shirt size and rooming category. Preserve Coach-controlled fields and existing category choices. |
| 2. Contacts | Existing required parent/guardian and emergency-contact fields. Distinguish each Parent's account information from the shared student's information. |
| 3. Medical | Existing allergies, prescriptions, physician, insurance and related required fields. Explicit None where applicable; conditional follow-up questions only where existing requirements need them. |
| 4. FIRST registration | Brief instructions, official link, and current-season student-specific completion checkbox. Distinguish Parent reported complete from Coach verified. Accommodate eligible adult students signing for themselves. |

Finish with a short saved-information summary and Go to Home. Explain any pending verification or student/Coach-owned task. Do not equate setup completion with travel clearance. Do not introduce an additional blanket legal acknowledgment or new required questions.

## Shared information and saving

- Reuse existing profile fields, validation and completeness rules rather than maintain a competing copy of the profile.
- Save each completed step; show Saved only after a successful save. Preserve entered values and explain a failed save.
- Resume from actual missing information, not a per-parent visited-step counter.
- Skip shared sections already completed by the student or another Parent. Keep existing answers accessible and editable in Profile within authorization rules.
- A later Parent must not silently overwrite newer changes from another session. Use the smallest compatible conflict/reload handling when necessary.
- No linked student remains the existing safe recovery state; no auto-linking or broader access.

## FIRST completion

Store/report completion per student and season; Parent self-report alone does not clear the requirement. Coach verifies against FIRST. Apply the verified requirement to relevant FIRST-event readiness only, not unrelated events. Before implementation, identify how relevant events are reliably designated and how existing completed/unknown records are represented; do not infer verification, bulk-mark records, or retrofit historical clearance silently.

Show an official instructions link and short guidance: Parent FIRST account, My Roles / Parent/Guardian, select or add youth, Acknowledgement Forms / Consent & Release, apply to FIRST Robotics Competition Team 8044 if needed. Existing official guidance also permits youth aged 18 or older to register/sign themselves. Recheck instructions when implementing because FIRST navigation can change. Reference: https://www.firstinspires.org/programs/youth-registration (consulted October 14, 2026).

The minimum durable status and readiness changes may need a small backward-compatible schema/API extension. This is a scoped exception to the earlier no-planned-schema-change statement, not authorization to implement now. Inspect existing capabilities first; do not add a FIRST integration, upload requirement, new permissions or extra verification roles. Consequential authorization/readiness changes receive Astra review.

## Explicit exclusions

Permission-slip review, PDF generation, signing and blanket all-events consent are excluded from this wizard. Existing approved PDF wording/layout, coverage rules, signature requirements and historical receipts remain unchanged and separate. No Medication Choices, extra policies, general redesign, payment changes, Timeclock changes, account reassignment, production deployment, main merge or destructive retention. CSV cents headings remain deferred.

## Implementation sequence — only after start instruction

1. Inspect existing fields/completeness, Parent update authorization and event classification; resolve only necessary gaps.
2. Reuse forms in the four-step full-page flow with saving, resume and multiple-student selection.
3. Implement minimum season-specific FIRST reported/verified status and relevant readiness connection.
4. Perform focused verification, consequential review, update evidence and publish a coherent development checkpoint for owner visual review.

## Finish conditions and verification

- Linked Parents can supply missing T-shirt size, rooming category and all other authorized required information without searching across pages.
- Completed shared information is prefilled/skipped for a second Parent; each Parent's personal account data remains correctly scoped.
- Save/resume, multiple students, save failures and conflicting updates preserve information and clearly explain recovery.
- Self-report cannot masquerade as Coach verification; relevant FIRST readiness reflects verified current-season status. Unrelated event readiness and historical records remain intact.
- The approved PDF and current signing workflow are unchanged.
- Representative phone/desktop visuals match existing components and language. Review changed steps in light/dark, without restarting the whole application review.
- Focused tests cover changed completeness/access, second-parent/resume, multi-student isolation, concurrent-save handling and FIRST verification/readiness. Reuse valid checks; integrated validation once at the completed milestone, repeated only after a relevant failure/fix. No fabricated records or expanded access for convenience.
- Final owner visual approval remains open after this batch. Separate launch gates remain unchanged.
