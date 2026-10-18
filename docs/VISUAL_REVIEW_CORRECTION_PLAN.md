# Visual-review correction subplan — October 14, 2026

## Purpose and status

The required correction pass is implemented; owner visual approval remains open. The external review supplies new evidence that supersedes the earlier readiness claim; completed workflows, checks and approved decisions remain valid except where a finding identifies a concrete gap. See VISUAL_CHECKS.md for implemented corrections, retained evidence and optional deferrals. Production deployment is not authorized.

Source: Logistics Work/claude-v2-review/visual-language-review/8044_visual_language_review_2026-10-14.md and its screenshots. Keep the report and account-specific images outside Git. Reviewed the report and representative Team/Readiness screenshots. Its framed phone/light views are useful observations, not proof of actual responsive or theme behavior.

## Reconciled decisions

- Parent invitations currently expire after seven days, matching PARENT_INVITATIONS.md, ARCHITECTURE.md and server code. Preserve seven days; no expiry change based solely on an older brief.
- Request-new-signature currently permits Coach and Travel Lead, matching the later ACCOUNTS_PERMISSION_IMPLEMENTATION.md contract and server operations guard. Preserve the current permission unless the owner explicitly changes policy. Verify UI and server agree, including disabled states; do not treat an enabled control alone as unauthorized access.
- Approved PDF wording/logo/layout stay unchanged. The inspected two-page receipt is the known verbose fictional fixture; ordinary examples remain one page.
- Join/waiting sign-out is already fixed and verified in c9b31de. Do not repeat it.
- User-confirmed PDF/CSV opening and prior Mentor/grant/role rehearsals remain evidence. External review omissions do not erase them. Add a short Mentor wording pass, not a new enrollment rehearsal.
- CSV cents headings remain the user's explicitly deferred post-launch follow-up.

## Batch 1 — Family information and truthful next steps

Findings: S1/S2/S4, P1/P2/P17; shared profile/permission context.

Work:
- Inspect family money query results, not just rendered text. Keep staff-only free-text reasons out of Student/Parent responses; retain complete reasons in authorized staff history and immutable source records. Use family-safe descriptions derived from transaction type, event, amount and disposition. Preserve messages explicitly intended for families, such as a correction request.
- Put To do first on family Home. Include actual incomplete setup/profile requirements and applicable permission obligations, distinguishing actions for the Student from actions for the Parent.
- Never tell families they are all caught up when a required step remains. Identify blocked next steps without inviting a Student to sign or requiring forms for irrelevant/unjoined events.
- Put Balance due first in family Money; make available credit and returns understandable without suggesting a cash payout or changing allocation rules. Add payment instructions only if confirmed by current operating policy.

Finish: the reported incomplete-profile/unsigned-form case gives accurate next steps; a genuinely complete case has an accurate empty state; family history contains no internal staff notes while staff history and financial records remain intact.

Checks: focused server result-minimization test, role-appropriate to-do cases and one representative family browser comparison. No financial arithmetic rewrite.

## Batch 2 — Working navigation, validation and status explanations

Findings: A6/A8, C1/C14/C22/C28/C34/C35.

Work:
- Opening Money account details or an individual report scrolls to and focuses the new heading after it renders; keyboard focus remains sensible when closing.
- Validate New Event required fields before leaving the relevant step and again before submission. Identify the invalid field and focus it. Preserve server validation; check name, valid dates and end-after-start using existing requirements. Do not infer that server creation is broken merely because the reviewer did not submit.
- Distinguish event readiness from profile completeness on Team; do not change readiness rules just to remove apparently contradictory labels.
- Trace Readiness's accepted-form dash through current coverage; show the correct accepted, missing, not-required or unknown meaning. Never infer acceptance from an empty list of missing requirements.
- Reproduce Reports with no event selected; display an explicit selection prompt, distinct from a selected event with nonparticipation.
- Explain open attendance as still in progress and awaiting finalization. Verify closed-session eligibility separately; do not count scheduled minutes automatically or change Timeclock calculations.
- Show references to details below only on pages that actually contain those details.

Finish: each reported interaction has visible feedback, invalid event data cannot advance/submit, and the four reported status combinations are correct and understandable.

Checks: focused existing validation/status tests only where behavior changes; browser account/report focus and empty-event form check without creating an event. Coordinate with Timeclock only if a shared calculation/contract defect is actually found.

## Batch 3 — Plain language appropriate to each role

Findings: A1/A7/A14, P4/P6/P13, C2/C4/C10/C11/C13/C26/C31/C33, T1/T3, plus related inexpensive copy fixes in touched components.

Work:
- Standardize Home, Money and Rooming category across headings/navigation; make abbreviated mobile labels clearly correspond to desktop labels.
- Rewrite family Attendance with ordinary terms (Central Time, earlier checkmark records, still clocked in) while preserving genuine unverified/partial evidence.
- Correct Student/Parent/Coach pronouns and view-only Travel Lead descriptions. Use neutral financial labels such as Fundraising credit where appropriate.
- Simplify Parent profile instructions, required-field cues and insurance/physician questions. Preserve the meaning of stored states: Unavailable must not be relabeled as refusal to disclose, nor may None reported be assumed to mean no insurance.
- Move receipt hashes and technical identifiers behind optional Verification details or out of normal Parent presentation. Preserve verification, immutable evidence, old receipts and approved PDF bytes.
- Rewrite Coach finance priority/history/matching/export help. Preserve source distinctions, repeated-balance cautions, partial-progress warnings and collection time-range limitations in understandable language.
- Replace loaded-members jargon while explicitly retaining the scope limit: for example, filters/export include students currently shown and More students loads additional results. Never claim complete-team coverage when data is partial.
- For custom requirements, first inspect key semantics and existing references. Use an ordinary label/help if a stable short identifier is needed; generate it only if uniqueness and retry behavior can be preserved without changing historical identities.
- Name permission export controls by purpose and disclose file type in secondary text. JSON must not be disguised as PDF/CSV. Determine whether existing PDF/CSV outputs satisfy the actual staff task; if they do not, identify the smallest necessary export before introducing a new format. No blanket export redesign.
- Explain disabled permission controls using the real selection/grant prerequisite.

Finish: reported misleading/technical wording is replaced without changing accounting, permission, medical-profile or export meaning. Review Student, Parent, Coach, Travel Lead and ordinary Mentor once across changed surfaces.

Checks: focused copy/type/lint validation; representative desktop and real narrow-viewport inspection. No new behavior tests for isolated label edits.

## Batch 4 — Verify source-only findings and close review gaps

Source-only section 5 is a candidate list, not proven live defects.

- Trace Medication Choices strings: remove obsolete active controls/instructions; preserve historical receipts explicitly identified as earlier form versions. Do not remove approved first aid or tamper with sealed records.
- Confirm broken ellipsis characters in actual source/rendering and correct if present.
- Map exposed processing codes and internal account IDs to useful labels where reachable. Preserve truthful waiting/failed/partial distinctions; do not label partial work Done.
- Fix required retry-length hints and small accessibility defects in touched screens: accessible Travel Team names, selected-child state and focus return.
- Complete the skipped Mentor wording review with the existing account. Reuse prior finance-grant and no-linked-Parent/room-invitation evidence unless a change affects those paths.

Finish: each source-only concern is marked fixed, historical-only, unreachable or deferred with a reason. Every external report finding has a disposition; no inaccessible-account polling or convenience access expansion.

## Batch 5 — Consolidated review and revised approval candidate

- Maintain a compact finding disposition keyed to report IDs. Fix approval blockers above; group duplicate findings rather than duplicate changes.
- Sol implements. Independent file ownership only; root owns shared LiveApp, backend integration, Git and development sync. Astra reviews consequential data-minimization/authorization/status changes and the final candidate, not every cosmetic edit.
- Reuse prior checks. Run focused tests for changed behavior, then one integrated lint/type/test/build and packaging milestone on the final candidate. Repeat only after a relevant failure/fix.
- Compare representative changed screens to the hosted prototype, retaining later features. Do not reconstruct an exhaustive theme/device matrix.
- Update checklist/handoff/PR together at completed workflows. Keep private evidence outside Git. Publish the reviewed development checkpoint and provide a short follow-up review guide.
- After two unsuccessful correction rounds, stop the loop and identify the smallest correct resolution.

Finish: no unresolved material finding remains; evidence and any accepted deferrals are explicit; candidate is presented for another owner visual review. Production launch remains separately gated.

## Deferred unless a concrete usability failure requires them

Broad phone-header/card compression, rearranging administration pages, replacing event navigation, hiding every repeated label/chip, redesigning payment entry, reducing finance summary metrics and new export formats are not automatic requirements. Preserve current features; make small related improvements only within touched workflows.

Do not adopt suggestions that erase important meaning: Ready for an event is not profile-complete; unavailable is not zero; available credit is not refunded cash; partial exports are not complete snapshots; an unavailable driver is not necessarily choosing not to drive.

No main merge, production deployment, real signing, destructive retention, account reassignment or extra permissions are authorized by this plan.
