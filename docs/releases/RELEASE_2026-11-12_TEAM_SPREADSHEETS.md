# Release 2026-11-12: Team spreadsheets, stage 1 (Google Drive connection, Student roster, Shirt sizes)

**Status: prepared on branch `feat/team-spreadsheets`; production code deploy approved by the owner on 2026-11-12.** The merge commit, deploy time and production checks are recorded in the PR and HANDOFF.md after release. Production Google settings are a separate step (see Production setup state).

| Item | Value |
| --- | --- |
| Commits | `441f0b1` (Team spreadsheets step 1: Google Drive connection, Student roster, Shirt sizes), `6b794a1` (fix spreadsheet creation refused by Google; clearer update messages) |
| Size | 30 files, +2159/-17 |
| Development Convex deploy | third-bandicoot-18, synced from this branch |
| Production Convex deploy | Pending: `bunx convex deploy` from a clean main equal to origin/main after the PR is merged |

## Scope
Decisions are in docs/DECISIONS.md (owner decisions recorded November 12, 2026). Build stage 1 of 7; setup and operation are in docs/TEAM_SPREADSHEETS.md.
- **Connect Google Drive wizard (Coach only):** General, Money, Health, Events and an optional Archive folder, then Check access.
- **Update spreadsheets (Coach or Travel Lead):** also runs automatically at 5:00 AM and 6:00 PM Central Time.
- **Files:** Student roster and Shirt sizes, both in the General folder.
- **Links in the app:** General, Events and Money links show to any Coach or Travel Lead; Health links to Coaches and Travel Leads with Health export access. People who can't see a file don't see it listed.
- **Student roster contact data:** guardian name, relationship, phone and email are visible to anyone who can open the General folder (owner decision).

## Schema
All additive; no existing data changes and no backfill.
- Three new tables: `sheetExportSettings`, `sheetExportFiles`, `sheetExportRuns`, with their indexes.
- One new cron: hourly, acting only in the 5 AM and 6 PM America/Chicago hours (no daylight saving adjustment needed).
- `calendarAuth` now uses the shared `convex/lib/googleAuth.ts`; behavior is identical (calendar tests pass).

## Verification (implemented, tested)
- `tsc` and `eslint` clean.
- Feature and calendar tests: 131 passed.
- Full suite earlier: 2963/2964; the one failure is the known `feeBulk` timeout, which passes alone.
- Development deployment third-bandicoot-18 synced from this branch.
- Live Google verified on the development deployment against the owner's Test folders. Google refuses caller-chosen file IDs for Sheets files (403 `generatedIdNotSupported`); this was fixed in `6b794a1` (Google picks the ID; duplicates are prevented by a stable key searched inside the folder).
- Coach re-test passed: both spreadsheets created, a repeat update skipped unchanged files, a Travel Lead sees the links but not the setup, no console errors.

## Production setup state
- The production **code** deploy is approved (2026-11-12). The production **Google settings are not part of the code deploy**: `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY` and `GOOGLE_SHEETS_EXPORT_ENABLED`.
- Until they are set, the Team spreadsheets card says spreadsheets aren't turned on and no Google calls happen.
- After they are set, a Coach connects the real folders (Reports > Team spreadsheets > Connect Google Drive) and presses Check access. Owner checklist: docs/TEAM_SPREADSHEETS.md.

## Known limitations (follow-up, not blocking)
- Drive search lag can rarely allow a duplicate file after a create with an unclear result.
- The Open links are about 24 px tall on phones (follow-up).
- Build stages 2 to 7 are not built.
- Season archiving is not built.
- No signed-in production walkthrough; live Google was exercised on development only.

## Release steps
1. Owner approves; the PR is merged into main on GitHub.
2. Clean worktree equal to origin/main (`git pull --ff-only`).
3. `bunx convex deploy` from main to production.
4. Notify other sessions to merge origin/main before their next development sync.
5. Separately, when the owner is ready: set the three Google settings on production, then a Coach connects the folders.

## Rollback
- Revert the merge commit on main and redeploy main. The three new tables are additive and can stay unused.
- To stop all Google writes immediately without a deploy, unset `GOOGLE_SHEETS_EXPORT_ENABLED`.
- Spreadsheets already created stay in Drive; Venom Status never deletes them.
- Frontend: revert the merge or restore the previous Worker versions.
