# Coach roster sorting

## Development scope

October 20 request: sort Active Roster by grade, subteam and last name, with that information visible. Development only; no production release. Retain full legal names and editable subteams; add a visible Grade column/card field using the shared grade vocabulary. Grade comes from the current setup draft before the saved consent profile; recognized aliases display canonically, unknown values stay visible and missing grades show Not provided.

Sorting must cover the entire current-season roster, not only the initial 20 students. Load a lightweight directory through bounded pages, then sort/filter and fetch detailed information for the visible rows. Status-based quick filters may load the enriched bounded pages and clearly indicate loading until complete. Preserve current-season Coach authorization, connection/archived filters and record edits. No schema migration or record rewrite is needed.

Use the stored lastName when available; for older names without structured parts use a deterministic surname fallback without changing the name. Full names remain visible. Default last-name order and selectable direction; grade order Freshman through Senior, missing/unknown after recognized grades. Tie-break consistently for pagination. Keep active controls when readiness time refreshes.

## Verification

556 tests across 103 files passed, plus lint, application typecheck/build and independent review. Development third-bandicoot-18 synchronized successfully with backend typecheck. Actual roster component browser checks used 25 synthetic students and mocked Convex hooks at 1440x900 light and 390x844 dark: full-directory sorting, pagination, later-page search/quick filters, missing grade visibility and responsive width passed. Screenshots inspected; evidence remains ignored in .test-temp/roster-sort-ui. Live Coach acceptance remains pending. No production deployment, record migration or signed-permission modification.
