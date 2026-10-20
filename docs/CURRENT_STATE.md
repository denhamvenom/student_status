# Current integration handoff

## October 20 - Active Roster sorting (development)

Active Roster now sorts by last name, grade or subteam in either direction and displays grade beside the full student name and subteam. Sorting and search cover the complete current-season directory before showing 20 detailed rows per page. Existing connection, archive, Travel Team and readiness/balance filters remain. Missing grades show Not provided; unknown legacy grades remain visible. Stored surnames take precedence over the older-name fallback.

Validation: 556 tests across 103 files passed; lint, application types/build and independent review passed. Actual roster component with synthetic mocked data passed desktop1440/light and phone390/dark checks, including later-page sorting/search, quick filters, pagination and visible grades. Development third-bandicoot-18 sync and backend typecheck passed. No records were migrated or rewritten. Production remains unchanged. Live Coach acceptance remains pending. See [roster behavior and evidence](ROSTER_SORTING.md).

## October 20 - Grade dropdown (local development)

Student and parent setup plus the parent health/contact profile now use Freshman, Sophomore, Junior and Senior. Recognized earlier values display canonically and convert on normal save; unknown values remain selectable unchanged. Existing confirmed profile spelling may remain until parent reconfirmation, and signed snapshots are untouched. No bulk migration or production data change.

Validation:552 tests/102 files passed, focused tests/types/lint and independent review passed. Shared dropdown browser checks passed at desktop/light and phone/dark. Application build and development third-bandicoot-18 synchronization passed, including backend typecheck. See [behavior and evidence](STUDENT_GRADE_DROPDOWN.md). Production release is not authorized for this change.

## Workspace and release baseline

Working checkout student-status-bulk-invite, branch feature/parent-email-invitations; root owns development sync. Other chat holds overlapping work. Baseline main37bf11a/PR25 is the released Mentor/Staff invitation email feature. Source and documentation for that production release are published; see RELEASE_2026-10-20.md. Development email stays disabled and Calendar writes remain production-only. No real emails or records used for grade verification.
