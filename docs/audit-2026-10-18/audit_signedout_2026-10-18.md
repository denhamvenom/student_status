# Audit Report: Signed out / Join / Waiting

Date: 2026-10-18. Prompt: `language_and_workflow_audit_prompt_FINAL_2026-10-18`. Scope: Student Status only. Browser state: signed out (the owner signed out before I started). I never signed in, so only the sign-in page and the public pages were seen on screen. The join request, waiting, wrong-account and invitation screens were read from the code and are marked that way. No emails or account names appear here.

## 1. Executive summary

The sign-in page is short and clear: one heading, one sentence, one button. The problem sits one step later. A new student cannot tell from the sign-in page that a team code is coming, and the line that is supposed to help ("Use the Google account linked to your team profile") means nothing to someone who has no profile yet. After sign-in, the join form says "confirm your student name" over two empty boxes, and the waiting screen is lost on reload: the form comes back, and a request the Coach declined looks the same as one still waiting.

A newcomer could finish 2 of the 5 top tasks unaided (read About, Privacy and Terms; find the sign-in button). They would be stuck on how to get access as a new student or parent, and on what to do after a wrong Google sign-in.

Language findings: 11 | Navigation and workflow findings: 5 | Items needing owner decision: 9 | Code access: Yes | Share of full-sentence text above grade 8: 4 of 19 scored by the script (about 2 are real problems) | Model tiers used: one agent (Sonnet 5.5), no helpers.

Setup notes. (a) What I saw on screen: sign-in page (desktop and a 390 px frame), About, Privacy and Terms. (b) What I read only in code: join form, waiting screen, wrong-account line, parent and adult invitation pages. Reaching them needs a Google sign-in, an unlinked account or an invitation link, which are outside "never sign in". (c) I did not press "Continue with Google". Its handler starts a real Google sign-in (`LiveApp.tsx:100`). (d) The Privacy and Terms pages are the same as in the Mentor report and are not scored again.

## 2. Site map and purpose

| Route / tab | Seen how | Source component | Predicted from the label | What it actually is |
|---|---|---|---|---|
| `/` signed out | On screen | `SignIn()` (`LiveApp.tsx:100`) | A sign-in page | "Student Status" title, one sentence, "Sign in" card with "Continue with Google". Matches. |
| `/` signed in, no team record ("pending") | Code only | `PendingJoin()` (`LiveApp.tsx:101`), `PendingJoinView.tsx` | n/a | "Join the team" form: Team code, First name, Last name, "Request to join". |
| Same screen after sending | Code only | `PendingJoinView.tsx` | n/a | "Waiting for approval" with one sentence and a Sign out button. |
| Wrong-account line | Code only | `PendingJoinView.tsx` | n/a | A sentence and a Sign out button, shown on both join and waiting screens. |
| `/invite-parent` | Code only (needs a link with a token) | `ParentInvitationLanding` (`ParentInvites.tsx:108`) | n/a | Parent invitation: sign in, pick relationship, tick an authority box, accept. |
| `/invite-adult` | Code only | `AdultInvitationLanding` (`Adults.tsx:95`) | n/a | Adult invitation: sign in, review access, accept. |
| `/about` | On screen | `PublicPages.tsx` | Who runs this and how to get in | Same as in the Mentor report; has "Go to sign in". |
| `/privacy` `/terms` | On screen | `PublicPages.tsx` | Policies | Same as in the Mentor report. |

Count: 3 footer links and one sign-in button on the first screen. Not over.

## 3. Task results

| Task | First click I would make | Right? | Clicks to finish | Result | Where I got lost |
|---|---|---|---|---|---|
| Sign in with a team account | "Continue with Google" | Yes | 1. Not pressed. | Finished unaided | None. |
| Find out how to get access as a new student | About (footer) | Partly. The About page says the Coach approves enrollment, but not that a team code is needed. | 2 | Stuck | The code is only mentioned after Google sign-in. |
| Find out how to get access as a parent | About | Partly. Nothing on About or the sign-in page says a parent needs an invitation from their student. That sentence appears only on the join form. | 2 | Stuck | Same. |
| Read the privacy notice | Privacy (footer) | Yes | 1 | Finished unaided | Dense (Mentor report). |
| Recover from the wrong Google account | Sign out on the join screen | Yes (code) | 1 | Not tested: needs sign-in | The line talks about "your team profile", which a new person lacks. |

Navigation problems:

- **N1. Two sign-in links on About.** "Sign in" in the header and "Go to sign in" in the body; both go to `/`. Fine, but they are two names for one thing.
- **N2. No way from the sign-in page to "how do I join?".** The footer About link is there, but About does not answer it (see finding 2).
- **N3. Waiting screen does not survive a reload** (workflow finding W2).
- **N4. Invitation pages return to `/`** with a "Return to Student Status" link; a failed invitation leaves you on a page whose only exits are a Coach or the student.
- **N5. The sign-in page has no `<main>` landmark** (the page uses a plain `<div class="signin-content">`; I found no `main` element when reading the page). Out of scope for wording; noted for the owner (Q9).

## 4. Language findings

Grades are Flesch-Kincaid estimates from a script (`fk5.py`). Short lines score high on one long word, so I also judged by reading. Sorted by how many people meet them and how badly they confuse.

| # | Screen / route | Source file and line | Exact current text | Problem | Grade (now → proposed) | Replacement | Class |
|---|---|---|---|---|---|---|---|
| 1 | Sign-in `/` (seen) | `live-copy.ts:5` (`signIn.instruction`) | "Use the Google account linked to your team profile." | A new student or a parent has no team profile yet, so the line does not apply. Nothing says a team code or an invitation is next. | 5.0 → 2.3 | Owner decision first. If new text is wanted: "Use the Google account for your team profile. New student? You will be asked for a team code after you sign in." | `[Needs Owner Decision]` (new sentence, not a reword) |
| 2 | Join form (code) | `live-copy.ts:6` (`join.instruction`) | "Enter the team code from a Coach, then confirm your student name." with two empty boxes "First name", "Last name" | Nothing to "confirm"; the boxes are empty. "Student name" could be the student's name or the person's. | 3.8 | "Enter the team code from a Coach, then type your first and last name." | `[Text-only / Safe]`. The server only saves the names (`app.ts:261`); a Coach reviews them. No test found for the string. |
| 3 | Join form (code) | `live-copy.ts:6` | Three names for one step: page title "Join the team", box heading "Student join request", button "Request to join" | One page, three names. A parent or Mentor on the wrong account also sees "Student join request". | n/a | Use "Join the team" for title and box heading, keep "Request to join". | `[Text-only / Safe]` |
| 4 | Join and waiting (code) | `live-copy.ts:6` (`join.wrongAccount`) | "Signed in with the wrong Google account? Sign out, then use the account linked to your team profile." | Same problem as finding 1: a person who has no profile is told to use the account linked to it. | 3.0 → 1.5 | "Wrong Google account? Sign out, then sign in with the right one." | `[Text-only / Safe]` |
| 5 | Join error (code) | `live-copy.ts:6` (`join.invalidCode`), `app.ts:252-259` | "Invalid, expired, or locked team code. Ask a Coach for a new code." | Short and clear (1.5). But "locked" is not explained: after 5 wrong tries the server locks the account for 15 minutes and shows this same line. | 1.5 | None proposed. See Q4. | `[Needs Owner Decision]` |
| 6 | Waiting (code) | `live-copy.ts:6` (`join.waitingDetail`) | "Your request is with the Coach. This page will open your team profile after approval." | Good, but not true after a reload (the screen goes back to the form; see W2). | 4.6 → 3.0 | "Your request is with the Coach. This page opens your team profile when you are approved." | `[Text-only / Safe]` for the wording; the behaviour is W2. |
| 7 | Parent invitation sign-in (code) | `family-copy.ts:57` (`signInDescription`) | "Use the Google account that received this invitation. Student information appears only after the invited account is verified." | "Verified" is system language. | 10.9 → 6.9 | "Use the Google account that got this invitation. You will see student information after we check the account." | `[Needs Owner Decision]` (access and privacy wording) |
| 8 | Adult vs parent invitation, wrong account (code) | `account-copy.ts:21-23`; `family-copy.ts:63` | Adult: "Sign in with the invited verified Google account to accept this invitation." Parent: "This Google account does not match the invited email. Sign in with the invited account, or ask the student for a corrected invitation." | Same situation, two styles. The adult line says "verified" and gives no next step if the account is wrong. | 9.7 and 6.3 | Match the parent version: "This Google account is not the one invited. Sign in with the invited account, or ask a Coach for a new invitation." | `[Needs Owner Decision]` |
| 9 | Invitation unavailable (code) | `account-copy.ts:21`; `family-copy.ts:56,67` | "This invitation has expired, was used or was revoked. Ask a Coach for a new link." / "This link has expired, was used, or is no longer available. Ask the student for a new invitation or contact a Coach." / "Ask the student for a new invitation link." | Three wordings (one with an Oxford comma, two without); the parent page uses two for what looks like the same case. | 3.0 and 5.9 | Use the parent long version for both, with "Coach" or "student" by who sent it. | `[Text-only / Safe]` |
| 10 | About `/about` (seen) | `PublicPages.tsx` | "Signing in does not automatically grant access to team records; the Coach approves enrollment and assigns team roles." | Right answer, wrong place: a visitor wants "how do I get in", not "what does signing in do". | 7.6 | None. See Q1. | `[Needs Owner Decision]` |
| 11 | Sign-in `/` (seen) | `live-copy.ts:5` (`signIn.description`) | "Team events, travel readiness, attendance and finances." | Reads fine, but the page never says who it is for (students, parents, adults). | 10.7 by script, short and clear | None. | n/a |

Credit where due: "Your request is with the Coach." (4.6) says who has it. "Invalid, expired, or locked team code. Ask a Coach for a new code." (1.5) gives a next step. "Sign-in could not be completed. Please try again." (0.6) and "Could not sign out. Please try again." (-0.7) are short and kind. The parent invitation's "Accepting access does not sign a travel permission form or give medical consent." (9.4 by script, but the point is exact and worth keeping) is the clearest consent line in the app. "Parents receive a separate invitation from their student." tells a parent they are in the wrong place.

**Remove before launch (test-only text):** None found on the signed-out pages I saw. The "Synthetic review" parent-invitation page in `ParentInvites.tsx:137` is the fixture app (`?review=` mode), not live.

## 5. Workflow findings

**W1. A new student joins the team.**
- Goal: get into the app.
- Current flow (code): 1. Sign-in page. 2. "Continue with Google". 3. Join form: Team code, First name, Last name. 4. "Request to join". 5. "Waiting for approval". 6. A Coach approves. 7. The page opens the team profile.
- Friction: hidden dependency (the code is asked for only after Google sign-in); purpose (finding 1, 2).
- Proposed flow: none that adds a feature. Wording: findings 1, 2, 3.
- Stays the same: the code step, the Coach approval, the lockout.
- Safety Check: (1) Text only for findings 2 and 3. (2) Could break: tests or screenshots that quote the strings (none found). (3) Student only. (4) Easy to revert. (5) Mix of `[Text-only / Safe]` and `[Needs Owner Decision]`. No verifier ran.

**W2. Waiting for approval.**
- Current flow (code): the "submitted" flag is held in the page only (`PendingJoin`, `useState(false)`). After a reload, the form comes back. If the student sends it again, the server returns the existing request before checking the code (`app.ts:247-248`), so even a wrong code shows "Waiting for approval". A request the Coach declines is saved as "declined" (`admin.ts:49`), but the viewer still reports "pending" (`app.ts:20`), so a declined student sees the form and then "Waiting for approval" again. I found no "declined" screen.
- Friction: dead end (a declined student waits for ever), disconnection (the app knows more than it says).
- Proposed flow: none that adds a screen. Q2 and Q3.
- Safety: this touches approvals, so `[Do Not Touch: approvals]`. Not tested on screen.

**W3. Wrong Google account.**
- Current flow (code): the sentence and a Sign out button are on the join and waiting screens. Invitation pages have "Use another Google account".
- Friction: purpose (finding 4); an active user on the wrong account is treated as a new person (join form) with no hint that they might have used a different account before.
- Proposed flow: wording only (finding 4).
- Safety: sign-out only. `[Text-only / Safe]`.

**W4. Accept a parent invitation.**
- Current flow (code): 1. Open the link. 2. Sign in with the invited Google account. 3. Choose relationship (Parent, Legal guardian). 4. Tick the authority box. 5. "Accept invitation". The page says that accepting does not sign or consent to anything.
- Friction: wrong-account message exists and is clear (finding 8 for the adult version).
- Proposed flow: none. Not seen on screen.
- Safety: `[Do Not Touch: consent, approvals]`.

**W5. Accept an adult invitation.**
- Current flow (code): open the link, sign in with the named account, review "Invited access" (role, finance edit, health export), "Accept".
- Friction: wrong-account line is thin (finding 8); the screen lists powers (finance edit, health export) but I did not see the wording on screen.
- Proposed flow: none.
- Safety: `[Do Not Touch: legal, safety, payment, health]`.

## 6. Coach navigation rationalization

Not applicable. This is a signed-out pass.

## 7. Questions for the owner

1. **New-student hint on the sign-in page.** Do you want one extra sentence ("New student? You will be asked for a team code after you sign in.")? It is new text, not a reword. Recommended: yes.
2. **Declined join requests.** A declined student sees the form, then "Waiting for approval" for ever. What should they see? (I did not look for a Coach-side message.)
3. **Re-sending a join request.** The server returns the existing request before checking the code, so any code works the second time. Is that intended? It does not approve anyone, but it makes the page read as if the new code was accepted.
4. **Lockout.** Five wrong codes lock the account for 15 minutes behind the word "locked". Should the message say how long?
5. **"Confirm your student name".** OK to change to "type your first and last name"?
6. **Adult and parent invitation messages.** Match them, with a next step on both?
7. **"Verified".** Does a parent know what "verified" means here? Recommended: reword (finding 7).
8. **Reload on the waiting screen.** Is the waiting screen meant to survive a reload? Today it does not.
9. **Sign-in page landmark.** The sign-in page has no `<main>` element. Out of scope here; worth a separate accessibility check.

## 8. Could not verify

- **Join form, waiting screen, wrong-account line** on screen. They need a sign-in with an unlinked Google account. Seen only in code.
- **Parent and adult invitation pages.** They need a link with a token. Seen only in code, and I did not visit `/invite-parent` or `/invite-adult`.
- **Error and lockout messages.** Not triggered.
- **"Continue with Google".** Not pressed (it starts a real Google sign-in).
- **How a Coach sees and declines a join request** (outside this role).
- **Blocked-page messages for signed-out visitors.** I did not type any address to reach one (rule 7).

## 9. State changes made during the audit

None.

- I loaded the root address `http://localhost:5173/` once in a tab and in a 390 px frame (removed after reading), and clicked the About, Privacy and Terms footer links.
- I did not sign in or sign out. The owner signed out before I started.
- No slips this run.

## 10. Do-not-break list

Left alone on purpose, and working well:

- One sign-in button, one sentence, no choices. The page is readable at 390 px (button 296 by 44 px, no side scroll).
- "Invalid, expired, or locked team code. Ask a Coach for a new code." and "Sign-in could not be completed. Please try again."
- The parent invitation's consent line: "Accepting access does not sign a travel permission form or give medical consent."
- "Parents receive a separate invitation from their student." and "Your request is with the Coach."
- The sign-in lockout and Coach approval themselves (only the wording around them is questioned).
