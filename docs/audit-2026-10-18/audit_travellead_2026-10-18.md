# Audit Report: Travel Lead

Date: 2026-10-18. Prompt: `language_and_workflow_audit_prompt_FINAL_2026-10-18`. Scope: Student Status only. Signed-in account shown as [signed-in Travel Lead] (a Mentor with the Travel Lead flag). No account names or emails are copied here. Driver contact details on the Drivers page are left out.

## 1. Executive summary

A Travel Lead gets the Coach's workspace minus a few pages, and most of it reads like a staff tool: short labels, dense tables, clear "view only" notes on Money and Fundraising. Three things make it harder than it needs to be. The word "Paid" means two different amounts on two pages for the same student. The Reports page says "Showing 10 of 10 students shown so far. More students may be available." The event page, where all the real decisions happen (approve, decline, assign drivers, rooms), uses section names that do not match its own jump links.

A newcomer could finish about 5 of the 8 top tasks unaided (see who is ready, check who owes money, see the driver list, read a student's paperwork status, open Settings). They would get stuck on where signups are approved (only on each event's page, no count in the nav), on which of three places holds the driver information, and on why "Record paper form" is switched off.

Language findings: 16 | Navigation and workflow findings: 8 | Items needing owner decision: 11 | Code access: Yes | Share of full-sentence text above grade 8: 7 of 18 scored by the script (about 5 are real problems) | Model tiers used: one agent (Sonnet 5.5), no helpers.

Setup notes. (a) The Travel Lead was already signed in. The header showed no role, but the window reported 956 px, where the header hides its name and role line (the Parent run at 1584 px did show it), so that gap may be a width effect. I confirmed the role in two ways: the Profile page shows the chips "Mentor" and "Travel Lead", and the nav groups match the Travel Lead menu in `navigation-copy.ts` (a Coach's Team group also holds Join requests, Users and roles, Season and Retention; this one holds only Team). (b) The window reports 956 px, which hides the desktop bar, so I read the desktop nav from the page and used a 390 px frame, in the same tab and sign-in, for the phone view. (c) I did not press: Add driver, Edit (driver), Approve, Decline, Waitlist, Promote, Save transport settings, Assign vehicle, Remove, Create room, Authorize a fifth occupant, Record paper form, Request a new signature, Prepare export, Export students shown (CSV), Download permission list, Save profile, any theme button, or Sign out. (d) Travel Lead cannot open Join requests, Users and roles, Season, Retention or Attendance from the nav. I did not type those addresses (rule 7).

## 2. Site map and purpose

| Route / tab | Desktop | Phone (how reached) | Source component | Predicted from the label | What it actually is |
|---|---|---|---|---|---|
| `/` "Team" | Group "Team" (one item) | Bottom bar, 3rd | `Roster` (`LiveApp.tsx`) | Roster | "Team" page: counts (Active, Travel Team, Inactive), subteam filter, roster table. Matches. |
| `/events` "Events" | Group "Events" | Bottom bar, 2nd | `EventList` | All events | Cards grouped Competitions / Outreach / Team. No "New event" button (see Q3). Matches. |
| `/events/:id` | From card | From card | `EventPage` (`LiveApp.tsx:151`) | n/a | Overview, "Signups and capacity" (approve, decline, waitlist), Transport, Rooming. The busiest page in the app. |
| `/readiness` "Event readiness" | Group "Events" | Bottom bar, 1st, as "Readiness" | `ReadinessReview.tsx` | Who is ready to travel | Pick an event; students, transportation, rooming; "Prepare summary" for printing. Matches. |
| `/drivers` "Drivers" | Group "Events" | Bottom bar, 4th | Drivers page | Adult drivers and approvals | Driver list with vehicle, seats, trailer; Add driver, Edit. Matches. |
| `/permissions` "Permission forms" | Group "Events" | More | `PermissionWorkflow.tsx` | Form status | Per-student form coverage, receipts, paper form, new signature request, export. More than the label says. |
| `/withdrawals` "Withdrawals" | Group "Events" | More, 1st | Withdrawal queue | Requests to leave an event | "Withdrawal requests: Pending review 0." Matches. |
| `/finances` "Money" | Group "Money" | More | `CoachFinanceWorkspace.tsx` | Charges and payments (edit?) | View-only table of every student, team totals, export, recent changes. Says "You do not have financial editing access." |
| `/fundraising` "Fundraising" | Group "Money" | More | `Fundraising.tsx` | Fundraising totals | "No fundraisers have been recorded for this season." View only. |
| `/reports` "Reports" | Group "Reports" (one item) | More | `TeamReports.tsx` | Exports | Team table of money, attendance, readiness; per-student report panel; CSV. More than exports. |
| `/myprofile` "Profile" | Group "Account" | More | `AdultProfile.tsx` | My adult profile | Same page as the Mentor's: about you, shirt size, driving, emergency contact. |
| `/settings` "Settings" | Group "Account" | More | `Settings()` | Theme, sign out | Light / Dark / System, email, Sign out. Matches. |
| `/about` `/privacy` `/terms` | Footer | Footer | `PublicPages.tsx` | n/a | See Mentor report. |

Count: 11 destinations inside 5 top buttons on desktop (Team, Events, Money, Reports, Account). Two of the five groups hold one page each. Phone: 4 tabs plus More (Withdrawals, Money, Fundraising, Permission forms, Reports, Profile, Settings, Sign out). The phone bar order (Readiness, Events, Team, Drivers) is not the desktop order (Team first), and the app lands on Team.

## 3. Task results

Predictions are in the progress file. Only the Team page had been seen when I wrote them.

| Task | First click I would make | Right? | Clicks to finish | Result | Where I got lost |
|---|---|---|---|---|---|
| See who is ready for an event | Events > Event readiness | Yes | 3 | Finished unaided | The event page's "Requirements" only says "Review student requirements in Event readiness." The Reports page has a third copy. |
| Approve or decline a signup | Events (group), then the event | Partly. I first looked in Withdrawals. | 3 to see the buttons. Not pressed. | Finished by guessing | Approvals are only on each event's own page. Nothing in the nav says how many are waiting. |
| Assign a driver and vehicle to an event | Drivers | No. Assigning is on the event's Transport section. Drivers is the list of drivers. | 4 to the control. Not pressed. | Finished by guessing | Three places hold driver information (Drivers, event Transport, Profile "I can drive students"). |
| Check who owes money | Money | Yes | 2 | Finished unaided | Reports repeats the table with a different "Paid". |
| Check a student's permission form | Permission forms | Yes | 2 | Finished unaided | "Record paper form" is switched off with no reason on it. |
| Export a list | Reports | Partly. Three different exports live in three places. | 2. Not pressed. | Finished by guessing | Money "Prepare export", Reports "Export students shown (CSV)", Permissions "Download event permission list (JSON)". |
| Update my own driving details | Account > Profile | Yes | 2. Not saved. | Finished unaided | Same page as the Mentor's. |
| Switch theme or sign out | Account > Settings | Yes | 2. Not pressed. | Finished unaided | On phone Sign out is only in More. |

Navigation problems:

- **N1. Two groups with one page each.** "Team" holds only Team; "Reports" holds only Reports. Each costs a click to reveal a single link.
- **N2. "Readiness" and "Event readiness".** Phone bar says "Readiness", desktop says "Event readiness", Reports has a "Readiness" column. One name would do.
- **N3. Phone order differs from desktop.** Readiness is first on phone, Team is first on desktop, and the app opens on Team.
- **N4. Approvals are hidden inside events.** A Travel Lead who wants to clear the queue must open each event. Withdrawals has a queue page; signups do not.
- **N5. The event page jump bar does not match its sections.** Links: Overview, Participants, Requirements, Transport, Rooming. Sections: Event details, "Signups and capacity", a one-line pointer, "Transport", "Rooming". "Participants" opens "Signups and capacity".
- **N6. Reports does three jobs.** Money table, attendance table, readiness check, and a CSV export, all on one wide page. Phone shows it as cards (not read in full).
- **N7. Permission forms does more than its label.** Coverage, receipts, paper form, new signature request and export.
- **N8. Travel Lead and Coach differ by hidden pages.** Join requests, Users and roles, Season, Retention and Attendance are not in the Travel Lead nav. Server rules allow some of these (Q3).

## 4. Language findings

Grades are Flesch-Kincaid estimates from a script (`fk4.py`). Short lines with long words score high, so I also judged by reading. Sorted by how many Travel Leads meet them and how badly they confuse.

| # | Screen / route | Source file | Exact current text | Problem | Grade (now → proposed) | Replacement | Class |
|---|---|---|---|---|---|---|---|
| 1 | Money `/finances` and Reports `/reports` | `finance-admin-copy.ts`; `TeamReports.tsx` | Money, Avery Partial: "PAID $40.00", "FUNDRAISING APPLIED $20.00". Reports, same student: "PAID $60.00". | "Paid" is personal payments only on Money and personal plus fundraising on Reports. Same word, different amounts. | n/a | Reports column: "Paid and applied". Or Money column: "Paid (personal)". Owner picks (Q1). | `[Do Not Touch: payment]` (text only; flag for owner) |
| 2 | Money `/finances` | `finance-admin-copy.ts` | "Paid is personal payments applied to charges. Fundraising applied is fundraising credit used on charges. Fundraising available is unused fundraising credit; account details show unused personal payments separately. Available funds are not cash refunds." | Four terms in one long block; the second half is hard to follow. | 10.3 → 6.8 | "Paid is what the family paid toward charges. Fundraising applied is fundraising credit used on charges. Fundraising available is credit not yet used. Available funds are not cash refunds." | `[Do Not Touch: payment]` (text only). Drops the pointer to "account details"; owner to confirm. |
| 3 | Reports `/reports` | `TeamReports.tsx` | "Showing 10 of 10 students shown so far. More students may be available; filters and CSV include only students shown." followed by a "Load more students" button | "10 of 10" and "more may be available" contradict each other. The first clause repeats "shown". | 5.1 → 2.9 | "Showing 10 students. There may be more. Filters and the CSV only include the students shown." | `[Needs Owner Decision]`: the "10 of 10" count may be a bug (Q2). |
| 4 | Reports, columns | `report-copy.ts`; `TeamReports.tsx` | Three columns "TUESDAY ATTENDANCE / THURSDAY SESSIONS / OUTREACH" showing "Unavailable" on every row, with "Attendance totals start at kickoff." above | Ten rows of the same "Unavailable" hide the real columns. Names differ from Parent and Student pages ("Tuesday meetings", "Thursday meetings"). "Kickoff" is jargon. | 7.6 → 5.7 | Note: "Attendance counting starts when the season starts." | `[Text-only / Safe]` for the note (the string is shared with Parent, Student and Mentor screens; change all or none). Column names `[Needs Owner Decision]`. |
| 5 | Reports header | `TeamReports.tsx` | Badge "Draft" next to "As of Oct 18, 2026" | Unexplained. Looks like the page is unfinished. | n/a | None proposed. See Q2. | `[Needs Owner Decision]` |
| 6 | Permission forms `/permissions` | `permission-workflow-copy.ts` | "Review submitted evidence and current event coverage. Signed receipts retain their original information." | "Evidence", "coverage" and "receipts" are system words. | 13.3 → 6.5 | "Review signed forms and which events they cover. Signed forms keep their original information." | `[Do Not Touch: consent]` (text only; flag for owner) |
| 7 | Drivers `/drivers` | `operations-copy.ts` | "Passenger seats exclude the driver. Only active, approved drivers count toward event capacity." | "Exclude" and "count toward event capacity" are formal. | 10.5 → 4.0 (my estimate; not scored) | "Seat counts do not include the driver. Only active, approved drivers add seats to an event." | `[Text-only / Safe]`. The string appears on the Drivers page and nowhere else I found. |
| 8 | Drivers, driver card | `operations-copy.ts` (`activeLabel`, status words) | "Unavailable" shown as the status of the first driver; "Approved" for the second | "Unavailable" could mean not approved, not able, or inactive. | n/a | None proposed. See Q4. | `[Needs Owner Decision]` |
| 9 | Event page, Signups | `operations-copy.ts` | "Signup closes: 6/14/2027, 7:00:00 PM CDT" and "1. Ellis Waitlist · 10/18/2026, 11:30:31 AM CDT" | Numeric dates with seconds. Everywhere else the app writes "Jun 21, 2027". | n/a | Use the app's usual style: "Jun 14, 2027, 7:00 PM CDT". | `[Text-only / Safe]` after checking which formatter this uses. I did not find a test for it. |
| 10 | Event page, Transport | `operations-copy.ts` | "4 passenger seats for 3 riders (2 students, 1 additional adults)." | "1 additional adults" is wrong. | n/a | "(2 students, 1 additional adult)" | `[Text-only / Safe]` |
| 11 | Event page, Signups | `operations-copy.ts` | "4 places reserved of 4 · 0 available. Pending signups reserve a place; charges begin at confirmation." | "Reserved of" is awkward. | 7.9 → 1.5 | "4 of 4 places taken. 0 left. Pending signups hold a place. Charges start when a signup is confirmed." | `[Do Not Touch: approvals, payment]` (text only; flag for owner) |
| 12 | Event page, Rooming | `operations-copy.ts` | "Students may choose roommates until the room deadline. A fifth occupant requires authorization and a note; six are never allowed." and a field labelled "Correction or fifth-occupant reason" | One box serves two actions (correction, fifth occupant). Label does not say which button uses it. | 6.5 → 3.8 | "Students can choose roommates until the room deadline. A fifth person in a room needs your approval and a note. Six are never allowed." Field label: owner decision. | `[Do Not Touch: safety, approvals]` (text only; flag for owner) |
| 13 | Event page, jump bar | `LiveApp.tsx:151` (`uiCopy.event`) | Jump links "Participants", "Requirements" vs sections "Signups and capacity" and a one-line pointer | Link names do not match section names. | n/a | Rename the link "Participants" to "Signups", or the section to "Participants". | `[Layout / Navigation]` (label only; no section is moved). |
| 14 | Withdrawals `/withdrawals` | `live-copy.ts` | "Review participation changes and how event payments are handled." | "Participation changes" is vague. | 8.9 → 5.0 | "Review requests to leave an event and decide what happens to payments." | `[Needs Owner Decision]` (payment) |
| 15 | Money `/finances`, Reports | `report-copy.ts` | "Older fundraising credits don't include the full amount raised. Transfers and carried-over credit are not counted as money raised." | Accurate but heavy. Raised appears as "Gross raised", "Raised", "Earned from fundraisers" on different pages. | 6.6 → 6.1 | None proposed beyond Q1; naming first. | `[Do Not Touch: payment]` |
| 16 | Roster `/` and events | `LiveApp.tsx` (`Roster`), `navigation-copy.ts` | "Travel Team" (column and filter), "Travel Lead" (role), "Team transportation required" (event) | Three "travel" words for three different things. | n/a | None proposed. See Q7. | `[Needs Owner Decision]` |

Credit where due: "View balances and account history. You do not have financial editing access." (7.4) and "Amounts are view only for your account." (6.5) say what the account can and cannot do. "Records are collected over a time range. They do not all represent one moment in time." (3.8) is honest and short. "Earlier changes are still being prepared; this list may be incomplete." (2.6) tells you not to trust a gap. "Waitlisted students are promoted manually in signup order." (9.7 by script, but short and clear) says what a staff member needs to know.

**Remove before launch (test-only text):**

- Permission forms: "This development workflow accepts only server-registered fictional records. Real permission signing remains closed." and "Only registered fictional development subjects may use consent."
- All pages: "Development workspace — synthetic data only" (dev builds, `readinessCopy.ts:6`) and the season name "2027–28 Synthetic rehearsal".
- Event names and details: "REHEARSAL ONLY", "SYNTHETIC", "REVIEW 2026-10-18", "TEST ONLY: shared vehicle or independent travel", "Fictional venue" (data).
- Drivers and vehicles: "SYNTHETIC visual validation driver", "Synthetic demonstration van", "TEST ONLY Review Van", "REVIEW 2026-10-18 Fictional Driver" (data).
- Students: "Consent rehearsal", "Student A", "Alex (rehearsal)", "Avery Partial", "Blake Unpaid", "Casey Credit", "Drew Pending", "Ellis Waitlist", "Finley Inactive" (data).
- Rooming data: "REVIEW 2026-10-18 Boys Assigned".
- Money: "Default amount: $1.00" per-event fee line for test events (data).

## 5. Workflow findings

**W1. Check who is ready for an event.**
- Goal: know who can travel.
- Current flow: 1. Events (group) > Event readiness. 2. Pick an event. 3. Read Students, Transportation, Rooming. 4. Optionally "Prepare summary" for printing (local screen state only, `ReadinessReview.tsx:86`; not pressed).
- Friction: overlap (same answer on the event page "Requirements" pointer and in Reports > Outstanding requirements > Readiness), naming (N2).
- Proposed flow: no removal. Use one name, "Event readiness", on phone and desktop (N2).
- Stays the same: all three places and the print summary.
- Safety Check: (1) Label only. (2) Could break: nav tests that look for the strings (not searched beyond a grep of `navigation-copy.ts`). (3) Coach and Travel Lead share the shell. (4) Easy to reverse. (5) `[Layout / Navigation]`. No verifier ran.

**W2. Approve or decline an event signup.**
- Current flow: 1. Events. 2. Open the event. 3. "Signups and capacity" > Awaiting approval > Approve / Decline / Waitlist, or Promote for the waitlist. (Server allows Coach or Travel Lead: `participation.ts:53`.)
- Friction: hidden dependency (queue only on each event), purpose (no count in the nav), disconnection (Withdrawals has a queue page, signups have none).
- Proposed flow: none that adds a feature. Q3.
- Safety: `[Do Not Touch: approvals, payment]`. Not pressed.

**W3. Put a driver and vehicle on an event.**
- Current flow: 1. Drivers (to see who is approved). 2. Events > the event > Transport > "Choose driver", "Passenger seats for this event", "Assign vehicle".
- Friction: three places: Drivers list, event Transport, and Profile "I can drive students". "Add driver" also exists.
- Proposed flow: none. Wording: finding 7, 8.
- Safety: `[Do Not Touch: safety]`. Not pressed.

**W4. Review money.**
- Current flow: 1. Money (student table, team overview, export, recent changes). 2. Reports (similar table, different "Paid").
- Friction: overlap and contradiction (finding 1); two views of the same data.
- Proposed flow: rename one column (finding 1). No merge: the two pages answer different questions.
- Safety: `[Do Not Touch: payment]`. No change made.

**W5. Check a student's permission form.**
- Current flow: 1. Permission forms. 2. Choose a student. 3. Read coverage and receipts. 4. "Record paper form" (disabled for this account).
- Friction: the off button has no reason on it. The test notice sits where the reason would go. Server rule: only a Coach, or a Travel Lead with the health export grant, can record paper (`permissions.ts:101`).
- Proposed flow: none. Q6.
- Safety: `[Do Not Touch: consent, health]`.

**W6. Export a list.**
- Current flow: Money "Prepare export" (creates a job, then download), Reports "Export students shown (CSV)", Permissions "Download event permission list (JSON)" (off until an event is chosen).
- Friction: three buttons, three verbs (Prepare, Export, Download), three scopes. Money's note: "Available balances repeat on each charge row; do not add those repeated balances together." (7.6).
- Proposed flow: none. Wording only after Q10.
- Safety: `[Do Not Touch: health, payment]`. Not pressed. `financeExport.prepare` writes a job.

**W7. Use the app on a phone.**
- Current flow: bottom bar Readiness, Events, Team, Drivers, More; More holds Withdrawals, Money, Fundraising, Permission forms, Reports, Profile, Settings, Sign out. Header hides name, role and Sign out.
- Friction: the most-used pages are not obvious (approvals are inside events, which sit on the bar, good). Money and Permission forms are two taps away.
- Proposed flow: none. Order only (N3).

**W8. Move around the event page.**
- Current flow: jump bar (Overview, Participants, Requirements, Transport, Rooming). Sections are collapsed disclosures.
- Friction: N5. Sections start closed, so a jump link opens one; a Travel Lead who scrolls sees only headings.
- Proposed flow: label match only (finding 13).

## 6. Coach navigation rationalization

Applies to the Travel Lead's version of the Coach shell.

Current map: Team (Team) · Events (Events, Event readiness, Drivers, Permission forms, Withdrawals) · Money (Money, Fundraising) · Reports (Reports) · Account (Profile, Settings). 11 pages, 5 groups, phone bar of 4 tabs plus More (8 items).

Proposed (labels and grouping only, no page removed):

1. **Show Team and Reports as direct links** instead of groups of one. `[Layout / Navigation]`. Safety: (1) Nothing removed. (2) Could break: nav tests, active-state logic that expects a group. (3) Coach and Travel Lead share it. (4) Easy to revert. (5) Not a legal, safety or payment area. Not tested.
2. **Use one name for readiness**: "Event readiness" in both desktop and phone. `[Text-only / Safe]`.
3. **Match event page jump labels to section names** (finding 13). `[Layout / Navigation]`.
4. **Keep the Events group order** (Events, Event readiness, Drivers, Permission forms, Withdrawals): it follows the order a Travel Lead works in. No change.
5. **Do not merge Money and Reports.** They answer different questions; fix the column word (finding 1) instead.

Not proposed: moving approvals out of the event page (it would add a queue, which is a new feature).

## 7. Questions for the owner

1. **"Paid" on Money and Reports.** Which meaning should "Paid" have? Recommended: keep "Paid" for personal payments and call the Reports column "Paid and applied".
2. **Reports "10 of 10 ... more may be available" and the "Draft" badge.** Is the count a bug? What is "Draft"? Recommended: fix the count; remove "Draft" if it is a test marker.
3. **Travel Lead powers.** The server lets a Travel Lead approve and edit signups (`participation.ts:53`), review join requests (`admin.ts:16,45`) and create events (`admin.ts:83`). The nav hides Join requests, and the Events page shows no "New event" button for this account. Is that intended? If yes, no change; if no, the server rule and the screen disagree.
4. **Driver status "Unavailable".** What does it mean (not approved, inactive, or away)?
5. **Withdrawals description.** OK to say "requests to leave an event"?
6. **"Record paper form" off.** Is it off only because of the test notice, or because this account lacks the health export grant? Recommended: say so on the button.
7. **Travel Team, Travel Lead, Team transportation.** Do users know these are three things? One line of help, or rename "Team transportation required" to "Team bus required"?
8. **Event dates in the Signups section.** Switch to the usual "Jun 14, 2027" style?
9. **"Readiness" vs "Event readiness".** Pick one.
10. **Three export buttons.** Pick one verb, "Download", for all three.
11. **Attendance page.** The Coach nav has Attendance; the Travel Lead's does not, yet Reports shows attendance columns (all "Unavailable"). Intended?

## 8. Could not verify

- **Buttons not pressed** (see Setup notes (c)). I read handlers for "Prepare summary" (local state only) and for the Reports "View report" button (a local expand; I pressed that one for one student). The money "Prepare export" button calls `financeExport.prepare` (writes a job): not pressed.
- **Add driver and Edit driver forms.** Not opened.
- **Money, "Fee priority order" section and "Default amount: $1.00".** Seen in a cut-off read; not read in full.
- **Withdrawal requests.** The queue was empty, so I did not see a request.
- **Permission forms, receipts and paper form.** No receipts in test data; the paper-form button is disabled.
- **Reports on phone** as cards; Roster and event pages on phone beyond the bar and More list.
- **Pages not in the Travel Lead nav:** Join requests, Users and roles, Season, Retention, Attendance. Not opened (rule 7).
- **"Load more students"** on Reports. Not pressed.
- **Blocked Travel Lead pages.** Messages come from `unavailableMessage()` in code only.

## 9. State changes made during the audit

None.

- I clicked the five top nav groups and their links, footer links and event "View event" links.
- I opened all collapsed sections on one event page (a screen setting, not saved).
- I opened one student's report panel on Reports ("View report" for one student; local expand). I did not press "Close report", so the panel stayed open until I moved on.
- I loaded a second copy of the app in a frame for the phone view (normal start-up reads) and removed it.
- I loaded the root address `http://localhost:5173/` once for a fresh start. No other address was typed.
- No slips this run.

## 10. Do-not-break list

Left alone on purpose, and working well:

- Plain labels on most pages (Drivers, Withdrawals, Money, Fundraising, Settings) and the "view only for your account" notes on Money and Fundraising.
- The Event readiness page: one event at a time, with a clear ✓ or × for Students, Transportation and Rooming, and the plain line "1 more passenger seat is needed."
- The event page's order of work (Signups, Transport, Rooming) and its guard text, "A fifth occupant requires authorization and a note; six are never allowed."
- The honest data notes on Money ("Records are collected over a time range...", "Earlier changes are still being prepared...").
