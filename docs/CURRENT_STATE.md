# Current integration handoff

## Actionable errors - development only

Active checkout: student-status-readiness-design, branch fix/actionable-errors-2026-10-20, based on verified released main 9deefe7. Prior development-review-fixtures and sibling parent-email-invitations branches shared that base. Preserve sibling worktrees and unrelated local .tmp-adult-tests.

Implemented consistent explicit backend error contracts and shared frontend presentation, including parent-invite cooldown guidance and private internal diagnostics. Independent Astra review has no blockers. Development third-bandicoot-18 synchronized; localhost actual-component error review is ready. See [verification and limitations](ACTIONABLE_ERRORS.md).

Reviewed implementation checkpoint 67c2145 is published and remote-verified on this feature branch in [draft PR30](https://github.com/denhamvenom/student_status/pull/30). Main merge and production remain unauthorized. Next: owner reviews localhost http://127.0.0.1:5182/setup?scenario=cooldown (fictional fixture); real development app is http://127.0.0.1:5173. Development email stays disabled and Calendar writes production-only.

Latest production baseline remains contact formatting PR29 at 9deefe7; see RELEASE_2026-10-20_CONTACT_FORMATS.md. Historical >500-charge fee test timeout remains unresolved and separate.
