# Current integration handoff

## Staff setup wizard - development candidate

Working checkout student-status-bulk-invite, branch feature/parent-email-invitations, baseline main e3bf53d. Staff onboarding now covers Coaches, Mentors and Travel Leads with existing personal fields. User explicitly requested temporary and permanent skipping: Skip for now is in-memory; Don’t ask me again persists on the account across logins/seasons. Profile remains available for later edits. See [staff setup behavior and evidence](STAFF_SETUP_WIZARD.md).

Focused backend tests and independent review passed. Actual-component synthetic desktop/light and phone/dark browser checks passed. Lint/types/build and development backend sync passed. Full suite561/562 passed; unrelated fee-history30-second timeout remains a separate follow-up (see evidence). Actual signed-in localhost wizard opened at Step1 for Coach review; no profile/dismissal writes. Root owns shared Convex sync; other chat holds overlapping changes. Production release is not authorized for staff onboarding.

## Production baseline

Grade dropdowns and roster sorting released in PR26 at e3bf53d4069a2777ee26c9ca146e792e0c7e4731, release v0.1.0-onboarding.7. Production backend amicable-eel-413 and both Cloudflare builds succeeded. Source and documentation are published. See RELEASE_2026-10-20_GRADES_ROSTER.md and GitHub release evidence. Development email remains disabled; Calendar writes remain production-only. No real records used for staff verification.

Individual-item skipping added: blank answers allowed throughout, supplied fields saved, skipped saved values preserved, completion suppresses future prompts. Focused13 tests and synthetic browser flow passed. See STAFF_SETUP_WIZARD.md.

Staff setup now has an optional Driving step before review, shared contact phone, vehicle/seats/trailer capability and Skip driving step preserving existing driver approval. Requested extra informational paragraph removed. Focused17 tests, source review and desktop/phone synthetic browser checks passed; see STAFF_SETUP_WIZARD.md. Development only.
