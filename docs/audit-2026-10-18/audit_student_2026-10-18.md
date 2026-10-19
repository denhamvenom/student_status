# Audit Report: Student

Date: 2026-10-18. Prompt: `language_and_workflow_audit_prompt_FINAL_2026-10-18`. Scope: Student Status only. Signed-in account shown as [signed-in Student] (the existing linked Student, preferred name "Test"). No account names or emails are copied here. The page shows the linked parent's full name and email on the Parents page; both are left out.

## 1. Executive summary

A Student can work out most tabs from their names. Events, Money and Settings do what the label says. Three things make the role confusing. Home says "You are all caught up" and then lists two things the student is still waiting on. The setup wizard and the Profile page each ask for or show the same details (preferred name, shirt size), and they give two different ways to change rooming. And the same "invite a parent" form lives in two places (Parents tab and wizard step 3).

A newcomer could finish about 4 of the 7 top tasks unaided (see events, check money, change shirt size, read the wording on Settings). They would most likely get stuck on "Sign up" for an event (nothing says what happens next), on Attendance (jargon and "Unavailable"), and on health information (Profile only says "Your parent fills this in").

Language findings: 12 | Navigation and workflow findings: 7 | Items needing owner decision: 11 | Code access: Yes | Share of full-sentence text above grade 8: 8 of 22 scored by the script (about 3 are real problems; the rest are very short lines or lines with long names) | Model tiers used: one agent (Sonnet 5.5), no helpers.

Setup notes. (a) The Student was already signed in. The header did not show the role or name on any screen, but the window reported 956 px, where the header hides that line (the same as on a phone); the Parent run at 1584 px did show it. So "no role in the header" holds only at 956 px and below. I confirmed the role from the Home page ("You are all caught up. Waiting on your parent...") and the nav (a "Parents" tab and an editable Profile). (b) Home loaded directly. Parent and Student both redirect to `/setup` while setup is open, but this Student's own steps are complete, so no redirect happened. (c) I never pressed "Sign up", "Create invitation link", "Send request", "Save profile", "Save and continue", "Finish setup", the transport checkbox, any theme button, or Sign out. (d) For the phone view I loaded the app in a 390 px frame in the same tab (same sign-in, read-only), then removed the frame.

## 2. Site map and purpose

| Route / tab | Desktop | Phone (how reached) | Source component | Predicted from the label | What it actually is |
|---|---|---|---|---|---|
| `/` "Home" | Link 1 of 7 | Bottom bar | `LiveApp.tsx` `DashboardPage` | Overview of me | Name, what's left, Money card, Events card, Attendance card. Matches, except the "all caught up" line. |
| `/events` "Events" | Link 2 | Bottom bar | `EventList` | Events I can join or am in | Cards grouped Competitions / Outreach / Team with status. Matches. |
| `/events/:id` | From card | From card | `EventPage` (`LiveApp.tsx:151`) | n/a | Details, fee, requirements, a "Sign up" button, or a transport checkbox for confirmed events. |
| `/finances` "Money" | Link 3 | Bottom bar | `FinancePage` | What I owe or raised | Balance, charged, available funds, fundraising, charges, history. Matches. |
| `/attendance` "Attendance" | Link 4 | More > Attendance | `DashboardReports.tsx` | My meeting attendance | Clocked totals, earlier checkmarks, session list. Matches, but jargon-heavy. |
| `/profile` "Profile" | Link 5 | Bottom bar | `Profile` | My info | Matches. My details, a small edit form, and a "Request a correction" form. |
| `/parents` "Parents" | Link 6 | More > Parents | `StudentParents` (`ParentInvites.tsx:77`) | Ambiguous: my parents' info, or linking them | Invite a parent by email, list of invitations, list of linked parents. Page heading is "Parent accounts". Half right. |
| `/settings` "Settings" | Link 7 | More > Settings | `Settings()` in `LiveApp.tsx` | Theme, sign out | Light / Dark / System, my email, Sign out. Matches. |
| `/setup` (from Home "Edit setup") | Link on Home only | Link on Home only | `SetupWizard.tsx` `StudentWizard` | n/a | 3 steps: About you, Team details, Parent connection & FIRST. Opens on step 3. |
| `/events/:id/rooming` | From a confirmed overnight event | Same | `RoomOperations` | n/a | Only reachable for a confirmed overnight event with rooming on. None in the test data. Not seen. |
| `/about` `/privacy` `/terms` | Footer | Footer | `PublicPages.tsx` | n/a | Same pages as in the Mentor report. Not repeated. |

Count: 7 top-level destinations on desktop (at the limit, not over). Phone: 4 tabs plus More (Attendance, Parents, Settings, Sign out). The phone header hides the name and the Sign out button; Sign out is only in More.

## 3. Task results

Predictions are in the progress file. Home had already loaded when I wrote them; the other pages were not opened before.

| Task | First click I would make | Right? | Clicks to finish | Result | Where I got lost |
|---|---|---|---|---|---|
| Finish my setup | Home "Edit setup" or Profile | Home is right. Profile is a second place. | 2 to open the wizard. Not saved (rule 1). | Finished by guessing | Wizard opens on step 3, not step 1. Step 3 shows "Needs completion" for something only the parent can do. |
| Check what I owe | Money | Yes | 1 | Finished unaided | Six money words are not explained (Raised, Earned from fundraisers, Transfers received, Applied to charges, Available funds, Available fundraising credit). |
| Sign up for an event | Events | Yes | 3 to the button. Not pressed. | Stuck | "Sign up" gives no hint of what it does (join now? ask the Coach?). `participation.signUp` writes. |
| Check my attendance | Attendance (phone: More first) | Yes | 1 desktop, 2 phone | Stuck | "Unavailable" and "Attendance totals start at kickoff." Then session rows that say "Total time 0 min 49 s" and "Counts after one full uninterrupted scheduled hour." |
| Invite my parent | Profile (guess) | No. It is the Parents tab. | 2 | Finished by guessing | Label "Parents" does not say "invite". The same form is also in wizard step 3. |
| Fix my shirt size | Profile | Yes | 1 to the form. Not saved. | Finished unaided | Wizard calls it "T-shirt size"; Profile says "Shirt size". |
| Ask for a rooming or name change | Profile | Yes | 2. Not sent. | Finished by guessing | Profile has a "Request a correction" form for rooming. The wizard says "Ask a Coach to change your subteam, rooming or Travel Team." Two routes. |

Navigation problems:

- **N1. "Parents" is the only label that does not predict its page.** The tab says "Parents"; the page says "PARENT ACCESS" then "Parent accounts" then "Invite a parent"; the wizard says "Parent connection" and "Your parents". Four names for one thing.
- **N2. Invite-a-parent form appears twice.** Parents tab and wizard step 3 ("Parent or guardian Google email" with "Invite another parent"). Source: `ParentInvites.tsx`, `SetupWizard.tsx:63`.
- **N3. Home "Edit setup" opens at the last step.** A student who wants to change their grade or birth date must press Back twice. After setup is complete the link still says "Edit setup" and the page says "Set up your profile".
- **N4. Wizard fields are split from Profile.** Grade and Date of birth are only in the wizard; Profile shows neither. Preferred name and shirt size are in both.
- **N5. No nav on the wizard.** On `/setup` the nav is gone; the only exits are Back, "Finish later" and "Finish setup".
- **N6. Phone: Parents is under More** while the health profile on Home is "waiting on your parent." The way to connect a parent is one tap deeper than a main tab.
- **N7. Phone header hides Sign out.** It is only in More. Fine, but a shared-device student has to know to look there.

## 4. Language findings

Grades are Flesch-Kincaid estimates from a script (`fk3.py`). Short lines score high because of names or one long word, so I also judged by reading. Sorted by how many Students meet them and how badly they confuse.

| # | Screen / route | Source file and line | Exact current text | Problem | Grade (now → proposed) | Replacement | Class |
|---|---|---|---|---|---|---|---|
| 1 | Home | `family-copy.ts:9` (`caughtUp`), `LiveApp.tsx:~124` | "You are all caught up." then "Waiting on your parent to finish your health profile." and "Waiting on your parent to complete your FIRST registration." | Says done and waiting in one place. A student may stop looking. | 3.2 → 3.0 | "Nothing for you to do right now. Your parent still needs to finish your health profile." (the FIRST line stays, same pattern) | `[Text-only / Safe]` for the health line. `[Do Not Touch: FIRST]` for the FIRST line. The Parent view has the same pattern (Parent report, finding 13). `caughtUp` is shared; change both or neither. |
| 2 | Attendance, Home | `report-copy.ts:14,19` | "Clocked attendance" and "Earlier attendance (checkmarks)" | "Clocked" is Timeclock language. "Checkmarks" has no meaning to a newcomer. | n/a | "Attendance from the Timeclock". The second needs the owner (Q4). | `[Text-only / Safe]` for the first. Used by Parent, Student and Coach (Coach passes its own label). No test found. |
| 3 | Attendance, session rows | `report-copy.ts:20-21` | "Counts after one full uninterrupted scheduled hour. Longest visit: 59 min 48 s." | "Uninterrupted scheduled" is formal. It does not say whether the student was counted. | 5.9 → 1.5 | "Counts after one full hour with no breaks. Longest visit: 59 min 48 s." | `[Text-only / Safe]`. String also used for Parent and Coach views, same meaning. |
| 4 | Home, Attendance | `report-copy.ts:8-9` | Bold "Unavailable", then "Attendance totals start at kickoff." | A bold "Unavailable" looks broken. "Kickoff" is FIRST jargon. | 7.6 → 5.7 | "Attendance counting starts when the season starts." | `[Text-only / Safe]` for Student and Parent copy. Same sentence is reused for Mentor and Coach screens. |
| 5 | Attendance, Earlier attendance | `report-copy.ts` | "TUESDAY MEETINGS Unavailable", "THURSDAY MEETINGS 0", "OUTREACH 0" | Three tiles with a mix of "Unavailable" and "0". Looks like a fault. | n/a | None proposed. See Q5. | `[Needs Owner Decision]` |
| 6 | Parents `/parents` | `family-copy.ts:47-55`; `ParentInvites.tsx:91` | Nav "Parents"; eyebrow "PARENT ACCESS"; heading "Parent accounts"; "Invite a parent"; wizard "Your parents", "Parent connection" | Four names for one thing; the label does not say it is for inviting. | n/a | Nav label "Parents" is acceptable once the page heading matches it. Proposed: heading "Parents". Drop the eyebrow. | `[Layout / Navigation]` for the heading; the eyebrow is text. Used by the Coach's parent access page? No: Coach uses `CoachParentAccess` (different heading). Not tested. |
| 7 | Parents | `family-copy.ts:50` | "Enter the Google account email your parent will use. The invitation expires in 7 days and can be used once." | Fine reading level (5.5). Two facts about the link, but "can be used once" could be "works once". | 5.5 → 3.0 | "Enter the Google email your parent will use. The link works once and expires in 7 days." | `[Needs Owner Decision]` (consent link wording). |
| 8 | Event page | `LiveApp.tsx:151`, `live-copy.ts:8` | Button "Sign up" | Does not say what happens next (join now? ask the Coach?). | n/a | None. A reason line would be new text. See Q2. | `[Needs Owner Decision]` |
| 9 | Event page, Requirements | `readinessCopy.ts`, `live-copy.ts` | "Requirements: Not applicable. No requirements apply to this participation." | Two lines say the same thing. "Participation" is a system word. | 14.3 → 5.0 | "No requirements for this event." and delete the first line. | `[Text-only / Safe]` for the second line. The first line is the status badge, removing it is a layout change. Also used by Parent and Coach. |
| 10 | Events list | `LiveApp.tsx` `EventList` | Card line "Fictional outreach venue · Not applicable" | The travel slot shows "Not applicable" for an outreach event. Reads like part of the place name. | n/a | Hide the travel part when there is none. | `[Layout / Navigation]`. Not confirmed whether other screens rely on the slot. |
| 11 | Profile | `LiveApp.tsx:260` | Health: "Allergies / Your parent fills this in." and "Prescriptions / Your parent fills this in." | Does not say the student cannot see it, or that it is kept private. | 0.5 | "Your parent adds this. You cannot see it here." | `[Do Not Touch: health]` Text only. Flag for owner. |
| 12 | Wizard step 2 vs Profile | `setup-wizard-copy.ts:teamCoachNote`, `correction-copy.ts` | Wizard: "Ask a Coach to change your subteam, rooming or Travel Team." Profile: "Request a correction ... Rooming category". | Two routes for rooming. | 3.7 | None proposed. See Q7. | `[Needs Owner Decision]` |

Seen in code only: wizard "T-shirt size" (`SetupWizard.tsx`, step 2) against "Shirt size" on Profile (`live-copy.ts:10`) — same finding as Parent #11. Proposed "Shirt size" everywhere. `[Text-only / Safe]` after checking `convex/setupWizard.ts` for the string.

Credit where due: "Your answers save after each step." (wizard, 4.3), "No email is sent by this app. Copy the link and share it privately with the invited parent." (4.3, honest and short), "Withdrawal approved. Your place has been released." (4.3), "How are you getting there? Choose whether to ride with the team or travel independently." (7.2, two clear choices), and the Money history lines ("Payment returned to available funds from [event]") say what happened.

**Remove before launch (test-only text):**

- All pages: the season name "2027–28 SYNTHETIC REHEARSAL" and the dev banner (dev builds only, `readinessCopy.ts:6`).
- Event names and details: "REHEARSAL ONLY", "SYNTHETIC", "REVIEW 2026-10-18", "TEST ONLY: shared vehicle or independent travel", "Fictional venue", "Fictional transport", "Fictional consent venue" (data).
- Student and parent names on the Home heading, Profile and Parents (data).
- Money history: "REHEARSAL ONLY — Room and withdrawal check" (data).

## 5. Workflow findings

**W1. Student completes their profile.**
- Goal: finish the setup the app asks for.
- Current flow: 1. Home "Edit setup". 2. Opens on step 3 of 3 ("Parent connection & FIRST"). 3. Back twice to see step 1 (About you: preferred name, grade, date of birth) and step 2 (Team details: T-shirt size, rooming category, subteam, Travel Team). 4. "Save and continue" each step, "Finish setup" on step 3. Separately Profile has an edit form for preferred name and shirt size.
- Friction: overlap (preferred name, shirt size in both), disconnection (wizard collects grade and DOB that Profile never shows), hidden dependency (step 3's "Finish setup" is pressable while the real blocker is the parent), purpose (nothing says the wizard already finished).
- Proposed flow: no removal, because I cannot show the two forms save to the same fields. Make "Edit setup" open on step 1 (owner Q1). Wording: findings 1, 12.
- Stays the same: all fields, all saves, the step order.
- Safety Check: (1) Not changed. (2) Could break: `setupWizard.saveStudent*`, `profileSetup`, the Coach roster fields. (3) Student, Parent (own wizard), Coach. (4) Not applicable. (5) `[Needs Owner Decision]`. No verifier ran.

**W2. Student invites a parent.**
- Current flow: 1. Parents (or wizard step 3). 2. Type the parent's Google email. 3. "Create invitation link". 4. Copy and share privately.
- Friction: overlap (two forms, `ParentInvites.tsx` and `SetupWizard.tsx:63`), naming (four labels), hidden dependency (the student needs the parent's Google email, and a typo makes a link that cannot be used).
- Proposed flow: keep both entry points; make heading and label match (finding 6). Owner question about duplicates (Q3).
- Safety Check: link creation writes; I did not press it. `[Layout / Navigation]` for the heading only.

**W3. Student signs up for an event.**
- Current flow: 1. Events. 2. Open an event. 3. "Sign up" (shown when sign-up mode is not "assigned" and the student has no status yet, `LiveApp.tsx:151`). 4. Status changes.
- Friction: purpose (no hint of what happens: pending, fee, approval), disconnection (the Parent event page has no sign-up button, so who signs up is unclear; Parent report W4).
- Proposed flow: none that does not add text or a feature. Q2.
- Safety: writes a participation record and a charge. `[Do Not Touch: payment, approvals]`.

**W4. Student withdraws from an event.**
- Current flow: shown only after participation exists (`StudentWithdrawal`, `Withdrawals.tsx:35`). On the one withdrawn event the page says "Withdrawal approved. Your place has been released." The confirmed Whole Team event showed no withdrawal section.
- Friction: not verified why. Could be `allowWithdrawal` off for that event type or a hidden control.
- Proposed flow: none. Q6.

**W5. Student checks attendance.**
- Current flow: 1. Attendance (phone: More first). 2. Clocked totals. 3. Earlier checkmarks. 4. Session list.
- Friction: same as Parent W3: two sets of numbers, "Unavailable" versus "0", three-sentence note block.
- Proposed flow: findings 2, 3, 4 only. No removal.
- Safety Check: (1) Text only. (2) No stored or exported data uses these strings (grep, no tests found). (3) Same strings for Parent and Coach; meaning holds for them. (4) High. (5) `[Text-only / Safe]`. No verifier ran.

**W6. Student corrects their name, rooming or sign-in account.**
- Current flow: Profile > "Request a correction" > pick one of three > explain > "Send request". A Coach reviews.
- Friction: lives lower on Profile under the edit form; the wizard points to a different route for rooming (finding 12); subteam is not in the correction list but the wizard says "ask a Coach."
- Proposed flow: none; wording only after Q7.

**W7. Student says they travel on their own.**
- Current flow: Events > a confirmed event > "How are you getting there?" > tick "Traveling independently". Saves at once (`Travel.tsx:76`); I did not tick it.
- Friction: instant save, no visible "Saved" in code (only errors); one checkbox pretending to be two choices. The component takes an `ownProfile` flag for the student view. I did not verify whether a student's tick still needs a parent or Coach, which matters for a minor (Q8).
- Proposed flow: none.

## 6. Coach navigation rationalization

Not applicable. This is a Student-only pass.

## 7. Questions for the owner

1. **Wizard entry.** Should "Edit setup" open on step 1 after setup is complete? Recommended: yes, and say "Edit your profile".
2. **Event sign-up.** What happens after "Sign up"? One line under the button (pending or done, and any fee) would answer it. Same question for Parents, who see no button.
3. **Two invite forms.** Do Parents tab and wizard step 3 need to both exist? Recommended: keep both but use one heading.
4. **"Earlier checkmarks".** Who made them and when? I did not rewrite it.
5. **Tiles "Unavailable" and "0".** Is "Unavailable" for a session type with no data yet and "0" for no attendance? Say so, or show the same word for both.
6. **Withdrawal on the confirmed Whole Team event.** Why is no withdrawal shown? Rule, or hidden?
7. **Rooming changes.** Profile correction form or "Ask a Coach"? Pick one and make both messages match.
8. **Independent travel for a minor.** Can a student alone turn on "Traveling independently" with no parent or Coach check? This is a safety question, so I did not try it.
9. **Money words.** Same as Parent Q2. Does a student need "Raised" and "Earned from fundraisers" explained?
10. **Health on Profile.** Should a student know their parent's health entries are private? One line.
11. **Home Money card** leaves out "Available funds" ($1.00) that the Money page shows. Intended?

## 8. Could not verify

- **Buttons not pressed:** Sign up, Create invitation link, Send request, Save profile, Save and continue, Finish setup, "I've done both in FIRST" (not shown to the student), the transport checkbox, Light/Dark/System, Sign out.
- **Rooming page** `/events/:id/rooming`. No confirmed overnight event with rooming on in the test data.
- **What "Finish setup" and "Finish later" do** beyond the code I read: "Finish later" is wired to the wizard's exit function; I read that it is passed straight to the button and that it carried me to Home. I did not read the body of the exit function in full.
- **Student withdrawal** form (only the approved message was on screen).
- **Money when something is owed** (balance $0.00 for this Student).
- **Phone:** the bottom bar, header, More sheet and footer were read at 390 px in a frame. Events, Money, Attendance, Profile, Parents and the wizard on phone were not each viewed. They use the same shared layouts as Parent and Mentor.
- **Blocked Student pages.** Not opened. Messages come from `unavailableMessage()` in the code only.
- **Invitation landing** `/invite-parent`. Needs a real token.

## 9. State changes made during the audit

None.

- In the setup wizard I pressed Back twice (it only moves the screen; handler `setStep(step-1)`, `SetupWizard.tsx:82`) and then "Finish later" to leave (exit only; no save is called from it). I did not press any Save.
- I clicked nav links, footer links and "View event" links through the page. I did not type any address except the root, `http://localhost:5173/`, twice (a fresh load).
- I loaded a second copy of the app in a frame to see the phone view. It ran the app's normal start-up reads, and I removed it.
- The first tab in the group (still at an old window size) was left open and unused; a second tab did the work.
- No slips this run.

## 10. Do-not-break list

Left alone on purpose, and working well:

- Seven short nav labels that match their pages (Home, Events, Money, Attendance, Profile, Settings) and a phone bar of four tabs plus More.
- "Request a correction" on Profile for the three fields a student must not change alone (legal name, rooming category, sign-in account), and the locked fields in the wizard (legal name, rooming category and subteam once set).
- "Your answers save after each step.", "No email is sent by this app...", "Withdrawal approved. Your place has been released.", and the two-choice wording "ride with the team or travel independently".
