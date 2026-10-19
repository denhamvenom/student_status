# Audit Report: Parent

Date: 2026-10-18. Prompt: `language_and_workflow_audit_prompt_FINAL_2026-10-18`. Scope: Student Status only. Signed-in account shown as [signed-in Parent]. Students seen: the three linked to this Parent ("Consent rehearsal", "Test", "Fictional PDF Student"). No account names or emails are copied here.

## 1. Executive summary

A Parent can tell what most pages are for from their names, and the pages that carry money and events read reasonably well. Three things make the role hard. The same child information is asked for in three places (the setup wizard, Profile, and Forms). The messages about who must finish what contradict each other ("Your student needs to finish setup" when the Parent can enter that data in the wizard). And Attendance and Forms use words a parent would not know (Clocked attendance, Consent & Release, deployment).

A newcomer could finish 2 of the 6 top tasks unaided (check what we owe, find the transport choice). They would first get lost on the Home page, which has three buttons that all go to the same wizard, two of them labelled "Finish setup" for different tasks.

Language findings: 13 | Navigation and workflow findings: 8 | Items needing owner decision: 14 | Code access: Yes | Share of full-sentence text above grade 8: 11 of 26 scored by the script (about 4 are real problems; the rest are short lines inflated by long names) | Model tiers used: one agent (Sonnet 5.5), no helpers.

Setup notes. (a) The Parent was already signed in. On a fresh load the app redirects to the setup wizard, so that is where the audit started. (b) I never pressed Save, Continue, "I've done both in FIRST", Finish setup, Prepare PDF, Send request, the transport checkbox, or any theme button. (c) For the phone view I loaded the app inside a 390 px wide frame in the same tab (same sign-in, read-only), because Chrome would not shrink the window. (d) Receipts on the Forms page show the Parent's own real name as signer; it is replaced here by [signed-in Parent].

## 2. Site map and purpose

| Route / tab | Desktop | Phone (how reached) | Source component | Predicted from the label | What it actually is |
|---|---|---|---|---|---|
| `/setup` (not in nav) | Landing after redirect | Landing after redirect | `SetupWizard.tsx` | n/a | 4-step wizard per child: Student details, Contacts, Medical, FIRST registration. Saves each step. |
| `/` "Home" | Link 1 of 7 | Bottom bar | `LiveApp.tsx` Home → `DashboardPage` | Overview of my children and what is left | Child name, "To do", Money card, Events card, Attendance card. Matches. |
| `/events` "Events" | Link 2 | Bottom bar | `EventList` | Events my child can join or is in | Cards grouped Competitions / Outreach / Team with "Not registered" or "Confirmed". Matches, but no way to register. |
| `/events/:id` | From card | From card | `EventPage` | n/a | Details, fee, requirements, and for confirmed events a transport checkbox. |
| `/finances` "Money" | Link 3 | Bottom bar | `FinancePage` | What we owe, payments | Balances, available funds, charges, history. Matches. |
| `/attendance` "Attendance" | Link 4 | More > Attendance | `FamilyAttendancePage` (`DashboardReports.tsx:77`) | How often my child comes | Clocked totals, older checkmarks, session list. Matches, but jargon-heavy. |
| `/profile` "Profile" | Link 5 | More > Profile | `Profile` | Ambiguous: mine or my child's | My child's profile plus a long health and contact form. Not mine. |
| `/forms` "Forms" | Link 6 | Bottom bar | `PermissionWorkflow.tsx` | Permission forms to sign | One child's permission form, with the same health form as Profile repeated. Title says "Permission form". |
| `/settings` "Settings" | Link 7 | More > Settings | `LiveApp.tsx` `Settings()` | Theme, sign out | Same as Mentor: Light/Dark/System, email, Sign out. Matches. |
| `/invite-parent` | Link from a student | n/a | `ParentInvitationLanding` | n/a | Not reached (needs a token). Code only. |
| `/about` `/privacy` `/terms` | Footer | Footer | `PublicPages.tsx` | n/a | See the Mentor report for these. Not repeated. |

Count: 7 top-level destinations on desktop (at the limit, not over). Phone: 4 tabs plus More (Attendance, Profile, Settings, Sign out). The header on phone hides the name, role and Sign out button.

## 3. Task results

Predictions are in the progress file and were written before opening Events, Money, Attendance, Profile, Forms and Settings. The Home page was already visible after the redirect.

| Task | First click I would make | Right? | Clicks to finish | Result | Where I got lost |
|---|---|---|---|---|---|
| Finish my child's information | Profile | No. The wizard (via Home "Finish setup" or the redirect) is the main path. Profile holds a second copy of the contacts and health form. | 3+ per step. Not saved (rule 1). | Finished by guessing | Three entry points: Home "Edit setup", Home "Finish setup" (x2), and Profile. |
| Check what we owe | Money | Yes | 1 | Finished unaided | Terms (Raised, Earned from fundraisers, Transfers received, Available funds) are not explained. No child here owes money, so I could not see the "how to pay" wording. |
| Sign the permission form | Forms | Yes | Stopped at 2 (Forms, "Choose events and review PDF" dialog). Signing is closed in test. | Stuck (for Consent rehearsal) | Button is off; the notes say "Your student needs to complete setup first", but the Parent wizard asks for those details. |
| Find and sign my child up for an event | Events | Yes | 2 | Stuck | "Participation: Not registered" with no button, no reason, no contact. |
| Check attendance | Attendance (phone: More, then Attendance) | Yes | 1 desktop, 2 phone | Stuck | "Unavailable" and "Attendance totals start at kickoff." Then a list of sessions with "Total time 0 min". |
| Tell the team my child travels on their own | Events, then the event | Yes | 3 | Finished unaided (checkbox not touched) | It only appears for a confirmed event. One checkbox, saves at once. |

Navigation problems:

- **N1. "Profile" means my child's profile and health form.** A Parent expecting their own details is wrong. The Mentor's "Profile" is the adult's own page. Same label, different meaning by role.
- **N2. Same form in two tabs.** The "Parent health and contact profile" form is on both Profile and Forms (`/profile` and `/forms`). The wizard asks for the same information again.
- **N3. Deep links go to setup.** Any fresh page load while a child still "needs setup" is sent to `/setup`, even a bookmarked Money or Forms link (`SetupEntryGate`, `LiveApp.tsx`, `location.pathname!=='/setup'` check). On `/setup` no nav item is marked as current.
- **N4. Phone hides the page the form needs.** Forms is one of the four main tabs. Profile, which must be filled in first, sits under More.
- **N5. Forms vs "Permission form".** Nav says "Forms", the page title says "Permission form". Coach and Travel Lead see "Permission forms" for a different page.
- **N6. Page headers differ.** Forms has no season line above the title; the other pages have one.
- **N7. Phone header takes about 40% of the first screen** (title, "Viewing", student buttons, test banner) before any content.
- **N8. The student switch is shown twice:** buttons plus "Viewing X". Fine for clarity, but on phone it adds height.

## 4. Language findings

Grades are Flesch-Kincaid estimates from a script. Short lines with long names (for example "Waiting on Consent rehearsal to finish student setup.") score high because of the name, so I judged those by reading too. Sorted by how many Parents meet them and how badly they confuse.

| # | Screen / route | Source file and line | Exact current text | Problem | Grade (now → proposed) | Replacement | Class |
|---|---|---|---|---|---|---|---|
| 1 | Profile, Forms | `PermissionWorkflow.tsx` (profile card), message in same file | "Your student needs to finish setup (shirt size and rooming category) before you can review the permission form." and "Your student needs to complete setup first." and Home: "Waiting on Consent rehearsal to finish student setup." | Tells the Parent the student must do it. The Parent wizard step 1 has T-shirt size and Rooming category for the Parent to fill in. Contradiction. | 10.4 | No rewrite proposed. I do not know the true rule. See Q1. | `[Needs Owner Decision]` |
| 2 | Attendance `/attendance` | `report-copy.ts:14` (`verified`, `legacy`), `:19` | Headings "Clocked attendance" and "Earlier attendance (checkmarks)" | "Clocked" is Timeclock language a Parent was never taught. "Checkmarks" has no meaning to a newcomer. | n/a | "Attendance from the Timeclock" and "Earlier attendance (checkmarks by a Coach)". The second needs the owner to confirm who made the checkmarks (Q4). | `[Text-only / Safe]` for the first. `FamilyAttendanceSummary` uses `copy.verified` as its default heading, and the Coach record passes its own label ("Attendance"), so the Coach is unaffected. No test found. |
| 3 | Attendance `/attendance` | `report-copy.ts:20` (`notQualifying`), `:21` | "Counts after one full uninterrupted scheduled hour. Longest visit: 0 min." | "Uninterrupted scheduled" is formal, and the line does not say whether the child attended. | 6.4 → 1.6 | "Counts after a full hour with no breaks. Longest visit: 0 min." | `[Text-only / Safe]`. String also used for students and Coach views of sessions, same meaning. |
| 4 | Home and Attendance | `report-copy.ts:8-9` | Bold "Unavailable", then "Attendance totals start at kickoff." | A bold "Unavailable" looks broken. "Kickoff" is FIRST jargon. | 7.6 → 5.9 | "Attendance shows here after kickoff, the day the build season starts." | `[Text-only / Safe]` only for the Parent/Student strings. The same sentence is reused for Mentor and Coach screens (see Mentor report, finding 2), so change the family copy alone or all together. |
| 5 | Home To do cards | `LiveApp.tsx:141` | Two buttons both reading "Finish setup", under "Profile & health" and "FIRST registration and Consent & Release", plus "Edit setup" above the title. All three go to `/setup`. | Identical buttons for different tasks. "Edit setup" duplicates them. | n/a | "Finish health profile" and "Finish FIRST registration". Leave "Edit setup" for the owner (Q5). | `[Do Not Touch: FIRST, health]` for the FIRST button. Text change only; destination unchanged. |
| 6 | Money `/finances`, Home Money card | `family-copy.ts` (`finance`, `dashboard`), `report-copy.ts:4` | Labels "RAISED", "EARNED FROM FUNDRAISERS", "TRANSFERS RECEIVED", "APPLIED TO CHARGES", "AVAILABLE FUNDS", "Available fundraising credit" | Six money words, none explained. One child shows "Available fundraising credit $6.25" next to "Earned from fundraisers $0.00" and "Transfers received $6.25". A Parent cannot tell why. | n/a | None proposed. A one-line meaning for each would be new text. See Q2. | `[Do Not Touch: payment]` |
| 7 | Money `/finances` | `family-copy.ts` (`returnNote`) | "Available funds can pay other charges or be used toward a future charge. Money returned from a canceled event stays available here; it has not been paid back to the family in cash or by check." | Long second sentence, passive. | 5.8 → 3.2 | "Available funds can pay other charges or a future charge. Money from a canceled event stays here. It is not paid back as cash or a check." | `[Do Not Touch: payment]`. Text only; flag for owner. |
| 8 | Profile and Forms | `PermissionWorkflow.tsx` | "Fill this in before you sign the permission form. If you change these details after preparing a form, prepare and review a new PDF before signing. Existing signed receipts keep their original information." | Three long sentences in a row. | 7.7 → 5.8 | "Fill this in before you sign the permission form. If you change anything after preparing a form, prepare a new PDF and check it before you sign. Forms already signed keep their old information." | `[Do Not Touch: consent, health]`. Text only; flag for owner. |
| 9 | Forms | `permission-workflow-copy.ts` (`signingClosed`), `PermissionWorkflow.tsx` | "Signing is unavailable for this student or deployment." | "Deployment" is developer voice, and the Parent cannot act on it. | 11.1 → 2.3 | "You cannot sign for this student right now." | `[Do Not Touch: consent]`. Text only. This may be a test-only state (see below). |
| 10 | Forms (no receipts) | `permission-workflow-copy.ts` (`parentNoHistory`) | "No permission receipts for this student in the current season. Prior-season records are retained, but are not available through Parent access. Contact a Coach for assistance." | "Receipts" and "Parent access" are system words. | 7.1 → 1.3 | "No signed forms for this student this season. Older forms are kept but you cannot see them here. Ask a Coach for help." | `[Do Not Touch: consent]`. Text only. |
| 11 | Setup wizard step 1 | `SetupWizard.tsx` (parent step 0), `setup-wizard-copy.ts` | "T-shirt size" | Called "Shirt size" on Profile, the Mentor profile and the student profile. | n/a | "Shirt size" | `[Text-only / Safe]` after checking: "T-shirt size" is also in `convex/setupWizard.ts` (server side) and may be in server messages; confirm there before changing. No test found. |
| 12 | Setup wizard chooser vs step 4 | `SetupWizard.tsx` `nextItemLabel` | Chooser says "Waiting on Coach" while step 4 shows a live "Finish setup" button (Fictional PDF Student). | Two statuses for the same child that seem to disagree. | n/a | None proposed. See Q6. | `[Needs Owner Decision]` |
| 13 | Home (Fictional PDF Student) | `LiveApp.tsx` (`DashboardPage`) | "You are all caught up." followed by "Waiting on the Coach to confirm Fictional PDF Student's FIRST registration." | Says done and waiting in the same place. | n/a | "Nothing for you to do. Waiting on the Coach to confirm Fictional PDF Student's FIRST registration." Same meaning, one message. | `[Do Not Touch: FIRST]`. Text only. |

Seen in code only (not on screen, not rewritten): the Medical step labels "Carried by", "Severity", "Response" and the options "Report allergies", "Add details", "Information unavailable" (`SetupWizard.tsx` `MedicalFields`). "Consent & Release" is used at first mention on Home and in wizard step 4 with no explanation (Q3).

Credit where due: wizard errors and helper lines are short and kind ("This step could not be saved. Your answers are still here. Review them and try again." grade 0.5; "Choose None reported if there are none." grade 0.6). The Contacts step asks "Who should we call about Test?", which is clear. Money history lines such as "Payment returned to available funds from [event]" say what happened.

**Remove before launch (test-only text):**

- Forms: "This development workflow accepts only server-registered fictional records. Real permission signing remains closed." and "Only registered fictional development subjects may use consent." and "Review a populated field trip PDF before signing." (`permission-workflow-copy.ts` `syntheticNotice`; "Synthetic test evidence" label on receipts).
- Forms receipts: "Electronic · Synthetic test evidence".
- All pages: "Development workspace — synthetic data only" (shown only in dev builds, `readinessCopy.ts:6`) and the season name "2027–28 Synthetic rehearsal" in the header and each page's top line (data).
- Event names and details: "REHEARSAL ONLY", "SYNTHETIC", "REVIEW 2026-10-18", "TEST ONLY: shared vehicle or independent travel", "Fictional venue", "Fictional transport" (data).
- Student names: "Consent rehearsal", "Test", "Fictional PDF Student" (data).
- Money history: "REHEARSAL ONLY — Room and withdrawal check" (data).

## 5. Workflow findings

**W1. Parent finishes a child's information.**
- Goal: complete the child's profile so the child can be ready for events.
- Current flow: 1. Redirected to `/setup`. 2. Choose a child. 3. Step 1 Student details (name read-only, shirt size, rooming category, grade, date of birth). 4. Step 2 Contacts. 5. Step 3 Medical (four questions, with extra fields if "Report"). 6. Step 4 FIRST registration. Separately: Profile has the same contacts and health form, and Forms repeats it. Source: `SetupWizard.tsx`; `PermissionWorkflow.tsx` (profile card).
- Friction: overlap (three places ask for the same data), disconnection (which one counts?), hidden dependency (the Home waiting line and the Profile note say the student must do part of it), purpose (Profile page does not say the wizard exists), repeated entry (contacts and health asked in wizard and again on Profile/Forms; order of Medical questions differs: wizard is Allergies, Prescriptions, Insurance, Physician; Profile is Insurance, Physician, Allergies, Prescriptions).
- Proposed flow: no removal proposed, because I cannot show the three forms save to the same record. Owner decision Q7. What can be done safely now: make the Home buttons say what they do (finding 5) and use one order of questions (Q7).
- Stays the same: all three entry points, all saved data.
- Safety Check: (1) Not changed. (2) Could break: health and consent data, `setupWizard.saveContacts`, `saveMedical`, parent-confirmed profile used to gate signing, tests. (3) Parent, Student and Coach use related screens. (4) Reversibility: not applicable (no change). (5) `[Needs Owner Decision]` / `[Do Not Touch: health, consent]`. No verifier ran.

**W2. Parent signs a permission form.**
- Goal: sign for an event.
- Current flow: 1. Forms. 2. See coverage, then "Choose events and review PDF" (off unless setup and profile are done). 3. Dialog: choose events, "Prepare PDF for review". 4. Review PDF, type full name, accept, medication choices. 5. Submit. I stopped at step 3 (the button only opens the dialog, `PermissionWorkflow.tsx:68`; the next step calls `prepare`, which writes).
- Friction: three different button names for one action across the flow ("Choose events and review PDF", "Prepare PDF for review", then the signing button); the off button gives two reasons in small text below it; profile form sits lower on the same page.
- Proposed flow: none. Wording only: findings 1, 8, 9, 10.
- Safety Check: Do-not-touch area. No change proposed beyond text. `[Do Not Touch: consent]`.

**W3. Parent reads attendance.**
- Current flow: 1. Attendance (phone: More first). 2. Clocked totals ("Unavailable"). 3. Earlier checkmarks ("Tuesday meetings: Unavailable", Thursday 0, Outreach 0). 4. Session list with "Total time 0 min".
- Friction: purpose test (a Parent cannot tell if the child attended), hidden dependency (needs to know children clock in at Timeclock), two sets of numbers with different names, a 3-sentence note block.
- Proposed flow: same page; findings 2, 3 and 4 only. No removal of "Earlier attendance".
- Safety Check: (1) Text only. (2) Nothing stored or exported depends on the strings (grep found no tests). (3) Used by Student and Coach attendance views; wording stays correct for them. (4) High. (5) `[Text-only / Safe]`. No verifier ran.

**W4. Parent signs a child up for an event.**
- Current flow: 1. Events. 2. Open an event. 3. See "Participation: Not registered". End.
- Friction: dead end, purpose unclear (who registers a child?), disconnection. For approval-type events the Coach decides, but nothing says so.
- Proposed flow: none that does not add a feature. Q8.

**W5. Parent says the child travels independently.**
- Current flow: 1. Events. 2. Open a confirmed event. 3. Tick "Traveling independently". Saves at once (`Travel.tsx:76`, no Save button).
- Friction: instant save with no visible confirmation in the code (only an error is shown); one checkbox presented as a choice between two ways to travel; only appears on the event page.
- Proposed flow: none. Q9.

**W6. Parent switches child.**
- Current flow: 1. Tap the child's name in the bar. Page stays on the same route. Works on desktop and phone.
- Friction: none significant. Selected child is a plain button state, shown twice.
- Safety: no change.

## 6. Coach navigation rationalization

Not applicable. This is a Parent-only pass.

## 7. Questions for the owner

1. **Who completes shirt size and rooming category?** The wizard lets the Parent do it, but Profile, Forms and Home say the student must. Which is right? Recommended: pick one and make all messages match.
2. **Money words.** Should "Raised", "Earned from fundraisers", "Transfers received" and "Available fundraising credit" each get a one-line meaning on the Parent screens? Recommended: yes, using the plain meaning the Coach screen already has for "Gross raised". I also did not check the math (per instructions). One child's numbers look odd (credit $6.25, earned $0.00).
3. **"Consent & Release".** Should the first mention say what it is? Recommended: a short line on Home and wizard step 4.
4. **"Earlier checkmarks".** Who made them and when? I did not rewrite it.
5. **"Edit setup" on Home.** It is shown even when setup is finished. Remove or keep?
6. **"Waiting on Coach" vs "Finish setup".** Is the Parent expected to press Finish setup once FIRST is awaiting the Coach? If not, hide it.
7. **Three copies of the health and contact form.** Wizard, Profile, Forms: one record or three? If one, recommend sending Parents to a single place and using one question order. I did not verify the saves.
8. **Event sign-up.** Where does a Parent register or ask? Recommended: add the Coach contact line if registration is by Coach only.
9. **Transport checkbox.** Should it say "Saved" when ticked, and should its wording show both choices?
10. **Whole Team event.** "SYNTHETIC Whole Team reactivation rehearsal" shows "Not registered" for Fictional PDF Student. Data or a bug?
11. **Profile label.** Rename the Parent's "Profile" to "Student profile"? It is two labels (nav and phone) and does not change the Student or Mentor labels if done for Parents only. Recommended: yes.
12. **Redirect to setup.** Should a Parent with a Money link still go to setup first? Recommended: yes for first visit only; confirm.
13. **Phone header height.** Is the test banner the main cause? It disappears in production builds.
14. **Parent invitation pages and sign-in.** Not reached (need a link). Covered in the Signed out pass, if you run it.

## 8. Could not verify

- **Medical step** of the wizard (no child needs it). Labels read from code.
- **Balance-due and how to pay.** No child owes money, so I never saw the wording for a payment due or any instruction on how to pay.
- **Signing steps 3 and 4.** Preparing the PDF writes a draft record. Signing is also closed in test.
- **Buttons not pressed:** Save and continue, Finish setup, "I've done both in FIRST", Save and confirm profile, Send request (correction), Prepare PDF for review, transport checkbox, Light/Dark/System, Sign out.
- **Rooming.** The route is not open to Parents, and I saw no roommate link on a Parent event page. Not checked further.
- **Phone:** Home, setup and More sheet checked at 390 px in a frame. Money, Attendance, Events, Profile and Forms on phone were not each viewed; their layouts follow the same rules as Mentor's.
- **`/invite-parent` landing** and any invitation errors. Need a real token.
- **Blocked Parent pages.** Not opened. Messages come from `unavailableMessage()` in the code only.
- **Real pages for Student or Coach views.** Out of this pass.

## 9. State changes made during the audit

None. Details:

- I picked each child in the setup chooser and in the child buttons (local screen state, no save). I opened the "Choose events and review PDF" dialog and pressed Cancel.
- `firstRegistration.get` is called on the FIRST step. I read it: it only reads data.
- I loaded a second copy of the app in a frame to see the phone view. It ran the app's normal start-up checks (reads only).
- No slips this run.

## 10. Do-not-break list

Left alone on purpose, and working well:

- Seven clear nav labels that match their pages (Home, Events, Money, Attendance, Profile, Forms, Settings), the current page marked, and the child buttons that follow the Parent to every page.
- The short, kind wizard messages (save failed, Choose None reported, "Who should we call about [name]?").
- The money history lines that say what happened to each payment.
- Rules that protect data: signing closed in test, profile must be confirmed before signing, instant-save only for the transport checkbox, "Finish later" without losing answers.
- FIRST states: Needs completion, Awaiting Coach verification, Verified. I suggest wording only.
- The Mentor's "Profile" and the Student's "Profile" are not changed by any item above except Q11.
- Everything under Medical, FIRST, signing and money: no behaviour change proposed.
