# Team spreadsheets

Venom Status keeps team spreadsheets up to date in the team's Google Workspace **shared drive**, using its own Google service account. Nobody edits these files by hand: every update clears and rewrites each tab, and a note at the top of every tab says so. Build stage 1 (of 7) ships the Google connection, the **Student roster** and **Shirt sizes**, and the full update machinery; later build stages only add file kinds. ("Build stages" are the roadmap at the end; the Connect Google Drive steps a Coach sees are a separate thing.)

## Owner checklist (once)

Production Google project: `denham-venom-production`. None of this touches sign-in.

1. In that project, enable the **Google Sheets API** and the **Google Drive API** (APIs & Services > Library).
2. Create a service account named **Venom Status reports** (IAM & Admin > Service Accounts). No project roles are needed.
3. On that service account, create a **JSON key**. Keep the file private; never commit it or paste it anywhere except the deployment settings in step 8. The service account's email address is the `client_email` value inside that file.
4. The team's drive must be a **Google Workspace shared drive**, not a personal My Drive. Folders in My Drive are refused.
5. In the shared drive: Manage members > add the service account's email address as **Content manager**.
6. In the shared drive, create a parent folder named **Venom Status Reports** and, inside it, five folders: **General**, **Money**, **Health**, **Archive** and **Events**. The parent folder itself is not shared with anyone. Keep the five side by side: a folder inside another configured folder is refused. (The Archive link is optional.)
7. **Sharing model (owner decision, November 12, 2026):** only you and the Venom Status service account are members of the shared drive. Share each subfolder individually with the people who need it (never the Venom Status Reports parent folder). Events can be shared more widely than General. Health only with people who have Health export access; Money only with people who should see money data. Do not add other people as drive members: drive membership reaches every folder.
8. On the Convex deployment, set three values (dashboard or `bunx convex env set`):
   - `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL`: the service account's email address.
   - `GOOGLE_SHEETS_SERVICE_ACCOUNT_PRIVATE_KEY`: the `private_key` value from the JSON key (the `\n` sequences may stay as written).
   - `GOOGLE_SHEETS_EXPORT_ENABLED`: `true` to let Venom Status write to Google. Anything else keeps updates off; the card says so and nothing is written.

   **Caution:** `bunx convex env list` prints every value, including the private key. Do not run it where others can see the screen, and never paste its output anywhere.
9. A Coach opens **Reports > Team spreadsheets > Connect Google Drive**, follows the steps (add the address as a member, paste the General, Money, Health and Events folder links and the optional Archive link), then presses **Check access**.
10. Press **Update spreadsheets** or wait for the next scheduled update (5:00 AM or 6:00 PM Central Time).

**What success looks like:** the check ends with "Google Drive is connected"; after an update the card lists Student roster and Shirt sizes with an update time and an Open link, and the two files appear in the General folder in Drive.

**Common messages and what they mean**

| Message (shortened) | What it means | What to do |
| --- | --- | --- |
| Venom Status can't open this folder | The service account isn't a member of the shared drive, or the link is wrong | Add the address as Content manager; check the link |
| This folder isn't in a shared drive | The folder is in a personal My Drive | Move it into the shared drive |
| …is in a different shared drive | Folders come from two drives | Use folders from one drive |
| …is inside the … folder | A configured folder sits inside another one | Make the folders siblings |
| Google didn't accept the Venom Status service account | The key or email on the deployment is wrong or disabled | Re-set the two values from the JSON key |
| The service account's key can't be read | The private key value is cut off or mangled | Re-set it from the JSON key |
| Spreadsheet updates aren't turned on yet | `GOOGLE_SHEETS_EXPORT_ENABLED` isn't `true` | Set it to `true` |
| Google was busy and didn't finish this spreadsheet | Google was slow or failing | Press Update spreadsheets in a few minutes |
| …no longer in its folder / …missing in Google Drive | Someone moved, trashed or deleted the file | Nothing; a new one was made (the old one stays in Drive) |

**Retention:** Drive files and their version history are part of the yearly retention review (DECISIONS, Retention). Old versions and files left behind after a folder change or a remade file are not deleted by Venom Status.

This is a separate service account from the Calendar one (`TIMECLOCK_CALENDAR_*`).

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
- **No duplicates:** the file ID is reserved with Drive `files.generateIds` and used to create the file; a repeated create answers 409 (already made) and counts as success. Every file carries a hidden Drive property with a stable key (season + kind + event); before making a file Venom Status searches by that key **inside the configured folder** (recovers a save lost after a create).
- **Every update checks the stored file** (even when nothing changed): it must exist, not be trashed, and have the configured folder among its parents. Otherwise a new file is made in the right folder, the old one stays in Drive, and the card says so ("missing" or "no longer in its folder"). The note clears after a later update that wrote without remaking.
- **Interrupted first write:** the file is saved right after it is created, with its fingerprint cleared, so a write that never finished is redone at the next update.
- **Writing a file:** one `batchUpdate` adds or renames tabs, clears and rewrites every tab, freezes the note and header rows, adds a warning-only protection once, and deletes tabs the builder no longer produces. The fingerprint covers a layout version (`LAYOUT_VERSION` in `convex/lib/googleSheets.ts`; bump it when layout or formatting changes), the file name and the tabs; if it matches, no write is made.
- **Formulas:** text is sent as text, never as a formula. Text that starts with `=` or `@` (or a tab or return) also gets a leading apostrophe (`safeCell` in `convex/lib/sheetRows.ts`), as does text starting with `+` or `-` unless the next character is a digit, a space or `(`; so a CSV download opened in Excel can't run it. Phone numbers like `+1 555 ...` or `(202) 555-0123` and numbers like `-5` stay clean; the apostrophe shows in Sheets for the rest. This is a deliberate trade for safety.
- **Moving folders:** saving different folders forgets files made in a changed folder (bounded read of 500 rows); the next update makes new ones. The old files stay in Drive for a person to delete. Saving settings writes an audit row (who, which folders changed by name, no folder links).
- **Setup check:** read-only calls (scope `drive.metadata.readonly`), so it works before updates are turned on. It requires all folders (General, Money, Health, Events, Archive if set) to be distinct, in one shared drive, writable, and **not nested**: each folder's ancestor chain (up to 30 levels) is walked and a folder inside another configured folder is refused.
- **Scopes:** writing requests only `https://www.googleapis.com/auth/drive`. The Sheets API accepts the Drive scope for `spreadsheets.get` and `spreadsheets.batchUpdate`, so the separate `spreadsheets` scope was dropped. This has not been exercised against live Google from this repository (tests mock fetch); if the first real update answers 403 on a spreadsheet call, add `https://www.googleapis.com/auth/spreadsheets` back to `WRITE_SCOPE`.
- **Roster grade** follows `coachRoster.list`: the setup draft's grade first, else the confirmed health-and-consent profile's.

### Files in build stage 1

- **Student roster** (General): Students tab with Preferred name, Legal name, Grade (blank if none saved), Subteam, Second subteam, Leadership role, Travel Team, Student email, Parent or guardian name / relationship / phone / email (confirmed profile first, else the older fields, as the Coach roster does), and Parent accounts (linked). Active students of the current season.
- **Shirt sizes** (General): Counts (XS to 3XL plus Other; columns Students / Adults / Total; totals row), Details (Name, Student or adult, Subteam, Size) and Missing size. Active students and active adults. "Adult" means an active Coach, Mentor or Travel Lead, or a Parent with Mentor or Travel Lead access; plain Parents are left out. A size outside the app's list is counted under Other and shown as entered.

### Roadmap (build stages 2 to 7)

Each later stage adds file kinds to `convex/lib/sheetKinds.ts` and a builder in `convex/sheetExportActions.ts`; the run, lease, retry, link-visibility and Reports card behavior is in place.

Per-event spreadsheets all go in the **Events** folder (owner decision, November 12, 2026). Exceptions, pending owner override: each event's Fees file stays in Money and its travel emergency file stays in Health.

2. Event rosters and signups (Events).
3. Attendance (Events).
4. Money: fees, payments, balances (Money folder; each event's Fees file stays here).
5. Health: allergies, medications, emergency contacts (Health folder; each event's travel emergency file stays here).
6. Travel: rooms, drivers, transport (Events; the travel emergency file stays in Health).
7. Season switch: move last season's files into `Archive/<Year>` and freeze them (the Archive folder ID is already stored). Season archiving remains a later stage.

### Code map

`convex/sheetExports.ts` (status, press, schedule entry, run state, settings), `convex/sheetExportActions.ts` (one-file runner, Drive setup check), `convex/sheetExportData.ts` (paged reads), `convex/lib/sheetKinds.ts` (kinds, link visibility), `convex/lib/sheetRows.ts` (row builders), `convex/lib/googleSheets.ts` (Drive/Sheets calls), `convex/lib/googleAuth.ts` (service-account token, shared with Calendar), `convex/lib/driveLinks.ts` (folder link parsing), `src/features/team-spreadsheets/` (card and wizard; copy in `copy.ts`).
