# Current integration handoff

## Mentor Profile and individual fundraiser links — development

Built on released main 04272ad. Mentors land on Profile with Report retained. Coach Money tools manages a separate Zeffy URL per active student; students and linked parents see Pay Now/Share on Money only when configured. No financial transactions or balances are changed by these actions. See MENTOR_PROFILE_FUNDRAISERS.md for behavior, authorization and evidence.

11 focused tests and independent source review passed. Synthetic actual-component checks verified desktop/light and phone/dark layouts, Mentor routing, Coach update/clear and family copy/no-link hiding. Physical-phone sharing and real checkout were not exercised. Development third-bandicoot-18 synchronized; production remains at the approved staff-setup release. No real links were assigned.

Root owns feature/parent-email-invitations in student-status-bulk-invite. Other chat confirmed no conflicting work and held shared sync during integration. Development email remains disabled; Calendar writes remain production-only. Previous unrelated 501-charge fee-test timeout is a separate follow-up.

Final lint, frontend/backend typechecks and application build passed.
