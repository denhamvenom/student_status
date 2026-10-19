# 8044 Student Status: Master Audit Report

Date: 18 Oct 2026. Updated the same day with the owner's five decisions and follow-up confirmations (section 6).

Built from the plain-language, navigation and workflow audits run that day on the local development copy (mock data):

- `claude/audit_coach_2026-10-18.md`
- `claude/audit_parent_2026-10-18.md`
- `claude/audit_student_2026-10-18.md`
- `claude/audit_travellead_2026-10-18.md`
- `claude/audit_signedout_2026-10-18.md`

The Mentor audit from this round was not found in the project or in the Claude outputs folder. Mentor items below come from the other reports' cross-references and the 15 Oct Mentor review. Adult Student was not tested (no account), and Timeclock was out of scope.

How to read the references: **C** = Coach, **P** = Parent, **S** = Student, **T** = Travel Lead, **O** = signed out. **L** = language row, **W** = workflow finding, **Q** = question. For example, C-L6 is Coach language row 6 and P-Q7 is Parent question 7. The role reports hold the exact text, file and line for every item. This report decides what to do with them.

---

## 1. Verdict

The app is safe and complete, but it is not yet easy. Every role can reach everything it should. The money, consent, FIRST and season tools are well guarded: previews, typed reasons, "this changed" checks and locked history. None of the 147 findings touches those safeguards.

Two things make the app hard to use, and both are fixable without new features.

1. **The words come from the code, not the people.** About half the longer sentences on Coach pages read above grade 8. Recovery messages say "committed", "held rows" and "revisions". One idea often carries several names: "Paid" means two different amounts, unused money has five names, and attendance is "Unavailable" with "kickoff" unexplained.
2. **The navigation follows the code, not the job.** On the Coach desktop menu, clicking a group tab does not open a page. Attendance and Retention sit under Admin. Parent access sits under Join requests. "Attendance" is really a Timeclock repair page. Parents and students meet the same health and contact form in two or three places.

Newcomers finishing the main tasks without help:

| Role | Coach | Travel Lead | Parent | Student | Signed out |
|---|---|---|---|---|---|
| Tasks finished unaided | 3 of 8 | 5 of 8 | 2 of 6 | 4 of 7 | 2 of 5 |

Findings by role (Mentor not included):

| Role | Language | Navigation and workflow | Questions |
|---|---|---|---|
| Coach | 52 | 15 | 34 |
| Travel Lead | 16 | 8 | 11 |
| Parent | 13 | 8 | 14 |
| Student | 12 | 7 | 11 |
| Signed out | 11 | 5 | 9 |
| **Total** | **104** | **43** | **79** |

After merging duplicates, the 79 questions come down to about 70:

- **Answered:** 59. Section 5 holds all but one, and the duplicate-fee-name question is in the Batch 3 work plan.
- **Decided and confirmed by the owner:** 5 (section 6).
- **Waiting on the developer to confirm a fact:** 6 (section 7).

## 2. Top 10 changes, in order of payoff

1. **Fix the Coach and Travel Lead menu.** Make a group tab open its first page (C-W1). Regroup by job into four groups: Team · Events · Money · Admin (section 3G). Show the same groups as headings in the phone More sheet (C-W5).
2. **Use one set of money words everywhere** (theme A). Today "Paid" is $40 on one page and $60 on another for the same student.
3. **Rewrite the money recovery messages** (C-L6: "committed", "held rows", "revisions", "money child"). These show up exactly when a money job has stopped partway.
4. **Make the setup path consistent for families** (theme D). Pick one place to fill in each detail. Stop saying "your student must finish" when the parent can. Make "Edit setup" open on step 1. Fix "You are all caught up" when something is still waiting.
5. **Make attendance readable** (theme B). Explain kickoff in one line, rename "Clocked attendance", and move and rename the Coach Attendance page, which is Timeclock repair.
6. **Explain event sign-up** (theme E). Say what "Sign up" does and who signs up a child. Show a waiting-signups count on each event card. Use the normal date style.
7. **Fix the join and waiting flow** (theme H). The waiting screen should survive a reload, a declined request should say so, and the sign-in page should tell a new student that a team code is coming.
8. **Apply the owner decisions** (section 6):
   - Travel Leads get New event and Join requests.
   - Independent travel needs a parent or Coach.
   - Students can leave Whole Team events, and the Coach is told.
   - One subteam list.
   - A Travel Team help line.
9. **Split the Money page.** Daily work stays on Money. Fee order, charge matching, bulk import, export and recent changes move to an Admin "Money tools" page (C-W8).
10. **Clear the "Remove before launch" list** (section 9).

---

## 3. Problems that cross roles

Each theme names the single wording to use. Where two reports suggested different wordings, the choice is marked **Chosen**.

### A. Money words (Coach, Travel Lead, Parent, Student)

| Concept | Today | Use | Refs |
|---|---|---|---|
| Personal payments used on charges | "Paid" on Money | **Paid (personal)** | C-L2, T-L1 |
| Everything applied to charges | "Paid" on Team reports | **Applied to charges**, the words already on the Money overview tile. **Chosen** over T's "Paid and applied". | C-L2, T-Q1 |
| Money a student has not used yet | Five names: Personal available, Unallocated personal payments, Available personal payments, and others | **Unused personal payments** / **Unused fundraising credit** | C-L3 |
| Total from a fundraiser | Gross Raised, Raised, Known gross raised | **Total raised** | C-L14, T-L15 |
| Family Money page labels | Raised, Earned from fundraisers, Transfers received, Applied to charges, Available funds, Available fundraising credit | Keep the labels and add a one-line meaning under each (answered P-Q2) | P-L6, S-Q9 |
| Money returned note | Two rewrites proposed | **Chosen: C-L49 wording.** It is the same string as P-L7. | C-L49, P-L7 |

Leave the CSV and export headers alone for now (C-Q23).

### B. Attendance and kickoff (all roles)

- **Kickoff line.** Three wordings were proposed (C-L51, P-L4, S-L4/T-L4). **Chosen:** "Attendance totals start at kickoff, when the FIRST build season begins." It keeps the real term and explains it, and the same string serves every role.
- **Family page headings.** "Clocked attendance" becomes "Attendance from the Timeclock" (P-L2, S-L2). "Uninterrupted scheduled hour" becomes "a full hour with no breaks" (P-L3, S-L3).
- **Coach "Attendance" page.** It is Timeclock repair, not a list of who came. Move it under Team and label it "Attendance fixes" (C-W11, C-Q13 answered). If a who-came list is ever built, the label can go back.
- **Column names.** "Tuesday attendance / Thursday sessions" become "Tuesday meetings / Thursday meetings", which is what the family pages already say (C-L43).
- **Empty values.** "Unavailable" and "0" are mixed on the same tiles (S-Q5). Use "Not counted yet" before any data exists and "0" after. Answered.

### C. Readiness and Reports names (Coach, Travel Lead, Mentor)

- Readiness: use **"Readiness"** on desktop and phone. **Chosen** over T's "Event readiness": the link sits inside the Events group, and the short name fits the phone bar (C-W2, T-Q9).
- Reports: use **"Team reports"** for the menu link and the page title, including the Mentor's "Team report" and "Report" (C cross-role table).
- "Showing 10 of 10 students shown so far. More students may be available" contradicts itself (C-L43, T-L3). Fix the count logic: show "Showing all 10 students." when everything is loaded, and "Showing 10 students so far. Press Load more to see more." otherwise.

### D. Family setup: one task, three places (Parent, Student)

- The same contacts and health form appears in the setup wizard, on Profile and on Forms (P-W1, P-N2). The questions come in a different order in each.
- Messages blame the wrong person. "Your student needs to finish setup (shirt size and rooming category)" appears even though the Parent wizard asks for exactly those (P-L1). **Answered (P-Q1):** say what is missing and that either the parent or the student can add it: "Shirt size and rooming category are still needed. You or your student can add them in setup."
- "You are all caught up." appears above "Waiting on…" lines (S-L1, P-L13). Use "Nothing for you to do right now." followed by the waiting line.
- "Edit setup" opens on the last step and stays after setup is done (S-N3, P-Q5). Open step 1 and label it "Edit profile".
- "T-shirt size" in the wizard and "Shirt size" everywhere else: use **Shirt size** (P-L11). Check `convex/setupWizard.ts` first.
- For Parents, the "Profile" label means the child's profile (P-N1). Rename it **"Student profile"** for Parents only.
- The Home page has two "Finish setup" buttons for different jobs (P-L5). Use "Finish health profile" and "Finish FIRST registration".

### E. Events and sign-ups (all roles)

- **"Sign up" does not say what happens next** (S-L8, S-Q2). Add one line under the button that depends on the event's sign-up type. For approval events: "The Coach will review your signup. Any fee is charged when you are confirmed." For open events: "You are signed up when you press this."
- **Parents see "Not registered" with no next step** (P-W4). Add one line depending on the sign-up type. For open and approval events: "Your student signs up for this event." For assigned events: "The Coach adds students to this event."
- **Sign-up decisions are hidden inside each event page** (C-W7, T-W2). Show "N waiting" on the event card (C-Q12). The menu does not need a count.
- **Dates with seconds** ("6/14/2027, 7:00:00 PM") change to the normal style, "Jun 14, 2027, 7:00 PM CDT" (C-L50, T-L9).
- **Plural errors** ("1 additional adults", "1 custom requirements") (C-L26, T-L10).
- **Event page jump links don't match the section names** (T-L13). Rename the jump link "Participants" to "Signups".
- **Independent travel and leaving Whole Team events** are decided in section 6 (decisions 1 and 5).

### F. System voice in money and consent text (Coach, Travel Lead)

- **Money words** ("committed", "held", "revision", "money child", "source releases"): 39 strings, all on Money and Fundraising failure and recovery states. Change them in one batch with the tests listed in C-L6. Never rename the code values.
- **Consent words** ("evidence", "coverage", "receipt", "snapshot"):
  - Use "signed form", "events covered" and "signed form copies" (C-L36, C-L37, C-L39, T-L6, P-L10).
  - Rename "receipt" to "signed form" everywhere at once (C-Q24 answered yes). Skip this only if your district or legal adviser asked for "receipt".

### G. Navigation that follows the code

The labels that mislead:

| Label | What it really is | Fix |
|---|---|---|
| Retention review | Holds on archived records | **Archived records** |
| Attendance (Coach) | Timeclock repair | **Attendance fixes**, under Team |
| Join requests | Mostly parent access, with the requests at the bottom | Put the requests first (C-W3) |
| Withdrawals | Requests to leave an event | **Withdrawal requests** |
| Reports | The page is titled "Team reports" | **Team reports** |
| Parents (Student) | Four names on one page | Page heading **Parents** (S-L6) |

**Proposed Coach menu.** This revises C-W2 after decision 2. Join requests now lives under Team, so Travel Leads find it in the same place, and Users & Roles moves into Admin. That removes the "People & access" group. There are four groups and the same 15 links, with nothing added or removed for the Coach.

- **Team:** Team, Join requests, Attendance fixes, Team reports
- **Events:** Events, Readiness, Permission forms, Drivers, Withdrawal requests
- **Money:** Money, Fundraising
- **Admin:** Users & Roles, Season, Archived records, Settings (plus Money tools once C-W8 is done)

**Travel Lead menu after the change:**

- **Team:** Team, Join requests, Team reports
- **Events:** Events (with "+ New event"), Readiness, Permission forms, Drivers, Withdrawal requests
- **Money:** Money, Fundraising
- **Account:** Profile, Settings

Join requests and New event are new on the Travel Lead's screens, by decision 2. The server already allows both.

### H. Sign-in, join and waiting (signed out, Student)

- The waiting state is held only in the page. After a reload the form comes back. A request the Coach declined still shows "Waiting for approval". Re-sending skips the code check. (O-W2, O-Q2, O-Q3, O-Q8)
  **Answered:** load the request status from the server, and give each status its own screen. Pending shows the waiting screen. Declined shows "Your request was not approved. Ask a Coach for help." This one change fixes all four questions.
- **New-student hint** on the sign-in page (O-Q1, yes): "New student? You will be asked for a team code after you sign in."
- **Lockout length:** "…locked. Try again in 15 minutes, or ask a Coach for a new code." (O-Q4)
- **Join-screen wording:** the waiting line says "Your request is with the Coach." Because Travel Leads can now review requests too (decision 2), use "Your request is with your Coach or Travel Lead." Change only that line.
- **Other rewording:** the join form, wrong-account line and invitation messages are reworded per O-L2, O-L3, O-L4, O-L7, O-L8 and O-L9 (all answered yes).

### I. Wrong audience

- **"Needs Coach review" shown to the Coach.** Use "Needs your review" on Coach-only pages (C-L52). On pages shared with Travel Leads, make it depend on the role (C-Q2, answered yes).
- **Blocked-page messages that leave out Travel Leads.** "This page is for Coaches." becomes "This page is for Coaches and Travel Leads." where both are allowed (C-Q29). This now includes Join requests.

---

## 4. Work plan for the developer

Each item points to the role report that holds the exact text, file and line. Batch 1 can ship on its own. The other batches are approved by the owner's answers in sections 5 and 6.

### Batch 1: text-only and safe

These are the `[Text-only / Safe]` rows. Where a test pins a string, the role report says which test to update in the same change.

- **Coach:** C-L1 to L5, L7, L8, L14 to L21, L23 to L27, L29 to L31, L33, L34, L40, the first string of L41, L42 to L44, L46, the first two strings of L47, L48, L49 to L52.
- **Travel Lead:** T-L7, L9, L10, L13, L14 (Coach wording C-L34; T marked it owner-only, but it is the same safe string).
- **Parent and Student:** P-L2, L3, L4 (with the theme B kickoff wording), L11; S-L1 (health line), L2, L3, L6 heading, L9 (second line).
- **Signed out:** O-L2, L3, L4, L6, L9.
- **Shared:** the theme A labels, the theme B wording, the blocked-page messages (C-Q29), and the Travel Team help line (decision 4).

### Batch 2: wording in money, consent, FIRST, health and safety areas

These are text only, but they are in do-not-touch areas, so read them once before they ship. An independent verifier already checked every Coach row.

- **Money:** C-L6 (the large "committed/held/revision" batch), C-L9 to L13, C-L35, C-L45, the last two strings of C-L47, T-L11, P-L7 (use the C-L49 wording).
- **Consent and health:** C-L36 to L39, the second string of C-L41, P-L8 to L10, S-L11, and the "receipt" to "signed form" rename.
- **FIRST:** C-L22, P-L5, P-L13, S-L1 (FIRST line).
- **Safety (rooms, drivers):** C-L28 (T-L12 is the same text), C-L32 (also answers T-L8 and T-Q4: "Unavailable" means "Not approved or inactive").

### Batch 3: navigation and layout

- **Menu:** the C-W1 tab fix (with the guard against losing an open New event form), the four-group menu in section 3G, and the C-W5 More-sheet headings. Change the labels in both sources (`readinessCopy.navigation` and `navigation-copy.ts`). Keep the `admin` key, and list `/retention` explicitly.
- **Pages:**
  - Put Join requests first on its page (C-W3).
  - Remove Archive from the roster rows and keep it on the student record (C-W4).
  - Hide the empty travel slot on event cards (S-L10).
- **Parent and Student:**
  - Label Profile "Student profile" for Parents (P-Q11).
  - Make "Edit setup" open on step 1, labelled "Edit profile" (S-Q1, P-Q5).
  - Hide "Finish setup" while FIRST is waiting on the Coach (P-Q6).
- **Smaller fixes:**
  - Collapse rare tools into a "More options" section on their own page (C-Q14).
  - Add the event name and a "← Event" link to the rooming page (C-Q15).
  - Point the dead "Open family link management" link to Join requests (C-Q7).
  - Label the template version ID "Version: …" (C-Q25).
  - Show the event name beside duplicate fee names (C-Q21).

### Batch 4: behaviour changes (approved)

- **From section 5:**
  - Confirm steps for Revoke access, Finalize room and Write off.
  - Read-only archived rows.
  - The Money tools page.
  - Sign-up explanation lines and waiting counts on event cards.
  - The server-backed join status.
  - Readiness deep links and counts.
  - A one-line meaning for each money word.
  - The health "entered, waiting for a parent to confirm" status.
  - The team code explanation and revoke button.
  - A "Saved" note on the transport checkbox.
  - The Available funds amount on the Home Money card.
- **From section 6:**
  - Travel Lead access to New event and Join requests (decision 2).
  - Parent or Coach approval for independent travel (decision 1).
  - Leaving Whole Team events with a Coach notice (decision 5).
  - The subteam migration (decision 3).

---

## 5. Questions answered

Duplicates are merged. These answers follow from the reports and the code, so the developer can go ahead. Owner decisions are in section 6, and developer facts are in section 7.

### Navigation and layout

| Refs | Question | Answer |
|---|---|---|
| C-Q1 | Should a desktop group tab open its first page? | **Yes.** If you are already in that group, the tab only shows the sub-row, so an open New event form is not lost. |
| C-Q4 | Split the Money page? | **Yes.** Create Admin > "Money tools" for fee order, charge matching, bulk import, export and recent changes. Give the page the same guard those tools have today, so a Travel Lead with Financial editing keeps exactly the access they have now. |
| C-Q8 | Where should parent access live? | It stays on Join requests, with the requests list first. |
| C-Q9 | Where should profile corrections live? | The queue stays on Users & Roles. Add a line on the Team roster, "N profile corrections waiting", that shows only when N > 0 and links to the queue. |
| C-Q13 | Rename the Attendance page? | **Yes:** "Attendance fixes", moved under Team. |
| C-Q14 | Rare tools on daily screens? | Fold each into a collapsed "More options" section on the same page. Do not move them to other pages. |
| C-Q15 | Rooming page with no heading? | Add the event name and "← Event". |
| C-Q7 | Dead family-link link? | Point it to Join requests (parent access). |
| T-Q9 | "Readiness" or "Event readiness"? | **Readiness.** |
| T-Q11 | Attendance columns but no Attendance page for Travel Leads? | **Intended.** The page is Coach-only repair work. No change. |
| P-Q11 | Rename the Parent's "Profile"? | **Yes:** "Student profile", for Parents only. |
| P-Q12 | Redirect a Parent with a bookmarked page to setup? | First visit only. After that, go straight to the bookmarked page. |
| P-Q13 | Phone header height? | Recheck in a production build, where the test banner is gone. |
| S-Q1 / P-Q5 | "Edit setup"? | Open step 1 and label it "Edit profile". |
| S-Q3 | Two invite-a-parent forms? | Keep both and give both the heading "Parents". |
| O-Q9 | Sign-in page has no `<main>` element? | Add it. It is a one-line accessibility fix. |

### Words

| Refs | Question | Answer |
|---|---|---|
| T-Q1 | What should "Paid" mean? | Money: "Paid (personal)". Team reports: "Applied to charges". |
| P-Q2 / S-Q9 | Explain the family money words? | **Yes.** One line under each label. Use "Total raised" to match the Coach screens. |
| P-Q3 | Explain "Consent & Release"? | **Yes.** At first mention: "FIRST's yearly form that a parent signs on the FIRST website." |
| C-Q24 | Rename "receipt" to "signed form"? | **Yes**, everywhere in one change, unless legal asked for "receipt". Update `PermissionWorkflow.test.ts:19`. |
| C-Q25 | Show the template version ID? | Keep it, labelled "Version: field-trip-original-v1". |
| C-Q28 | The event type "Team" collides with other "Team" names. | Change the display label only, to "Team activity". The stored value stays "Team". |
| C-Q2 | "Needs Coach review" shown to a Coach? | Make it depend on the role: "Needs your review" for Coaches. |
| C-Q29 | Blocked messages leave out Travel Leads? | "This page is for Coaches and Travel Leads." |
| T-Q2 (count) | "10 of 10 … more may be available"? | It is a bug. Fix the count logic (theme C). |
| T-Q4 | What does driver status "Unavailable" mean? | The code says not approved or inactive. Use "Not approved or inactive" (C-L32). |
| T-Q5 | Withdrawals description OK? | **Yes** (C-L34 wording). |
| T-Q6 | Why is "Record paper form" switched off? | Show the reason under the button: "Needs a Coach or the Health export permission." |
| T-Q8 | Event date style? | **Yes:** "Jun 14, 2027, 7:00 PM CDT". |
| T-Q10 | Three export verbs? | Use "Download" for the two one-step exports. Money stays "Prepare export" then "Download", because it is a two-step job and the button is pinned by a test. |
| S-Q5 | "Unavailable" vs "0"? | "Not counted yet" before any data exists, "0" after. |
| S-Q10 | Health privacy line for students? | **Yes:** "Your parent adds this. You cannot see it here." |
| O-Q1 | New-student hint on the sign-in page? | **Yes.** |
| O-Q4 | Say how long the lockout lasts? | **Yes:** "Try again in 15 minutes". |
| O-Q5 | "Confirm your student name"? | **Yes:** "type your first and last name". |
| O-Q6 / O-Q7 | Match the invitation messages and drop "verified"? | **Yes** to both. |
| C-Q22 | Team code explanation? | **Yes:** "Students use this code to ask to join. A Coach or Travel Lead approves each request." |

### Behaviour

| Refs | Question | Answer |
|---|---|---|
| C-Q3 | Confirm steps on controls that save on one tap? | **Yes, only for the hard-to-undo ones:** Revoke access, Finalize room ("Review and finalize"), Write off. Leave Subteam, Travel Team, Promote, Approve and Decline alone. |
| C-Q18 | Archived students keep editable Subteam and Travel Team? | Make them read-only on archived rows. |
| C-Q22 | Team code revoke button? | **Yes.** The backend `admin.revokeJoinCode` already exists. A leaked code should be cancellable. |
| C-Q10 / C-Q11 | Readiness deep links and counts? | **Yes, later:** open the student record or form directly, and show the open count on every event button if the query is cheap. Do this after Batches 1 to 3. |
| C-Q12 | Show waiting sign-ups? | A count on the event card only. |
| C-Q5 | Unused personal payments missing from the Money table? | Rename the column now (C-L2). Do not add a column yet. |
| C-Q6 | Health shows "missing" while allergies are filled in? | Show the real state: "Entered, waiting for a parent to confirm." This is an explanation of an existing state, not a new feature. |
| C-Q16 | Duplicate protection on bulk import depends on who retries? | Remove the user from the duplicate key, so a retry by any Coach is caught. The developer should confirm nothing else relies on the key. |
| C-Q17 | Waitlist sorted by one date, Promote checked against another? | It is a bug. Use one order, `signedUpAt`, for both. |
| C-Q20 | Where are last season's fundraisers? | Show them read-only on the Season page's past-season view, beside roster balances. Low priority. |
| C-Q23 | Export headers in developer voice? | Leave them until you know who uses the files. |
| C-Q31 | Retention policy-gap note? | Remove it before launch, or replace it with a plain status line once the policy exists. |
| C-Q32 | Withdrawal history? | Fine as is. History is in Money > Recent changes. |
| C-Q34 | "Attendance is ready" next to "Unavailable"? | A test-season effect. Recheck once real season dates exist. |
| P-Q1 | Who fills in shirt size and rooming? | Either the parent or the student. Reword all messages to match (theme D). |
| P-Q6 | "Finish setup" while waiting on the Coach? | Hide it. |
| P-Q8 | Parent event sign-up? | Add the line that depends on sign-up type (theme E). |
| P-Q9 | Transport checkbox? | Show "Saved" after a tick. Label it: "My student will travel on their own (not with the team)." |
| S-Q2 | What happens after "Sign up"? | Add the line that depends on sign-up type (theme E). |
| S-Q7 | Rooming changes: correction form or "Ask a Coach"? | Use Profile > "Request a correction". Change the wizard line to "To change your rooming category, use Request a correction on your Profile." |
| S-Q11 | Home Money card leaves out Available funds? | Show it on the card when it is above $0. |
| O-Q2 / Q3 / Q8 | Join waiting state, declined requests, resend? | Load the status from the server and show one screen per status (theme H). |
| P-Q14 | Invitation pages not reached? | Covered in code by the signed-out pass. Test with a real invitation link before launch. |

## 6. Owner decisions (18 Oct, all confirmed)

### 1. Independent travel needs a parent or Coach (S-Q8)

**Rule:** only a parent or a Coach can turn on "Traveling independently". A student cannot set it.

**Changes:**
- **Student event page:** replace the checkbox with a status line.
  - When it is off: "Your parent or Coach sets this if you will travel on your own."
  - When it is on: "Traveling on your own (set by your parent or Coach)."
- **Server:** refuse the change when it comes from a student account, not just hide the checkbox. The component takes an `ownProfile` flag for the student view (`Travel.tsx:76`), so the server check is what actually enforces the rule.
- **Parent event page:** keep the checkbox, with the P-Q9 label and a "Saved" note.
- **Coach:** keep whatever control the Coach has today on the event's Transport section.

**Confirmed:** an adult student with no linked parent needs the Coach to set it.

**Check:** look for any record a student already set. Mock data only today.

**Class:** behaviour change in a safety area. Approved.

### 2. Travel Leads can create events and review join requests (C-Q30, T-Q3)

**Rule:** the server already allows both. The screens should now show them.

**Changes:**
- **Events page:** show "+ New event" to Travel Leads, and open the `/events/new` route to them.
- **Menu:** add Join requests to the Travel Lead's Team group (section 3G).
- **Wording:**
  - The blocked message "This page is for Coaches." on `/enroll` becomes "This page is for Coaches and Travel Leads." for other roles.
  - The waiting screen says "your Coach or Travel Lead".
  - The team code line becomes "A Coach or Travel Lead approves each request."

**Confirmed:**
- **Event fees:** any Travel Lead can set event fees in the New event wizard, without the Financial editing grant. Fees only become charges when a student is confirmed, and the Coach sees every event.
- **Join requests page:** Travel Leads see the pending requests. The team code, the parent invitation switch and Revoke access stay Coach-only.

**Class:** shows an existing server permission on screen. It moves a capability onto the Travel Lead's screens, by owner decision.

### 3. One subteam list (C-Q19)

**Final list:**
- Build
- Electrical
- Machining
- Programming
- Business and Media (one subteam)

Plus "Unassigned" for students without one.

**Changes:**
- Use this one list in the roster dropdowns, the roster filter, the student wizard and `live-copy.ts:11`.
- Keep the stored keys stable.
- Migrate the old values (mapping confirmed by the owner):

| Old value | Becomes |
|---|---|
| Business | Business and Media |
| Mechanical | Build |
| Outreach | Business and Media |

**Check:**
- **Production:** the owner believes this mapping is already in place on the production side. Before the migration runs, confirm that development and production use the same keys and mapping, so the two don't drift.
- **Downstream uses:** the subteam is a stored value. Update any filters, CSV exports and Team reports that group by subteam in the same change.

**Class:** data migration. Approved.

### 4. Travel Team meaning (T-Q7)

**Meaning:** students chosen by mentors and Coaches through an application. They travel to all out-of-state events and to the local event.

**Help line for staff (roster column and filter):** "Travel Team: students chosen by mentors and Coaches through an application. They go to all out-of-state events and our local event."

**Line for students and parents** (wizard step 2 and Student profile, where Travel Team shows): "The Travel Team is chosen by mentors and Coaches through an application. Travel Team students go to all out-of-state events and our local event."

**Event field:** relabel "Team transportation required" to "Students must ride team transport". This keeps it apart from "Travel Team" and "Travel Lead". Display label only.

**Class:** text only.

### 5. Students can leave a Whole Team event, and the Coach is told (S-Q6)

**Rule:** a student can leave a Whole Team event, and the Coach must be told.

**Changes:**
- **Student event page:** on a confirmed Whole Team event, show "Leave this event". After the student confirms, show "You have left this event. Your Coach has been told."
- **How the Coach is told:** the app sends no email, so this is an in-app notice. Each leave appears on Withdrawal requests under a new heading, "Left Whole Team events", with the student, the event and the date. It also appears in the event's Signups section. The Coach dismisses each notice after reading it.
- **Money:** Whole Team events have a $0 fee in the test data. If a Whole Team event ever has a fee, the money part goes through the normal withdrawal decision. Leaving is instant, but any refund or charge still waits for the Coach.
- **Re-enrolment:** reactivating a student re-adds them to upcoming Whole Team events "while preserving earlier withdrawals" (C-L19). A student who left stays out, which matches this rule.

**Check:** if your team wants the Coach told by email or text, that is a new feature. This plan covers the in-app notice only.

**Class:** behaviour change. Approved.

## 7. Facts the developer needs to confirm

These come before rewording, because the right words depend on the answer.

1. **The three family health and contact forms** (wizard, Profile, Forms): do they save to one record? (P-Q7) If they do, Forms shows a summary with an "Edit in Student profile" link instead of a second full form, and all three use the same question order.
2. **The "Draft" chip** on Team reports and the printable readiness summary: what does it mean? (C-Q26, T-Q2) If it means nothing to users, remove it.
3. **"Earlier attendance (checkmarks)":** who made the checkmarks, and when? (P-Q4, S-Q4) Probably Coach-entered records from before Timeclock. If so, the label becomes "Earlier attendance (marked by a Coach)".
4. **Meanings to pin down before rewording** (C-Q27): room "Finalized" (who can undo it?), "Personal held" and "Fundraising held", invitation status "Replaced", "Row reference", and "Event arrangements".
5. **An event date one day early** (C-Q33): an event stored at 00:00 UTC shows as the day before in Central time. Store event dates as local dates.
6. **Fictional PDF Student shows "Not registered"** for the Whole Team event (P-Q10). This is either a data problem or a bug.

## 8. Possible bugs found along the way

These are not wording problems. They are listed so they don't get lost.

| # | What | Ref | Next step |
|---|---|---|---|
| 1 | Waitlist display order and the Promote check use different dates | C-Q17 | Fix |
| 2 | A declined join request still shows "Waiting for approval" | O-W2 | Fix (theme H) |
| 3 | Re-sending a join request skips the code check | O-Q3 | Fix (theme H) |
| 4 | The waiting screen is lost on reload | O-Q8 | Fix (theme H) |
| 5 | Team reports count "10 of 10 … more may be available" | T-L3 | Fix |
| 6 | Bulk payment duplicate protection depends on who retries | C-Q16 | Fix after confirming |
| 7 | Event date shows one day early | C-Q33 | Developer check |
| 8 | Whole Team event "Not registered" for one student | P-Q10 | Developer check |
| 9 | Server lets Travel Leads create events and review joins; screens don't | C-Q30, T-Q3 | Resolved: show them on screen (decision 2) |
| 10 | Archived roster rows can still be edited | C-Q18 | Fix |
| 11 | "Open family link management" leads to an empty section | C-Q7 | Fix |
| 12 | A student can set "Traveling independently" alone | S-Q8 | Fix on the server (decision 1) |

## 9. Remove before launch

This is test-only text, merged from all reports. Do not reword it; delete it or let it disappear in production builds.

- **Every page:**
  - The banner "Development workspace — synthetic data only" (dev builds only).
  - The season names "2027–28 Synthetic rehearsal" and "REHEARSAL ONLY - Historical Charge Correction" (data).
- **Permission forms (Coach, Travel Lead, Parent):**
  - "This development workflow accepts only server-registered fictional records…"
  - "Only registered fictional development subjects may use consent."
  - "Synthetic test evidence" / "Synthetic development evidence."
  - "Synthetic records remain labeled in exports."
  - The "Record a synthetic paper form" set and the draft-authoring notice.
  - The parent-side "Prepare synthetic form" and "Submit synthetic signature".
  - The unapproved-drafts notice.
  - "Review a populated field trip PDF before signing."
- **Signing and PDFs:** "Signing is unavailable for this student or deployment." if it only shows in test (P-L9); otherwise use the P-L9 rewrite. Also the PDF stamps "SYNTHETIC DEVELOPMENT FORM - NO REAL CONSENT" and "SYNTHETIC SIGNATURE EVIDENCE".
- **Family pages:** "Synthetic review", "Sample Student", "Sample Parent", and the "Approval still required … synthetic workflow …" paragraph.
- **Retention:** the policy-gap note (C-Q31).
- **Data cleaned with the mock records:** any name starting "REVIEW 2026-10-18", "REHEARSAL ONLY", "SYNTHETIC", "TEST ONLY" or "Fictional"; the test drivers and vans; and reasons such as "Owner-authorized fictional development review".

## 10. Do not break

Every report agreed these must stay as they are. Wording changes must not touch them.

- **Money safeguards:** every money change has a preview, a typed reason (8+ characters) and a "this changed since you looked" check. "Prepare" steps change no money until confirmed.
- **Season change:** you must type the season name, history is locked, and correction mode times out after 15 minutes.
- **FIRST:** both boxes must be ticked to verify, reopening needs a reason, and Competition FIRST stays on the student record.
- **Consent text is data:**
  - Never edit `src/lib/field-trip-approved.ts` as a copy change, because the backend compares it.
  - Signing is closed in test.
  - The profile must be confirmed before signing.
- **Stored values that look like words:** event types (Competition, Outreach, Team), readiness keys, subteam keys (migrated only by decision 3), and code values such as 'commit', 'held' and 'progress'. Change display labels only.
- **Who sees what:**
  - The Coach-only routes stay Coach-only, except `/events/new` and Join requests, which open to Travel Leads (decision 2).
  - The Travel Lead roster stays read-only.
  - Parent access controls (team code, invitation switch, Revoke access) stay Coach-only.
  - The Financial editing and Health export grants keep their current effect.
  - The only capability changes are the three owner decisions: Travel Lead access (2), independent travel (1) and leaving Whole Team events (5).
- **Wording that works and should stay:**
  - "No email is sent by this app. Copy the link and share it privately…"
  - "Accepting access does not sign a travel permission form or give medical consent."
  - "Your answers save after each step."
  - The "view only for your account" notes.
  - The readiness matrix and its print summary.
  - The roster filter chips.
  - The "← Team" and "← Events" back links.
  - The short, kind error messages.

## 11. Gaps in this audit

- **Mentor:** this round's Mentor report is missing from the project. The Coach report mentions role audits in the Logistics Work folder, so it may be saved there. If you send it, I'll fold it in.
- **Adult Student:** not tested, because there is no account. Its FIRST path was seen only as a Parent and in code.
- **Phone layout:** Chrome would not shrink below 500 px for the Coach pass, so it ran at 500 px instead of 390 px.
- **States never seen:**
  - A balance that is actually due, and how-to-pay wording.
  - A pending withdrawal.
  - A fundraiser this season.
  - Live signing.
  - The join, waiting and invitation screens on screen (all read in code).
- **Verification:** only the Coach pass used an independent verifier. The Parent, Student, Travel Lead and signed-out passes were single-agent, so their Batch 2 wording deserves your read before it ships.
- **Timeclock:** out of scope. It deserves its own pass, because Attendance depends on it.
