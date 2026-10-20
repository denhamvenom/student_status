# Current integration handoff

## October 20 - Grade dropdown (local development)

Student and parent setup plus the parent health/contact profile now use Freshman, Sophomore, Junior and Senior. Recognized earlier values display canonically and convert on normal save; unknown values remain selectable unchanged. Existing confirmed profile spelling may remain until parent reconfirmation, and signed snapshots are untouched. No bulk migration or production data change.

Validation:552 tests/102 files passed, focused tests/types/lint and independent review passed. Shared dropdown browser checks passed at desktop/light and phone/dark. Application build and development third-bandicoot-18 synchronization passed, including backend typecheck. See [behavior and evidence](STUDENT_GRADE_DROPDOWN.md). Production release is not authorized for this change.

## Workspace and release baseline

Working checkout student-status-bulk-invite, branch feature/parent-email-invitations; root owns development sync. Other chat holds overlapping work. Baseline main37bf11a/PR25 is the released Mentor/Staff invitation email feature. Source and documentation for that production release are published; see RELEASE_2026-10-20.md. Development email stays disabled and Calendar writes remain production-only. No real emails or records used for grade verification.
