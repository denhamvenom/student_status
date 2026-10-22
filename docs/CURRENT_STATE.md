# Current integration handoff

## Historical Timeclock import - October 22, 2026

Branch `feature/timeclock-history-import` in checkout `student-status-zeffy`, based on production main `07d3223`. Owner approved historical CSV attendance: match current students by first/preferred name and last initial, discard unmatched names, use Calendar start through final valid clock-out continuously for Team Meetings, and full scheduled time for the two identified outreach occurrences. Exclude clock-outs before the meeting start. All timestamps are Central. This supersedes the original proposal to preserve individual IN times and breaks.

Local private preview is prepared in ignored `tmp/timeclock-import/`; no real records enter Git. Backend import passed independent review, source lint and 23 focused regression tests; no historical attendance has been posted yet. See [TIMECLOCK_HISTORY_IMPORT.md](TIMECLOCK_HISTORY_IMPORT.md).

## Zeffy donation integration released - October 21, 2026

Owner approved production release and activation. PR34 merged as `07d3223fb1e159cbba19783b206f12db551fc2c4`; release `v0.1.0-onboarding.14`. Convex production `amicable-eel-413` is deployed and configured. Student Status Worker version `1d345faa-8a8a-49ec-96ac-695a21e64100` serves the new controls; HTTPS assets were verified.

Live preview passed, the first import credited one eligible donation with no review items, and a second run credited zero and skipped the existing payment. Ledger provenance and account allocation were verified privately. Checks are enabled for 7 AM/7 PM America/Chicago; actual scheduled execution remains unobserved. See [ZEFFY_SYNC.md](ZEFFY_SYNC.md) for behavior, limits and validation.

Checkpoint checkout `student-status-zeffy`, branch `feature/zeffy-donation-sync`. Release evidence is published on this branch without a documentation-only merge that would redeploy main. Preserve sibling worktrees and keep real records out of Git. Next operational check: inspect the first scheduled result after 7 AM Central October 22. No further code work is required for activation.

## Previous release: event schedule and Pay styling - October 21, 2026

Owner approved production release of PR33. Checkout student-status-event-display, branch fix/student-event-time-pay. Student dashboard, event list and detail show Central start/end times with CST/CDT; all-day dates preserve exclusive-end semantics. Pay Now uses the existing readable gold button.

Reviewed source 575fe30 passed 630 tests, source lint, types/build, independent Astra review and synthetic phone/dark + desktop/light browser checks. Original reported Pay contrast issue was not reproduced in the harness; candidate appearance was verified. Local preview theme switching was repaired in ignored mocks only; those files never ship.

Integrated main 267b789, including PR32's approved test cleanup; application source merged without conflicts, documentation reconciled. See test-audit.md for its original evidence. No backend changes, deployment or database migration needed. Release execution and verification: RELEASE_2026-10-21_EVENT_DISPLAY.md; immutable release notes will record final merge and Worker versions.

Production baseline is v0.1.0-onboarding.12. Preserve other worktrees and unrelated temporary evidence. Do not deploy synthetic preview files from tmp.
