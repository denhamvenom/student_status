# Release 2026-11-12: Team spreadsheets, all kinds and season archive

**Status: prepared on branch `feat/team-spreadsheets-all`; not merged and not deployed.** Production needs the owner's approval. The merge commit, deploy time and production checks go in the PR and HANDOFF.md after release.

| Item | Value |
| --- | --- |
| Commits | `4963183` (nine more kinds), `7e4eaf5` (integrate all kinds, plain not-ready messages, season archiving), `e9e4758` (generated API types), plus the council-fix commit(s) recorded in the PR |
| Development Convex deploy | Synced from this branch before the council fixes; to be re-synced after them |
| Production Convex deploy | Pending: `bunx convex deploy` from a clean main equal to origin/main after the PR is merged, with `GOOGLE_SHEETS_EXPORT_ENABLED` off |

## Scope
Decisions are in docs/DECISIONS.md (Team spreadsheets, owner decisions November 12, 2026). Setup and operation are in docs/TEAM_SPREADSHEETS.md. Builds on stage 1 (docs/releases/RELEASE_2026-11-12_TEAM_SPREADSHEETS.md).
- **All eleven kinds:** General (Student roster, Shirt sizes, Adult roster with a Parents tab, Drivers, Readiness without money items, Attendance with Build hours and All clocked hours), Money (Money; per event Event fees), Health (Health; per event Travel emergency), Events (per event Event spreadsheet with question answers).
- **Per-event files:** from 60 days before an event until 7 days after it, then frozen. A Travel emergency file only for events with team travel, an overnight stay or a required permission form. Names are date first ("2027-03-06 Lone Star Regional - Fees"); a renamed or moved event renames its Drive file.
- **Run size:** up to 150 files per update, soonest events first; the card says the rest (events furthest away) are added as those events get closer.
- **Season archive:** when a season ends, its files move into an Archive folder inside their own folder (General/Archive/<season>, and the same for Money, Health and Events), so sharing never changes. No top-level Archive folder; the Connect Google Drive wizard now has four folder steps.
- **Card:** one row per event with up to three links (Event, Fees, Travel emergency, only the ones the person may open); five events, then "Show all {n} events". Coaches see when last season's move stopped partway or was skipped.

## Council fixes in this release
- **Season switch during an update:** a run writes only while its season is active; the archive stops runs of the old season and waits until their last step lets go. A step that loses its hold closes out at once (no 15-minute hold) and records a file it had just made, so nothing is left untracked in a live folder.
- **Manual archive** refuses a season that is still active. Archive start (automatic or manual) and finish (state and count) are in the audit trail. A restart uses the folder settings current at that time.
- **Logging:** a file that fails for a reason other than Google logs the kind, event and error name and message (no data values or secrets).

## Schema
All additive; no backfill.
- `sheetArchives`: new optional fields `archiveFolders`, `trigger`, `actorId`. The older `folderIds` field stays optional and is no longer written.
- `sheetExportSettings.archiveFolderId` stays optional for compatibility and is no longer set or used.

## Verification (implemented, tested)
- Development run before the council fixes: 47 files written, 0 failures.
- After the fixes (Windows, this worktree): `bunx vitest run` on `convex/sheetExports.test.ts`, `convex/sheetExportsAll.test.ts`, `convex/sheetArchive.test.ts`, `convex/seasonTransition.test.ts`, `convex/lib/sheetEvents.test.ts`, `convex/lib/googleSheets.test.ts` and `src/features/team-spreadsheets`: 122 passed. All Google calls in tests are faked; nothing reached real Google.
- `eslint` clean on the changed files. `tsc --noEmit` clean except one error in `src/features/event-setup/signup-csv.ts` (missing `@/lib/ui-copy`), which is in a file this release does not change.
- Not yet: full `bun run check`, a development re-sync and live Google run after the fixes, and a signed-in walkthrough of the new card rows.

## Known limitations (follow-up, not blocking)
- Drive search lag can rarely allow a duplicate file after a create with an unclear result.
- A file that an interrupted step had found by its key (after an earlier lost save) and recorded just as its season was archived may keep an older Drive name; it is archived as it is.
- The card lists at most 60 events (current first, then the most recent frozen ones).
- Files left behind after a folder change or a remade file are not deleted; they are part of the yearly retention review.

## Rollout (owner decision, November 12, 2026)
1. Owner approves; the PR is merged into main on GitHub.
2. Clean worktree equal to origin/main (`git pull --ff-only`).
3. `bunx convex deploy` from main to production, with `GOOGLE_SHEETS_EXPORT_ENABLED` off.
4. Notify other sessions to merge origin/main before their next development sync.
5. The owner checks the sharing of the General, Money, Health and Events folders.
6. Turn `GOOGLE_SHEETS_EXPORT_ENABLED` on; the lead runs `bunx convex run sheetExports:startNow` (production, with the owner's approval) and checks the card.

## Rollback
- To stop all Google writes immediately without a deploy, set `GOOGLE_SHEETS_EXPORT_ENABLED` off (anything but `true`). Running updates and archive jobs stop at their next step.
- Revert the merge commit on main and redeploy main. The new fields are optional and can stay.
- Spreadsheets and Archive folders already created stay in Drive; Venom Status never deletes them.
- Frontend: revert the merge or restore the previous Worker versions.
