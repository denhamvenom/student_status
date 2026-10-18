# Audit Report: Coach

Date: 2026-10-18. App: 8044 Student Status, local development copy at `http://localhost:5173/` with mock data. Timeclock (`:5174`) was out of scope. The owner was signed in as the Coach in Chrome. I did not sign in or out.

Setup notes:
- I opened a new tab in the same Chrome profile, because this session could not see the owner's existing tab. The new tab was already signed in as the Coach (header role "Coach").
- I read the developer's `REVIEWER_GUIDE.html` for the 13 Coach areas, the seeded states and the known quirks, and treated it as context only. No account emails from it appear here.
- I did not use `?review=` fixture mode. `src/App.tsx` is that fixture app, so its wording is not treated as live.
- I made no edits. I did not press any button that saves, approves, verifies, posts or opens a saving dialog. Wizard steps were not advanced: New event was viewed at step 1 only, and the Season steps were read in code.

## 1. Executive summary

The Coach role is complete and well protected. Every page loads, 12 of the 13 guide areas are in the Coach menu (the 13th, Parent forms, is for parents), and the money, consent and season tools use preview steps, typed reasons and "this changed" checks. Clarity is the weak point: about half of the longer helper sentences are above grade 8, recovery messages use system words ("committed", "held rows", "revisions", "coverage"), and one idea often has several names (five names for unused personal money; "Paid" means a different amount on Money and on Team reports). The mental load is high because the menu groups follow the code rather than the job (Attendance and Retention under Admin, parent access under Join requests, student corrections under Users & Roles), and the Money page alone holds about twelve tools.

A newcomer could finish 3 of the 8 top tasks unaided (see who owes money, find students with missing information, start a new event). They would first get lost in the top menu: clicking a group name such as "Money" does not open the Money page. It only changes the second row of links and underlines "Money" while the old page stays on screen. After that, they would struggle to get a trip ready: the readiness page shows what is open, but each item has to be fixed on a different page.

Language findings: 52 | Navigation and workflow findings: 15 | Items needing owner decision: 34 | Code access: Yes | Share of full-sentence text above grade 8: 28 of 55 on-screen sentences of 8+ words checked (plus 16 of 20 code-only messages; 9 of 24 shorter lines also score above 8, but the score is unreliable for lines that short) | Model tiers used: lead Opus 5.5 (high effort); code grounder Sonnet 5.5 (medium); safety verifier Opus 5.5 (high, fresh context).

Reading grades come from a Flesch-Kincaid script (a vowel-group count and a hyphenation dictionary, taking the higher syllable count). Expect about ±1 grade.

## 2. Site map and purpose

Desktop has five group tabs: Team, Events, Money, Reports, Admin. Each group shows a second row of links. The phone has a bottom bar (Team, Events, Readiness, Money, More), and the More sheet lists the other 11 links plus Sign out in one flat list.

In the "Predicted" column, I wrote down what I expected from each label before opening any page.

| Route / tab | Desktop | Phone (how reached) | Source component | Predicted from the label | What it actually is |
|---|---|---|---|---|---|
| `/` Team | Team > Team | Bottom bar "Team" | `CoachRosterManagement` (`src/CoachRosterManagement.tsx`), summary card `TeamRosterSummary` (`src/DashboardReports.tsx:47`) | Student roster | Matches. Roster with filters, inline Subteam and Travel Team controls that save at once, and Archive per row. |
| `/team/:id` student record | From a roster name | Same | `CoachStudentRecord` (`src/CoachStudentRecord.tsx:46`), `FirstRegistration` | n/a (no menu item) | One student's status, money, next event, profile, parents, permission link, FIRST verification and attendance. Has a "← Team" link back. |
| `/enroll` Join requests | Team > Join requests | More > Join requests | `JoinPage` (`src/LiveApp.tsx:270`) + `CoachParentAccess` (`src/ParentInvites.tsx:58`) | People asking to join, waiting for approval | Mostly parent access: the parent-invitation switch, each student's parent links with Revoke access, and Create team code. The join requests themselves are at the bottom ("Pending · 0"). |
| `/adults` Users & Roles | Team > Users & Roles | More > Users & Roles | `Adults` (`src/Adults.tsx:90`) + `ProfileCorrectionQueue` (`src/ProfileCorrections.tsx:28`) | Adult accounts and roles | Matches, plus a "Profile corrections" queue for student legal-name and rooming-category fixes. |
| `/events` Events | Events > Events | Bottom bar "Events" | `EventList` (`src/LiveApp.tsx:150`) | Events and trips, create event | Matches. Grouped as Competitions, Outreach and Team, with "+ New event". |
| `/events/new` | "+ New event" | Same | `NewEvent` dialog (`src/LiveApp.tsx:271`) | n/a | Six-step wizard: Basics, Who's going, Costs, Requirements, Travel, Review. |
| `/events/:id` | "View event →" | Same | `EventPage` + `EventOperations` + `EventTransport` + `RoomOperations` | n/a | The real work page for an event: sign-up approvals, settings, custom requirements, transport and rooming, in collapsed sections. |
| `/events/:id/rooming` | No link for Coach | No link | `RoomOperations` (`src/features/operations/RoomOperations.tsx:79`) | n/a | The same rooming panel as on the event page. No heading, no event name, no back link. It is reached only by typing the address. |
| `/readiness` Event readiness | Events > Event readiness | Bottom bar "Readiness" | `ReadinessReview` (`src/features/design-review/ReadinessReview.tsx:60`) | Per event, who is ready | Matches. Pick an event, then see Students / Transportation / Rooming with open items, and print a summary. |
| `/drivers` Drivers | Events > Drivers | More > Drivers | `DriversPage` (`src/Travel.tsx:20`) + `DriverOwnerReconciliation` | Drivers and vehicles | Matches, plus a rarely used "Driver ownership review" panel. |
| `/permissions` Permission forms | Events > Permission forms | More > Permission forms | `OperatorPermissionWorkflow` (`src/PermissionWorkflow.tsx:117`) | Permission slips per event and who signed | Per student, not per event: choose a student, then see event coverage, signed forms, paper form entry, request a new signature, and export. |
| `/withdrawals` Withdrawals | Events > Withdrawals | More > Withdrawals | `WithdrawalQueue` (`src/Withdrawals.tsx:85`) | Unclear: leaving an event, or money taken out? | Requests from families to leave an event, plus what happens to money paid. Only pending requests are shown. The h1 is "Withdrawal requests". |
| `/finances` Money | Money > Money | Bottom bar "Money" | `AdminFinance` (`src/LiveApp.tsx:195`) | Balances, charges, payments | Matches, but the page also holds fee priority order, charge matching, bulk payment import, add charge, money returned and transfers, team overview, export and recent changes (about 12 tools). |
| `/fundraising` Fundraising | Money > Fundraising | More > Fundraising | `Fundraising` (`src/Fundraising.tsx:92`) | Fundraisers and amounts raised | Matches (current season only; there are none in this season). |
| `/reports` Reports | Reports > Reports (the only item) | More > Reports | `TeamReports` (`src/TeamReports.tsx:49`) | Printable or exportable reports | A per-student table (money, attendance, events, readiness) with a CSV export. The h1 is "Team reports". |
| `/attendance` Attendance | Admin > Attendance | More > Attendance | `AttendanceOperations` (`src/features/operations/AttendanceOperations.tsx:39`) | Meeting attendance: who came | Not a list of who came. Timeclock repair: recalculate totals, confirm Timeclock names, correct sessions. |
| `/season` Season | Admin > Season | More > Season | `SeasonAdministration` + `SeasonReviewSteps` | Season dates, start a new season | Matches. A six-step season-change wizard plus locked past seasons and timed correction mode. |
| `/settings` Settings | Admin > Settings | More > Settings | `Settings` (`src/LiveApp.tsx:321`) + `FirstInvitationSettings` + `FamilyLinkMaintenance` | My account settings | Appearance, Sign out, FIRST team invitation link. The family-link section hides itself when there is nothing to fix (`src/FamilyLinkMaintenance.tsx:30`). |
| `/retention` Retention review | Admin > Retention review (added automatically at the end) | More > Retention review | `RetentionReview` (`src/RetentionReview.tsx:127`) | Which students are coming back next year | Not about students returning. Record keeping: holds on archived records and a five-year review date. Deletion is switched off. |
| `/forms` Parent forms (guide area) | Not in the Coach menu | Not in the Coach menu | Blocked: "Permission forms are for parents." (`src/LiveApp.tsx:353`) | n/a | For parents only. The Coach equivalent is `/permissions`. I did not type the address (rule 7); the block text is from code. |

## 3. Task results

Tasks are inferred from what the pages offer. "Clicks" counts from the landing page (Team) on desktop.

| Task | First click I would make | Right? | Clicks to finish | Result | Where I got lost |
|---|---|---|---|---|---|
| T1 See who owes money | "Balance due" chip on Team, or the "Money" tab | Chip: yes. Tab: partly (it only reveals the sub-row; a second click on "Money" opens the page). | 1 (chip) or 2 (Money) | Finished unaided | The "Money" tab click did not change the page, but the underline moved to Money. |
| T2 Record a payment | "Money" tab | Partly (2 clicks to reach the page) | 4 to the dialog (Money, Money, row "Record", then fill and submit). Not submitted, per rule 2. | Finished by guessing up to the dialog | The button says only "Record". Inside the account panel, "Close account" looked dangerous. |
| T3 Find students with missing information and open one | "Missing info" chip on Team | Yes | 2 | Finished unaided | None. On the record, "Health information" is listed as missing while allergies are shown, and nothing says why. |
| T4 Get students ready for a trip | Events tab, then the event | Partly. Readiness is a separate page, and the event page sends you there ("Review student requirements in Event readiness."). | 3 to see what is open; 3 to 6 more per item to fix | Finished by guessing | Each open item is fixed somewhere else. FIRST is on the student record (via "Review season verification"), permission on Permission forms (re-pick the student), rooms and transport on the event page (collapsed sections). |
| T5 Approve or decline event sign-ups | Events tab | Partly | 4 (Events, Events, View event, open "Signups and capacity") | Finished by guessing (not pressed, per rule 2) | Sign-ups are inside a collapsed section on each event page. Nothing in the menu shows that sign-ups are waiting. One reason box serves two Decline buttons. |
| T6 Create an event | Events tab, then "+ New event" | Yes | 3 to open the wizard (not advanced, per the owner) | Path clear to step 1 | The type "Team" is not explained on step 1. |
| T7 See or fix attendance | Admin > Attendance | No | n/a | Stuck | The Attendance page has no list of who came. Attendance numbers are in Team reports and on each student record, mostly "Unavailable". The Coach Attendance page only repairs Timeclock data. |
| T8 Invite an adult or control parent access | Team > Users & Roles | Adults: yes. Parents: no. | 3 for adults | Adults: finished unaided. Parents: finished by guessing. | Parent access is under Join requests, not Users & Roles. The student record's "Open family link management" goes to Settings, which shows nothing about family links. |

Navigation problems:
- **Group tabs do not navigate (desktop).** Clicking "Money", "Events", "Reports" or "Admin" only swaps the second row (`src/AppShell.tsx`, `setChosenGroup`). The tab underline moves to the clicked group while the page underneath does not change, so the "where am I" cue is wrong until a second click. "Reports" is a group with one link, "Reports".
- **Labels that do not match pages.** "Retention review" is record keeping, not student retention. "Attendance" is Timeclock repair. "Join requests" is mostly parent access. "Withdrawals" is ambiguous (the h1 says "Withdrawal requests"). "Reports" opens "Team reports".
- **Groups that follow the code, not the task.** Attendance (weekly use) is under Admin with Season and Settings. Retention review is put under Admin automatically only because it belongs to no group (`AppShell.tsx`, `extra`). Student profile corrections are under Users & Roles (adults). Parent access is under Join requests. Family link maintenance is under Settings.
- **Count and hiding.** Desktop has 5 group tabs but 15 destinations. Phone has 4 bar items plus More, which holds 11 links in one flat list that must be scrolled. Retention review, Season and Settings are last in More. The phone loses the desktop grouping entirely.
- **Duplicates.** Rooming appears on the event page and at an unlinked `/events/:id/rooming`. Permission status appears per student (Permission forms) and per event (Event readiness). Archive and Reactivate appear on every roster row and on the student record. Sign out appears in the header, in Settings and in More. "Balance due" appears as a Team chip and a Money column.
- **Names that differ.** Desktop "Event readiness" vs phone "Readiness". Desktop button "Record" vs phone "Record payment". Student record links "Open Coach finance workspace", "Open team readiness" and "Open Coach attendance workspace" vs menu "Money", "Event readiness" and "Attendance". Season text says "Finance" and the event wizard says "student finances" for the page the menu calls "Money".
- **Where am I.** The Drivers page shows "TRAVEL OPERATIONS" above its title where every other page shows the season name. `/events/:id/rooming` has no heading or back link. Deep pages `/team/:id` and `/events/:id` do have back links ("← Team", "← Events").
- **Dead end.** "Open family link management" on the student record goes to `/settings`, where no family-link section shows when maintenance is complete.

## 4. Language findings

Rows are sorted by how often a Coach meets the screen (Money, Team, Events and Readiness first), then by how badly the wording confuses. Where one row holds several strings, they are separated by line breaks in the same order in each column. The grade is the highest of that row's sentences of 8+ words, current → proposed; "n/a" means labels or lines too short to score. Every proposed wording was checked against the code for tests, export headers, PDF text, backend comparisons and email. No email exists in this app. The safety verifier independently re-checked each row not classed `[Text-only / Safe]`, and its corrections are already applied.

**Safety Check, common to every `[Text-only / Safe]` row** (rows with anything extra say so in the Class column):
1. **What changes:** text only.
2. **What could break:** nothing found. The string is not a key, not stored data, not compared in logic, not an export header or PDF text, and not pinned by a test unless the Class column names the test. Nav labels and h1s are pinned by no test (`src/**/*.test.ts` searched).
3. **Role dependency:** the same component is shown to Travel Leads on Money, Fundraising, Events, Readiness, Drivers, Permission forms, Withdrawals and Reports. In every case the new wording means the same for them. No capability moves between roles.
4. **Reversibility:** High.
5. **Class:** as given in the row.

| # | Screen / route | Source file and line | Exact current text | Problem | Reading grade (current → proposed) | Replacement | Class |
|---|---|---|---|---|---|---|---|
| 1 | Money, account details panel (top button) | `src/LiveApp.tsx:231` | Close account | Reads like closing (ending) the student's money account. It only hides the panel. | n/a | Close details | [Text-only / Safe] |
| 2 | Money table column; Team reports column | `src/lib/finance-admin-copy.ts:2; src/TeamReports.tsx:46` | Paid | Same word, two amounts. For Avery Partial, Money shows Paid $40.00 (personal payments only) and Team reports shows Paid $60.00 (everything applied). The Travel Lead pass found the same. | n/a | Money: Paid (personal)<br>Team reports: Applied to charges (the words already on the Money overview tile) | [Text-only / Safe] |
| 3 | Student record Finances box; Money "Money returned" panel | `src/CoachStudentRecord.tsx:36; src/lib/operations-copy.ts:315` | Personal available<br>Fundraising available<br>Unallocated personal payments | One idea (money a student has that is not used yet) has five names on Coach pages: these three, "Available personal payments" (overview tile, report-copy.ts:32) and "unused personal payments" (column help). "Unallocated" is jargon. The app's main term is "personal payments". | n/a | Unused personal payments<br>Unused fundraising credit<br>Unused personal payments | [Text-only / Safe]. Do not change the export column "Personal available" in convex/financeExport.ts:14 (see Q23). |
| 4 | Money table, every row (desktop) | `src/lib/finance-admin-copy.ts:9` | Record | Vague action. The phone shows "Record payment" for the same button, and screen readers already hear "Record payment for <name>". | n/a | Record payment | [Text-only / Safe] (the test pins only the aria label, which does not change) |
| 5 | Money, "What do these columns mean?" | `src/lib/finance-admin-copy.ts:4` | Paid is personal payments applied to charges. Fundraising applied is fundraising credit used on charges. Fundraising available is unused fundraising credit; account details show unused personal payments separately. Available funds are not cash refunds. | Stacked definitions; matches the old column names. | 11.0 → 7.9 | Paid (personal) is personal payments used on charges. Fundraising applied is fundraising credit used on charges. Fundraising available is credit not used yet. Each account's details show unused personal payments. Money still available is not a cash refund. | [Text-only / Safe] (change together with row 2) |
| 6 | Money recovery and progress messages: 17 strings with "commit", 9 with "revision", 13 with "held", across 7 copy files. Four worst shown. | `src/lib/finance-admin-copy.ts:18; src/lib/fee-administration-copy.ts:70; src/lib/fundraising-copy.ts:37; src/lib/charge-administration-copy.ts:23` | In progress. Only amounts shown as committed are final.<br>The original target and scope stay fixed. Select up to 20 held rows to retry using the displayed current financial revisions. Finish any failed money child before resuming its parent operation.<br>Source reversal progress is separate from the target gross/team/travel totals, which commit only when the entire row finishes.<br>Planned target. The corrected obligation commits only after all required source releases finish. | System voice ("committed", "revisions", "held rows", "scope", "money child", "parent operation", "source releases"). These appear when a money job stops partway, when the Coach most needs plain words. Nothing on screen is marked "committed" (verifier). | 13.1 → 7.6 | Still processing. This amount may still change.<br>The amount and the students stay the same. Pick up to 20 rows on hold to try again. Finish any failed student step first, then resume the whole job.<br>The fundraiser totals (raised, team, travel) change only after the whole row is done.<br>Planned amount. The new charge amount is saved only after the extra money already used on it is moved back. | [Do Not Touch: payment], text only, for owner review. Verifier agreed with these corrected wordings. Rename the nearby "Committed" and "Held" labels in the same change (fee-administration-copy.ts:58,59,71,88,116; charge-administration-copy.ts:24; ChargeAdministration.tsx:81; FinanceOperations.tsx:94,109,111). Update the tests FinanceRecentChanges.test.ts:10,22, ChargeAdministration.test.ts:48,50, FeeAdministration.test.ts:64,65,78,81 and ReviewStates.test.ts:47,48. Never rename the code values 'commit', 'committed', 'progress' or 'held'. |
| 7 | Money, Recent changes | `src/lib/finance-admin-copy.ts:20` | Each before-and-after amount belongs to that recorded change, not the student’s current balance. Earlier amounts appear only when the original record supports them. | Abstract ("belongs to", "supports them"). | 11.0 → 3.7 | Each before and after amount is for that one change. It is not the student's balance now. Older amounts show only if the old record has them. | [Text-only / Safe] |
| 8 | Money, Export finances | `src/lib/finance-export-copy.ts:3; :5; :6` | Download charges and payments for the selected students. The charge file separates personal payments from fundraising credit. Available balances repeat on each charge row; do not add those repeated balances together.<br>Download the JSON file too. It lists every included student, including those with no charges, and records when the data was collected.<br>Records are collected over a time range. They do not all represent one moment in time. | Long and technical. "JSON" is unexplained. The last line is system voice. | 9.4 → 6.6 | Download charges and payments for the students you choose. The file lists personal payments and fundraising credit apart. Each charge row repeats the student's available balance, so do not add those up.<br>Also download the JSON file. It lists every student included, even those with no charges, and when the data was gathered.<br>The data is gathered over a short time, not at one exact moment. | [Text-only / Safe] (tests pin only the button words) |
| 9 | Money, account details, Correct a payment receipt | `src/lib/payment-admin-copy.ts:38` | Preserve the original receipt and record a reasoned correction. Reductions may restore unpaid charges. Actual refunds use the separate payout workflow. | "reasoned correction", "payout workflow". It does not say where refunds are recorded. | 10.2 → 6.0 | The original payment stays on record. Enter the right amount and a reason. Lowering a payment can make a charge unpaid again. To record a refund, use Money returned. | [Do Not Touch: payment], text only. Verifier agreed. |
| 10 | Money, account details, Add a charge | `src/lib/operations-copy.ts:84; :85` | Classify event charges as the main event/travel fee or an extra, such as lunch. Outstanding credits will apply by priority.<br>Standalone charge | "Classify", "Outstanding credits will apply by priority", "Standalone". | 8.4 → 6.3 | Choose if this is the main event or travel fee, or an extra like lunch. Money the student already has pays charges in Priority order.<br>Not for an event | [Do Not Touch: payment], text only. Verifier agreed with this corrected wording ("Priority" points to the form's own Priority box). |
| 11 | Money, Fee priority order | `src/lib/fee-administration-copy.ts:16; :18` | Some earlier charges are not yet matched to a shared fee. Match them before confirming the full season payment order.<br>Match older charges to the fee they belong to. Names or amounts alone aren't enough; anything unmatched waits for a Coach. | "shared fee" is never explained. Stacked clauses. | 5.4 → 3.6 | Some earlier charges are not matched to a shared fee yet. Match them before you confirm the payment order.<br>Match earlier charges to their shared fee. A matching name or amount alone is not enough. Anything not matched waits for a Coach. | [Do Not Touch: payment], text only. Keeps "earlier" so it matches the button "Match earlier charges" (pinned by FeeAdministration.test.ts). Verifier agreed. |
| 12 | Money, Bulk payment entry | `src/lib/payment-admin-copy.ts:10` | Record personal payments received offline. If an import stops partway, retry with the same batch name so rows aren't recorded twice. | "offline" is unclear, because the app never takes payments online. | 6.5 → 6.4 | Record personal payments that families made outside this app (cash, check or other). If an import stops partway, retry with the same batch name so no row is saved twice. | [Do Not Touch: payment], text only. Verifier agreed. See Q16 on duplicate protection. |
| 13 | Money, Money returned form | `src/lib/operations-copy.ts:302; :304; :311; convex/financeOperations.ts:70` | Other external method<br>Method reference | Formal. "Method reference" does not say what to type. | n/a | Other<br>Check or receipt number | [Do Not Touch: payment], text only. Also change operations-copy.ts:311 ("Enter the date and method reference.") and the field name in convex/financeOperations.ts:70 (needs a backend deploy). Verifier agreed. |
| 14 | Money overview tile; Fundraising | `src/lib/report-copy.ts:28; :29; src/lib/fundraising-copy.ts:26` | Gross Raised<br>Gross raised is the total before the team and student split.<br>Known gross raised | Most 12-year-olds do not know "gross" in this sense. | 3.7 → 5.9 | Total raised<br>Total raised is the amount before it is split between the team and students.<br>Known total raised | [Text-only / Safe] (display labels only; backend comments and errors use their own text) |
| 15 | Team summary card; Money overview note | `src/lib/report-copy.ts:30; :24` | Inactive students<br>Totals include active and inactive student accounts in the current season. | Two names for one state. The Team page says "archived" in five places (button, list heading, status chip, count line, dialogs). Only this card says "inactive". | 10.2 → 6.3 | Archived students<br>Totals count both active and archived students this season. | [Text-only / Safe]. The Travel Lead's read-only roster shows the same card, with the same meaning. |
| 16 | Team column STUDENT SIGN-IN; student record Status box | `src/CoachRosterManagement.tsx:23; src/CoachStudentRecord.tsx:30` | Access active<br>Access inactive<br>Student account: No linked student account | The column says "sign-in", its values say "access", and the record page says "student account": three names for one thing. | n/a | Can sign in<br>Sign-in turned off<br>Student sign-in: None linked | [Text-only / Safe] |
| 17 | Team MISSING PROFILE INFORMATION; student record | `src/CoachRosterManagement.tsx:32; src/CoachStudentRecord.tsx:35` | None identified | Formal, and sounds unsure. | n/a | Nothing missing | [Text-only / Safe] |
| 18 | Team, archived view count line | `src/CoachRosterManagement.tsx:45` | Showing all 1 archived students. | Grammar ("1 students"). Team reports already handles one student (src/TeamReports.tsx:34). | n/a | Showing 1 archived student. | [Text-only / Safe] (the roster line is not pinned by a test) |
| 19 | Team subtitle; Archive and Reactivate dialogs (read in code); status-clash message | `src/lib/roster-management-copy.ts:14; :5; :6; :12` | Manage active and archived student profiles in the current season.<br>Archive this current-season student profile. Records and balances are retained. This changes roster status; it does not deactivate or reactivate the linked Google account.<br>Restore this current-season student profile. Eligible upcoming Whole Team events include reactivated students while preserving earlier withdrawals. This changes roster status; it does not deactivate or reactivate the linked Google account.<br>Student status changed. Review the current roster and choose the appropriate action again. | "retained", "roster status", "deactivate", "preserving earlier withdrawals"; passive and formal. | 14.3 → 6.3 | See and manage this season's active and archived students.<br>This moves the student to the archived list. Their records and balances stay. Their Google sign-in does not change.<br>This moves the student back to the active list. They rejoin upcoming Whole Team events, but not events they left. Their Google sign-in does not change.<br>This student's status just changed. Check the list and choose again. | [Text-only / Safe] |
| 20 | Student record Status box | `src/CoachStudentRecord.tsx:35` | Required setup: Recorded / Incomplete<br>3 item(s) | "Recorded" does not say what was done. "item(s)". | n/a | Student setup: Done / Not done<br>3 missing | [Text-only / Safe] |
| 21 | Student record links | `src/CoachStudentRecord.tsx:36-42` | Open Coach finance workspace<br>Open team readiness<br>Open Coach attendance workspace<br>Open correction requests | The names do not match the menu (Money, Event readiness, Attendance, Users & Roles), so the Coach lands on a page with a different name. | n/a | Open Money<br>Open Readiness<br>Open Attendance<br>Open profile corrections | [Text-only / Safe] |
| 22 | Student record, FIRST box | `src/FirstRegistration.tsx:128` | Check both in FIRST, then verify. | "Check" can mean "look up" or "tick a box". Here it means both. | n/a | Look up both in FIRST. Then check both boxes and press Verify. | [Do Not Touch: FIRST], text only. Verifier agreed. Also update docs/VISUAL_CHECKS.md:175, which quotes the old line. |
| 23 | Events subtitle | `src/lib/live-copy.ts:8` | Competitions and outreach for the current season. | Leaves out the third type, Team, which has its own section on the same page. | n/a | Competitions, outreach and team events this season. | [Text-only / Safe] (students, parents and Travel Leads see it too, with the same meaning) |
| 24 | Event page, Signups and capacity | `src/lib/operations-copy.ts:335` | 4 places reserved of 4 · 0 available. Pending signups reserve a place; charges begin at confirmation. | "charges begin at confirmation" is jargon. | 6.4 → 1.5 | 4 of 4 places taken · 0 left. A pending signup holds a place. The fee is charged only when the student is confirmed. | [Text-only / Safe]. Keep the template's optional "of N" and "· N left" parts. Verifier agreed (fee only on approve or promote, eventOperations.ts:72-73). |
| 25 | Event page, Event settings line | `src/lib/operations-copy.ts:336` | Waitlisted students are promoted manually in signup order. | Passive; "promoted manually". | 14.1 → 5.5 | Waitlisted students move up only when someone presses Promote. They move up one at a time, in signup order. | [Text-only / Safe]. Verifier: the order is enforced (eventOperations.ts:68-69; Promote is enabled only on the first row), so the rule stays in the text. See Q17. |
| 26 | Event page counts | `src/lib/operations-copy.ts:325; custom-requirement count in the event component (line not located)` | 4 passenger seats for 3 riders (2 students, 1 additional adults).<br>1 custom requirements | Plural errors. | 9.1 → 5.9 | 4 passenger seats for 3 riders (2 students, 1 more adult).<br>1 custom requirement | [Text-only / Safe] (template plural logic only) |
| 27 | Event page, Custom requirements form | `src/features/operations/EventOperations.tsx:78; src/lib/operations-copy.ts:208` | Use a unique short name, such as lunch-order (up to 32 letters, numbers, hyphens or underscores). Keep it unchanged when editing the same requirement.<br>HTTPS link | Developer voice: the short name is a stored key. "HTTPS" is jargon. | 8.3 → 1.9 | A short code, like lunch-order. Use up to 32 letters, numbers, - or _. Do not change it later.<br>Web link (https://) | [Text-only / Safe] |
| 28 | Event page, Rooming (also /events/:id/rooming) | `src/lib/operations-copy.ts:265-267; :260; :261; :272` | Students may choose roommates until the room deadline. A fifth occupant requires authorization and a note; six are never allowed.<br>Correction or fifth-occupant reason<br>Authorize a fifth occupant<br>requested assignment | "occupant", "authorization". "requested assignment" does not say who asked for what. | 7.8 → 2.3 | Students can pick roommates until the room deadline. A 5th student in a room needs your OK and a note. A room can never have 6.<br>Reason (for a fix or a 5th student)<br>Allow a 5th student<br>asked to be assigned | [Do Not Touch: safety], text only. Keep the leading space in the rule string and the " · " before "asked to be assigned". The backend repeats the rule in convex/rooms.ts:215,276 (optional update). Verifier agreed. |
| 29 | Readiness print summary; Team reports column | `src/features/design-review/readinessCopy.ts:40-41; src/TeamReports.tsx:46` | Outstanding<br>No outstanding items shown. | A 12-year-old reads "outstanding" as "excellent". "shown" sounds unsure. | n/a | Still to do<br>Nothing left to do. | [Text-only / Safe] once src/TeamReports.test.ts:29 (pins data-label="Outstanding") is updated in the same change |
| 30 | Readiness, bottom | `src/features/design-review/readinessCopy.ts:42 + link` | Print permission forms from Permission forms | Reads like a broken sentence. | n/a | To print permission forms, open Permission forms. | [Text-only / Safe] |
| 31 | Readiness, FIRST cell link (every student) | `src/features/design-review/ReadinessReview.tsx:96` | Review season verification | Does not say it opens the student's page. | n/a | Open student record | [Text-only / Safe] |
| 32 | Drivers subtitle and status chip | `src/lib/operations-copy.ts:6; :39 (used at src/Travel.tsx:42)` | Passenger seats exclude the driver. Only active, approved drivers count toward event capacity.<br>Unavailable | "count toward event capacity". "Unavailable" hides the reason. | 10.5 → 5.2 | Passenger seats do not count the driver. Only seats from active, approved drivers count for events.<br>Not approved or inactive | [Do Not Touch: safety], text only. Verifier agreed: the chip shows exactly when not approved or not active. |
| 33 | Drivers, Driver ownership review | `src/lib/adult-profile-copy.ts:20` | Review unowned driver records with one verified Mentor Google email match. Other conflicts need separate Coach review. | Jargon: "unowned driver records", "verified ... match", "conflicts". It also tells the Coach to ask a Coach. | 9.2 → 6.0 | Link a driver to a Mentor when the driver's email matches one Mentor's Google email. Check other cases by hand. | [Text-only / Safe] (Coach-only panel) |
| 34 | Withdrawal requests subtitle | `src/lib/live-copy.ts:15` | Review participation changes and how event payments are handled. | Vague. It does not say these are requests to leave an event. | 10.2 → 7.6 | Decide requests to leave an event, and what happens to money already paid. | [Text-only / Safe] |
| 35 | Withdrawal decision summary (read in code; no request pending) | `src/lib/operations-copy.ts:330` | Return to student account: $X · retain paid: $Y. Unpaid extras $Z will be canceled. Returned funds automatically apply to other outstanding charges by priority; any remainder stays available in its original payment or fundraising source. This is not a cash or check payout. | Long and stacked: "retain", "remainder", "source", "payout". | 8.3 → 4.6 | Back to student account: $X. Team keeps (not refunded): $Y. Unpaid extras ($Z) will be canceled. Money put back pays the student's other charges first, in fee order. Anything left stays on the account as the same kind of money (personal payment or fundraising credit). This is not a cash or check refund. | [Do Not Touch: payment], text only. Verifier agreed with this corrected wording (it keeps the payment-vs-fundraising distinction). |
| 36 | Permission forms subtitle | `src/lib/permission-workflow-copy.ts:5` | Review submitted evidence and current event coverage. Signed receipts retain their original information. | "evidence", "coverage", "receipts retain". | 14.2 → 1.8 | Check signed forms and the events they cover now. What a parent signed is saved and does not change. | [Do Not Touch: consent], text only. Verifier agreed with this corrected wording. |
| 37 | Permission forms, per-student panel | `src/lib/permission-workflow-copy.ts:11; :36` | Current event coverage<br>This form does not currently cover an event. | "coverage" is jargon. | 5.2 → 2.3 | Permission status by event<br>This form does not cover any event now. | [Do Not Touch: consent], text only. Verifier rejected my first wording for the heading and supplied this one. Update src/PermissionWorkflow.test.ts:19, which pins the second string. On renaming "receipt", see Q24. |
| 38 | Permission forms, Field trip form template box | `src/PermissionWorkflow.tsx:210` | The original one-page form layout and wording, including minor first aid, are the Coach-approved template.<br>Selected for future PDF preparation. | Passive; "template", "PDF preparation". | 12.3 → 7.4 | This is the Coach-approved field trip form. It keeps the original one-page layout and wording, including minor first aid.<br>New forms will use this form. | [Do Not Touch: consent / legal], text only for this box. Never edit src/lib/field-trip-approved.ts: the backend compares that wording. Verifier agreed. |
| 39 | Permission forms, Export permission records | `src/lib/permission-workflow-copy.ts:44; :43` | Download an event permission list as a JSON file. Health details and complete signed records require a separate export grant.<br>Include permission snapshots and health records | "export grant" is not the name used on Users & Roles ("Health export"). "snapshots". | 7.2 → 5.9 | Download a list of permission forms for one event (JSON file). Signed form copies and health details need the Health export permission.<br>Include signed form copies and health records | [Do Not Touch: health], text only. Verifier agreed with this corrected wording. |
| 40 | Join requests, Parent invitations | `src/lib/family-copy.ts:42` | Control whether students can create new parent invitations across the team. Invitations already issued remain valid until their own expiry, and linked parents keep access. | Long and formal ("remain valid until their own expiry"). | 11.5 → 6.1 | Choose if students can invite new parents. Invitations already sent still work until they expire. Linked parents keep access. | [Text-only / Safe] (the browser-check script pins only the heading and the checkbox label) |
| 41 | Users & Roles, Invite adult | `src/lib/account-copy.ts:31; :15` | Invitations expire after one week and must be accepted with the invited Google email.<br>Financial editing and health exports are separate permissions for Travel Leads. | Passive. The two permission boxes below are never explained. | 11.2 → 6.9 | Invitations expire after one week. The adult must sign in with the Google email you enter.<br>These are extra permissions for Travel Leads. Financial editing lets them record and correct money (payments, charges, refunds). Health export lets them download health records and signed form copies. | First string [Text-only / Safe]. Second string [Do Not Touch: approvals, health, payment], text only (it adds a missing explanation). Verifier agreed with this fuller wording. |
| 42 | Attendance | `src/lib/operations-copy.ts:146; src/lib/report-copy.ts:36; src/lib/operations-copy.ts:150` | Review Timeclock attendance and make audited corrections. Clock-in and clock-out stay in the separate Timeclock app.<br>Recalculate attendance from the Timeclock and recorded corrections. Totals may be unavailable until this finishes.<br>Earlier attendance checkmarks are shown separately from clocked time. | "audited corrections", "recorded corrections". Timeclock is never explained. | 13.3 → 7.6 | Check Timeclock attendance and fix mistakes. Every fix is logged. Students clock in and out in the separate Timeclock app.<br>Count all attendance again. This uses the Timeclock and your fixes. Totals may say Unavailable until it is done.<br>Old checkmark records are listed apart from Timeclock time. | [Text-only / Safe] (the button "Recalculate attendance" is pinned by ReviewStates.test.ts and is not changed) |
| 43 | Team reports | `src/TeamReports.tsx:34-38; :46; src/lib/live-copy.ts:13` | Showing 10 of 10 students shown so far. More students may be available; filters and CSV include only students shown.<br>Choose an event to see readiness and outstanding requirements.<br>Tuesday attendance<br>Thursday sessions | "shown" appears three times. The two attendance columns use two words for one idea, and the attendance section calls them "Tuesday meetings" and "Thursday meetings" (report-copy.ts:16). | 10.2 → 3.4 | Showing 10 students so far. Press Load more to see more. Filters and the CSV file use only the students shown.<br>Choose an event to see who is ready and what is still to do.<br>Tuesday meetings<br>Thursday meetings | [Text-only / Safe] once src/TeamReports.test.ts:28-36 (pins the count sentences) is updated. The Mentor report shares live-copy.ts:13, with the same meaning. Leave the CSV headers alone (Q23). |
| 44 | Season page and past seasons | `src/lib/season-admin-copy.ts:3; src/SeasonAdministration.tsx:116; src/SeasonReviewSteps.tsx:69; src/lib/historical-copy.ts:3; :4` | Prepare the next season and review each student before any transition.<br>Review and save each decision before confirming. Historical records remain attached to their original season.<br>Locked, read-only historical records. Original student IDs, attendance, signatures and financial evidence remain in this season.<br>Historical records are locked. Corrections preserve the original evidence and record your identity, time and reason. Access expires after 15 minutes.<br>I understand that this changes historical records and reports. | "transition", "remain attached", "financial evidence", "preserve the original evidence". | 14.1 → 7.4 | Set up next season. Check each student before you switch seasons.<br>Save each choice before you confirm. Old records stay with the season they came from.<br>These past-season records are locked. Attendance, signatures and money records stay with this season.<br>Past records are locked. A fix keeps the original and saves who made it, when and why. Fix mode ends after 15 minutes.<br>I understand this changes past records and reports. | [Text-only / Safe] |
| 45 | Season review steps (read in code; steps not opened) | `src/SeasonReviewSteps.tsx:27, :55 (literals)` | Every active student requires a roster decision, an account / profile review, and explicit dispositions for each unpaid charge and available source. Missing or changed decisions stop the transition and link back through its error.<br>Departing funds are normally nonrefundable. Special family requests, Coach approval and actual personal payouts are handled separately in Finance. Archiving never moves money. | "dispositions", "available source", "link back through its error". "Finance" is not a page name (the menu says Money). | 14.1 → 8.0 | Each active student needs a stay-or-leave choice and an account and profile check. Every unpaid charge and all leftover money (personal payments and fundraising credit) also need a choice. If a choice is missing or changed, the switch stops and shows where to fix it.<br>Money left by students who leave is usually not refunded. Family requests, Coach approval and real refunds are handled on the Money page. Archiving never moves money. | [Do Not Touch: payment], text only. Verifier agreed with this corrected wording. |
| 46 | Retention review | `src/lib/retention-copy.ts:8; :10; :14; :29` | Review archived records and record holds. Reaching five years prompts review; it does not authorize deletion.<br>Application accounts<br>Archive date missing — needs Coach review<br>Deletion is disabled pending approved policy and separate verification. | "record holds", "authorize deletion", "pending ... verification". It tells the Coach to ask a Coach. | 16.8 → 7.8 | Check archived records and place holds on any that must be kept. At five years a record is flagged for review. That alone does not allow deleting it.<br>Sign-in accounts<br>Archive date missing. Please check it.<br>Deleting records is turned off until a policy is approved and checked. | [Text-only / Safe] (Coach-only page) |
| 47 | Fundraising | `src/lib/fundraising-copy.ts:3; :6; :23; :33 (and convex/fundraisers.ts:119)` | Record amounts raised and review how proceeds support the team and student travel.<br>Allocate proceeds<br>The allocation is fixed after awards have been recorded.<br>The original travel credit has been spent or transferred. This reduction is on hold for Coach resolution; balances remain unchanged. | "proceeds", "allocate", "awards", "Coach resolution". | 8.4 → 6.0 | Record money raised and see how it is split between the team and student travel.<br>How to split the money<br>The split can't change after amounts are posted.<br>This student's travel credit was already spent or moved, so it can't be lowered yet. Balances have not changed. A Coach must sort it out. | First two strings [Text-only / Safe]. Last two [Do Not Touch: payment], text only. The hold message on screen comes from convex/fundraisers.ts:119, so change it there too (backend deploy). Verifier agreed. |
| 48 | New event wizard and enrollment notice (read in code) | `src/lib/event-copy.ts:39; :42; :9` | Individual student selection is not available in this creation flow.<br>Pending signups are charged only when confirmed. Additional charges can be added from student finances after creation.<br>Participation and event fees are being prepared. Event arrangements will be available when enrollment is complete. | System voice ("creation flow", "enrollment"). "student finances" is not the page name. | 13.1 → 4.4 | You can't pick single students here.<br>Pending signups are charged only when confirmed. You can add other charges on the Money page later.<br>Students and event fees are being added. The rest of the event page will open when this is done. | [Text-only / Safe] (second string is about fees; verifier agreed). Inferred: "arrangements" means transport and rooms, so the owner should confirm the third string. |
| 49 | Account details, Available funds by source (also on the Parent and Student Money pages) | `src/lib/family-copy.ts:15` | Available funds can pay other charges or be used toward a future charge. Money returned from a canceled event stays available here; it has not been paid back to the family in cash or by check. | Long second sentence; "toward". | 8.1 → 4.4 | Available money can pay other charges now or later. Money from a canceled event stays here. It has not been paid back to the family in cash or by check. | [Text-only / Safe] (same meaning for families) |
| 50 | Event page dates | `value formatted in the event component (line not located); template src/lib/operations-copy.ts:336` | Signup closes: 6/14/2027, 7:00:00 PM CDT. (also the waitlist time "10/18/2026, 11:30:31 AM CDT") | Shows seconds and a different date style from the rest of the app ("Jun 21, 2027"). | 2.3 → 2.3 | Signup closes: Jun 14, 2027, 7:00 PM CDT. | [Text-only / Safe] (display format only) |
| 51 | Kickoff note (6 places; also Mentor, Parent, Student) | `src/lib/live-copy.ts:13; src/lib/report-copy.ts:8-9; src/lib/season-admin-copy.ts:21; src/TeamReports.tsx:19, :40` | Attendance totals start at kickoff. | "kickoff" is a FIRST term a new parent or volunteer may not know. The Mentor pass found the same. | n/a | Attendance totals start at the FIRST season kickoff. | [Text-only / Safe] |
| 52 | "needs Coach review" on Coach-only pages | `src/lib/retention-copy.ts:14 (row 46); src/lib/family-link-maintenance-copy.ts (failed); src/SeasonReviewSteps.tsx:15 ("Needs Coach review")` | Maintenance needs Coach review before it can continue.<br>Needs Coach review | Wrong audience: the reader is the Coach. (On pages shared with Travel Leads, see Q2.) | 8.2 → 5.0 | Maintenance needs your review before it can go on.<br>Needs your review | [Text-only / Safe] (Coach-only routes) |

**Repeats, grouped:**
- "commit/committed" appears in 17 copy strings, "revision" in 9 and "held" in 13. They are spread over charge-administration, fee-administration, finance-admin, fundraising, operations, payment-admin and family copy, and all sit on Money or Fundraising states (row 6).
- "evidence" appears in 14 strings in 7 files. "coverage" appears in 8 strings (finance-admin, permission-workflow, retention). "scope" appears in 14 strings (fee administration, permission workflow). Use "records", "events covered" and "students included" when these strings are next edited. Not every one was seen on screen; most are failure or recovery states.
- "needs Coach review" is shown to the Coach on Money (`finance-admin-copy.ts:7`, `:21`, `:34`; `report-copy.ts:26`, `:34`), Fee tools, Fundraising, Retention, Season and Family link maintenance. Only the Coach-only pages are in row 52. The shared pages are Q2.

**Remove before launch** (test-only text, listed and not rewritten):
- Every Coach page, banner: "Development workspace — synthetic data only" (`src/features/design-review/readinessCopy.ts:6`; shown only in dev builds, `src/AppShell.tsx`).
- `/permissions`: "This development workflow accepts only server-registered fictional records. Real permission signing remains closed." (`src/lib/permission-workflow-copy.ts:6`)
- `/permissions` (under "Record paper form" for a student who is not a registered test subject): "Only registered fictional development subjects may use consent." (backend: `convex/permissions.ts:103`, `convex/lib/permissionSigningMode.ts:38`)
- `/permissions` signed-form rows: "Synthetic test evidence" (`permission-workflow-copy.ts:6`); "Synthetic development evidence." (`src/PermissionWorkflow.tsx:109`)
- `/permissions` export: "Synthetic records remain labeled in exports." (`permission-workflow-copy.ts:46`)
- `/permissions` paper form (code): "Record a synthetic paper form", "Record synthetic paper form", "I checked the fictional paper record and confirm it matches the reviewed PDF." (`:40`). Also "Draft authoring does not approve real consent. This creates unapproved wording for the synthetic development workflow; real signing remains closed." (`:51`)
- Parent-side text in the same file, seen by Coaches only in code: "Prepare synthetic form" (`:13`), "Submit synthetic signature" (`:28`), "This wording and medication administration policy are unapproved development drafts. The synthetic form grants no real consent." (`:10`)
- PDF stamps: "SYNTHETIC DEVELOPMENT FORM - NO REAL CONSENT" and "SYNTHETIC SIGNATURE EVIDENCE" (`src/lib/field-trip-pdf.ts:29`, `:191`, `:298`)
- Family pages: "Synthetic review", "Sample Student", "Sample Parent" (`src/lib/family-copy.ts:70`; `src/ParentInvites.tsx:136-138`); the "Approval still required … synthetic workflow …" paragraph (`family-copy.ts:32`)
- Mock data, not UI text, which is cleaned with the data: season names "2027–28 Synthetic rehearsal" and "REHEARSAL ONLY - Historical Charge Correction"; record names starting "REVIEW 2026-10-18", "REHEARSAL ONLY", "SYNTHETIC", "TEST ONLY", "Fictional"; reasons such as "Owner-authorized fictional development review; …".

## 5. Workflow findings

The Coach has 15 menu destinations, plus the student record, the event page, New event and an unlinked rooming page. Tests that failed are named from the Workflow Test (1 purpose, 2 steps, 3 overlap, 4 dead weight, 5 disconnection, 6 repeated entry, 7 hidden dependency, 8 decision burden, 9 role fit, 10 naming).

### W1. Top menu: a group tab does not open a page (Coach, desktop)
- **Goal:** go to Money (or any page in another group).
- **Current flow** (`src/AppShell.tsx`, group buttons call `setChosenGroup`): 1. Click "Money". 2. The second row changes to "Money · Fundraising" and "Money" is underlined, but the Team page stays on screen. 3. Click "Money" again in the second row.
- **Friction:** tests 2 and 7. Every move to another group takes two clicks, and for a moment the menu says you are on a page you are not on. "Reports" is a group with one link.
- **Proposed flow:** 1. Click "Money" and land on Money. Keep the verifier's conditions: if the current page is already in that group, only show the sub-row, so an open New event wizard is not thrown away; and treat the tabs as links.
- **What stays the same:** every link and route; who sees what (`filteredGroups` is still filtered by `menu[role]`).
- **Safety Check:** 1. Navigation behaviour. 2. No data, money, consent or permission effect. Risk: there is no unsaved-change guard anywhere in `src/`, so clicking another group discards half-typed input, the same as any other link does today. 3. Coach and Travel Lead only; Mentor, Parent and Student have flat menus. 4. High. 5. `[Needs Owner Decision]` (behaviour). **Verifier:** agreed with the conditions above. See Q1.

### W2. Menu groups follow the code, not the job (Coach, desktop and phone)
- **Goal:** find a page by what you want to do.
- **Current:** Team[Team, Join requests, Users & Roles] · Events[Events, Event readiness, Drivers, Permission forms, Withdrawals] · Money[Money, Fundraising] · Reports[Reports] · Admin[Attendance, Season, Settings, Retention review].
- **Friction:** tests 1, 7 and 10. Attendance is a weekly job but sits in Admin. Retention review lands in Admin only because it is in no group (`AppShell.tsx`, `extra`). Reports is a one-link group. Join requests and Users & Roles are occasional access tasks mixed with the daily roster. Labels differ from page titles: Event readiness vs phone "Readiness"; Withdrawals vs h1 "Withdrawal requests"; Reports vs h1 "Team reports"; "Retention review" names the wrong idea.
- **Proposed flow (labels and grouping only):** Team[Team, Attendance, Team reports] · Events[Events, Readiness, Permission forms, Drivers, Withdrawal requests] · Money[Money, Fundraising] · People & access[Join requests, Users & Roles] · Admin[Season, Archived records, Settings]. Section 6 has the full table.
- **What stays the same:** all 15 routes, guards, page components and the phone bottom bar.
- **Safety Check:**
  1. Navigation and labels only.
  2. Nothing breaks. No test pins nav labels or h1s. The labels are not keys. The blocked-page fallback h1 reads `menu` labels, but every menu path has a route, so it never shows one.
     - Do this:
       - Change labels in both sources: `readinessCopy.navigation` (desktop) and `navigation-copy.ts` `labels` (phone More sheet). Do not edit the "snapshot" `ui-copy.reference.json`.
       - Keep the `admin` key, which the Travel Lead branch indexes.
       - Add a key for "People & access".
       - List `/retention` in Admin explicitly.
     - Renaming `retentionCopy.title` also renames the page h1 and its error h1. Also update `retention-copy.ts:40` and the backend message in `convex/retentionReview.ts:146-147`. Keep the "Archive status changed" prefix that tests match.
  3. Travel Lead after the change: Team[Team, Team reports] · Events[…] · Money[…] · Account[Profile, Settings]. Nothing is newly reachable or lost. Mentor, Parent and Student are unaffected.
  4. High.
  5. `[Layout / Navigation]`.
- **Verifier:** agreed with these conditions. It suggested "Archived records" over my first idea, "Record keeping".

### W3. Join requests page hides the join requests at the bottom (Coach)
- **Goal:** approve a student who asked to join.
- **Current flow** (`src/LiveApp.tsx:270`): 1. Team > Join requests. 2. Scroll past "Parent invitations", the switch, the per-student parent access list with "Revoke access", and "Team code". 3. Reach "Pending · 0".
- **Friction:** tests 1 and 4. The page title promises join requests, but most of the page is parent access. "Revoke access" and the invitation switch save on click.
- **Proposed flow:** show "Pending · N" first, then Team code, then the parent-access block. Nothing else changes.
- **What stays the same:** all three blocks and their controls.
- **Safety Check:** 1. Layout (JSX order). 2. Nothing breaks: the blocks share no state, and no test covers `JoinPage`. The browser script `scripts/parent-invites-browser-check.mjs` uses the `?review=` fixture, not this page. 3. A Travel Lead can open `/enroll` but sees only the pending list, so nothing changes for them. 4. High. 5. `[Layout / Navigation]`.
- **Verifier:** agreed. Whether parent access should move to Users & Roles is Q8.

### W4. Archive and Reactivate on every roster row (Coach)
- **Goal:** archive a student who left (a few times a season).
- **Current:** a full ACTIONS column with "Archive student" on all 11 rows of the main roster (`src/CoachRosterManagement.tsx:32`). The same button and dialog are on the student record (`src/CoachStudentRecord.tsx:34`).
- **Friction:** tests 3 and 4. A rare, status-changing action sits on the daily screen, in a dense table, next to controls that save on click.
- **Proposed flow:** 1. Click the student's name. 2. On the record, press Archive student (or Reactivate student), give a reason, confirm.
- **What stays the same:** the dialog, the reason, the stale-data check and the backend call (`api.admin.updateRoster`, including Whole Team re-enrolment on reactivation, `convex/admin.ts:123-143`).
- **Safety Check:**
  1. Layout. One of two entry points is removed.
  2. No data or permission change. Reactivation stays reachable: an archived current-season record loads for a Coach and shows "Reactivate student" (`convex/coachRoster.ts:84-87`; test `convex/coachRoster.test.ts:25-36`). Workflow cost: archiving several students means one record visit each. Do this:
     - Change the empty-row `colSpan` from 10 to 9.
     - Reword the saved message `roster-management-copy.ts:8`: "Student profile archived. To undo, press Reactivate student."
  3. Coach only (Travel Lead gets a read-only roster).
  4. High.
  5. `[Layout / Navigation]`. The owner should confirm, because the action changes status.
- **Verifier:** agreed with these conditions.

### W5. Phone More sheet is one long flat list (Coach, phone)
- **Goal:** reach Season, Retention or Settings on a phone.
- **Current:** More opens 11 links plus Sign out with no headings, in menu order, so Retention review, Settings and Sign out are below the fold (checked at 500 px wide).
- **Friction:** tests 7 and 10. The phone loses the desktop groups, so the same page sits in a different "place" on each device.
- **Proposed flow:** the same links under the same group headings as desktop (staff only), Sign out last.
- **What stays the same:** every link; the bottom bar.
- **Safety Check:** 1. Layout. 2. Link order changes to group order. Headings must be built only when the person is staff, or a Parent would see an "Admin" heading (`filteredGroups` is built for every role). Hide empty groups. 3. Coach and Travel Lead. 4. High. 5. `[Layout / Navigation]`.
- **Verifier:** agreed with these conditions.

### W6. Getting a trip ready means visiting four pages (Coach)
- **Goal:** make every confirmed student ready for the Overnight Review Trip.
- **Current flow:**
  1. Events > Event readiness.
  2. Pick the trip; only the selected event shows its open count, and the others say "Select to view".
  3. See "Students · 4 open" and a FIRST cell "Needs completion" with "Review season verification".
  4. Click it to open the student record (`/team/:id`) and verify FIRST there.
  5. Return, then Permission forms to choose the student again and check the form.
  6. Return to the event page and open the collapsed "Rooming" section to place Casey ("requested assignment").
- **Friction:** tests 3, 5 and 7. The readiness matrix is the start point, but every fix is on another page, and two links ("Review student requirements in Event readiness." on the event page; "Permission forms" on readiness) open the general page, not the student or event (Inferred from the hrefs: `/readiness`, `/permissions`).
- **Proposed flow (text only now):** rename "Review season verification" to "Open student record" (row 31) and "Print permission forms from Permission forms" (row 30). Deep links and counts on every event button change behaviour, so they are Q10 and Q11.
- **What stays the same:** all pages and checks.
- **Safety Check (text part):** 1. Text. 2. Nothing found. 3. A Travel Lead sees the same readiness page with the same meaning. 4. High. 5. `[Text-only / Safe]`.

### W7. Sign-up decisions are buried and save instantly (Coach, Travel Lead)
- **Goal:** approve Drew (pending) and promote Ellis (waitlist).
- **Current flow** (`src/features/operations/EventOperations.tsx:66-70`):
  1. Events.
  2. View event.
  3. Expand "Signups and capacity".
  4. Approve, Decline or Promote. Each saves at once with no confirm and no undo (Inferred: approve and promote also add the event fee when the fee is above zero, `convex/eventOperations.ts:72-73`).
  5. To decline, type in the one "Reason for declining a signup" box, which sits after the waitlist and serves both Decline buttons.
- **Friction:** tests 2, 7 and 8. Nothing in the menu or on Events shows that sign-ups are waiting. The reason box has a hidden link to two buttons.
- **Proposed flow (text only now):** reword the capacity and waitlist lines (rows 24 and 25). A confirm step and a waiting-count badge are behaviour changes (Q3, Q12).
- **Safety Check (text part):** as rows 24 and 25.

### W8. The Money page holds about twelve tools (Coach)
- **Goal:** record one family's check.
- **Current:** one long page with:
  - student accounts table, plus an inline account panel with Add a charge, Correct a payment receipt, and Money returned and fundraising transfers;
  - Fee priority order, Match earlier charges, and Bulk payment entry (rows or CSV);
  - Team finance overview (9 tiles);
  - Export finances;
  - Recent changes, plus "Prepare historical changes" (a background job).
- **Friction:** tests 4 and 8. The daily task (find student, record payment) shares a page with season-setup and repair tools (fee order, charge matching, CSV import, rebuilds). A newcomer must scroll past tools they should not touch.
- **Proposed flow:** keep student accounts, account details and Record payment on Money. Move Fee priority order, Match earlier charges, Bulk payment entry, Export and Recent changes to a "Money tools" page under Admin.
- **Safety Check:**
  1. Layout, plus a new route.
  2. `/finances` is shared with Travel Leads (`src/LiveApp.tsx:376`); their access to these tools depends on `isCoach` and the Financial editing grant. A new route needs its own guard.
  3. Coach and Travel Lead.
  4. Medium.
  5. `[Needs Owner Decision]` (Q4). I did not send it to the verifier as a recommendation.

### W9. Parent and family access is spread over three pages, one a dead end (Coach)
- **Goal:** check or remove a parent's access to a student.
- **Current:**
  - Parent access, the invitation switch and Revoke access are on Join requests (`src/ParentInvites.tsx:58`).
  - Family link maintenance is on Settings, and is hidden when there is nothing to fix (`src/FamilyLinkMaintenance.tsx:30`).
  - The student record's "Open family link management" goes to Settings (`src/CoachStudentRecord.tsx:39`), which then shows nothing about families.
- **Friction:** tests 3, 5 and 7, plus a dead end.
- **Proposed flow:** no safe change I can show. The link target and the section's placement change behaviour (Q7, Q8).

### W10. Student profile corrections sit on the adults page (Coach)
- **Goal:** fix a student's legal name or rooming category after a family asks.
- **Current:** "Profile corrections" is a section under Users & Roles (`src/LiveApp.tsx:376` renders `<Adults/><ProfileCorrectionQueue/>`). The student record links there as "Open correction requests".
- **Friction:** tests 1 and 9. It is a student task inside an adult-accounts page, and nothing in the menu says corrections are waiting.
- **Proposed flow:** text now (row 21: "Open profile corrections"). Moving the queue is Q9.

### W11. "Attendance" is Timeclock repair, not attendance (Coach)
- **Goal:** see who came to meetings.
- **Current:** Admin > Attendance shows "Attendance reports / Recalculate attendance", "Timeclock roster names / 7 names need review" and "Session review". There is no list of who attended. Attendance totals are on Team reports ("Tuesday attendance" and "Thursday sessions", all "Unavailable") and on each student record.
- **Friction:** tests 1 and 3. The label does not match the page. "Attendance is ready. Sessions checked: 0" sits beside totals that read "Unavailable" everywhere else, which may be the future-dated season quirk.
- **Proposed flow:** move the link under Team (W2). Wording in row 42. Renaming the page (for example "Attendance fixes") changes the meaning the owner intends, so it is Q13.

### W12. Rare admin tools on daily screens (Coach)
- **Current:**
  - "Driver ownership review" on Drivers.
  - "Recalculate attendance" on Attendance.
  - "Prepare historical changes" and "Rebuild financial reports" on Money.
  - "Reason to reopen / Reopen verification", always open on a verified student record.
  - "Correction or fifth-occupant reason / Authorize a fifth occupant" on every rooming panel.
- **Friction:** test 4. Edge cases sit on main screens.
- **Proposed flow:** none recommended. Moving these components changes where Travel Leads see them, and some guard FIRST and safety rules (Q14).

### W13. Inline controls that save the moment you touch them (Coach)
- **Current** (code: `src/CoachRosterManagement.tsx:30-32`, `EventOperations.tsx:69-70`, `ParentInvites.tsx:69`, `RoomOperations.tsx:73`, `SeasonAdministration.tsx:93-95`, `SeasonReviewSteps.tsx:36,42`):
  - Roster Subteam dropdown and "Travel Team" checkbox. These are also editable on archived rows, and "Travel Team" is also the name of a filter button 2 cm above.
  - Sign-up Approve / Decline / Promote.
  - "Allow new parent invitations" and "Revoke access".
  - Room "Assign", "Remove" and "Finalize". "Review and finalize" finalizes at once.
  - Season Returning / Departing and Carry debt / Write off.
- **Friction:** tests 7 and 8. A mis-tap changes data with no confirm.
- **Proposed flow:** none here. Adding confirms changes behaviour (Q3), and making archived rows read-only is Q18.

### W14. Permission status in two places (Coach)
- **Current:** per event on Event readiness (a "Permission form" column), and per student on Permission forms (select a student, then "Current event coverage").
- **Friction:** test 3. Overlap is fine, since they answer different questions, but the names differ, and the panel heading "Current event coverage" is jargon.
- **Proposed flow:** keep both. Text in rows 36 and 37.

### W15. Rooming page reachable only by address (Coach)
- **Current:** `/events/:id/rooming` repeats the event page's rooming panel. It has no h1, no event name and no back link, and no Coach link points to it. Students reach it from their event page ("Choose roommates").
- **Friction:** "where am I" and duplication. Low impact, because Coaches never land there by normal clicks.
- **Proposed flow:** none for the Coach. Noted for the owner (Q15).

## 6. Coach navigation rationalization

"Who and how often" is inferred from what each page does. The 13 areas from the reviewer guide are marked (G).

| Area | Route | What it is for | Who uses it, how often | How a newcomer reaches it now | Keep / merge / move |
|---|---|---|---|---|---|
| Roster and profiles (G) | `/` (also `/team`) | Who is on the team; filters; subteam and Travel Team | Coach, daily | Landing page; Team > Team; phone Team | Keep (Team) |
| Student record | `/team/:id` | One student's full status; FIRST season verification | Coach, weekly | Click a name on the roster or readiness | Keep |
| Money (G): student accounts, account details, Record payment, Add a charge, Correct receipt, Money returned | `/finances` | Balances and payments for each student | Coach and Travel Lead, weekly | Money > Money; phone Money | Keep (Money) |
| Money: Team finance overview | `/finances` | Team totals | Coach, monthly | Same page, scroll | Keep |
| Money: Fee priority order, Match earlier charges | `/finances` | Set the order credits pay fees; link old charges to fees | Coach, a few times a season | Same page, scroll | Move to Admin "Money tools" (Q4) |
| Money: Bulk payment entry (rows or CSV import) | `/finances` | Record many payments at once | Coach, rarely | Same page, scroll | Move to Admin "Money tools" (Q4) |
| Money: Export finances, Recent changes, Prepare historical changes | `/finances` | Download data; audit trail; backfill job | Coach, rarely | Same page, scroll | Move to Admin "Money tools" (Q4) |
| Fundraisers (G) | `/fundraising` | Create a fundraiser, post amounts, split team vs student | Coach and Travel Lead, a few times a season | Money > Fundraising; More | Keep (Money) |
| Events (G) | `/events`, `/events/new`, `/events/:id` | List, create and run events: sign-ups, settings, requirements, transport, rooming | Coach daily in season; Travel Lead | Events > Events; phone Events | Keep (Events) |
| Rooming page | `/events/:id/rooming` | Duplicate of the event page's rooming panel | Students; Coach never by clicks | Only by typing the address | Leave as is (Q15) |
| Readiness and FIRST (G) | `/readiness` | Per event: who is ready, what is open; print | Coach and Travel Lead, weekly before trips | Events > Event readiness; phone Readiness | Keep (Events), label "Readiness" |
| Parent forms (G) | `/forms` | Parents fill in permission forms | Parents only | Not in the Coach menu (blocked text "Permission forms are for parents.") | n/a for Coach; Coach work is `/permissions` |
| Operator permissions (G) | `/permissions` | Per student: event coverage, signed forms, paper forms, new signature, export | Coach and Travel Lead, before each trip | Events > Permission forms; More | Keep (Events) |
| Drivers (G) | `/drivers` | Driver and vehicle list; link drivers to Mentors | Coach and Travel Lead, before trips | Events > Drivers; More | Keep (Events); ownership review is Q14 |
| Withdrawals (G) | `/withdrawals` | Decide requests to leave an event, and money | Coach and Travel Lead, occasionally | Events > Withdrawals; More | Keep (Events), label "Withdrawal requests" |
| Attendance (G) | `/attendance` | Fix Timeclock data: names, sessions, recalculate | Coach, weekly in build season | Admin > Attendance; More | Move to Team |
| Team reports | `/reports` | Per-student summary table, CSV | Coach and Travel Lead, weekly | Reports > Reports; More | Move into Team, label "Team reports" |
| Join requests | `/enroll` | Approve students joining; team code; parent access | Coach, start of season | Team > Join requests; More | Move to "People & access"; requests first (W3) |
| Adult roles (G) | `/adults` | Adult accounts, roles, grants, invitations; student profile corrections | Coach, a few times a season | Team > Users & Roles; More | Move to "People & access"; corrections Q9 |
| Season history (G) | `/season` | Plan and run the season change; view and correct past seasons | Coach, once or twice a year | Admin > Season; More | Keep (Admin) |
| Retention preview (G) | `/retention` | Holds on archived records; five-year review | Coach, rarely | Admin > Retention review (added automatically); More | Keep (Admin), rename "Archived records", list it explicitly |
| Settings | `/settings` | Appearance, sign out, FIRST team invitation, family link maintenance | Coach, rarely | Admin > Settings; More | Keep (Admin) |

**Proposed Coach navigation** (labels and grouping only; routes unchanged). The suggested buckets were renamed to fit the evidence: "Daily operations" became **Team**, "Event and travel prep" became **Events**, Money stays its own group because it is used weekly, and **People & access** was added because joining and adult access are occasional and different from the daily roster.

| Group (desktop tab) | Links | Phone |
|---|---|---|
| **Team** | Team (`/`), Attendance (`/attendance`), Team reports (`/reports`) | Bar: Team. More: Attendance, Team reports |
| **Events** | Events (`/events`), Readiness (`/readiness`), Permission forms (`/permissions`), Drivers (`/drivers`), Withdrawal requests (`/withdrawals`) | Bar: Events, Readiness. More: Permission forms, Drivers, Withdrawal requests |
| **Money** | Money (`/finances`), Fundraising (`/fundraising`) | Bar: Money. More: Fundraising |
| **People & access** | Join requests (`/enroll`), Users & Roles (`/adults`) | More: Join requests, Users & Roles |
| **Admin** (back office, one area) | Season (`/season`), Archived records (`/retention`), Settings (`/settings`); later "Money tools" if Q4 is approved | More: Season, Archived records, Settings, then Sign out |

Five groups, 15 links: no new pages and no removed pages. The phone More sheet keeps 11 links but shows them under these headings (W5). Desktop tabs open their first link (W1, owner decision).

**Every existing feature stays reachable:**

| Feature | Path today | Path after the proposal |
|---|---|---|
| Roster, filters, Subteam, Travel Team | Team > Team | Team > Team |
| Archive / Reactivate student | Roster row, or student record | Student record only (W4) |
| Student record | Roster name; readiness "Review season verification" | Roster name; readiness "Open student record" |
| FIRST season verification | Student record | Student record |
| Join requests, team code, parent invitations and access | Team > Join requests | People & access > Join requests (requests first) |
| Adult accounts, invitations, grants, profile corrections | Team > Users & Roles | People & access > Users & Roles |
| Events list, New event, event page (sign-ups, settings, requirements, transport, rooming) | Events > Events | Events > Events |
| Event readiness, print summary, Mark FIRST done | Events > Event readiness | Events > Readiness |
| Drivers, driver ownership review | Events > Drivers | Events > Drivers |
| Permission forms (coverage, signed forms, paper form, new signature, export, approved template) | Events > Permission forms | Events > Permission forms |
| Withdrawal requests | Events > Withdrawals | Events > Withdrawal requests |
| Student accounts, Record payment, account details, charges, refunds, transfers, overview | Money > Money | Money > Money |
| Fee priority, charge matching, bulk import, export, recent changes | Money > Money (scroll) | Money > Money now; Admin > Money tools only if Q4 is approved |
| Fundraising | Money > Fundraising | Money > Fundraising |
| Team reports, CSV | Reports > Reports | Team > Team reports |
| Attendance (Timeclock fixes, recalculate) | Admin > Attendance | Team > Attendance |
| Season change, past seasons, historical corrections | Admin > Season | Admin > Season |
| Retention holds | Admin > Retention review | Admin > Archived records |
| Settings, FIRST invitation, family link maintenance, sign out | Admin > Settings; header Sign out | Admin > Settings; header Sign out |
| Rooming page by address | `/events/:id/rooming` | Unchanged |

## 7. Questions for the owner

Behaviour changes, items I could not verify, verifier notes, and numbers that looked odd. Each has my recommended answer.

1. **Should a desktop group tab open its first page?** (W1) Today it only swaps the second row and underlines the clicked group while the old page stays. *Recommended:* yes, with the verifier's guard (do nothing extra if you are already in that group), so an open New event wizard is not lost.
2. **"Needs Coach review" on pages a Travel Lead also uses.**
   - Where it shows:
     - Money: "Account totals need Coach review." (`finance-admin-copy.ts:7`); "Earlier changes need Coach review…" (`:21`); "Shared fee maintenance needs Coach review…" (`:34`).
     - Team finance overview (`report-copy.ts:26`, `:34`).
     - Fundraising holds; finance status chips (`ChargeAdministration.tsx:22`, `FinanceOperations.tsx:15`, `Withdrawals.tsx:16`; the chip is pinned by `ReviewStates.test.ts:46`).
   - For the Coach reading it, the words are wrong. For a Travel Lead, they are right.
   - *Recommended:* show "needs your review" to Coaches and keep "needs Coach review" for Travel Leads. That is a small role-aware change.
3. **Add a confirm step to controls that save on one tap?** (W13) The candidates are Revoke access, Finalize or "Review and finalize" a room, Write off, and Approve or Decline a sign-up. *Recommended:* confirm only the hard-to-undo ones: Revoke access, Finalize and Write off. Leave Subteam, Travel Team and Promote as they are.
4. **Split the Money page?** (W8) Move Fee priority order, Match earlier charges, Bulk payment entry, Export and Recent changes to an Admin "Money tools" page. *Recommended:* yes, but only after deciding what Travel Leads with Financial editing should see there.
5. **Casey Credit's $25 personal payment does not show in the Money table.** The table has Paid, Fundraising applied and Fundraising available, but no column for unused personal payments. The column help says to open account details. Paid shows $0.00, which reads like "nothing paid". *Recommended:* rename the column (finding row 2). Whether to add a column is your call; adding one would be a new feature.
6. **Health information shows as missing while allergies are filled in** (Blake Unpaid's record: "Allergies: FICTIONAL TEST ONLY…", and "Missing profile information" lists "Health information"). The guide says the data is unconfirmed by a parent, but the page does not say so. On Avery's record, "None reported" next to a missing "Health information" is equally unclear. *Recommended:* add a missing explanation such as "Entered, not yet confirmed by a parent". It is a new status line, so you decide.
7. **The "Open family link management" link leads to nothing** (it goes to `/settings`, whose family section is hidden when complete). *Recommended:* remove the link from the student record, or point it to the student's parent access on Join requests.
8. **Where should parent access live?** It is under Join requests today. *Recommended:* keep it there, with the join requests list first (W3). Moving it to Users & Roles would split adult invitations from parent links, which work differently.
9. **Where should student profile corrections live?** They are under Users & Roles today. *Recommended:* a "Profile corrections" link under Team, or a line on the roster when corrections are waiting.
10. **Should readiness links open the exact student or form?** For example, Permission forms with the student already chosen. *Recommended:* yes, later. It needs address parameters.
11. **Show the open count on every readiness event button** instead of "Select to view"? *Recommended:* yes, if the query is cheap. The data is already loaded per event.
12. **Show waiting sign-ups somewhere a Coach will see them** (Events list or menu)? *Recommended:* a count on the event card only. Not in the menu.
13. **Rename the Attendance page?** It is Timeclock repair, not a list of who came. *Recommended:* keep the name "Attendance" if you plan a list there. Otherwise use "Attendance fixes".
14. **Rare tools on daily screens:** Driver ownership review, Recalculate attendance, Prepare historical changes, Rebuild financial reports, the always-visible "Reopen verification", and "Authorize a fifth occupant". *Recommended:* fold each into a collapsed "More options" section on its page. Do not move them to other pages.
15. **The rooming page at `/events/:id/rooming`** has no heading, event name or back link (students use it). *Recommended:* add the event name and "← Event" (a wording and layout fix for the student path).
16. **Duplicate protection on bulk payment import** depends on the same signed-in person retrying (the key includes the user, season, batch, student and row reference, `convex/paymentAdministration.ts:143`). A retry by another Coach is not protected (verifier). *Recommended:* confirm this is intended before editing the help text further.
17. **Waitlist order:** the list is sorted by `signedUpAt` (`eventOperations.ts:40`), but Promote is checked against the earliest `createdAt` (`:68`). If they differ, Promote on the first row could be refused (verifier). *Recommended:* make the two orders match.
18. **Archived students keep editable Subteam and Travel Team controls** on the roster. *Recommended:* make them read-only for archived rows.
19. **The subteam lists do not match.**
    - The filter shows values in use: Programming, Mechanical, Build.
    - Row dropdowns offer Unassigned, Build, Electrical, Programming, Machining, Business. "Mechanical" appears only on rows that already have it.
    - `live-copy.ts:11` lists Mechanical, Programming, Electrical, Outreach, Business.
    - *Recommended:* pick one list. These are stored values, so it is a data decision.
20. **Fundraiser history from past seasons.**
    - The guide says it exists (2026–27, "REHEARSAL ONLY — Split proceeds").
    - The Fundraising page shows only the current season: "No fundraisers have been recorded for this season."
    - The Season page's past-season view shows roster balances and attendance, not fundraisers.
    - *Recommended:* confirm where a Coach should see last season's fundraisers.
21. **Two shared fees have the same name** in Fee priority order (#1 and #2, both "REVIEW 2026-10-18 Review charge (separate from zero-fee trip)", $100.00). This is probably mock data, but nothing on screen tells them apart. *Recommended:* show the event or a date next to duplicate names.
22. **Team code has no explanation and no way to cancel it.** `admin.revokeJoinCode` exists but no button uses it. *Recommended:* add the missing explanation "Students use this code to ask to join. You still approve each request." Decide whether to add a revoke button.
23. **Export headers and formats are in developer voice:** the Team report CSV ("Charged cents", "Paid cents", "Season ID", "Offseason Tuesday", `src/lib/team-report-csv.ts:20-22`, tested), the finance CSV ("Personal available", "Original cents", `convex/financeExport.ts:14`), and JSON downloads for permissions and finance. *Recommended:* leave the headers until you know who uses the files. Renaming breaks anyone's saved spreadsheet, and a test.
24. **Rename "receipt" to "signed form" everywhere?** This includes the Parent views ("Current-season receipt history", "View receipt"). *Recommended:* yes, all at once, unless "receipt" is a term your school or legal adviser asked for. Update `PermissionWorkflow.test.ts:19`.
25. **The template version ID "field-trip-original-v1"** shows under the approved form's title on Permission forms. *Recommended:* keep it, as it helps trace which wording a parent signed, but label it "Version: field-trip-original-v1".
26. **What does the "Draft" chip mean** on Team reports ("As of Oct 18, 2026 · Draft") and the printable readiness summary ("Printable readiness summary · Draft")? I could not tell from the screen. *Recommended:* explain it in one line or remove it.
27. **Meanings to confirm before rewording:** room "Finalized" (locked? who can undo?), "Personal held" and "Fundraising held" on past seasons, invitation status "Replaced", "Row reference" on bulk payments, and "Event arrangements" in the enrollment notice (finding row 48).
28. **The event type "Team"** shares a name with the Team page, the Travel Team and Whole Team. The option text is also the saved value (`src/LiveApp.tsx:286`; backend accepts only "Competition", "Outreach", "Team", `convex/admin.ts:79`). *Recommended:* change only the display label (for example "Team activity", which the wizard already uses in `event-copy.ts:14`), not the stored value.
29. **Blocked-page messages leave out Travel Leads:** "This page is for Coaches." for `/enroll` (`LiveApp.tsx:348`), and "This review screen is available to Coaches." (`readinessCopy.ts:25`), although Travel Leads are allowed on both. Other roles see these. *Recommended:* "This page is for Coaches and Travel Leads."
30. **The backend allows a Travel Lead to create events** (`convex/admin.ts:83`), while the UI route is Coach-only. Not probed (access testing is a separate audit). *Recommended:* check in the access audit.
31. **The Retention page shows a policy-gap note** ("Exact deletion coverage, required holds, backups, and downloaded exports remain unresolved…", `retention-copy.ts:28`). *Recommended:* remove before launch once the policy is set, or reword it as a plain status.
32. **Withdrawal requests shows only pending requests;** past decisions are not listed (the guide says two exist). *Recommended:* confirm this is intended. History may already live in Money > Recent changes.
33. **An event date looked one day early:** the Overnight Review Trip is stored as 2027-06-22 00:00 UTC and shows "Jun 21, 2027 – Jun 23, 2027" (Central time). *Recommended:* check that event dates are entered and shown in the same time zone. Not checking math.
34. **Attendance says "Attendance is ready. Sessions checked: 0"** while every attendance total says "Unavailable". This may be the future-dated test season. *Recommended:* confirm after the season dates are real.

## 8. Could not verify

- **Dialogs and forms not opened, read in code instead:**
  - Archive and Reactivate dialogs. One click on "Reactivate student" was refused by this session's permission check, so I stopped clicking anything that opens a saving action.
  - Record payment dialog, Add driver and Edit driver forms, Edit access (Users & Roles), Review record (Retention), Record paper form, Request a new signature, Withdrawal decision form (no request pending), Accept form and Send back for correction (no form awaiting review).
  - Fundraiser posting and held-row states (no fundraisers this season), "Mark FIRST done" (no event that needs it), and every failure and recovery state on Money.
- **Wizard steps not advanced (owner's instruction):** New event steps 2 to 6, and Season steps 2 to 6. Their wording was read in `src/lib/event-copy.ts`, `src/lib/ui-copy.ts`, `src/SeasonReviewSteps.tsx` and `src/lib/season-admin-copy.ts`.
- **Buttons not pressed:**
  - Anything that saves, approves, verifies, reopens, promotes, posts, imports, exports, finalizes or prepares, including "Prepare account", "Prepare historical changes", "Prepare export", "Recalculate attendance", "Start maintenance", "Use approved field trip form", "Create team code" and "Create invitation link".
  - Their handlers were read (the code grounder's table). No Coach button calls an outside service. The only outbound calls are Google sign-in and a read-only Google Calendar job on a timer, not a button.
- **Phone width:** Chrome would not shrink the window below 500 px, so the phone pass ran at 500 × 659 (phone layout active: bottom bar, More sheet, tables as cards), not 390 × 844. Nothing overflowed sideways at 500 px.
- **`/forms`** (Parent forms) was not visited, per rule 7. Its block text is from code.
- **Line numbers not located:** the custom-requirement count template and the event date formatter (finding rows 26 and 50).
- **Not tested:** Timeclock (out of scope); Travel Lead variants with Financial editing or Health export (no such account); real email, payments, FIRST and e-signature (the app has none of these as live services); production builds (the dev banner is assumed absent there, `import.meta.env.DEV`).
- **The cross-role pass** is based on this Coach pass, the code, and the executive summaries of the five earlier role audits in your Logistics Work folder. I did not re-test the other roles. Per your instruction, no `*_review_*` files were read.

## 9. State changes made during the audit

None. No data was saved, created, deleted or sent. Only client-side views changed:
- the window size (1280 × 800 for desktop, then the smallest phone width Chrome allowed, then back);
- opening collapsed sections on the event page and Money;
- choosing an event on Event readiness and a student on Permission forms;
- "Prepare summary" on readiness (an on-screen summary, no server call);
- "Show archived students";
- selecting a past season on Season (view only);
- opening and closing the phone More sheet;
- New event opened at step 1, then left by navigating away. Nothing was entered.

## 10. Do-not-break list

These rules and protections are left alone on purpose. Please confirm none is lost when the wording changes are made.

- **Money safeguards:**
  - Every money change that moves amounts has a preview ("Review exact changes", "Review payments", "Review exact amounts", "Review transfer to team", "Review exact correction"), a typed reason (8+ characters), and a "this changed since you looked" check.
  - "Prepare" steps for shared fees record a plan and change no money until "Confirm reviewed changes".
- **Season change:** "Confirm and start transition" needs the exact new season name typed and a saved reset review. Saving a draft never archives anyone. Past seasons are locked, and correction mode times out after 15 minutes with a reason.
- **FIRST:** season verification needs both boxes ticked. Reopening needs a reason. The backend refuses per-event "Mark FIRST done" for Competitions (`convex/participation.ts:101`), so Competition FIRST stays on the student record.
- **Consent wording is data:** `src/lib/field-trip-approved.ts` is read and compared by the backend (`convex/permissionVersions.ts:51`, `convex/permissionsV2.ts:38`). Never edit it as a copy change. Only the box text in `PermissionWorkflow.tsx:210` is wording.
- **Words that are stored or compared values, not copy:**
  - event types "Competition", "Outreach", "Team";
  - readiness keys "Required payment", "Permission accepted", "FIRST registration", "FIRST registration and Consent & Release" (`convex/lib/readModels.ts:33-38`; the screen already relabels at `ReadinessReview.tsx:96`);
  - "Profile setup" and "Room category" (`convex/coachRoster.ts:23-25`);
  - subteam keys;
  - code values such as 'commit', 'committed', 'held', 'progress'.
- **Backend error sentences** shown on screen live in `convex/`. They must be reworded there, and some are matched by tests (for example the "Archive status changed" prefix).
- **Strings pinned by tests:** see the Class column in section 4. Also "Record payment for", "Prepare export", "Download charge details (CSV)", "Recalculate attendance", "Match earlier charges", "Retry remaining work", "Start maintenance". These button words were not changed.
- **Who sees what:**
  - Coach-only routes: `/team`, `/team/:id`, `/adults`, `/season`, `/retention`, `/events/new`, and the Coach Attendance page.
  - Travel Lead limits: read-only roster; no Users & Roles, Season or Retention.
  - Financial editing and Health export grants: health packet export needs the Coach role or the grant (`convex/permissions.ts:246`).
  - Nothing proposed here moves a capability between roles.
- **Works well; keep as is:**
  - "No email is sent by this app. Copy the link and share it privately with the invited adult." Honest and clear.
  - "Paste the team invitation link from FIRST. Families see it during setup." and "Not set. Families are told to contact you." Plain and actionable.
  - "Record money already given to a family. This app records the refund; it does not transfer money. Fundraising credits cannot be paid out." Clear on what the app does not do.
  - "Leftover cents go to the team." and the "What do these columns mean?" pattern (keep the pattern, simplify the text).
  - The readiness matrix with its Students / Transportation / Rooming chips and the printable summary.
  - Roster filter chips (All, Needs attention, Missing info, Balance due) and "Showing all 11 active students."
  - Back links "← Team" and "← Events"; the season name above most page titles.
  - Empty states "No join requests are waiting." and "No requests are waiting."
  - Phone: every Coach page and action is reachable through the bottom bar or More. Tables turn into cards. No sideways page scroll.
  - "Review …" preview buttons on Money and Fundraising only read data, so they are safe to explore.

## 11. Cross-role summary

The same concept is named differently across roles. This is based on this pass, the code (`navigation-copy.ts`, `ui-copy.ts`, `family-copy.ts`) and the earlier role reports' summaries.

| Concept | Coach | Travel Lead | Mentor | Parent | Student | Suggested single name |
|---|---|---|---|---|---|---|
| Permission form page | "Permission forms" (link and h1) | "Permission forms" | n/a | Menu "Forms" (phone) or "Permission form"; h1 "Permission form" | n/a | "Permission forms" for staff, "Permission form" for one child is fine; phone "Forms" is acceptable shorthand |
| Team summary page | Link "Reports", h1 "Team reports" | Same | Menu "Team report", phone "Report" | n/a | n/a | "Team report(s)" everywhere |
| Readiness page | Desktop "Event readiness", phone "Readiness", record link "Open team readiness" | Phone first slot "Readiness" | n/a | n/a | n/a | "Readiness" |
| Money page | Menu and h1 "Money"; record link "Open Coach finance workspace"; Season text "Finance"; New event "student finances" | "Money" | n/a | "Money" | "Money" | "Money" |
| Unused money | Five names (section 4, row 3) | Same as Coach | n/a | "Available funds by source / Personal payments / Available fundraising credit" | Same as Parent | "Unused personal payments" / "Unused fundraising credit" |
| "Paid" | Money: personal only; Team reports: everything applied | Same split (the Travel Lead pass found it too) | n/a | n/a | n/a | "Paid (personal)" and "Applied to charges" |
| Archived student | "Archived" (roster) vs "Inactive students" (summary card) | Summary card says "Inactive" | n/a | n/a | n/a | "Archived" |
| Attendance page | Timeclock repair (no list of who came) | Not available | Note only ("Attendance totals start at kickoff.") | Attendance totals | Attendance totals | Same label, different jobs: see Q13 |
| Profile | Student record "Profile & health" | Menu "Profile" (reference file says "My profile") | "Profile" | "Profile" (reference file says "Profile & health") | "Profile" | "Profile" |
| Parent links | "Parent invitations" / "Parent access" (Join requests); "Parents & guardian" (record) | n/a | n/a | n/a | "Parents" tab, "Invite a parent", "Parent accounts" | "Parent access" (staff) and "Parents" (student) |
| Review requests | "needs Coach review" shown to the Coach | Correct for Travel Lead | n/a | n/a | n/a | role-aware (Q2) |
| Kickoff | "Attendance totals start at kickoff." | Same | Same (Mentor pass flagged it) | Same | Same | "…the FIRST season kickoff." |

The three cross-role fixes worth doing first are all text-only: one name for unused money, one meaning for "Paid", and "Readiness" or "Team reports" used the same way on every device.
