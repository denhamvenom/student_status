# Team spreadsheets

Venom Status keeps team spreadsheets up to date in the team's Google Workspace **shared drive**, using its own Google service account. Nobody edits these files by hand: every update clears and rewrites each tab, and a note at the top of every tab says so. Eleven kinds of file are ready (listed below): six General, one Money and one Health file per season, and per qualifying event one Events and one Money file, plus a Health (Travel emergency) file when the event has travel, an overnight stay or a permission form. When a season ends, its files move into an Archive folder inside their own folder.

## Owner checklist (once)

Production Google project: `denham-venom-production`. None of this touches sign-in.

1. In that project, enable the **Google Sheets API** and the **Google Drive API** (APIs & Services > Library).
2. Create a service account named **Venom Status reports** (IAM & Admin > Service Accounts). No project roles are needed.
3. On that service account, create a **JSON key**. Keep the file private; never commit it or paste it anywhere except the deployment settings in step 8. The service account's email address is the `client_email` value inside that file.
4. The team's drive must be a **Google Workspace shared drive**, not a personal My Drive. Folders in My Drive are refused.
5. In the shared drive: Manage members > add the service account's email address as **Content manager**.
6. In the shared drive, create a parent folder named **Venom Status Reports** and, inside it, four folders: **General**, **Money**, **Health** and **Events**. The parent folder itself is not shared with anyone. Keep the four side by side: a folder inside another configured folder is refused. **No separate Archive folder is needed:** when a season ends, Venom Status makes an **Archive** folder inside each of the four (for example General > Archive > 2026–27) and moves that season's files there, so they keep the same sharing.
7. **Sharing model (owner decision, November 12, 2026):** only you and the Venom Status service account are members of the shared drive. Share each subfolder individually with the people who need it (never the Venom Status Reports parent folder). Events can be shared more widely than General. Health only with people who have Health export access; Money only with people who should see money data. Do not add other people as drive members: drive membership reaches every folder. The Archive folders inside each folder inherit that folder's sharing.
8. On the Convex deployment, set three values (dashboard or `bunx convex env set`):
   - `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL`: the service account's email address.
   - `GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY`: the `private_key` value from the JSON key (the `\n` sequences may stay as written).
   - `GOOGLE_SHEETS_EXPORT_ENABLED`: `true` to let Venom Status write to Google. Anything else keeps updates off; the card says so and nothing is written. Leave it off until step 11.

   **Caution:** `bunx convex env list` prints every value, including the private key. Do not run it where others can see the screen, and never paste its output anywhere.
9. A Coach opens **Reports > Team spreadsheets > Connect Google Drive**, follows the steps (add the address as a member, paste the General, Money, Health and Events folder links), then presses **Check access**. This works while updates are still off.
10. Check the sharing of **General, Money, Health and Events** (step 7) before anything is written.
11. Set `GOOGLE_SHEETS_EXPORT_ENABLED` to `true`, then the lead runs `bunx convex run sheetExports:startNow` (production only with the owner's approval) or a Coach presses **Update spreadsheets**. After that, updates run at 5:00 AM and 6:00 PM Central Time.

**Rollout order (owner decision, November 12, 2026):** deploy the code with updates off → the owner checks the sharing of General, Money, Health and Events → turn updates on → the lead runs `startNow`.

**Rotating the service account key:** creating a key is blocked by the organization's policy, so each rotation needs an owner-approved, temporary policy exception. (1) The owner approves the exception for the production project. (2) Create a new JSON key on the Venom Status reports service account. (3) Set `GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY` (and the email, if it changed) on the deployment from the new key. (4) Press **Update spreadsheets** or run `startNow` and confirm it finishes. (5) Delete the old key in the Google Cloud console and end the policy exception. Never paste a key anywhere but the deployment settings, and delete the downloaded file afterwards.

**What success looks like:** the check ends with "Google Drive is connected"; after an update the card lists each file with an update time and an Open link, and the files appear in the folders below.

**Common messages and what they mean**

| Message (shortened) | What it means | What to do |
| --- | --- | --- |
| Venom Status can't open this folder | The service account isn't a member of the shared drive, or the link is wrong | Add the address as Content manager; check the link |
| This folder isn't in a shared drive | The folder is in a personal My Drive | Move it into the shared drive |
| …is in a different shared drive | Folders come from two drives | Use folders from one drive |
| …is inside the … folder | A configured folder sits inside another one | Make the folders siblings |
| Google didn't accept the Venom Status Google account | The key or email on the deployment is wrong or disabled | Re-set the two values from the JSON key |
| The Venom Status Google key can't be read | The private key value is cut off or mangled | Re-set it from the JSON key |
| Spreadsheet updates aren't turned on yet | `GOOGLE_SHEETS_EXPORT_ENABLED` isn't `true` | Set it to `true` |
| Google Drive didn't let Venom Status save this spreadsheet | Drive refused the save (a Coach sees Connect Google Drive and Check access) | Press Check access; confirm the Content manager role |
| Google was busy and didn't finish this spreadsheet | Google was slow or failing | Press Update spreadsheets in a few minutes |
| …no longer in its folder / …missing in Google Drive | Someone moved, trashed or deleted the file | Nothing; a new one was made (the old one stays in Drive) |

**Retention:** Drive files and their version history are part of the yearly retention review (DECISIONS, Retention). Old versions and files left behind after a folder change or a remade file are not deleted by Venom Status.

This is a separate service account from the Calendar one (`TIMECLOCK_CALENDAR_*`).

## What each folder holds

| Folder | Once per season | Once per qualifying event |
| --- | --- | --- |
| **General** | Student roster, Shirt sizes, Adult roster, Drivers, Readiness, Attendance | |
| **Money** | Money (balances, fees, fundraising) | Event fees |
| **Health** | Health (students' and adults' emergency contacts and health information) | Travel emergency |
| **Events** | | Event spreadsheet (who's going, question answers, Mentors, rooming, rides, shifts, attendance) |

Tab and column names are in `docs/LANGUAGE.md` ("Team spreadsheets — sheet names and headers").

**Which events get files:** an event gets its files from **60 days before it starts** until **7 days after it ends**: an Event spreadsheet and Event fees always, and a **Travel emergency** file only when it has team travel (team transport to an in-person, off-site place), an **overnight** stay, or a **required permission form** (owner decision, November 12, 2026). After that its files are frozen: they stay in Drive and on the card, and are no longer updated. Canceled and archived events get none. A one-off event of type **Team** and any occurrence of a **repeating meeting series** are excluded; regular team meetings are covered by the **Attendance** report instead. Outreach, Competition and Fundraiser events qualify unless they are repeating-series occurrences. Files are named date first, "2027-03-06 Lone Star Regional" (" - Fees", " - Travel emergency"), so they sort by date in Drive. At most 150 files are written per update, soonest events first; the card says how many for the events furthest away are added as those events get closer.

**On the card**, each event is one row with up to three links (Event, Fees, Travel emergency; only the ones the person may open). Five events show, then **Show all {n} events**.

**When Attendance or Money is still updating** the file keeps its last numbers and the card says so in plain words (for example "Attendance is updating, so its spreadsheet kept the last numbers. Try again in a few minutes."); a later update fixes it.

## Who sees what (owner decisions, November 12, 2026)

- **Student roster** keeps parent or guardian name, relationship, phone, email and linked parent accounts, in the General folder. Anyone who can open General (Coaches, Travel Leads, and whoever you share the folder with) sees them. This intentionally widens guardian contact access beyond the app's Coach-only roster detail.
- **In the app:** General, Events and Money links show to any Coach or Travel Lead (a Parent acting as Travel Lead included), the same rule as the money views. Health links show to Coaches and to Travel Leads with Health export access. People who can't see a file don't see it listed at all.
- **In Drive:** access is whatever you share on each folder (checklist step 7).

## For developers

### How updates work

- **When:** 5:00 AM and 6:00 PM America/Chicago every day. An hourly timer acts only in those two Chicago hours, so daylight saving changes need no adjustment. Any Coach or Travel Lead (a Parent acting as Travel Lead included) can also press **Update spreadsheets**. Mentors, Parents and Students cannot; this is enforced on the server. Presses are rate limited per person (5 per 10 minutes); Check access is limited to 10 per 10 minutes per Coach.
- **Always everything:** a press refreshes every file, including ones the person can't open.
- **One at a time:** a press during an update answers "Spreadsheets are already updating. This takes a few minutes." If an update stops without finishing, its hold expires after 15 minutes (longer than the 10-minute limit of one step) and the next press or scheduled update takes over. Before it creates a file and before each Google write a step re-checks that its run still holds the update, and `saveFile` refuses (and the step stops) if the run was replaced.
- **One file per step:** each spreadsheet is built and written in its own short step, which then schedules the next about a second later. Data is read in bounded pages (students and adults throw rather than silently truncate). A file that fails is marked with a plain-language problem and the update finishes as partly done; other files continue.
- **Requests:** each Google request has a 30 second limit. Reads and the file create retry up to three times on 429, 5xx or a dropped connection. A `batchUpdate` is a write that may already have been applied after a timeout, dropped connection or 5xx, so it is retried only on 429 (nothing applied); otherwise the file is marked failed and the next update re-reads the file and redoes the write. Tabs and protections are computed from what the file holds at that moment, so a repeat never adds a tab or protection twice.
- **No duplicates:** Drive refuses a caller-chosen file ID for Google Sheets files (`403 generatedIdNotSupported`, verified against live Google on November 12, 2026), so Google picks the ID. Every file carries a hidden Drive property with a stable key (season + kind + event); before making a file Venom Status searches by that key **inside the configured folder** (recovers a save lost after a create). If a create ends without a clear answer (timeout, dropped connection, 5xx), it searches by key again, with short waits, before sending another create. The run lease re-check happens before each create.
- **Server log:** every failed Google request logs `Google request failed` with the function name, HTTP status, and Google's reason codes and message. Any other failure of a file (a loader or builder error) logs `Spreadsheet step failed` with the kind, the event ID and the error's name and message. Never tokens, keys, request bodies or row data. Users only see plain messages.
- **Every update checks the stored file** (even when nothing changed): it must exist, not be trashed, and have the configured folder among its parents. Otherwise a new file is made in the right folder, the old one stays in Drive, and the card says so ("missing" or "no longer in its folder"). The note clears after a later update that wrote without remaking.
- **Interrupted first write:** the file is saved right after it is created, with its fingerprint cleared, so a write that never finished is redone at the next update.
- **File names:** when the computed name differs from the stored one (an event renamed or moved to another day, a season renamed, a new naming rule), the Drive file is renamed (`files.update`, `supportsAllDrives`) just before its write. No new file is made.
- **Writing a file:** one `batchUpdate` adds or renames tabs, clears and rewrites every tab, freezes the note and header rows, adds a warning-only protection once, and deletes tabs the builder no longer produces. The fingerprint covers a layout version (`LAYOUT_VERSION` in `convex/lib/googleSheets.ts`; bump it when layout or formatting changes), the file name and the tabs; if it matches, no write is made.
- **Formulas:** text is sent as text, never as a formula. Text that starts with `=` or `@` (or a tab or return) also gets a leading apostrophe (`safeCell` in `convex/lib/sheetRows.ts`), as does text starting with `+` or `-` unless the next character is a digit, a space or `(`; so a CSV download opened in Excel can't run it. Phone numbers like `+1 555 ...` or `(202) 555-0123` and numbers like `-5` stay clean; the apostrophe shows in Sheets for the rest. This is a deliberate trade for safety.
- **Moving folders:** saving different folders forgets files made in a changed folder (bounded read of 1,000 rows; archived files are kept); the next update makes new ones. The old files stay in Drive for a person to delete. Saving settings writes an audit row (who, which folders changed by name, no folder links).
- **Setup check:** read-only calls (scope `drive.metadata.readonly`), so it works before updates are turned on. It requires the four folders (General, Money, Health, Events) to be distinct, in one shared drive, writable, and **not nested**: each folder's ancestor chain (up to 30 levels) is walked and a folder inside another configured folder is refused.
- **Scopes:** writing requests only `https://www.googleapis.com/auth/drive`. Verified against live Google (November 12, 2026, test folder): with that scope alone, `files.create` (without an ID), `spreadsheets.get` and `spreadsheets.batchUpdate` all answer 200; the separate `spreadsheets` scope isn't needed.
- **Per-event files:** event-scoped kinds get one file per qualifying event. An event qualifies when it is in the active season, not canceled or archived, not a regular Team meeting (type Team) and not an occurrence of a repeating meeting (`seriesId` set), and it starts within the next 60 days or ended within the last 7 (an event in progress counts). `eventTravelEmergency` also needs `eventNeedsTravelEmergency`: team transport (`teamTransportEnabled`, not on site, not virtual), `overnight` or `permissionRequired`. An event that loses all three keeps its file, frozen. Rules and numbers: `convex/lib/sheetEvents.ts`. File names are "{YYYY-MM-DD} {Event name}" (start date, team time), with " - Fees" or " - Travel emergency" for those kinds. The Drive key includes the event, so each event's file is found again after a lost save. A file whose event leaves the window (ended more than 7 days ago, canceled, archived, deleted) is **frozen**: no further writes, it stays in Drive and on the card under Events with a note. An event that leaves the window during an update is dropped from that update without any Google call.
- **Run size:** each update plans its files when it starts: ready team kinds first, then every ready event kind that applies for each qualifying event, soonest event first. At most 150 files per update (`MAX_FILES_PER_RUN`); any more (the events furthest away) are counted and the card says they are added as those events get closer. Each file is still its own short step with the same 15-minute hold, so a long list never makes one step longer.
- **Season switch during an update:** a run writes only while its season is the active one. `runCurrent`, `claimNext` and `saveFile` check it, so a run whose season was archived stops before its next create or write. `startSeasonArchive` stops any running run of that season; the archive waits while that run's hold is live. A step that loses its hold calls `abandonStep`, which lets go of the hold at once (no 15-minute wait) and records a spreadsheet the step had just made but couldn't save, so the archive moves it and nothing is left untracked in a live folder. A finished or stopped run always releases its hold.
- **Starting from the server:** `bunx convex run sheetExports:startNow` starts a full update without a signed-in person (trigger `server`), with the same checks as the button except the per-person limit. It answers `started`, `alreadyUpdating`, `notSetUp`, `noSeason` or `off`. Running it against production needs the owner's approval like any production command.
- **Roster grade** follows `coachRoster.list`: the setup draft's grade first, else the confirmed health-and-consent profile's.

### Files

- **Student roster** (General): Students tab with Preferred name, Legal name, Grade (blank if none saved), Subteam, Second subteam, Leadership role, Travel Team, Student email, Parent or guardian name / relationship / phone / email (confirmed profile first, else the older fields, as the Coach roster does), and Parent accounts (linked). Active students of the current season.
- **Shirt sizes** (General): Counts (XS to 3XL plus Other; columns Students / Adults / Total; totals row), Details (Name, Student or adult, Subteam, Size) and Missing size. Active students and active adults. "Adult" means an active Coach, Mentor or Travel Lead, or a Parent with Mentor or Travel Lead access; plain Parents are left out. A size outside the app's list is counted under Other and shown as entered.
- **Adult roster** (General): Adults tab with Name, Role, Travel Lead, Subteams, Email, Phone, Students (linked). Active Coaches, Mentors and Parents (a Parent with Mentor or Travel Lead access shows as Mentor or Travel Lead).
- **Drivers** (General): Drivers tab with seats, vehicle, Can tow, Approved, Active.
- **Readiness** (General): one row per active student with the same readiness as the Team roster.
- **Attendance** (General): Summary, By subteam and Weekly hours. Throws a plain message while the season's attendance reports are updating.
- **Money** (Money): Balances, Fees and Fundraising tabs. Same readiness gate as the finance CSV export.
- **Health** (Health): Students and Adults tabs.
- **Event** (Events): Summary, Who's going and, when they apply, Question answers, Mentors, Rooming, Rides, Shifts, Attendance. Fees are never shown ("See the Money folder").
- **Event fees** (Money) and **Travel emergency** (Health): per event, as above.

### Adding or finishing a spreadsheet kind

Every kind is registered and `ready: true`. A kind set to `ready: false` is left out of updates and off the Reports card. A new kind touches only its own three files, plus the shared-file steps at the end of this section; `convex/sheetExports.test.ts` keeps only the two simplest kinds ready, and `convex/sheetExportsAll.test.ts` runs all of them end to end.

1. **`convex/sheetKinds/<kind>.ts`**: the pure definition. Export `type Data` (what the loader returns) and `definition: SheetKindDefinition<Data>` (contract in `convex/lib/sheetKinds.ts`):
   - `kind`, `folder` (`general`, `money`, `health` or `events`) and `scope` (`team`: one file per season; `event`: one file per qualifying event) are already set; keep them.
   - `label`: the short name on the card ("Open {label}").
   - `title(info)`: the Drive file name. `info` is `{ seasonName, event }`; `event` (`{ name, startsAt }`) is set only for event kinds. Use `eventKindTitle(info, suffix?)` from `convex/lib/sheetEvents.ts` for event kinds.
   - `build(data)`: returns the tabs (`SheetTab[]`: `{ title, rows }`, first row is the header). Pure: no database, no clock. Cells are plain text or numbers (the writer sends text as text and neutralizes formula-like text). Shared helpers are in `convex/lib/sheetRows.ts` (`yesNo`, `rosterGrade`, `guardianFor`). A file must have at least one tab; building none fails the file.
   - Set `ready: true` when the kind is complete.
2. **`convex/sheetData/<kind>.ts`**: the data. Export `load: SheetLoader<Data>`, called as `load(ctx, { seasonId, eventId })` from the runner action (`eventId` is null for team kinds). Put the kind's own `internalQuery` functions in this file and call them with `ctx.runQuery(internal.sheetData.<kind>.<query>, ...)`, annotating the result type. Each query reads a bounded page (`.paginate` or `.take`), and the loader loops and throws rather than truncating. Shared reads of students and adults are in `convex/sheetExportData.ts` (`readAllStudents`, `readAllAdults`). Read only what the file shows; never put health or money fields in a kind whose folder is General or Events.
3. **`convex/sheetKinds/<kind>.test.ts`**: table-driven tests of `build` (headers, ordering, blanks, edge cases) and the file name. Run it with `bunx vitest run convex/sheetKinds/<kind>.test.ts`. To test the whole path, `convex/sheetExportsAll.test.ts` seeds a season and runs every kind with fake Google.

New queries change `convex/_generated/api.d.ts`. Run `bunx convex codegen` when you can; the `sheetData/<kind>` module is already listed there, and generated types pick up its new functions from the module's own exports. Link visibility follows the folder (`folderVisible`); the card, runs, retries and Drive handling need no change. Add any new card or file wording to `docs/LANGUAGE.md` and describe the file's contents under "Files" below.

| Kind | Scope | Folder | Files |
| --- | --- | --- | --- |
| `adultRoster` | team | General | `convex/sheetKinds/adultRoster.ts`, `convex/sheetData/adultRoster.ts` |
| `drivers` | team | General | `convex/sheetKinds/drivers.ts`, `convex/sheetData/drivers.ts` |
| `readiness` | team | General | `convex/sheetKinds/readiness.ts`, `convex/sheetData/readiness.ts` |
| `attendance` | team | General | `convex/sheetKinds/attendance.ts`, `convex/sheetData/attendance.ts` |
| `money` | team | Money | `convex/sheetKinds/money.ts`, `convex/sheetData/money.ts` |
| `health` | team | Health | `convex/sheetKinds/health.ts`, `convex/sheetData/health.ts` |
| `event` | event | Events | `convex/sheetKinds/event.ts`, `convex/sheetData/event.ts` |
| `eventFees` | event | Money | `convex/sheetKinds/eventFees.ts`, `convex/sheetData/eventFees.ts` |
| `eventTravelEmergency` | event | Health | `convex/sheetKinds/eventTravelEmergency.ts`, `convex/sheetData/eventTravelEmergency.ts` |

Adding a kind that isn't listed is the one case that touches shared files: add its literal to `sheetFileKind` in `convex/lib/sheetKinds.ts` (schema-additive), one line to `convex/lib/sheetRegistry.ts`, and its two modules to `convex/_generated/api.d.ts`.

**Season archive (owner decision, November 12, 2026):** when a season transition activates the new season (`seasonTransition.ts`, stage `activate`), `startSeasonArchive` (`convex/sheetArchive.ts`) schedules an archive job for the OLD season. `bunx convex run sheetArchive:archiveSeasonNow '{"seasonId":"..."}'` starts it by hand and is safe to repeat; it answers `notArchived` (and does nothing) while the season is still active or a draft. One action (`sheetArchiveActions.archiveStep`) handles one file: it finds or makes `Archive` inside the file's folder (from the folder settings current at that step, so a restart after a folder change uses the new folders) and `<season name>` inside that, checks where the file is now, moves it there with `moveFile`, and marks the `sheetExportFiles` row `archivedAt`, `archiveFolderId` and frozen. The folder made under each live folder is remembered in `sheetArchives.archiveFolders`. No run writes an archived file again (`claimNext` drops it, `saveFile` refuses it, a folder change does not forget it). Progress and notes are in `sheetArchives` (state running, done, partial or skipped). Nothing is done when Drive was never connected; with updates turned off a plain note is kept and nothing moves. A Google failure stops the job as partial; starting it again continues with the files left. Audit rows: `archiveStartAuto` (season transition, under the confirming Coach) or `archiveStartManual` (under the Coach who connected Drive, reason "Started from the server"), and `archiveFinish` with the state and the number moved. The card shows everyone "Last season's spreadsheets were moved to an Archive folder inside each folder (for example General > Archive > {season name})." after a finished move; a Coach also sees when a move stopped partway or was skipped. Archived files leave the current lists. Nothing is ever deleted.

**Archive sharing and retention:** each archived file stays inside the folder it was shared through, so its sharing does not change. Archived files stay in the yearly retention review (DECISIONS, Retention). The `archiveFolderId` setting from the earlier layout is no longer asked for or used.

### Code map

`convex/sheetExports.ts` (status, press, `startNow`, schedule entry, run planning and state, settings), `convex/sheetExportActions.ts` (one-file runner, Drive setup check), `convex/sheetExportData.ts` (shared paged reads of students and adults), `convex/sheetKinds/<kind>.ts` (each kind's definition and row builder), `convex/sheetData/<kind>.ts` (each kind's queries and loader), `convex/lib/sheetRegistry.ts` (the list of kinds), `convex/lib/sheetKinds.ts` (kind contract, validators, link visibility), `convex/lib/sheetEvents.ts` (which events get files, the Travel emergency rule, event file names, per-update cap), `convex/sheetArchive.ts` and `convex/sheetArchiveActions.ts` (season archive), `convex/lib/sheetRows.ts` (shared cell helpers), `convex/lib/googleSheets.ts` (Drive/Sheets calls), `convex/lib/googleAuth.ts` (service-account token, shared with Calendar), `convex/lib/driveLinks.ts` (folder link parsing), `src/features/team-spreadsheets/` (card and wizard; copy in `copy.ts`).
