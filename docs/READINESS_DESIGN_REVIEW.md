# Coach Readiness — representative design review

Scope: one Coach screen at `/readiness`, including a screen-scoped header and navigation. Other roles and routes retain their existing interface. Coach review is required before any wider rollout.

Reference: immutable Claude Design prototype, Coach / readiness, 390px phone and 1440px desktop, light and dark. The local development indicator is intentionally retained. Existing fictional development records differ from reference fixtures; counts and dates must reflect the application, not copied sample values.

## Checklist

- [x] Isolate the candidate from paused backend and broader frontend drafts.
- [x] Compare all four size/theme combinations and inspect captures; available-data presentation follows the prototype. Coach acceptance remains pending.
- [x] Verify both event selections, grouped navigation, Settings round-trip, theme changes, More dismissal with Escape and focus return. No domain mutation submitted.
- [x] Lint, strict types, 101 tests across 18 files and build pass. Tests required an unsandboxed rerun after the known Windows temporary-file failure. Existing large-bundle warning remains.
- [x] Astra source and phone-dark image review accepted after fixing aggregate event readiness, preserving all Coach navigation destinations and guarding FIRST controls with event applicability.
- [x] Publish and verify checkpoint `ed69bbb` in draft [PR #9](https://github.com/denhamvenom/student_status/pull/9), stacked on the audit-report branch. No merge or deployment.
- [x] Coach approved this screen on October 12, 2026 and authorized frontend rollout with prototype comparisons, logs, checklist and Git updates.

## Data and workflow differences

The current readiness contract supplies open requirement labels, not every completed per-requirement result shown in the prototype. A neutral dash must not imply completion. Event-wide summaries for every unselected event, richer room details and PDF exports are not invented during this frontend-only pass. Existing FIRST registration controls remain available. No backend, schema, role, Timeclock, production deployment or main merge is included.

## Preservation

Earlier broad frontend drafts remain outside this candidate in the original audit workspace and in the local `preserved-design-drafts-2026-10-12` directory. They are not approved for rollout. This candidate is based on the published audit-report branch, excluding the paused Attendance/Who’s Going implementation ancestry.

## Visual evidence and limits

Compared 390px and 1440px in light/dark against the actual rendered prototype. Read-only DOM checks found no horizontal document overflow at either target width. Screen-scoped styles reproduce the wordmark, grouped navigation, wrapped event choices, purple selection, status chips, desktop table and labeled phone rows. Full-page captures show fixed bottom navigation at the viewport position; that capture artifact does not indicate permanently obscured content.

Intentional differences: fictional development records/counts/date ranges; retained development banner; existing FIRST completion actions; unknown completion values displayed as dashes; unavailable exports clearly stated; user-approved Withdrawals retained in navigation. Unselected event summaries require selecting that event, avoiding unbounded queries. Only the selected event has a verified overall state. Account appearance restored to System after testing and viewport overrides cleared.

Screenshots remain outside Git in the local visualization directory. No records, account addresses, screenshots or environment values are included in publication. This is readiness for Coach visual review, not approval for rollout or a claim that missing report/consent workflows are complete.
