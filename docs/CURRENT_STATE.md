# Current integration handoff

## Zeffy donation integration candidate - October 21, 2026

Checkout `student-status-zeffy`, branch `feature/zeffy-donation-sync`, based on origin/main `4f4b0f2`. Zeffy credits use the existing student fundraiser links, preserved page/season ownership, ledger source projections and automatic allocation. Coach controls are in Money tools; scheduled checks are 7AM/7PM America/Chicago and default off. See [ZEFFY_SYNC.md](ZEFFY_SYNC.md) for scope, limits and release procedure.

Owner cannot rehearse on development: local synthetic tests and a read-only live source/link/account preflight were used. No real credits or deployment changes. Typecheck/source lint/build, independent review and representative synthetic browser checks passed. Full test run had 635 passes, three unrelated timeouts and a corrected new fixture; all four suites passed 25/25 on targeted single-worker rerun. Real-record evidence is not in Git.

Next: publish candidate branch/PR, then obtain explicit production release/activation approval. Add the key to production securely, deploy initially disabled, review live preview, post first credit and verify duplicate rerun before relying on the schedule. Production balance and scheduled-run verification remain pending. Preserve all sibling worktrees.

## Previous release: event schedule and Pay styling - October 21, 2026

Owner approved production release of PR33. Checkout student-status-event-display, branch fix/student-event-time-pay. Student dashboard, event list and detail show Central start/end times with CST/CDT; all-day dates preserve exclusive-end semantics. Pay Now uses the existing readable gold button.

Reviewed source 575fe30 passed 630 tests, source lint, types/build, independent Astra review and synthetic phone/dark + desktop/light browser checks. Original reported Pay contrast issue was not reproduced in the harness; candidate appearance was verified. Local preview theme switching was repaired in ignored mocks only; those files never ship.

Integrated main 267b789, including PR32's approved test cleanup; application source merged without conflicts, documentation reconciled. See test-audit.md for its original evidence. No backend changes, deployment or database migration needed. Release execution and verification: RELEASE_2026-10-21_EVENT_DISPLAY.md; immutable release notes will record final merge and Worker versions.

Production baseline is v0.1.0-onboarding.12. Preserve other worktrees and unrelated temporary evidence. Do not deploy synthetic preview files from tmp.
