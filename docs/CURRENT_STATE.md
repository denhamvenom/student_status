# Current integration handoff

## Event schedules and Pay styling deployed - October 21, 2026

PR33 merged at 4f4b0f2aa1b2bc67163f69456c1be0dbbef5ec41; immutable release v0.1.0-onboarding.13 published. Owner approved release and public-site verification. Student dashboard, event list and detail now show Central start/end times, preserving Calendar all-day dates. Pay Now uses the established gold/dark-text button.

Production https://students.team8044.org verified: root and entry/LiveApp JS/CSS return 200; all four asset hashes match the approved production build. Production backend URL only, both fixes present, no synthetic preview mocks. Worker e4686496-6301-40a7-a065-fd109876c0c4 active at 100%. Automatic build was pending, so the authenticated CLI deployed the identical approved source. No backend deployment, schema/dependency change or real data write.

Validation: candidate 630/630 tests; integrated PR32 run 630/631 with the known intermittent invitation-limit assertion, then complete 26-test file passed on rerun. Source lint/types/build/dry-run, independent Astra review and ten representative synthetic browser checks passed. Original Pay issue not reproduced in harness; updated styling verified. Production check was signed-out rendering and exact served assets, not an authenticated student/payment rehearsal.

Release evidence and rollback: RELEASE_2026-10-21_EVENT_DISPLAY.md and https://github.com/denhamvenom/student_status/releases/tag/v0.1.0-onboarding.13. This post-release documentation checkpoint does not need another main merge/deployment. Local checkout student-status-event-display, branch fix/student-event-time-pay. Preserve unrelated worktrees. Ignored tmp preview mocks must never ship.
